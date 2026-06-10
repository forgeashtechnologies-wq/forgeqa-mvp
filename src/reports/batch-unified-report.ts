import fs from 'node:fs';
import path from 'node:path';
import type { UnifiedBatchReport, UnifiedBatchFinding, UnifiedBatchRunSummary } from './batch-unified-types.js';

const DISCLAIMER_TEXT =
  'This ForgeQA unified batch report validates scoped QA readiness artifacts only. It does not certify the application as secure, compliant, bug-free, or production-ready.';

export function buildUnifiedBatchReport(batchId: string): UnifiedBatchReport {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchId);
  if (!fs.existsSync(batchDir)) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  const planPath = path.join(batchDir, 'batch-plan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error(`Batch plan not found: ${planPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  // Result
  const resultPath = path.join(batchDir, 'batch-result.json');
  let result: UnifiedBatchReport['result'] | undefined;
  if (fs.existsSync(resultPath)) {
    const batchResult = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    const items = batchResult.items ?? [];
    const runIds: string[] = batchResult.runIds ?? [];
    result = {
      totalRuns: items.length,
      completedRuns: items.filter((i: any) => i.status === 'completed').length,
      failedRuns: items.filter((i: any) => i.status === 'failed').length,
      notReadyRuns: items.filter((i: any) => i.verdict === 'not_ready').length,
      readyRuns: items.filter((i: any) => i.verdict === 'ready_for_demo').length,
      dryRunCount: items.filter((i: any) => i.status === 'dry-run').length,
      runIds,
    };
    if (batchResult.startedAt && batchResult.completedAt) {
      result.totalDurationMs = new Date(batchResult.completedAt).getTime() - new Date(batchResult.startedAt).getTime();
    }
  }

  // Validation
  const validationPath = path.join(batchDir, 'batch-validation.json');
  let validation: UnifiedBatchReport['validation'] = {
    status: 'pass',
    checkCount: 0,
    warnings: 0,
    failures: 0,
    missingFiles: [],
    brokenLinks: [],
    validationArtifactPath: `artifacts/batches/${batchId}/batch-validation.json`,
  };
  if (fs.existsSync(validationPath)) {
    const v = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
    validation = {
      status: v.status ?? 'pass',
      checkCount: v.summary?.totalChecks ?? (v.checks ?? []).length,
      warnings: v.summary?.warnCount ?? 0,
      failures: v.summary?.failCount ?? 0,
      missingFiles: v.summary?.missingFiles ?? [],
      brokenLinks: v.summary?.brokenLinks ?? [],
      validationArtifactPath: `artifacts/batches/${batchId}/batch-validation.json`,
    };
  }

  // Repair
  const repairPath = path.join(batchDir, 'batch-repair.json');
  let repair: UnifiedBatchReport['repair'] | undefined;
  if (fs.existsSync(repairPath)) {
    const r = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    repair = {
      status: r.status ?? 'skipped',
      totalActions: r.summary?.totalActions ?? 0,
      fixedCount: r.summary?.fixedCount ?? 0,
      skippedCount: r.summary?.skippedCount ?? 0,
      manualReviewCount: r.summary?.manualReviewCount ?? 0,
      failedCount: r.summary?.failedCount ?? 0,
      repairArtifactPath: `artifacts/batches/${batchId}/batch-repair.json`,
    };
  }

  // Manifest
  const manifestPath = path.join(batchDir, 'batch-manifest.json');
  let manifest: UnifiedBatchReport['manifest'] = {
    artifactCount: 0,
    validationStatus: 'unknown',
    requiredMissingCount: 0,
    runIds: [],
    manifestPath: `artifacts/batches/${batchId}/batch-manifest.json`,
  };
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const artifacts = m.artifacts ?? [];
    manifest = {
      artifactCount: artifacts.length,
      validationStatus: m.validationStatus ?? 'unknown',
      requiredMissingCount: artifacts.filter((a: any) => a.required && !a.present).length,
      runIds: m.runIds ?? [],
      manifestPath: `artifacts/batches/${batchId}/batch-manifest.json`,
    };
  }

  // Industry
  const industryPath = path.join(batchDir, 'industry-batch-assessment.json');
  let industry: UnifiedBatchReport['industry'] | undefined;
  if (fs.existsSync(industryPath)) {
    const ind = JSON.parse(fs.readFileSync(industryPath, 'utf-8'));
    industry = {
      packId: ind.packId ?? 'unknown',
      packName: ind.packName ?? 'unknown',
      status: ind.status ?? 'unknown',
      score: ind.score ?? 0,
      requiredItemsTested: ind.requiredItemsTested ?? [],
      requiredItemsMissing: ind.requiredItemsMissing ?? [],
      recommendedItemsMissing: ind.recommendedItemsMissing ?? [],
      blockedByPolicyItems: ind.blockedByPolicyItems ?? [],
      recommendations: ind.recommendations ?? [],
      industryAssessmentPath: `artifacts/batches/${batchId}/industry-batch-assessment.json`,
    };
  }

  // Run summaries
  const runSummaries: UnifiedBatchRunSummary[] = [];
  const linkedRunIds = result?.runIds ?? manifest.runIds ?? [];
  for (const runId of linkedRunIds) {
    const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
    let runSummary: UnifiedBatchRunSummary = {
      runId,
      status: 'unknown',
      verdict: 'unknown',
      artifactPath: `artifacts/runs/${runId}`,
    };

    if (!fs.existsSync(runDir)) {
      runSummary.status = 'missing';
      runSummary.verdict = 'not_ready';
    } else {
      const runJsonPath = path.join(runDir, 'run.json');
      if (fs.existsSync(runJsonPath)) {
        const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
        runSummary.prompt = runJson.prompt ?? runJson.templateId;
        runSummary.templateId = runJson.templateId;
        runSummary.status = runJson.status ?? 'unknown';
        runSummary.verdict = runJson.verdict ?? 'unknown';
      }

      // Check for unified report
      const unifiedPath = path.join(runDir, 'unified-report.json');
      if (fs.existsSync(unifiedPath)) {
        runSummary.unifiedReportPath = `artifacts/runs/${runId}/unified-report.json`;
      }

      // Check for validation
      const valPath = path.join(runDir, 'artifact-validation.json');
      if (fs.existsSync(valPath)) {
        const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
        const failCount = (val.checks ?? []).filter((c: any) => c.status === 'fail').length;
        const warnCount = (val.checks ?? []).filter((c: any) => c.status === 'warn').length;
        runSummary.validationStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
      }

      // Check for repair
      const repPath = path.join(runDir, 'artifact-repair.json');
      if (fs.existsSync(repPath)) {
        const rep = JSON.parse(fs.readFileSync(repPath, 'utf-8'));
        runSummary.repairStatus = rep.status ?? 'skipped';
      }

      runSummary.reportPath = `artifacts/runs/${runId}/report.md`;
    }

    runSummaries.push(runSummary);
  }

  // Repair actions
  const repairActions: UnifiedBatchReport['repairActions'] = [];
  if (fs.existsSync(repairPath)) {
    const r = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    for (const a of r.actions ?? []) {
      repairActions.push({
        id: a.id ?? '',
        category: a.category ?? '',
        status: a.status ?? '',
        message: a.message ?? '',
        file: a.file ?? undefined,
        safe: a.safe ?? false,
      });
    }
  }

  // Findings
  const findings: UnifiedBatchFinding[] = [];

  // Batch validation findings
  if (fs.existsSync(validationPath)) {
    const v = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
    for (const f of v.findings ?? []) {
      findings.push({
        severity: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info',
        source: 'batch_validation',
        title: f.title ?? 'Batch Validation Finding',
        message: f.message ?? '',
        file: f.file ?? undefined,
        suggestedFix: f.suggestedFix ?? undefined,
      });
    }
  }

  // Batch repair findings
  if (fs.existsSync(repairPath)) {
    const r = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    for (const f of r.findings ?? []) {
      findings.push({
        severity: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info',
        source: 'batch_repair',
        title: f.id ?? 'Batch Repair Finding',
        message: f.message ?? '',
        file: f.file ?? undefined,
        suggestedFix: f.suggestedManualFix ?? undefined,
      });
    }
  }

  // Missing linked runs
  const missingLinkedRuns = runSummaries.filter((r) => r.status === 'missing');
  for (const r of missingLinkedRuns) {
    findings.push({
      severity: 'error',
      source: 'linked_run',
      title: 'Missing Linked Run',
      message: `Run ${r.runId} is referenced but not found in artifacts/runs/`,
      runId: r.runId,
      suggestedFix: 'Run may have been deleted or not yet created.',
    });
  }

  // Industry findings
  if (industry && industry.requiredItemsMissing.length > 0) {
    findings.push({
      severity: 'warning',
      source: 'industry',
      title: 'Missing Required Industry Items',
      message: `${industry.requiredItemsMissing.length} required industry item(s) not tested: ${industry.requiredItemsMissing.join(', ')}`,
      suggestedFix: 'Add runs covering the missing required items.',
    });
  }

  // Recommended next steps
  const recommendedNextSteps: string[] = [];
  if (!result) {
    recommendedNextSteps.push('This batch is in preview mode. Run batch-execute to generate results.');
  }
  if (validation.failures > 0) {
    recommendedNextSteps.push('Review batch validation failures before sharing this report.');
  }
  if (repair && repair.manualReviewCount > 0) {
    recommendedNextSteps.push(`Review ${repair.manualReviewCount} batch repair item(s) marked for manual review.`);
  }
  if (missingLinkedRuns.length > 0) {
    recommendedNextSteps.push(`${missingLinkedRuns.length} linked run(s) are missing. Verify runs were not deleted.`);
  }
  if (industry && industry.requiredItemsMissing.length > 0) {
    recommendedNextSteps.push(`Address ${industry.requiredItemsMissing.length} missing required industry item(s).`);
  }
  if (recommendedNextSteps.length === 0) {
    recommendedNextSteps.push('Batch report is ready for founder review.');
  }

  return {
    batchId,
    createdAt: plan.createdAt ?? new Date().toISOString(),
    status: result ? (validation.status === 'fail' ? 'fail' : validation.status === 'warn' ? 'warn' : 'pass') : 'preview',
    mode: plan.options?.demo ? 'demo' : plan.options?.external ? 'external' : 'unknown',
    industryPackId: plan.industryPackId ?? undefined,
    industryPackName: plan.industryPackName ?? undefined,
    plan: {
      promptCount: plan.resolvedTemplates?.length ?? 0,
      prompts: plan.resolvedTemplates?.map((t: any) => t.prompt ?? t.id) ?? [],
      templateIds: plan.resolvedTemplates?.map((t: any) => t.templateId ?? t.id) ?? [],
      demo: plan.options?.demo ?? false,
      external: plan.options?.external ?? false,
      dryRun: plan.options?.dryRun ?? false,
      industryMappingStatus: plan.industryMappingStatus ?? undefined,
      missingRecommendedTemplates: plan.missingRecommendedTemplates ?? undefined,
    },
    result,
    validation,
    repair,
    manifest,
    industry,
    runSummaries,
    summary: {
      totalFindings: findings.length,
      totalRepairActions: repair?.totalActions ?? 0,
      manualReviewItems: repair?.manualReviewCount ?? 0,
      missingLinkedRuns: missingLinkedRuns.length,
    },
    findings,
    repairActions,
    recommendedNextSteps,
    artifactLinks: [
      { label: 'Batch Plan', path: `artifacts/batches/${batchId}/batch-plan.json`, exists: fs.existsSync(path.join(batchDir, 'batch-plan.json')), category: 'core' },
      { label: 'Batch Plan MD', path: `artifacts/batches/${batchId}/batch-plan.md`, exists: fs.existsSync(path.join(batchDir, 'batch-plan.md')), category: 'core' },
      { label: 'Batch Result', path: `artifacts/batches/${batchId}/batch-result.json`, exists: fs.existsSync(path.join(batchDir, 'batch-result.json')), category: 'core' },
      { label: 'Batch Result MD', path: `artifacts/batches/${batchId}/batch-result.md`, exists: fs.existsSync(path.join(batchDir, 'batch-result.md')), category: 'core' },
      { label: 'Validation JSON', path: `artifacts/batches/${batchId}/batch-validation.json`, exists: fs.existsSync(path.join(batchDir, 'batch-validation.json')), category: 'validation' },
      { label: 'Validation MD', path: `artifacts/batches/${batchId}/batch-validation.md`, exists: fs.existsSync(path.join(batchDir, 'batch-validation.md')), category: 'validation' },
      { label: 'Repair JSON', path: `artifacts/batches/${batchId}/batch-repair.json`, exists: fs.existsSync(path.join(batchDir, 'batch-repair.json')), category: 'repair' },
      { label: 'Repair MD', path: `artifacts/batches/${batchId}/batch-repair.md`, exists: fs.existsSync(path.join(batchDir, 'batch-repair.md')), category: 'repair' },
      { label: 'Manifest', path: `artifacts/batches/${batchId}/batch-manifest.json`, exists: fs.existsSync(path.join(batchDir, 'batch-manifest.json')), category: 'manifest' },
      { label: 'Industry Assessment', path: `artifacts/batches/${batchId}/industry-batch-assessment.json`, exists: fs.existsSync(path.join(batchDir, 'industry-batch-assessment.json')), category: 'industry' },
      { label: 'Industry Assessment MD', path: `artifacts/batches/${batchId}/industry-batch-assessment.md`, exists: fs.existsSync(path.join(batchDir, 'industry-batch-assessment.md')), category: 'industry' },
    ],
    caveats: [
      'This report is a consolidated view of batch artifacts.',
      'It does not replace individual run or batch validation reports.',
      'Always review original artifacts for full detail.',
      'This is a QA readiness check, not a compliance certification.',
    ],
    disclaimer: DISCLAIMER_TEXT,
  };
}

