import fs from 'node:fs';
import path from 'node:path';
import type { IndustryPack, IndustryPackStatus } from './types.js';
import type { BatchResult } from '../batch/types.js';
import { getIndustryPackById } from './registry.js';
import { assessIndustryReadiness } from './assessor.js';
import type { AppTestabilityScan } from '../scanner/types.js';
import type { RunManifest } from '../schemas/core.js';

export interface BatchIndustryItemAssessment {
  runId: string;
  prompt: string;
  templateId: string;
  templateName: string;
  industryStatus: IndustryPackStatus;
  industryScore: number;
  testedScopeCount: number;
  notTestedCount: number;
  policyBlockedCount: number;
  failureTypes: string[];
  reportPath: string;
  industryAssessmentPath?: string;
}

export interface BatchIndustryAssessment {
  batchId: string;
  packId: string;
  packName: string;
  status: IndustryPackStatus;
  score: number;
  assessedAt: string;
  runIds: string[];
  itemAssessments: BatchIndustryItemAssessment[];
  aggregatedCoverage: number;
  requiredItemsTested: string[];
  requiredItemsMissing: string[];
  recommendedItemsTested: string[];
  recommendedItemsMissing: string[];
  optionalItemsTested: string[];
  notTestedItems: Array<{ label: string; reason: string; severity: 'info' | 'warning' | 'error' }>;
  blockedByPolicyItems: Array<{ label: string; reason: string }>;
  warnings: string[];
  recommendations: string[];
  caveats: string[];
  disclaimer: string;
  evidenceLinks: Array<{ type: string; path: string; description: string }>;
}

