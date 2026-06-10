import type {
  IndustryPack,
  IndustryPackAssessment,
  IndustryPackStatus,
} from './types.js';
import { getIndustryPackById } from './registry.js';
import fs from 'node:fs';
import path from 'node:path';
import { getRunDir } from '../artifacts/manager.js';
import type { RunManifest } from '../schemas/core.js';
import type { AppTestabilityScan } from '../scanner/types.js';
import type { ScopeAnalysis } from '../scope/types.js';
import type { FailureClassificationReport } from '../failures/types.js';
import type { GoldenDataSafetyAudit } from '../data/types.js';

export interface AssessmentContext {
  scan?: AppTestabilityScan;
  runManifest?: RunManifest;
  scopeAnalysis?: ScopeAnalysis;
  failureClassification?: FailureClassificationReport;
  policyFindings?: Array<{ patternId: string; message: string; severity: string }>;
  dataSafetyAudit?: GoldenDataSafetyAudit;
}

export function assessIndustryReadiness(
  pack: IndustryPack,
  context: AssessmentContext,
): IndustryPackAssessment {
  const missingRequiredItems: IndustryPackAssessment['missingRequiredItems'] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const notTestedItems: IndustryPackAssessment['notTestedItems'] = [];
  const blockedByPolicyItems: IndustryPackAssessment['blockedByPolicyItems'] = [];
  const evidenceLinks: IndustryPackAssessment['evidenceLinks'] = [];

  // Determine which templates were executed
  const executedTemplateIds = new Set<string>();
  if (context.runManifest) {
    // Try to infer from run manifest
    executedTemplateIds.add(context.runManifest.templateId);
  }

  // Check required templates
  for (const rec of pack.recommendedTemplates) {
    if (rec.priority === 'required' && !executedTemplateIds.has(rec.templateId)) {
      missingRequiredItems.push({
        criterionId: rec.templateId,
        label: rec.templateId,
        reason: `Required template "${rec.templateId}" was not executed in this run.`,
      });
    }
  }

  // Check readiness criteria against scan findings
  for (const criterion of pack.readinessCriteria) {
    let passed = false;
    let failed = false;
    let notTested = true;

    if (context.scan) {
      notTested = false;
      // Evaluate based on criterion category and evidence sources
      if (criterion.category === 'testability') {
        const selectorOk = context.scan.selectorFindings.every((f) => f.severity !== 'critical' && f.severity !== 'error');
        passed = selectorOk && context.scan.score.overall >= 70;
        failed = !passed;
      } else if (criterion.category === 'accessibility') {
        const a11yCritical = context.scan.accessibilityFindings.some((f) => f.severity === 'critical');
        const a11yError = context.scan.accessibilityFindings.some((f) => f.severity === 'error');
        passed = !a11yCritical && !a11yError;
        failed = a11yCritical || a11yError;
      } else if (criterion.category === 'policy') {
        const riskCritical = context.scan.riskFindings.some((f) => f.severity === 'critical');
        passed = !riskCritical;
        failed = riskCritical;
      } else if (criterion.category === 'data-safety') {
        passed = context.dataSafetyAudit?.status !== 'fail';
        failed = context.dataSafetyAudit?.status === 'fail';
      } else if (criterion.category === 'forms') {
        const formCritical = context.scan.formFindings.some((f) => f.severity === 'critical');
        passed = !formCritical && context.scan.formFindings.length > 0;
        failed = formCritical;
      }
    }

    if (notTested) {
      notTestedItems.push({
        label: criterion.label,
        reason: criterion.notTestedMessage,
        severity: criterion.required ? 'error' : 'warning',
      });
    } else if (failed) {
      missingRequiredItems.push({
        criterionId: criterion.id,
        label: criterion.label,
        reason: criterion.failCondition,
      });
      if (criterion.required) {
        warnings.push(`Required criterion failed: ${criterion.label}`);
      }
    } else if (passed) {
      // good
    }
  }

  // Check policy blocked items
  if (context.policyFindings) {
    for (const pf of context.policyFindings) {
      blockedByPolicyItems.push({
        label: pf.patternId,
        reason: pf.message,
      });
    }
  }

  // Scan critical findings downgrade status
  if (context.scan) {
    const criticalFindings = context.scan.findings.filter((f) => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      warnings.push(`Scan found ${criticalFindings.length} critical finding(s).`);
      for (const f of criticalFindings) {
        recommendations.push(`Address critical finding: ${f.title} — ${f.message}`);
      }
    }
  }

  // Healthcare/education pack: flag real data risk
  if (pack.id === 'healthcare-appointment-safe' || pack.id === 'education-alumni') {
    if (context.dataSafetyAudit && context.dataSafetyAudit.status === 'fail') {
      warnings.push('Data safety audit found issues. Real patient/student data may be present.');
      recommendations.push('Ensure all test data uses approved test domains and safeToDelete=true.');
    }
  }

  // Not-tested warnings from pack
  for (const w of pack.notTestedWarnings) {
    notTestedItems.push({
      label: w,
      reason: 'Not tested by any executed template.',
      severity: 'info',
    });
  }

  // Evidence links
  if (context.scan) {
    evidenceLinks.push({
      type: 'scan',
      path: 'preflight-scan/scan-result.json',
      description: 'App testability scan results',
    });
  }
  if (context.runManifest) {
    evidenceLinks.push({
      type: 'run',
      path: 'run.json',
      description: 'Run manifest with step results',
    });
  }

  // Calculate score
  const totalRequired = pack.readinessCriteria.filter((c) => c.required).length;
  const passedRequired = totalRequired - missingRequiredItems.filter((m) =>
    pack.readinessCriteria.some((c) => c.required && c.id === m.criterionId),
  ).length;
  const coverage = totalRequired > 0 ? passedRequired / totalRequired : 1;

  let score = Math.round(coverage * 100);
  if (context.scan) {
    score = Math.round((score + context.scan.score.overall) / 2);
  }

  // Determine status
  let status: IndustryPackStatus;
  if (missingRequiredItems.length > 0 && missingRequiredItems.some((m) =>
    pack.readinessCriteria.some((c) => c.required && c.id === m.criterionId),
  )) {
    status = 'not_ready';
  } else if (warnings.length > 0 || notTestedItems.some((n) => n.severity === 'error')) {
    status = 'needs_human_review';
  } else if (notTestedItems.length > 0 || warnings.length > 0) {
    status = 'ready_with_warnings';
  } else {
    status = 'ready';
  }

  // Scan critical overrides to not_ready
  if (context.scan?.findings.some((f) => f.severity === 'critical')) {
    status = 'not_ready';
  }

  return {
    packId: pack.id,
    packName: pack.name,
    runId: context.runManifest?.runId,
    scanId: context.scan?.scanId,
    status,
    score,
    requiredCoverage: coverage,
    missingRequiredItems,
    warnings,
    recommendations,
    notTestedItems,
    blockedByPolicyItems,
    evidenceLinks,
    caveats: pack.caveats,
    disclaimer:
      'This is a ForgeQA readiness assessment, not legal, regulatory, security, or compliance certification.',
    assessedAt: new Date().toISOString(),
  };
}

