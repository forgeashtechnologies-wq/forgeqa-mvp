import type { WorkflowPlan, GoldenDataSet, RunManifest, StepResult } from '../schemas/core.js';
import type { PatternAnalysis, PatternFinding, ReadinessImpact } from './types.js';
import { getPatternById } from './registry.js';

export function enrichFinding(finding: PatternFinding): PatternFinding {
  const pattern = getPatternById(finding.patternId);
  if (!pattern) return finding;
  return {
    ...finding,
    title: pattern.title,
    category: pattern.category,
    confidence: pattern.sourceConfidence,
    evidence: finding.evidence ?? finding.message,
    rootCause: pattern.rootCause,
    howToConfirm: pattern.howToConfirm,
    safeFix: pattern.safeFix,
    preventionRule: pattern.preventionRule,
    regressionTest: pattern.regressionTest,
    sourceType: pattern.sourceType,
    sourceUrl: pattern.sourceUrl,
    sourceConfidence: pattern.sourceConfidence,
    relatedPatterns: pattern.relatedPatterns,
  };
}

function computeImpact(findings: PatternFinding[]): ReadinessImpact {
  const hasDangerousFix = findings.some(
    (f) => f.category === 'Dangerous Fix' || f.patternId.startsWith('drop_') || f.patternId.startsWith('disable_') || f.patternId.startsWith('real_') || f.patternId === 'broad_delete_cleanup' || f.patternId === 'production_key_used_in_test'
  );
  if (hasDangerousFix) {
    return { verdict: 'not_ready', reason: 'Dangerous fix pattern detected — do not proceed without review.' };
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  if (errorCount > 0) {
    return { verdict: 'not_ready', reason: `${errorCount} error-level pattern(s) detected.` };
  }
  if (warningCount > 0) {
    return { verdict: 'ready_with_warnings', reason: `${warningCount} warning-level pattern(s) detected — review recommended.` };
  }
  return { verdict: 'no_impact', reason: 'No significant pattern findings.' };
}

export function analyzePatterns(
  plan: WorkflowPlan,
  data: GoldenDataSet,
  manifest: RunManifest,
): PatternAnalysis {
  const rawFindings: PatternFinding[] = [];

  // --- Plan-based detections ---

  for (const step of plan.steps) {
    // hard_sleep_instead_of_semantic_wait
    if (step.action === 'wait') {
      const ms = parseInt(step.value || '0', 10);
      if (ms > 0) {
        rawFindings.push({
          patternId: 'hard_sleep_instead_of_semantic_wait',
          message: `Step "${step.description}" uses a hard sleep of ${ms}ms instead of a semantic wait.`,
          stepId: step.id,
          severity: 'warning',
          evidence: `action=wait, value=${ms}ms`,
        });
      }
    }

    // relative_url_without_base_url
    if (step.action === 'navigate') {
      const target = step.target || '';
      if (target.startsWith('/') && !plan.baseUrl) {
        rawFindings.push({
          patternId: 'relative_url_without_base_url',
          message: `Step "${step.description}" navigates to a relative URL "${target}" without a configured baseUrl.`,
          stepId: step.id,
          severity: 'warning',
          evidence: `target=${target}, baseUrl=${plan.baseUrl ?? 'undefined'}`,
        });
      }
    }

    // assertion_without_retry
    if (step.action === 'assertText') {
      const prevStep = plan.steps.find((s) => s.order === step.order - 1);
      if (!prevStep || (prevStep.action !== 'wait' && prevStep.action !== 'assertVisible')) {
        rawFindings.push({
          patternId: 'assertion_without_retry',
          message: `Step "${step.description}" asserts text without a preceding wait or visibility check.`,
          stepId: step.id,
          severity: 'warning',
          evidence: `prevAction=${prevStep?.action ?? 'none'}`,
        });
      }
    }
  }

  // --- Data-based detections ---

  // real_email_domain_used_in_test_data
  for (const user of data.users) {
    const domain = user.email.split('@')[1];
    if (!domain?.endsWith('.test')) {
      rawFindings.push({
        patternId: 'real_email_domain_used_in_test_data',
        message: `User email "${user.email}" uses a real domain instead of a test domain.`,
        severity: 'error',
        evidence: `domain=${domain ?? 'missing'}`,
      });
    }
  }

  // cleanup_target_missing_safe_tags
  for (const user of data.users) {
    if (!user.safeToDelete) {
      rawFindings.push({
        patternId: 'cleanup_target_missing_safe_tags',
        message: `User "${user.email}" is missing safeToDelete=true.`,
        severity: 'error',
        evidence: `safeToDelete=${user.safeToDelete}`,
      });
    }
  }
  for (const file of data.files) {
    if (!file.safeToDelete) {
      rawFindings.push({
        patternId: 'cleanup_target_missing_safe_tags',
        message: `File "${file.filename}" is missing safeToDelete=true.`,
        severity: 'error',
        evidence: `safeToDelete=${file.safeToDelete}`,
      });
    }
  }

  // duplicate_seed_data_on_rerun
  const emails = data.users.map((u) => u.email);
  const uniqueEmails = new Set(emails);
  if (uniqueEmails.size !== emails.length) {
    rawFindings.push({
      patternId: 'duplicate_seed_data_on_rerun',
      message: 'Duplicate email addresses detected in generated users.',
      severity: 'warning',
      evidence: `unique=${uniqueEmails.size}, total=${emails.length}`,
    });
  }

  // --- Manifest-based detections ---

  // failure_without_trace_or_screenshot
  const failedSteps = manifest.steps.filter((s: StepResult) => s.status === 'failed');
  for (const step of failedSteps) {
    if (!step.screenshotPath) {
      rawFindings.push({
        patternId: 'failure_without_trace_or_screenshot',
        message: `Failed step "${step.stepId}" has no failure screenshot.`,
        stepId: step.stepId,
        severity: 'error',
        evidence: `screenshotPath=${step.screenshotPath ?? 'missing'}`,
      });
    }
  }

  // report_claims_pass_without_screenshot
  const planStepsWithScreenshot = new Set(
    plan.steps.filter((s) => s.screenshot).map((s) => s.id),
  );
  for (const step of manifest.steps) {
    if (step.status === 'passed' && planStepsWithScreenshot.has(step.stepId) && !step.screenshotPath) {
      rawFindings.push({
        patternId: 'report_claims_pass_without_screenshot',
        message: `Passed step "${step.stepId}" was configured for a screenshot but none was captured.`,
        stepId: step.stepId,
        severity: 'warning',
        evidence: `screenshot=${step.screenshotPath ?? 'missing'}`,
      });
    }
  }

  // readiness_score_not_linked_to_failed_steps
  const hasFailedSteps = manifest.steps.some((s: StepResult) => s.status === 'failed');
  if (hasFailedSteps && manifest.status !== 'failed') {
    rawFindings.push({
      patternId: 'readiness_score_not_linked_to_failed_steps',
      message: `Manifest status is "${manifest.status}" despite ${failedSteps.length} failed step(s).`,
      severity: 'warning',
      evidence: `manifest.status=${manifest.status}, failedSteps=${failedSteps.length}`,
    });
  }

  // --- Enrich all findings ---
  const findings = rawFindings.map(enrichFinding);

  // --- Summary ---
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const info = findings.filter((f) => f.severity === 'info').length;
  const impact = computeImpact(findings);

  return { findings, summary: { errors, warnings, info }, impact };
}