export function assessBatchAgainstIndustryPack(
  batchResult: BatchResult,
  pack: IndustryPack,
): BatchIndustryAssessment {
  const itemAssessments: BatchIndustryItemAssessment[] = [];
  const requiredItemsTested = new Set<string>();
  const requiredItemsMissing = new Set<string>();
  const recommendedItemsTested = new Set<string>();
  const recommendedItemsMissing = new Set<string>();
  const optionalItemsTested = new Set<string>();
  const blockedByPolicyItems: BatchIndustryAssessment['blockedByPolicyItems'] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const notTestedItems: BatchIndustryAssessment['notTestedItems'] = [];
  const evidenceLinks: BatchIndustryAssessment['evidenceLinks'] = [];

  const executedTemplateIds = new Set<string>();
  const isDiagnosticOrPolicy = (tid: string) => tid.startsWith('diagnostic.') || tid.startsWith('policy.');

  for (const item of batchResult.items) {
    if (item.status === 'completed' && item.runId) {
      executedTemplateIds.add(item.templateId);
    }
  }

  // Per-run item assessments
  for (const item of batchResult.items) {
    if (!item.runId) continue;

    const runDir = path.join(process.cwd(), 'artifacts', 'runs', item.runId);
    let scan: AppTestabilityScan | undefined;
    let manifest: RunManifest | undefined;

    try {
      const scanPath = path.join(runDir, 'preflight-scan', 'scan-result.json');
      if (fs.existsSync(scanPath)) {
        scan = JSON.parse(fs.readFileSync(scanPath, 'utf-8')) as AppTestabilityScan;
      }
    } catch { /* ignore */ }

    try {
      const manifestPath = path.join(runDir, 'run.json');
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RunManifest;
      }
    } catch { /* ignore */ }

    const context = { scan, runManifest: manifest };
    const assessment = assessIndustryReadiness(pack, context);

    const policyBlockedCount = assessment.blockedByPolicyItems.length;
    const failureTypes: string[] = [];
    try {
      const failureReportPath = path.join(runDir, 'failure-classification.json');
      if (fs.existsSync(failureReportPath)) {
        const failureReport = JSON.parse(fs.readFileSync(failureReportPath, 'utf-8'));
        for (const fc of failureReport.classifications ?? []) {
          failureTypes.push(fc.failureType);
        }
      }
    } catch { /* ignore */ }

    itemAssessments.push({
      runId: item.runId,
      prompt: item.prompt,
      templateId: item.templateId,
      templateName: item.templateName,
      industryStatus: assessment.status,
      industryScore: assessment.score,
      testedScopeCount: assessment.requiredCoverage > 0 ? 1 : 0,
      notTestedCount: assessment.missingRequiredItems.length + assessment.notTestedItems.length,
      policyBlockedCount,
      failureTypes,
      reportPath: `artifacts/runs/${item.runId}/report.md`,
      industryAssessmentPath: fs.existsSync(path.join(runDir, 'industry-assessment.json'))
        ? `artifacts/runs/${item.runId}/industry-assessment.json`
        : undefined,
    });

    evidenceLinks.push({
      type: 'run',
      path: `artifacts/runs/${item.runId}/report.md`,
      description: `Run report for ${item.prompt}`,
    });

    for (const b of assessment.blockedByPolicyItems) {
      blockedByPolicyItems.push(b);
    }
  }

  // Check required templates
  for (const rec of pack.recommendedTemplates) {
    if (rec.priority === 'required') {
      if (executedTemplateIds.has(rec.templateId)) {
        requiredItemsTested.add(rec.templateId);
      } else {
        requiredItemsMissing.add(rec.templateId);
        notTestedItems.push({
          label: rec.templateId,
          reason: `Required template "${rec.templateId}" was not executed in this batch: ${rec.reason}`,
          severity: 'error',
        });
      }
    } else if (rec.priority === 'recommended') {
      if (executedTemplateIds.has(rec.templateId)) {
        recommendedItemsTested.add(rec.templateId);
      } else {
        recommendedItemsMissing.add(rec.templateId);
        notTestedItems.push({
          label: rec.templateId,
          reason: `Recommended template "${rec.templateId}" was not executed: ${rec.reason}`,
          severity: 'warning',
        });
      }
    } else if (rec.priority === 'optional') {
      if (executedTemplateIds.has(rec.templateId)) {
        optionalItemsTested.add(rec.templateId);
      }
    }
  }

  // Check optional templates
  for (const rec of pack.optionalTemplates) {
    if (executedTemplateIds.has(rec.templateId)) {
      optionalItemsTested.add(rec.templateId);
    }
  }

  // Pack-level not-tested warnings
  for (const w of pack.notTestedWarnings) {
    notTestedItems.push({
      label: w,
      reason: 'Not tested by any executed template in this batch.',
      severity: 'info',
    });
  }

  // Downgrade if any run is not_ready due to non-diagnostic failure
  const nonDiagnosticNotReady = itemAssessments.filter((ia) =>
    ia.industryStatus === 'not_ready' && !isDiagnosticOrPolicy(ia.templateId),
  );
  if (nonDiagnosticNotReady.length > 0) {
    warnings.push(`${nonDiagnosticNotReady.length} non-diagnostic run(s) marked not_ready.`);
  }

  // Downgrade if critical safety issue
  const hasCriticalFailure = itemAssessments.some((ia) =>
    ia.failureTypes.includes('app_bug') || ia.failureTypes.includes('data_issue'),
  );
  if (hasCriticalFailure) {
    warnings.push('Critical failure detected in one or more runs.');
  }

  // Calculate score
  const totalRequired = pack.recommendedTemplates.filter((r) => r.priority === 'required').length;
  const requiredCoverage = totalRequired > 0 ? requiredItemsTested.size / totalRequired : 1;
  const avgItemScore = itemAssessments.length > 0
    ? itemAssessments.reduce((sum, ia) => sum + ia.industryScore, 0) / itemAssessments.length
    : 0;
  const score = Math.round((requiredCoverage * 100 + avgItemScore) / 2);

  // Determine status
  let status: IndustryPackStatus;
  if (requiredItemsMissing.size > 0) {
    status = hasCriticalFailure ? 'not_ready' : 'needs_human_review';
  } else if (nonDiagnosticNotReady.length > 0 || warnings.length > 0) {
    status = 'ready_with_warnings';
  } else if (notTestedItems.length > 0) {
    status = 'ready_with_warnings';
  } else {
    status = 'ready';
  }

  // Recommendations
  if (requiredItemsMissing.size > 0) {
    recommendations.push(`Run the following required templates: ${Array.from(requiredItemsMissing).join(', ')}`);
  }
  if (recommendedItemsMissing.size > 0) {
    recommendations.push(`Consider running recommended templates: ${Array.from(recommendedItemsMissing).join(', ')}`);
  }
  if (blockedByPolicyItems.length > 0) {
    recommendations.push('Review policy-blocked items. These are expected for safe operation.');
  }

  return {
    batchId: batchResult.batchId,
    packId: pack.id,
    packName: pack.name,
    status,
    score,
    assessedAt: new Date().toISOString(),
    runIds: batchResult.runIds,
    itemAssessments,
    aggregatedCoverage: requiredCoverage,
    requiredItemsTested: Array.from(requiredItemsTested),
    requiredItemsMissing: Array.from(requiredItemsMissing),
    recommendedItemsTested: Array.from(recommendedItemsTested),
    recommendedItemsMissing: Array.from(recommendedItemsMissing),
    optionalItemsTested: Array.from(optionalItemsTested),
    notTestedItems,
    blockedByPolicyItems,
    warnings,
    recommendations,
    caveats: pack.caveats,
    disclaimer:
      'This is a ForgeQA readiness assessment, not legal, regulatory, security, or compliance certification.',
    evidenceLinks,
  };
}