export function assessRunAgainstIndustryPack(runId: string, packId: string): IndustryPackAssessment | null {
  const pack = getIndustryPackById(packId);
  if (!pack) return null;

  let runManifest: RunManifest | undefined;
  try {
    const runJsonPath = path.join(getRunDir(runId), 'run.json');
    if (fs.existsSync(runJsonPath)) {
      runManifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8')) as RunManifest;
    }
  } catch {
    // ignore
  }

  return assessIndustryReadiness(pack, { runManifest });
}

export function assessScanAgainstIndustryPack(
  scanResult: AppTestabilityScan,
  packId: string,
): IndustryPackAssessment | null {
  const pack = getIndustryPackById(packId);
  if (!pack) return null;

  return assessIndustryReadiness(pack, { scan: scanResult });
}

export function generateIndustryAssessmentMarkdown(assessment: IndustryPackAssessment): string {
  const lines: string[] = [];
  lines.push(`# Industry Readiness Pack: ${assessment.packName}`);
  lines.push('');
  lines.push(`- **Pack ID:** \`${assessment.packId}\``);
  lines.push(`- **Status:** ${assessment.status}`);
  lines.push(`- **Score:** ${assessment.score}/100`);
  lines.push(`- **Required Coverage:** ${Math.round(assessment.requiredCoverage * 100)}%`);
  lines.push(`- **Assessed At:** ${assessment.assessedAt}`);
  if (assessment.runId) lines.push(`- **Run ID:** \`${assessment.runId}\``);
  if (assessment.scanId) lines.push(`- **Scan ID:** \`${assessment.scanId}\``);
  lines.push('');

  if (assessment.missingRequiredItems.length > 0) {
    lines.push('## Missing Required Items');
    lines.push('');
    for (const item of assessment.missingRequiredItems) {
      lines.push(`- **${item.label}** — ${item.reason}`);
    }
    lines.push('');
  }

  if (assessment.blockedByPolicyItems.length > 0) {
    lines.push('## Blocked by Policy');
    lines.push('');
    for (const item of assessment.blockedByPolicyItems) {
      lines.push(`- **${item.label}** — ${item.reason}`);
    }
    lines.push('');
  }

  if (assessment.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of assessment.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  if (assessment.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const r of assessment.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  if (assessment.notTestedItems.length > 0) {
    lines.push('## Not Tested');
    lines.push('');
    for (const item of assessment.notTestedItems) {
      lines.push(`- **${item.label}** (${item.severity}) — ${item.reason}`);
    }
    lines.push('');
  }

  lines.push('## Caveats');
  lines.push('');
  for (const c of assessment.caveats) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Disclaimer');
  lines.push('');
  lines.push(`> ${assessment.disclaimer}`);
  lines.push('');

  return lines.join('\n');
}

export function generateIndustryAssessmentJson(assessment: IndustryPackAssessment): string {
  return JSON.stringify(assessment, null, 2);
}