export function generateUnifiedBatchReportMarkdown(report: UnifiedBatchReport): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Unified Batch Report');
  lines.push('');
  lines.push(`- **Batch ID:** \`${report.batchId}\``);
  lines.push(`- **Status:** ${report.status.toUpperCase()}`);
  if (report.mode) lines.push(`- **Mode:** ${report.mode}`);
  if (report.industryPackId) lines.push(`- **Industry Pack:** ${report.industryPackName ?? report.industryPackId}`);
  lines.push(`- **Created At:** ${report.createdAt}`);
  lines.push('');

  lines.push('## Executive Summary');
  if (report.result) {
    lines.push(`- **Runs:** ${report.result.totalRuns} total, ${report.result.completedRuns} completed, ${report.result.failedRuns} failed`);
    lines.push(`- **Ready:** ${report.result.readyRuns}, **Not Ready:** ${report.result.notReadyRuns}`);
    if (report.result.totalDurationMs) {
      lines.push(`- **Duration:** ${(report.result.totalDurationMs / 1000).toFixed(1)}s`);
    }
  } else {
    lines.push('- **Preview-only batch** (no results yet)');
  }
  lines.push(`- **Validation:** ${report.validation.status.toUpperCase()} (${report.validation.checkCount} checks, ${report.validation.failures} failures, ${report.validation.warnings} warnings)`);
  if (report.repair) {
    lines.push(`- **Repair:** ${report.repair.status.toUpperCase()} (${report.repair.fixedCount} fixed, ${report.repair.manualReviewCount} manual review)`);
  } else {
    lines.push('- **Repair:** Not performed');
  }
  if (report.industry) {
    lines.push(`- **Industry:** ${report.industry.packName} — ${report.industry.status} (${report.industry.score}%)`);
  }
  lines.push(`- **Findings:** ${report.summary.totalFindings}`);
  lines.push(`- **Missing Linked Runs:** ${report.summary.missingLinkedRuns}`);
  lines.push('');

  lines.push('## Planned Prompts and Templates');
  for (let i = 0; i < report.plan.prompts.length; i++) {
    lines.push(`- ${i + 1}. **${report.plan.prompts[i]}** (${report.plan.templateIds[i] ?? 'unknown template'})`);
  }
  lines.push('');

  if (report.result) {
    lines.push('## Run Results Summary');
    lines.push(`- Total: ${report.result.totalRuns}`);
    lines.push(`- Completed: ${report.result.completedRuns}`);
    lines.push(`- Failed: ${report.result.failedRuns}`);
    lines.push(`- Ready for Demo: ${report.result.readyRuns}`);
    lines.push(`- Not Ready: ${report.result.notReadyRuns}`);
    lines.push(`- Dry-run: ${report.result.dryRunCount}`);
    lines.push('');

    lines.push('## Per-Run Status Table');
    lines.push('| Run ID | Prompt | Template | Status | Verdict | Validation | Repair |');
    lines.push('|--------|--------|----------|--------|---------|------------|--------|');
    for (const run of report.runSummaries) {
      const prompt = run.prompt ?? '-';
      const template = run.templateId ?? '-';
      const status = run.status;
      const verdict = run.verdict;
      const val = run.validationStatus ?? '-';
      const rep = run.repairStatus ?? '-';
      lines.push(`| \`${run.runId}\` | ${prompt} | ${template} | ${status} | ${verdict} | ${val} | ${rep} |`);
    }
    lines.push('');
  }

  lines.push('## Batch Validation Summary');
  lines.push(`- **Status:** ${report.validation.status.toUpperCase()}`);
  lines.push(`- **Checks:** ${report.validation.checkCount}`);
  lines.push(`- **Warnings:** ${report.validation.warnings}`);
  lines.push(`- **Failures:** ${report.validation.failures}`);
  lines.push(`- **Missing Files:** ${report.validation.missingFiles.length > 0 ? report.validation.missingFiles.join(', ') : 'none'}`);
  lines.push(`- **Broken Links:** ${report.validation.brokenLinks.length > 0 ? report.validation.brokenLinks.join(', ') : 'none'}`);
  lines.push('');

  if (report.repair) {
    lines.push('## Batch Repair Summary');
    lines.push(`- **Status:** ${report.repair.status.toUpperCase()}`);
    lines.push(`- **Total Actions:** ${report.repair.totalActions}`);
    lines.push(`- **Fixed:** ${report.repair.fixedCount}`);
    lines.push(`- **Skipped:** ${report.repair.skippedCount}`);
    lines.push(`- **Manual Review:** ${report.repair.manualReviewCount}`);
    lines.push(`- **Failed:** ${report.repair.failedCount}`);
    lines.push('');
  }

  lines.push('## Batch Manifest Summary');
  lines.push(`- **Artifact Count:** ${report.manifest.artifactCount}`);
  lines.push(`- **Validation Status:** ${report.manifest.validationStatus}`);
  lines.push(`- **Required Missing:** ${report.manifest.requiredMissingCount}`);
  lines.push(`- **Linked Runs:** ${report.manifest.runIds.length}`);
  lines.push('');

  if (report.industry) {
    lines.push('## Industry Readiness Summary');
    lines.push(`- **Pack:** ${report.industry.packName} (${report.industry.packId})`);
    lines.push(`- **Status:** ${report.industry.status}`);
    lines.push(`- **Score:** ${report.industry.score}%`);
    if (report.industry.requiredItemsTested.length > 0) {
      lines.push(`- **Required Tested:** ${report.industry.requiredItemsTested.join(', ')}`);
    }
    if (report.industry.requiredItemsMissing.length > 0) {
      lines.push(`- **Required Missing:** ${report.industry.requiredItemsMissing.join(', ')}`);
    }
    if (report.industry.recommendedItemsMissing.length > 0) {
      lines.push(`- **Recommended Missing:** ${report.industry.recommendedItemsMissing.join(', ')}`);
    }
    if (report.industry.blockedByPolicyItems.length > 0) {
      lines.push(`- **Blocked by Policy:** ${report.industry.blockedByPolicyItems.join(', ')}`);
    }
    if (report.industry.recommendations.length > 0) {
      lines.push(`- **Recommendations:**`);
      for (const rec of report.industry.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }
    lines.push('');
  }

  if (report.findings.length > 0) {
    lines.push('## Remaining Findings');
    for (const f of report.findings) {
      lines.push(`- **[${f.severity.toUpperCase()}]** *${f.source}* — ${f.title}: ${f.message}`);
      if (f.runId) lines.push(`  - Run: \`${f.runId}\``);
      if (f.file) lines.push(`  - File: ${f.file}`);
      if (f.suggestedFix) lines.push(`  - Fix: ${f.suggestedFix}`);
    }
    lines.push('');
  }

  if (report.summary.manualReviewItems > 0) {
    lines.push('## Manual Review Items');
    lines.push(`- ${report.summary.manualReviewItems} repair action(s) require manual review.`);
    lines.push('');
  }

  lines.push('## Artifact Links');
  for (const link of report.artifactLinks) {
    lines.push(`- [${link.exists ? '✅' : '❌'}] **${link.label}:** [${link.path}](${link.path})`);
  }
  lines.push('');

  lines.push('## Recommended Next Steps');
  for (const step of report.recommendedNextSteps) {
    lines.push(`- ${step}`);
  }
  lines.push('');

  lines.push('## Caveats');
  for (const c of report.caveats) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Disclaimer');
  lines.push(`> ${report.disclaimer}`);
  lines.push('');

  return lines.join('\n');
}

export function generateUnifiedBatchReportJson(report: UnifiedBatchReport): string {
  return JSON.stringify(report, null, 2);
}

export function writeUnifiedBatchReport(batchId: string, report: UnifiedBatchReport): void {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchId);
  if (!fs.existsSync(batchDir)) return;

  fs.writeFileSync(path.join(batchDir, 'batch-unified-report.json'), generateUnifiedBatchReportJson(report), 'utf-8');
  fs.writeFileSync(path.join(batchDir, 'batch-unified-report.md'), generateUnifiedBatchReportMarkdown(report), 'utf-8');
}