export function generateBatchIndustryAssessmentMarkdown(assessment: BatchIndustryAssessment): string {
  const lines: string[] = [];
  lines.push(`# Batch Industry Readiness Assessment`);
  lines.push('');
  lines.push(`- **Batch ID:** \`${assessment.batchId}\``);
  lines.push(`- **Pack:** ${assessment.packName} (\`${assessment.packId}\`)`);
  lines.push(`- **Status:** ${assessment.status}`);
  lines.push(`- **Score:** ${assessment.score}/100`);
  lines.push(`- **Required Coverage:** ${Math.round(assessment.aggregatedCoverage * 100)}%`);
  lines.push(`- **Assessed At:** ${assessment.assessedAt}`);
  lines.push('');

  if (assessment.requiredItemsTested.length > 0) {
    lines.push('## Required Items Tested');
    lines.push('');
    for (const item of assessment.requiredItemsTested) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (assessment.requiredItemsMissing.length > 0) {
    lines.push('## Required Items Missing');
    lines.push('');
    for (const item of assessment.requiredItemsMissing) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (assessment.recommendedItemsTested.length > 0) {
    lines.push('## Recommended Items Tested');
    lines.push('');
    for (const item of assessment.recommendedItemsTested) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (assessment.recommendedItemsMissing.length > 0) {
    lines.push('## Recommended Items Missing');
    lines.push('');
    for (const item of assessment.recommendedItemsMissing) {
      lines.push(`- ${item}`);
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

  lines.push('## Per-Run Assessments');
  lines.push('');
  for (const item of assessment.itemAssessments) {
    lines.push(`### ${item.prompt}`);
    lines.push(`- **Run ID:** \`${item.runId}\``);
    lines.push(`- **Template:** ${item.templateName} (${item.templateId})`);
    lines.push(`- **Status:** ${item.industryStatus}`);
    lines.push(`- **Score:** ${item.industryScore}/100`);
    lines.push(`- **Report:** ${item.reportPath}`);
    if (item.industryAssessmentPath) {
      lines.push(`- **Industry Assessment:** ${item.industryAssessmentPath}`);
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

export function generateBatchIndustryAssessmentJson(assessment: BatchIndustryAssessment): string {
  return JSON.stringify(assessment, null, 2);
}

export function assessBatchById(batchId: string, packId: string): BatchIndustryAssessment | null {
  const pack = getIndustryPackById(packId);
  if (!pack) return null;

  const batchResultPath = path.join(process.cwd(), 'artifacts', 'batches', batchId, 'batch-result.json');
  if (!fs.existsSync(batchResultPath)) return null;

  const batchResult = JSON.parse(fs.readFileSync(batchResultPath, 'utf-8')) as BatchResult;
  return assessBatchAgainstIndustryPack(batchResult, pack);
}
