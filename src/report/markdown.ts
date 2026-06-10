import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowPlan, GoldenDataSet, RunManifest, ReadinessVerdict, StepResult } from '../schemas/core.js';
import type { PatternFinding } from '../patterns/types.js';
import type { ArtifactValidationResult } from '../artifacts/validator.js';
import type { WorkflowTemplate } from '../templates/types.js';
import type { FixtureValidationResult } from '../fixtures/validator.js';
import type { ScopeAnalysis } from '../scope/types.js';
import type { FailureClassificationReport } from '../failures/types.js';
import type { GalleryData } from '../evidence/gallery.js';

export interface ReportOptions {
  prompt: string;
  plan: WorkflowPlan;
  data: GoldenDataSet;
  manifest: RunManifest;
  runDir: string;
  verdict: ReadinessVerdict;
  findings?: PatternFinding[];
  validation?: ArtifactValidationResult;
  template?: WorkflowTemplate;
  fixtureValidation?: FixtureValidationResult;
  scopeAnalysis?: ScopeAnalysis;
  failureClassification?: FailureClassificationReport;
  galleryData?: GalleryData;
  preflightScan?: import('../scanner/types.js').AppTestabilityScan;
  industryAssessment?: import('../industry/types.js').IndustryPackAssessment;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'passed': return '**Passed**';
    case 'failed': return '**Failed**';
    case 'skipped': return '*Skipped*';
    default: return status;
  }
}

function verdictLabel(verdict: ReadinessVerdict): string {
  switch (verdict) {
    case 'ready_for_demo': return 'Ready for Demo';
    case 'conditionally_ready': return 'Conditionally Ready';
    case 'not_ready': return 'Not Ready';
    case 'needs_human_review': return 'Needs Human Review';
  }
}

function collectScreenshots(runDir: string): string[] {
  const ssDir = path.join(runDir, 'screenshots');
  if (!fs.existsSync(ssDir)) return [];
  return fs
    .readdirSync(ssDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => path.join('screenshots', f));
}

function hasTrace(runDir: string): boolean {
  return fs.existsSync(path.join(runDir, 'trace.zip'));
}

