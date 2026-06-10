import fs from 'node:fs';
import path from 'node:path';
import type { UnifiedRunReport, UnifiedFinding, UnifiedArtifactLink } from './unified-types.js';

const DISCLAIMER_TEXT =
  'This ForgeQA unified report validates scoped QA readiness artifacts only. It does not certify the application as secure, compliant, bug-free, or production-ready.';

export function buildUnifiedRunReport(runId: string): UnifiedRunReport {
  const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
  if (!fs.existsSync(runDir)) {
    throw new Error(`Run not found: ${runId}`);
  }

  const runJsonPath = path.join(runDir, 'run.json');
  if (!fs.existsSync(runJsonPath)) {
    throw new Error(`Run manifest not found: ${runJsonPath}`);
  }

  const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));

  // Validation
  const validationPath = path.join(runDir, 'artifact-validation.json');
  let validationSummary: UnifiedRunReport['validation'] = {
    status: 'pass',
    checkCount: 0,
    warnings: 0,
    failures: 0,
    findings: 0,
    validationArtifactPath: `artifacts/runs/${runId}/artifact-validation.json`,
  };
  if (fs.existsSync(validationPath)) {
    const validation = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
    const failCount = (validation.checks ?? []).filter((c: any) => c.status === 'fail').length;
    const warnCount = (validation.checks ?? []).filter((c: any) => c.status === 'warn').length;
    validationSummary = {
      status: failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass',
      checkCount: (validation.checks ?? []).length,
      warnings: warnCount,
      failures: failCount,
      findings: (validation.findings ?? []).length,
      validationArtifactPath: `artifacts/runs/${runId}/artifact-validation.json`,
    };
  }

  // Repair
  const repairPath = path.join(runDir, 'artifact-repair.json');
  let repairSummary: UnifiedRunReport['repair'] | undefined;
  if (fs.existsSync(repairPath)) {
    const repair = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    repairSummary = {
      status: repair.status ?? 'skipped',
      totalActions: repair.summary?.totalActions ?? 0,
      fixedCount: repair.summary?.fixedCount ?? 0,
      skippedCount: repair.summary?.skippedCount ?? 0,
      manualReviewCount: repair.summary?.manualReviewCount ?? 0,
      failedCount: repair.summary?.failedCount ?? 0,
      safeCount: repair.summary?.safeCount ?? 0,
      unsafeCount: repair.summary?.unsafeCount ?? 0,
      repairArtifactPath: `artifacts/runs/${runId}/artifact-repair.json`,
    };
  }

  // Findings from validation
  const findings: UnifiedFinding[] = [];
  if (fs.existsSync(validationPath)) {
    const validation = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
    for (const f of validation.findings ?? []) {
      findings.push({
        severity: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info',
        source: 'validation',
        title: f.patternId ?? 'Validation Finding',
        message: f.message ?? '',
        file: f.evidence ?? undefined,
        suggestedFix: f.suggestedFix ?? undefined,
      });
    }
  }

  // Findings from repair
  if (fs.existsSync(repairPath)) {
    const repair = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    for (const f of repair.findings ?? []) {
      findings.push({
        severity: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info',
        source: 'repair',
        title: f.id ?? 'Repair Finding',
        message: f.message ?? '',
        file: f.file ?? undefined,
        suggestedFix: f.suggestedManualFix ?? undefined,
      });
    }
  }

  // Run-level findings from run.json
  const policyFindings = (runJson.executionPolicy?.findings ?? []) as any[];
  for (const f of policyFindings) {
    findings.push({
      severity: f.severity === 'blocked' ? 'error' : f.severity === 'caution' ? 'warning' : 'info',
      source: 'policy',
      title: f.patternId ?? 'Policy Finding',
      message: f.message ?? '',
      file: f.evidence ?? undefined,
    });
  }

  // Data safety findings
  const dataSafetyPath = path.join(runDir, 'data-safety-audit.json');
  if (fs.existsSync(dataSafetyPath)) {
    const audit = JSON.parse(fs.readFileSync(dataSafetyPath, 'utf-8'));
    if (audit.status === 'warn' || audit.status === 'fail') {
      findings.push({
        severity: audit.status === 'fail' ? 'error' : 'warning',
        source: 'data_safety',
        title: 'Data Safety Audit',
        message: `Data safety audit status: ${audit.status}`,
        file: `artifacts/runs/${runId}/data-safety-audit.json`,
      });
    }
  }

  // Scope analysis findings
  const scopePath = path.join(runDir, 'scope-analysis.json');
  if (fs.existsSync(scopePath)) {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf-8'));
    if (scope.summary?.needsHumanReviewCount > 0) {
      findings.push({
        severity: 'warning',
        source: 'scope',
        title: 'Scope Analysis',
        message: `${scope.summary.needsHumanReviewCount} item(s) need human review`,
        file: `artifacts/runs/${runId}/scope-analysis.json`,
      });
    }
  }

  // Failure classification findings
  const failurePath = path.join(runDir, 'failure-classification.json');
  if (fs.existsSync(failurePath)) {
    const failure = JSON.parse(fs.readFileSync(failurePath, 'utf-8'));
    if (failure.summary?.totalFailedSteps > 0) {
      findings.push({
        severity: 'error',
        source: 'failure_classification',
        title: 'Failure Classification',
        message: `${failure.summary.totalFailedSteps} step(s) failed`,
        file: `artifacts/runs/${runId}/failure-classification.json`,
      });
    }
  }

  // Repair actions
  const repairActions: UnifiedRunReport['repairActions'] = [];
  if (fs.existsSync(repairPath)) {
    const repair = JSON.parse(fs.readFileSync(repairPath, 'utf-8'));
    for (const a of repair.actions ?? []) {
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

  // Artifact links
  const artifactLinks: UnifiedArtifactLink[] = [
    { label: 'Run Manifest', path: `artifacts/runs/${runId}/run.json`, exists: fs.existsSync(path.join(runDir, 'run.json')), category: 'core' },
    { label: 'Plan', path: `artifacts/runs/${runId}/plan.json`, exists: fs.existsSync(path.join(runDir, 'plan.json')), category: 'core' },
    { label: 'Data', path: `artifacts/runs/${runId}/data.json`, exists: fs.existsSync(path.join(runDir, 'data.json')), category: 'core' },
    { label: 'Report MD', path: `artifacts/runs/${runId}/report.md`, exists: fs.existsSync(path.join(runDir, 'report.md')), category: 'report' },
    { label: 'Report HTML', path: `artifacts/runs/${runId}/report.html`, exists: fs.existsSync(path.join(runDir, 'report.html')), category: 'report' },
    { label: 'Validation JSON', path: `artifacts/runs/${runId}/artifact-validation.json`, exists: fs.existsSync(path.join(runDir, 'artifact-validation.json')), category: 'validation' },
    { label: 'Validation MD', path: `artifacts/runs/${runId}/artifact-validation.md`, exists: fs.existsSync(path.join(runDir, 'artifact-validation.md')), category: 'validation' },
    { label: 'Repair JSON', path: `artifacts/runs/${runId}/artifact-repair.json`, exists: fs.existsSync(path.join(runDir, 'artifact-repair.json')), category: 'repair' },
    { label: 'Repair MD', path: `artifacts/runs/${runId}/artifact-repair.md`, exists: fs.existsSync(path.join(runDir, 'artifact-repair.md')), category: 'repair' },
    { label: 'Screenshots', path: `artifacts/runs/${runId}/screenshots/`, exists: fs.existsSync(path.join(runDir, 'screenshots')), category: 'evidence' },
    { label: 'Trace ZIP', path: `artifacts/runs/${runId}/trace.zip`, exists: fs.existsSync(path.join(runDir, 'trace.zip')), category: 'evidence' },
    { label: 'Data Safety Audit', path: `artifacts/runs/${runId}/data-safety-audit.json`, exists: fs.existsSync(path.join(runDir, 'data-safety-audit.json')), category: 'audit' },
    { label: 'Scope Analysis', path: `artifacts/runs/${runId}/scope-analysis.json`, exists: fs.existsSync(path.join(runDir, 'scope-analysis.json')), category: 'audit' },
    { label: 'Failure Classification', path: `artifacts/runs/${runId}/failure-classification.json`, exists: fs.existsSync(path.join(runDir, 'failure-classification.json')), category: 'audit' },
    { label: 'Cleanup Report', path: `artifacts/runs/${runId}/cleanup-report.md`, exists: fs.existsSync(path.join(runDir, 'cleanup-report.md')), category: 'report' },
  ];

  // Recommended next steps
  const recommendedNextSteps: string[] = [];
  if (validationSummary.failures > 0) {
    recommendedNextSteps.push('Review validation failures before sharing this report.');
  }
  if (repairSummary && repairSummary.manualReviewCount > 0) {
    recommendedNextSteps.push(`Review ${repairSummary.manualReviewCount} repair item(s) marked for manual review.`);
  }
  if (validationSummary.warnings > 0) {
    recommendedNextSteps.push('Review validation warnings for potential issues.');
  }
  if (!repairSummary) {
    recommendedNextSteps.push('Consider running repair-report with --fix if portability issues exist.');
  }
  if (recommendedNextSteps.length === 0) {
    recommendedNextSteps.push('Report is ready for founder review.');
  }

  return {
    runId,
    createdAt: runJson.completedAt ?? runJson.startedAt ?? new Date().toISOString(),
    status: runJson.status ?? 'unknown',
    verdict: runJson.verdict ?? 'unknown',
    templateId: runJson.templateId ?? 'unknown',
    templateName: runJson.templateName ?? undefined,
    mode: runJson.executionPolicy?.mode ?? undefined,
    viewport: runJson.viewport ? {
      profile: runJson.viewport.profile,
      width: runJson.viewport.width,
      height: runJson.viewport.height,
      isMobile: runJson.viewport.isMobile,
    } : undefined,
    validation: validationSummary,
    repair: repairSummary,
    summary: {
      totalFindings: findings.length,
      totalRepairActions: repairActions.length,
      manualReviewItems: repairSummary?.manualReviewCount ?? 0,
    },
    findings,
    repairActions,
    recommendedNextSteps,
    artifactLinks,
    caveats: [
      'This report is a consolidated view of run artifacts.',
      'It does not replace individual validation or repair reports.',
      'Always review original artifacts for full detail.',
      'This is a QA readiness check, not a compliance certification.',
    ],
    disclaimer: DISCLAIMER_TEXT,
  };
}

export function generateUnifiedRunReportMarkdown(report: UnifiedRunReport): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Unified Run Report');
  lines.push('');
  lines.push(`- **Run ID:** \`${report.runId}\``);
  lines.push(`- **Status:** ${report.status}`);
  lines.push(`- **Verdict:** ${report.verdict}`);
  lines.push(`- **Template:** ${report.templateName ?? report.templateId}`);
  if (report.mode) lines.push(`- **Mode:** ${report.mode}`);
  if (report.viewport) {
    lines.push(`- **Viewport:** ${report.viewport.profile} (${report.viewport.width}x${report.viewport.height})`);
  }
  lines.push(`- **Created At:** ${report.createdAt}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push(`- Validation: ${report.validation.status.toUpperCase()} (${report.validation.checkCount} checks, ${report.validation.failures} failures, ${report.validation.warnings} warnings)`);
  if (report.repair) {
    lines.push(`- Repair: ${report.repair.status.toUpperCase()} (${report.repair.fixedCount} fixed, ${report.repair.manualReviewCount} manual review)`);
  } else {
    lines.push('- Repair: Not performed');
  }
  lines.push(`- Total Findings: ${report.summary.totalFindings}`);
  lines.push(`- Manual Review Items: ${report.summary.manualReviewItems}`);
  lines.push('');

  lines.push('## Validation Summary');
  lines.push(`- **Status:** ${report.validation.status.toUpperCase()}`);
  lines.push(`- **Checks:** ${report.validation.checkCount}`);
  lines.push(`- **Warnings:** ${report.validation.warnings}`);
  lines.push(`- **Failures:** ${report.validation.failures}`);
  lines.push(`- **Findings:** ${report.validation.findings}`);
  lines.push(`- **Artifacts:** [artifact-validation.json](${report.validation.validationArtifactPath})`);
  lines.push('');

  if (report.repair) {
    lines.push('## Repair Summary');
    lines.push(`- **Status:** ${report.repair.status.toUpperCase()}`);
    lines.push(`- **Total Actions:** ${report.repair.totalActions}`);
    lines.push(`- **Fixed:** ${report.repair.fixedCount}`);
    lines.push(`- **Skipped:** ${report.repair.skippedCount}`);
    lines.push(`- **Manual Review:** ${report.repair.manualReviewCount}`);
    lines.push(`- **Failed:** ${report.repair.failedCount}`);
    lines.push(`- **Safe Actions:** ${report.repair.safeCount}`);
    lines.push(`- **Unsafe Actions:** ${report.repair.unsafeCount}`);
    lines.push(`- **Artifacts:** [artifact-repair.json](${report.repair.repairArtifactPath})`);
    lines.push('');
  }

  if (report.repairActions.length > 0) {
    lines.push('## Repair Actions');
    for (const a of report.repairActions) {
      lines.push(`- **[${a.status.toUpperCase()}]** \`${a.id}\` (${a.category}) — ${a.message}`);
      if (a.file) lines.push(`  - File: ${a.file}`);
      if (!a.safe) lines.push(`  - ⚠️ This action was not marked as safe.`);
    }
    lines.push('');
  }

  if (report.findings.length > 0) {
    lines.push('## Remaining Findings');
    for (const f of report.findings) {
      lines.push(`- **[${f.severity.toUpperCase()}]** *${f.source}* — ${f.title}: ${f.message}`);
      if (f.file) lines.push(`  - File: ${f.file}`);
      if (f.suggestedFix) lines.push(`  - Fix: ${f.suggestedFix}`);
    }
    lines.push('');
  }

  if (report.summary.manualReviewItems > 0) {
    lines.push('## Manual Review Items');
    const manualItems = report.repairActions.filter((a) => a.status === 'manual_review');
    for (const a of manualItems) {
      lines.push(`- \`${a.id}\`: ${a.message}`);
      if (a.file) lines.push(`  - File: ${a.file}`);
    }
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

export function generateUnifiedRunReportJson(report: UnifiedRunReport): string {
  return JSON.stringify(report, null, 2);
}

export function writeUnifiedRunReport(runId: string, report: UnifiedRunReport): void {
  const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
  if (!fs.existsSync(runDir)) return;

  fs.writeFileSync(path.join(runDir, 'unified-report.json'), generateUnifiedRunReportJson(report), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'unified-report.md'), generateUnifiedRunReportMarkdown(report), 'utf-8');
}
