import fs from 'node:fs';
import path from 'node:path';
import type { ProjectDashboard } from './types.js';

export function generateProjectDashboardMarkdown(dashboard: ProjectDashboard): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Project Dashboard');
  lines.push('');
  lines.push(`- **Dashboard ID:** \`${dashboard.dashboardId}\``);
  lines.push(`- **Status:** ${dashboard.status.toUpperCase()}`);
  lines.push(`- **Created At:** ${dashboard.createdAt}`);
  lines.push(`- **Artifact Root:** \`${dashboard.artifactRoot}\``);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push(`- **Health Score:** ${dashboard.summary.overallHealthScore}/100`);
  lines.push(`- **Total Runs:** ${dashboard.summary.totalRuns}`);
  lines.push(`- **Total Batches:** ${dashboard.summary.totalBatches}`);
  lines.push(`- **Release Checks:** ${dashboard.summary.totalReleaseChecks}`);
  lines.push(`- **Ready Runs:** ${dashboard.summary.readyRunCount}`);
  lines.push(`- **Not Ready Runs:** ${dashboard.summary.notReadyRunCount}`);
  lines.push(`- **Failed Runs:** ${dashboard.summary.failedRunCount}`);
  lines.push(`- **Warning Runs:** ${dashboard.summary.warningRunCount}`);
  lines.push('');

  lines.push('## Local MVP Status');
  if (dashboard.status === 'local_ready') {
    lines.push('- All systems operational. No major issues detected.');
  } else if (dashboard.status === 'local_ready_with_warnings') {
    lines.push('- Systems operational with warnings. Review validation findings.');
  } else if (dashboard.status === 'needs_human_review') {
    lines.push('- Manual review items require attention before proceeding.');
  } else {
    lines.push('- Not ready. Address failures and missing artifacts.');
  }
  lines.push('');

  if (dashboard.runs.length > 0) {
    lines.push('## Run Summary');
    lines.push('| Run ID | Template | Status | Verdict | Validation | Repair |');
    lines.push('|--------|----------|--------|---------|------------|--------|');
    for (const run of dashboard.runs) {
      lines.push(
        `| \`${run.runId}\` | ${run.templateId} | ${run.status} | ${run.verdict} | ${run.validationStatus ?? '-'} | ${run.repairStatus ?? '-'} |`,
      );
    }
    lines.push('');
  }

  if (dashboard.batches.length > 0) {
    lines.push('## Batch Summary');
    lines.push('| Batch ID | Status | Mode | Runs | Validation | Repair |');
    lines.push('|----------|--------|------|------|------------|--------|');
    for (const batch of dashboard.batches) {
      lines.push(
        `| \`${batch.batchId}\` | ${batch.status} | ${batch.mode ?? '-'} | ${batch.runCount} | ${batch.validationStatus ?? '-'} | ${batch.repairStatus ?? '-'} |`,
      );
    }
    lines.push('');
  }

  if (dashboard.releaseChecks.length > 0) {
    lines.push('## Release Check Summary');
    for (const rc of dashboard.releaseChecks) {
      lines.push(`- **${rc.id}:** ${rc.status.toUpperCase()} (${rc.checksPassed}/${rc.checksTotal} passed, ${rc.checksWarned} warned, ${rc.checksFailed} failed)`);
    }
    lines.push('');
  }

  lines.push('## Validation / Repair Summary');
  lines.push(`- **Runs Validated:** ${dashboard.validation.totalRunsValidated}`);
  lines.push(`- **Runs with Warnings:** ${dashboard.validation.totalRunsWithWarnings}`);
  lines.push(`- **Runs with Failures:** ${dashboard.validation.totalRunsWithFailures}`);
  lines.push(`- **Batches Validated:** ${dashboard.validation.totalBatchesValidated}`);
  lines.push(`- **Batches with Warnings:** ${dashboard.validation.totalBatchesWithWarnings}`);
  lines.push(`- **Batches with Failures:** ${dashboard.validation.totalBatchesWithFailures}`);
  lines.push(`- **Runs Repaired:** ${dashboard.repair.totalRunsRepaired}`);
  lines.push(`- **Batches Repaired:** ${dashboard.repair.totalBatchesRepaired}`);
  lines.push(`- **Manual Review Items:** ${dashboard.repair.totalManualReviewItems}`);
  lines.push('');

  if (dashboard.industry.packsUsed.length > 0) {
    lines.push('## Industry Coverage Summary');
    lines.push(`- **Packs Used:** ${dashboard.industry.packsUsed.join(', ')}`);
    lines.push(`- **Assessments:** ${dashboard.industry.totalAssessments}`);
    lines.push('');
  }

  if (dashboard.templates.tested.length > 0) {
    lines.push('## Tested vs Not Tested Summary');
    lines.push(`- **Tested Templates:** ${dashboard.templates.tested.length}`);
    lines.push(`- **Top Templates by Run Count:**`);
    for (const t of dashboard.templates.topByRunCount) {
      lines.push(`  - ${t.templateId}: ${t.runCount} run(s)`);
    }
    lines.push('');
  }

  if (Object.keys(dashboard.failures.failureTypes).length > 0) {
    lines.push('## Failure Type Summary');
    lines.push(`- **Total Failed Steps:** ${dashboard.failures.totalFailedSteps}`);
    for (const [type, count] of Object.entries(dashboard.failures.failureTypes)) {
      lines.push(`  - ${type}: ${count}`);
    }
    lines.push('');
  }

  lines.push('## Latest Artifacts');
  if (dashboard.summary.latestRunId) {
    lines.push(`- **Latest Run:** [artifacts/runs/${dashboard.summary.latestRunId}](artifacts/runs/${dashboard.summary.latestRunId})`);
  }
  if (dashboard.summary.latestBatchId) {
    lines.push(`- **Latest Batch:** [artifacts/batches/${dashboard.summary.latestBatchId}](artifacts/batches/${dashboard.summary.latestBatchId})`);
  }
  if (dashboard.summary.latestReleaseCheckId) {
    lines.push(`- **Latest Release Check:** [artifacts/release/latest-release-check.json](artifacts/release/latest-release-check.json)`);
  }
  lines.push('');

  if (dashboard.recommendations.length > 0) {
    lines.push('## Recommended Next Actions');
    for (const rec of dashboard.recommendations) {
      lines.push(`- **[${rec.priority.toUpperCase()}]** *${rec.category}* — ${rec.message}`);
      if (rec.suggestedCommand) lines.push(`  - Command: \`${rec.suggestedCommand}\``);
      lines.push(`  - Reason: ${rec.reason}`);
    }
    lines.push('');
  }

  lines.push('## Caveats');
  for (const c of dashboard.caveats) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Disclaimer');
  lines.push(`> ${dashboard.disclaimer}`);
  lines.push('');

  return lines.join('\n');
}

export function generateProjectDashboardJson(dashboard: ProjectDashboard): string {
  return JSON.stringify(dashboard, null, 2);
}

export function writeProjectDashboard(dashboard: ProjectDashboard): void {
  const dashboardDir = path.join(process.cwd(), 'artifacts', 'dashboard');
  if (!fs.existsSync(dashboardDir)) {
    fs.mkdirSync(dashboardDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dashboardDir, 'project-overview.json'), generateProjectDashboardJson(dashboard), 'utf-8');
  fs.writeFileSync(path.join(dashboardDir, 'project-overview.md'), generateProjectDashboardMarkdown(dashboard), 'utf-8');
  fs.writeFileSync(path.join(dashboardDir, `project-overview-${timestamp}.json`), generateProjectDashboardJson(dashboard), 'utf-8');
  fs.writeFileSync(path.join(dashboardDir, `project-overview-${timestamp}.md`), generateProjectDashboardMarkdown(dashboard), 'utf-8');
}