export function generateMarkdownReport(options: ReportOptions): string {
  const { prompt, plan, data, manifest, runDir, verdict } = options;
  const screenshots = collectScreenshots(runDir);
  const traceExists = hasTrace(runDir);
  const failedSteps = manifest.steps.filter((s: StepResult) => s.status === 'failed');

  const totalDuration = manifest.completedAt && manifest.startedAt
    ? new Date(manifest.completedAt).getTime() - new Date(manifest.startedAt).getTime()
    : 0;

  const lines: string[] = [];

  lines.push('# ForgeQA Run Report');
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run ID | \`${manifest.runId}\` |`);
  lines.push(`| E2E Run ID | \`${manifest.e2eRunId}\` |`);
  lines.push(`| Status | ${statusBadge(manifest.status)} |`);
  lines.push(`| Template | ${plan.templateName} (\`${plan.templateId}\`) |`);
  lines.push(`| Duration | ${formatDuration(totalDuration)} |`);
  lines.push(`| Steps | ${manifest.steps.length} total, ${manifest.steps.filter((s: StepResult) => s.status === 'passed').length} passed, ${failedSteps.length} failed |`);
  lines.push('');

  // Readiness Verdict
  lines.push('## Demo Readiness Verdict');
  lines.push('');
  lines.push(`**${verdictLabel(verdict)}**`);
  lines.push('');
  if (verdict === 'ready_for_demo') {
    lines.push('All critical steps passed. The workflow is safe to demonstrate.');
  } else if (verdict === 'not_ready') {
    lines.push('One or more critical steps failed. Do not demo without review.');
  } else if (verdict === 'conditionally_ready') {
    lines.push('Some non-critical issues detected. Demo with caution.');
  } else {
    lines.push('Insufficient evidence for a clear verdict. Human review required.');
  }
  lines.push('');

  // Readiness Impact from patterns
  const impact = options.findings && options.findings.length > 0 ? computePatternImpact(options.findings) : null;
  if (impact) {
    lines.push('### Readiness Impact from Patterns');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    const errors = options.findings!.filter((f) => f.severity === 'error').length;
    const warnings = options.findings!.filter((f) => f.severity === 'warning').length;
    const info = options.findings!.filter((f) => f.severity === 'info').length;
    lines.push(`| Errors | ${errors} |`);
    lines.push(`| Warnings | ${warnings} |`);
    lines.push(`| Info | ${info} |`);
    lines.push(`| Impact | **${impact.verdict}** — ${impact.reason} |`);
    lines.push('');
  }

  // Prompt
  lines.push('## Prompt Executed');
  lines.push('');
  lines.push(`> ${prompt}`);
  lines.push('');

  // Preflight Scan
  if (options.preflightScan) {
    lines.push('## Preflight Testability Scan');
    lines.push('');
    lines.push(`- **Scan ID:** \`${options.preflightScan.scanId}\``);
    lines.push(`- **Status:** ${options.preflightScan.status}`);
    lines.push(`- **Score:** ${options.preflightScan.score.overall}/100`);
    lines.push(`- **Selector Score:** ${options.preflightScan.score.selectorScore}/100`);
    lines.push(`- **Accessibility Score:** ${options.preflightScan.score.accessibilityScore}/100`);
    lines.push(`- **Form Score:** ${options.preflightScan.score.formScore}/100`);
    lines.push(`- **Risk Score:** ${options.preflightScan.score.riskScore}/100`);
    lines.push(`- **Total Findings:** ${options.preflightScan.summary.totalFindings}`);
    lines.push(`  - Critical: ${options.preflightScan.summary.criticalCount}`);
    lines.push(`  - Error: ${options.preflightScan.summary.errorCount}`);
    lines.push(`  - Warning: ${options.preflightScan.summary.warningCount}`);
    lines.push(`  - Info: ${options.preflightScan.summary.infoCount}`);
    lines.push('');
    if (options.preflightScan.recommendations.length > 0) {
      lines.push('**Recommendations:**');
      for (const rec of options.preflightScan.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }
    if (options.preflightScan.suggestedTemplates && options.preflightScan.suggestedTemplates.length > 0) {
      lines.push('**Suggested Templates:**');
      for (const st of options.preflightScan.suggestedTemplates) {
        lines.push(`- ${st.templateName} (${st.confidence} confidence) — ${st.reason}`);
      }
      lines.push('');
    }
    lines.push(`*Full scan report available in \`preflight-scan/scan-report.md\`.*`);
    lines.push('');
  }

  // Workflow
  lines.push('## Workflow Matched');
  lines.push('');
  lines.push(`- **Name:** ${plan.templateName}`);
  lines.push(`- **ID:** \`${plan.templateId}\``);
  lines.push(`- **Description:** ${plan.description}`);
  if (options.template) {
    const t = options.template;
    lines.push(`- **Category:** ${t.category}`);
    lines.push(`- **Difficulty:** ${t.difficulty}`);
    lines.push(`- **Estimated Duration:** ${Math.round(t.estimatedDurationSeconds / 60)} min`);
    lines.push(`- **Tags:** ${t.tags.join(', ')}`);
    lines.push(`- **Risk Level:** ${t.riskLevel}`);
    lines.push(`- **Requires Auth:** ${t.requiresAuth ? 'yes' : 'no'}`);
    lines.push(`- **File Upload:** ${t.requiresFileUpload ? 'yes' : 'no'}`);
    lines.push(`- **Supported Modes:** ${t.supportedModes.join(', ')}`);
  }
  lines.push('');

  // Diagnostic Scenario
  if (options.template?.category === 'diagnostic') {
    lines.push('## Diagnostic Scenario');
    lines.push('');
    lines.push(`- **Scenario ID:** ${plan.templateId}`);
    lines.push(`- **Expected Findings:** This scenario is designed to trigger ForgeQA pattern detection.`);
    const detectedFindings = options.findings?.length ?? 0;
    lines.push(`- **Detected Findings:** ${detectedFindings}`);
    lines.push(`- **Tags:** ${options.template?.tags.join(', ')}`);
    const diagnosticVerdict = detectedFindings > 0 ? 'diagnostic_pass' : 'diagnostic_fail';
    lines.push(`- **Diagnostic Verdict:** ${diagnosticVerdict}`);
    lines.push('');
    lines.push('*This is a diagnostic run, not a product readiness assessment. Pattern findings here are expected by design.*');
    lines.push('');
  }

  // Tested Scope
  if (options.scopeAnalysis) {
    lines.push('## Tested Scope');
    lines.push('');
    const tested = options.scopeAnalysis.items.filter((i) => i.status === 'tested');
    if (tested.length > 0) {
      for (const item of tested) {
        lines.push(`- **${item.label}** (${item.confidence} confidence)`);
        if (item.evidenceStepIds.length > 0) {
          lines.push(`  - Evidence: ${item.evidenceStepIds.join(', ')}`);
        }
      }
    } else {
      lines.push('*No fully tested scope items.*');
    }
    lines.push('');

    lines.push('## Not Tested / Out of Scope');
    lines.push('');
    const notTested = options.scopeAnalysis.items.filter((i) => i.status === 'not_tested');
    if (notTested.length > 0) {
      for (const item of notTested) {
        lines.push(`- **${item.label}** — ${item.reason}`);
        if (item.recommendation) {
          lines.push(`  - Recommendation: ${item.recommendation}`);
        }
      }
    } else {
      lines.push('*All declared scope items were tested or partially tested.*');
    }
    lines.push('');

    lines.push('## Scoped Readiness Statement');
    lines.push('');
    lines.push(`> ${options.scopeAnalysis.scopedReadinessStatement}`);
    lines.push('');
  }

  // URL Safety
  const policyFindings = options.findings?.filter((f) =>
    ['external_url_blocked', 'likely_production_target', 'external_host_requires_allowlist',
     'payment_domain_blocked', 'oauth_domain_blocked', 'unsafe_protocol_blocked',
     'credential_input_not_supported'].includes(f.patternId),
  ) ?? [];
  if (policyFindings.length > 0 || options.template?.supportedModes.includes('external')) {
    lines.push('## URL Safety / External Mode Policy');
    lines.push('');
    lines.push(`- **Mode:** ${options.template?.supportedModes.includes('external') ? 'external' : 'demo'}`);
    if (options.template?.baseUrl) {
      lines.push(`- **Base URL:** ${options.template.baseUrl}`);
    }
    if (policyFindings.length > 0) {
      lines.push('');
      lines.push('**Policy Findings:**');
      for (const f of policyFindings) {
        const icon = f.severity === 'error' ? '❌' : '⚠️';
        lines.push(`- ${icon} **${f.patternId}**: ${f.message}`);
      }
    } else {
      lines.push('*No policy findings.*');
    }
    lines.push('');
    lines.push('*ForgeQA executed only the approved workflow template. It did not crawl the site or perform unrestricted browser actions.*');
    lines.push('');
  }

  // Golden Data Safety
  lines.push('## Golden Data Safety');
  lines.push('');
  lines.push(`- **Data Profile:** ${data.profileType ?? 'default'}`);
  lines.push(`- **Users generated:** ${data.users.length}`);
  lines.push(`- **Files generated:** ${data.files.length}`);
  lines.push(`- **Forms generated:** ${data.forms?.length ?? 0}`);
  lines.push(`- **Table records generated:** ${data.tableRecords?.length ?? 0}`);
  lines.push(`- **Approved domains:** forgeqa.test, forgecircle.test, example.test`);
  const auditPath = path.join(options.runDir, 'data-safety-audit.json');
  let auditStatus = 'not_run';
  if (fs.existsSync(auditPath)) {
    try {
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
      auditStatus = audit.status;
    } catch { /* ignore */ }
  }
  lines.push(`- **Data safety audit status:** ${auditStatus}`);
  if (auditStatus === 'fail') {
    lines.push('- ⚠️ **Data safety audit detected failures. Review data-safety-audit.md.**');
  }
  lines.push('');
  lines.push('*ForgeQA generated only synthetic test data. No real user data was used. No cleanup execution occurred.*');
  lines.push('');

  // Execution Policy
  if (manifest.executionPolicy) {
    const ep = manifest.executionPolicy;
    lines.push('## Execution Policy / Safe Action Gates');
    lines.push('');
    lines.push(`- **Mode:** ${ep.mode}`);
    lines.push(`- **Strict Policy:** ${ep.strictPolicy ? 'yes' : 'no'}`);
    lines.push(`- **Submit Allowed:** ${ep.allowSubmit ? 'yes' : 'no'}`);
    lines.push(`- **Upload Allowed:** ${ep.allowUpload ? 'yes' : 'no'}`);
    if (ep.approvedRiskReason) {
      lines.push(`- **Approved Risk Reason:** ${ep.approvedRiskReason}`);
    }
    lines.push(`- **Allowed steps:** ${ep.allowedCount}`);
    lines.push(`- **Caution steps:** ${ep.cautionCount}`);
    lines.push(`- **Blocked steps:** ${ep.blockedCount}`);
    lines.push('');

    if (options.template) {
      lines.push('### Template Policy Metadata');
      lines.push('');
      lines.push(`- **Template ID:** ${options.template.id}`);
      lines.push(`- **Template allows external submit:** ${options.template.allowExternalSubmit ? 'yes' : 'no'}`);
      lines.push(`- **Template allows external upload:** ${options.template.allowExternalUpload ? 'yes' : 'no'}`);
      lines.push(`- **Mutation risk:** ${options.template.mutationRisk ?? 'unspecified'}`);
      lines.push(`- **Expected mutation scope:** ${options.template.expectedMutationScope ?? 'unspecified'}`);
      lines.push('');
    }

    if (manifest.policyDecisions) {
      const blocked = manifest.policyDecisions.filter((d) => d.riskLevel === 'blocked');
      if (blocked.length > 0) {
        lines.push('### Blocked Actions');
        lines.push('');
        for (const b of blocked) {
          lines.push(`- **Step ${b.stepIndex + 1} (${b.action}):** ${b.message}`);
          if (b.suggestedFix) {
            lines.push(`  - *Fix:* ${b.suggestedFix}`);
          }
        }
        lines.push('');
      }
      const caution = manifest.policyDecisions.filter((d) => d.riskLevel === 'caution');
      if (caution.length > 0) {
        lines.push('### Caution Actions');
        lines.push('');
        for (const c of caution) {
          lines.push(`- **Step ${c.stepIndex + 1} (${c.action}):** ${c.message}`);
          if (c.suggestedFix) {
            lines.push(`  - *Fix:* ${c.suggestedFix}`);
          }
        }
        lines.push('');
      }
    }

    lines.push('*ForgeQA evaluated each step before execution. Blocked steps were not executed. Policy gates are separate from Playwright actionability checks.*');
    lines.push('*Overrides cannot bypass hard safety blocks: destructive, payment, email-sending, OAuth, and credential actions are always blocked regardless of flags.*');
    lines.push('');
  }

  // Metadata
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- **Started:** ${manifest.startedAt}`);
  if (manifest.completedAt) {
    lines.push(`- **Completed:** ${manifest.completedAt}`);
  }
  const relArtifactsDir = manifest.artifactsDir.startsWith(process.cwd())
    ? path.relative(process.cwd(), manifest.artifactsDir)
    : manifest.artifactsDir;
  lines.push(`- **Artifacts:** ${relArtifactsDir}`);
  if (manifest.viewport) {
    lines.push(`- **Viewport:** ${manifest.viewport.profile ?? 'custom'} (${manifest.viewport.width}x${manifest.viewport.height})`);
    lines.push(`- **Mobile:** ${manifest.viewport.isMobile ? 'yes' : 'no'}`);
    lines.push(`- **Touch:** ${manifest.viewport.hasTouch ? 'yes' : 'no'}`);
    lines.push(`- **Scale Factor:** ${manifest.viewport.deviceScaleFactor ?? 1}`);
  }
  lines.push('');

  // Golden Data
  lines.push('## Golden Data Summary');
  lines.push('');
  lines.push(`- **Users generated:** ${data.users.length}`);
  lines.push(`- **Files generated:** ${data.files.length}`);
  lines.push(`- **Test domain:** \`forgeqa.test\``);
  lines.push(`- **All data tagged:** createdByForgeQA=true, safeToDelete=true`);
  if (data.users.length > 0) {
    const u = data.users[0];
    lines.push(`- **Sample user:** ${u.displayName} (${u.email})`);
  }
  lines.push('');

  // Step Results
  lines.push('## Step Results');
  lines.push('');
  lines.push('| # | Step | Action | Status | Duration |');
  lines.push('|---|------|--------|--------|----------|');
  for (const step of manifest.steps) {
    const planStep = plan.steps.find((ps: { id: string }) => ps.id === step.stepId);
    const desc = planStep?.description ?? step.stepId;
    const action = planStep?.action ?? '—';
    const dur = step.durationMs !== undefined ? formatDuration(step.durationMs) : '—';
    lines.push(`| ${planStep?.order ?? '?'} | ${desc} | ${action} | ${statusBadge(step.status)} | ${dur} |`);
  }
  lines.push('');

  // Failure Type Classification
  if (options.failureClassification) {
    lines.push('## Failure Type Classification');
    lines.push('');
    if (options.failureClassification.classifications.length === 0) {
      lines.push('> No failed steps required classification.');
      lines.push('');
    } else {
      lines.push(`| Step | Type | Confidence | Owner | Next Action |`);
      lines.push(`|------|------|------------|-------|-------------|`);
      for (const c of options.failureClassification.classifications) {
        lines.push(`| ${c.stepId} | ${c.failureType} | ${c.confidence} | ${c.suggestedOwner} | ${c.recommendedNextAction} |`);
      }
      lines.push('');
      const diagCount = options.failureClassification.summary.expectedDiagnosticCount;
      if (diagCount > 0) {
        lines.push(`*${diagCount} expected diagnostic failure(s) detected. These validate the detector, not a product defect.*`);
        lines.push('');
      }
    }
  }

  // Pattern Findings
  const findings = options.findings ?? [];
  if (findings.length > 0) {
    lines.push('## Pattern Findings');
    lines.push('');
    lines.push(`| Severity | Pattern | Message | Step |`);
    lines.push(`|----------|---------|---------|------|`);
    for (const finding of findings) {
      const severity = finding.severity === 'error' ? '🔴 Error' : finding.severity === 'warning' ? '🟡 Warning' : '🔵 Info';
      const name = finding.title ?? finding.patternId;
      const stepRef = finding.stepId ? `\`${finding.stepId}\`` : '—';
      lines.push(`| ${severity} | ${name} | ${finding.message} | ${stepRef} |`);
    }
    lines.push('');

    // Enriched details for each finding
    for (const finding of findings) {
      lines.push(`### ${finding.title ?? finding.patternId}`);
      lines.push('');
      if (finding.evidence) {
        lines.push(`**Evidence:** ${finding.evidence}`);
      }
      if (finding.rootCause) {
        lines.push(`**Root Cause:** ${finding.rootCause}`);
      }
      if (finding.howToConfirm) {
        lines.push(`**How to Confirm:** ${finding.howToConfirm}`);
      }
      if (finding.safeFix) {
        lines.push(`**Safe Fix:** ${finding.safeFix}`);
      }
      if (finding.preventionRule) {
        lines.push(`**Prevention Rule:** ${finding.preventionRule}`);
      }
      if (finding.sourceConfidence) {
        lines.push(`**Source Confidence:** ${finding.sourceConfidence}`);
      }
      if (finding.relatedPatterns && finding.relatedPatterns.length > 0) {
        lines.push(`**Related Patterns:** ${finding.relatedPatterns.join(', ')}`);
      }
      if (finding.sourceUrl) {
        lines.push(`**Source:** ${finding.sourceType ?? 'docs'} — ${finding.sourceUrl}`);
      }
      lines.push('');
    }
  }

  // DOM Analysis
  const domFindings = manifest.domFindings ?? [];
  if (domFindings.length > 0) {
    lines.push('## DOM Analysis');
    lines.push('');
    lines.push(`| Severity | Pattern | Message | Step |`);
    lines.push(`|----------|---------|---------|------|`);
    for (const finding of domFindings) {
      const severity = finding.severity === 'error' ? '🔴 Error' : finding.severity === 'warning' ? '🟡 Warning' : '🔵 Info';
      const name = finding.title ?? finding.patternId;
      const stepRef = finding.stepId ? `\`${finding.stepId}\`` : '—';
      lines.push(`| ${severity} | ${name} | ${finding.message} | ${stepRef} |`);
    }
    lines.push('');

    for (const finding of domFindings) {
      lines.push(`### ${finding.title ?? finding.patternId}`);
      lines.push('');
      if (finding.evidence) {
        lines.push(`**Evidence:** ${finding.evidence}`);
      }
      if (finding.rootCause) {
        lines.push(`**Root Cause:** ${finding.rootCause}`);
      }
      if (finding.safeFix) {
        lines.push(`**Safe Fix:** ${finding.safeFix}`);
      }
      if (finding.sourceConfidence) {
        lines.push(`**Source Confidence:** ${finding.sourceConfidence}`);
      }
      lines.push('');
    }
  }

  // Fixture Integrity
  const fixtureValidation = options.fixtureValidation;
  if (fixtureValidation) {
    lines.push('## Fixture Integrity');
    lines.push('');
    lines.push(`- **Fixture Route:** ${fixtureValidation.route ?? 'N/A'}`);
    lines.push(`- **Fixture Path:** ${fixtureValidation.fixturePath ?? 'N/A'}`);
    lines.push(`- **Validation Status:** ${fixtureValidation.status}`);
    const missingSelectors = fixtureValidation.checks
      .filter((c) => c.name === 'required selectors present' && c.status === 'fail')
      .flatMap((c) => {
        const match = c.message.match(/Missing required selectors: (.*)/);
        return match ? match[1].split(',').map((s) => s.trim()) : [];
      });
    if (missingSelectors.length > 0) {
      lines.push(`- **Missing Selectors:** ${missingSelectors.join(', ')}`);
    } else {
      lines.push('- **Missing Selectors:** none');
    }
    const hasExternalAssets = fixtureValidation.checks.some((c) => c.name === 'no external assets' && c.status === 'fail');
    lines.push(`- **External Asset Check:** ${hasExternalAssets ? 'failed' : 'passed'}`);
    const routeRegistered = !fixtureValidation.findings.some((f) => f.patternId === 'fixture_route_missing_file');
    lines.push(`- **Route Registration Check:** ${routeRegistered ? 'passed' : 'failed'}`);
    if (fixtureValidation.checks.some((c) => c.name === 'required selectors present' && c.status === 'info' && c.message.includes('diagnostic'))) {
      lines.push('- **Diagnostic Exception:** expected missing selectors declared');
    }
    lines.push('');
  }

  // Report Health
  const validation = options.validation;
  if (validation) {
    lines.push('## Report Health');
    lines.push('');
    lines.push('| Check | Status | Message |');
    lines.push('|-------|--------|---------|');
    for (const check of validation.checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      lines.push(`| ${check.name} | ${icon} ${check.status} | ${check.message} |`);
    }
    lines.push('');
    if (validation.findings.length > 0) {
      lines.push('**Validation Findings:**');
      lines.push('');
      for (const f of validation.findings) {
        const sev = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`- ${sev} **${f.title ?? f.patternId}**: ${f.message}`);
      }
      lines.push('');
    }
  }

  // Failed Steps
  if (failedSteps.length > 0) {
    lines.push('## Failed Step Details');
    lines.push('');
    for (const step of failedSteps) {
      const planStep = plan.steps.find((ps: { id: string }) => ps.id === step.stepId);
      lines.push(`### ${planStep?.description ?? step.stepId}`);
      lines.push(`- **Status:** Failed`);
      lines.push(`- **Error:** ${step.error ?? 'No error message'}`);
      if (step.screenshotPath) {
        lines.push(`- **Screenshot:** \`${path.basename(step.screenshotPath)}\``);
      }
      lines.push('');
    }
  }

  // Screenshots
  lines.push('## Screenshot Index');
  lines.push('');
  if (screenshots.length === 0) {
    lines.push('*No screenshots captured.*');
  } else {
    for (const ss of screenshots) {
      lines.push(`- \`${ss}\``);
    }
  }
  lines.push('');

  // Evidence Gallery
  if (options.galleryData) {
    lines.push('## Evidence Gallery');
    lines.push('');
    lines.push(`- **Screenshots:** ${options.galleryData.screenshotCount}`);
    lines.push(`- **Failed-step screenshots:** ${options.galleryData.failedStepScreenshotCount}`);
    lines.push(`- **Blocked-step screenshots:** ${options.galleryData.blockedStepScreenshotCount}`);
    lines.push(`- **Gallery files:** screenshot-gallery.html, screenshot-gallery.md`);
    if (options.galleryData.traceZipAvailable) {
      lines.push(`- **Trace ZIP:** Available. View locally with: \`pnpm exec playwright show-trace trace.zip\``);
    } else {
      lines.push('- **Trace ZIP:** Not available for this run.');
    }
    lines.push('');
  }

  // Trace
  lines.push('## Trace Artifact');
  lines.push('');
  if (traceExists) {
    lines.push('Trace archive available: `trace.zip`');
    lines.push('');
    lines.push('To inspect the trace locally, run: `npx playwright show-trace trace.zip`');
  } else {
    lines.push('*No trace archive generated.*');
  }
  lines.push('');

  // Industry Readiness Pack
  if (options.industryAssessment) {
    const ia = options.industryAssessment;
    lines.push('## Industry Readiness Pack');
    lines.push('');
    lines.push(`- **Pack:** ${ia.packName} (\`${ia.packId}\`)`);
    lines.push(`- **Status:** ${ia.status}`);
    lines.push(`- **Score:** ${ia.score}/100`);
    lines.push(`- **Required Coverage:** ${Math.round(ia.requiredCoverage * 100)}%`);
    lines.push('');
    if (ia.missingRequiredItems.length > 0) {
      lines.push('### Missing Required Items');
      lines.push('');
      for (const item of ia.missingRequiredItems) {
        lines.push(`- **${item.label}** — ${item.reason}`);
      }
      lines.push('');
    }
    if (ia.blockedByPolicyItems.length > 0) {
      lines.push('### Blocked by Policy');
      lines.push('');
      for (const item of ia.blockedByPolicyItems) {
        lines.push(`- **${item.label}** — ${item.reason}`);
      }
      lines.push('');
    }
    if (ia.warnings.length > 0) {
      lines.push('### Warnings');
      lines.push('');
      for (const w of ia.warnings) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
    if (ia.recommendations.length > 0) {
      lines.push('### Recommendations');
      lines.push('');
      for (const r of ia.recommendations) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }
    if (ia.notTestedItems.length > 0) {
      lines.push('### Not Tested');
      lines.push('');
      for (const item of ia.notTestedItems) {
        lines.push(`- **${item.label}** (${item.severity}) — ${item.reason}`);
      }
      lines.push('');
    }
    lines.push('### Caveats');
    lines.push('');
    for (const c of ia.caveats) {
      lines.push(`- ${c}`);
    }
    lines.push('');
    lines.push(`> ${ia.disclaimer}`);
    lines.push('');
  }

  // Safety
  lines.push('## Safety Notes');
  lines.push('');
  lines.push('- All generated data uses the `forgeqa.test` domain.');
  lines.push('- All entities are tagged `createdByForgeQA=true`.');
  lines.push('- All cleanup targets are tagged `safeToDelete=true`.');
  lines.push('- No real user data was used.');
  lines.push('- Cleanup is dry-run only in MVP.');
  lines.push('');

  // Cleanup summary
  lines.push('## Cleanup Dry-Run Summary');
  lines.push('');
  lines.push(`- **Users that would be removed:** ${data.users.length}`);
  lines.push(`- **Files that would be removed:** ${data.files.length}`);
  lines.push('- **Actual deletions:** 0 (dry-run)');
  lines.push('');

  // Disclaimer
  lines.push('---');
  lines.push('');
  lines.push('*This report was generated automatically by ForgeQA MVP. It reflects the state of the workflow at the time of execution and should be reviewed before any demo or delivery decision.*');
  lines.push('');

  return lines.join('\n');
}

function computePatternImpact(findings: PatternFinding[]) {
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

export function computeReadinessVerdict(manifest: RunManifest): ReadinessVerdict {
  if (manifest.steps.length === 0) return 'needs_human_review';
  if (manifest.steps.every((s: StepResult) => s.status === 'passed')) return 'ready_for_demo';
  if (manifest.steps.some((s: StepResult) => s.status === 'failed')) return 'not_ready';
  return 'conditionally_ready';
}
