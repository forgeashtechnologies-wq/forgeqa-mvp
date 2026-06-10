import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { ProjectDashboard, DashboardSummary, DashboardRunSummary, DashboardBatchSummary, DashboardReleaseSummary, DashboardRecommendation } from './types.js';

const DISCLAIMER_TEXT =
  'This ForgeQA dashboard summarizes local QA readiness artifacts only. It does not certify any application as secure, compliant, bug-free, or production-ready.';

export interface CollectOptions {
  artifactRoot?: string;
  limit?: number;
}

export function collectProjectDashboard(options: CollectOptions = {}): ProjectDashboard {
  const artifactRoot = options.artifactRoot ?? path.join(process.cwd(), 'artifacts');
  const limit = options.limit ?? 20;

  const runs = collectRunSummaries(artifactRoot);
  const batches = collectBatchSummaries(artifactRoot);
  const releaseChecks = collectReleaseSummaries(artifactRoot);

  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
  const latestBatch = batches.length > 0 ? batches[batches.length - 1] : undefined;
  const latestRelease = releaseChecks.length > 0 ? releaseChecks[releaseChecks.length - 1] : undefined;

  const validatedRuns = runs.filter((r) => r.validationStatus);
  const repairedRuns = runs.filter((r) => r.repairStatus);
  const validatedBatches = batches.filter((b) => b.validationStatus);
  const repairedBatches = batches.filter((b) => b.repairStatus);

  const summary = {
    totalRuns: runs.length,
    totalBatches: batches.length,
    totalReleaseChecks: releaseChecks.length,
    latestRunId: latestRun?.runId,
    latestBatchId: latestBatch?.batchId,
    latestReleaseCheckId: latestRelease?.id,
    readyRunCount: runs.filter((r) => r.verdict === 'ready_for_demo').length,
    notReadyRunCount: runs.filter((r) => r.verdict === 'not_ready').length,
    failedRunCount: runs.filter((r) => r.status === 'failed').length,
    warningRunCount: runs.filter((r) => r.validationStatus === 'warn' || r.repairStatus === 'manual_review').length,
    validatedRunCount: validatedRuns.length,
    repairedRunCount: repairedRuns.length,
    batchPassCount: batches.filter((b) => b.validationStatus === 'pass').length,
    batchWarnCount: batches.filter((b) => b.validationStatus === 'warn').length,
    batchFailCount: batches.filter((b) => b.validationStatus === 'fail').length,
    overallHealthScore: computeProjectHealthScore(runs, batches, releaseChecks),
  };

  // Templates
  const templateRunCounts: Record<string, number> = {};
  for (const r of runs) {
    templateRunCounts[r.templateId] = (templateRunCounts[r.templateId] ?? 0) + 1;
  }
  const testedTemplates = Object.keys(templateRunCounts);
  const topByRunCount = Object.entries(templateRunCounts)
    .map(([templateId, runCount]) => ({ templateId, runCount }))
    .sort((a, b) => b.runCount - a.runCount)
    .slice(0, 10);

  // Industry
  const packsUsed = new Set<string>();
  const packsWithAssessment = new Set<string>();
  for (const r of runs) {
    if (r.industryPackId) packsUsed.add(r.industryPackId);
  }
  for (const b of batches) {
    if (b.industryPackId) packsUsed.add(b.industryPackId);
  }

  // Validation
  const validation = {
    totalRunsValidated: validatedRuns.length,
    totalRunsWithWarnings: runs.filter((r) => r.validationStatus === 'warn').length,
    totalRunsWithFailures: runs.filter((r) => r.validationStatus === 'fail').length,
    totalBatchesValidated: validatedBatches.length,
    totalBatchesWithWarnings: batches.filter((b) => b.validationStatus === 'warn').length,
    totalBatchesWithFailures: batches.filter((b) => b.validationStatus === 'fail').length,
  };

  // Repair
  const repair = {
    totalRunsRepaired: repairedRuns.length,
    totalBatchesRepaired: repairedBatches.length,
    totalManualReviewItems: 0,
  };

  // Failures
  const failureTypes: Record<string, number> = {};
  let totalFailedSteps = 0;
  const runsDir = path.join(artifactRoot, 'runs');
  if (fs.existsSync(runsDir)) {
    for (const runId of fs.readdirSync(runsDir)) {
      const failurePath = path.join(runsDir, runId, 'failure-classification.json');
      if (fs.existsSync(failurePath)) {
        try {
          const fc = JSON.parse(fs.readFileSync(failurePath, 'utf-8'));
          totalFailedSteps += fc.summary?.totalFailedSteps ?? 0;
          for (const key of Object.keys(fc.failureTypes ?? {})) {
            failureTypes[key] = (failureTypes[key] ?? 0) + (fc.failureTypes[key] ?? 0);
          }
        } catch {
          // ignore invalid JSON
        }
      }
    }
  }

  const dashboard: ProjectDashboard = {
    dashboardId: nanoid(),
    createdAt: new Date().toISOString(),
    artifactRoot: 'artifacts/',
    status: determineOverallStatus(summary, validation, repair),
    summary,
    runs: runs.slice(-limit),
    batches: batches.slice(-limit),
    releaseChecks: releaseChecks.slice(-limit),
    templates: {
      tested: testedTemplates,
      untested: [],
      topByRunCount,
    },
    industry: {
      packsUsed: Array.from(packsUsed),
      packsWithAssessment: Array.from(packsWithAssessment),
      totalAssessments: 0,
    },
    validation,
    repair,
    failures: {
      totalFailedSteps,
      failureTypes,
    },
    recommendations: generateProjectRecommendations({ summary, runs, batches, releaseChecks, validation, repair }),
    artifactLinks: [
      { label: 'Runs Directory', path: 'artifacts/runs/', exists: fs.existsSync(path.join(artifactRoot, 'runs')) },
      { label: 'Batches Directory', path: 'artifacts/batches/', exists: fs.existsSync(path.join(artifactRoot, 'batches')) },
      { label: 'Release Checks', path: 'artifacts/release/', exists: fs.existsSync(path.join(artifactRoot, 'release')) },
      { label: 'Dashboard', path: 'artifacts/dashboard/', exists: fs.existsSync(path.join(artifactRoot, 'dashboard')) },
    ],
    caveats: [
      'This dashboard reflects local artifacts only.',
      'It does not monitor real-time application health.',
      'Always review individual run and batch reports for full detail.',
      'This is a QA readiness check, not a compliance certification.',
    ],
    disclaimer: DISCLAIMER_TEXT,
  };

  return dashboard;
}

export function collectRunSummaries(artifactRoot: string): DashboardRunSummary[] {
  const runs: DashboardRunSummary[] = [];
  const runsDir = path.join(artifactRoot, 'runs');
  if (!fs.existsSync(runsDir)) return runs;

  for (const runId of fs.readdirSync(runsDir)) {
    const runDir = path.join(runsDir, runId);
    const stat = fs.statSync(runDir);
    if (!stat.isDirectory()) continue;

    const runJsonPath = path.join(runDir, 'run.json');
    if (!fs.existsSync(runJsonPath)) continue;

    try {
      const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      const summary: DashboardRunSummary = {
        runId,
        templateId: runJson.templateId ?? 'unknown',
        status: runJson.status ?? 'unknown',
        verdict: runJson.verdict ?? 'unknown',
        createdAt: runJson.completedAt ?? runJson.startedAt,
        artifactPath: `artifacts/runs/${runId}`,
      };

      // Validation
      const valPath = path.join(runDir, 'artifact-validation.json');
      if (fs.existsSync(valPath)) {
        const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
        const failCount = (val.checks ?? []).filter((c: any) => c.status === 'fail').length;
        const warnCount = (val.checks ?? []).filter((c: any) => c.status === 'warn').length;
        summary.validationStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
      }

      // Repair
      const repPath = path.join(runDir, 'artifact-repair.json');
      if (fs.existsSync(repPath)) {
        const rep = JSON.parse(fs.readFileSync(repPath, 'utf-8'));
        summary.repairStatus = rep.status ?? 'skipped';
      }

      // Industry
      const indPath = path.join(runDir, 'industry-assessment.json');
      if (fs.existsSync(indPath)) {
        const ind = JSON.parse(fs.readFileSync(indPath, 'utf-8'));
        summary.industryPackId = ind.packId;
      }

      runs.push(summary);
    } catch {
      // skip invalid run.json
    }
  }

  // Sort by createdAt descending
  runs.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  return runs;
}

export function collectBatchSummaries(artifactRoot: string): DashboardBatchSummary[] {
  const batches: DashboardBatchSummary[] = [];
  const batchesDir = path.join(artifactRoot, 'batches');
  if (!fs.existsSync(batchesDir)) return batches;

  for (const batchId of fs.readdirSync(batchesDir)) {
    const batchDir = path.join(batchesDir, batchId);
    const stat = fs.statSync(batchDir);
    if (!stat.isDirectory()) continue;

    const planPath = path.join(batchDir, 'batch-plan.json');
    if (!fs.existsSync(planPath)) continue;

    try {
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
      const resultPath = path.join(batchDir, 'batch-result.json');
      let runCount = 0;
      let createdAt: string | undefined;
      if (fs.existsSync(resultPath)) {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        runCount = (result.items ?? []).length;
        createdAt = result.completedAt ?? result.startedAt;
      }

      const summary: DashboardBatchSummary = {
        batchId,
        status: resultPath ? 'completed' : 'preview',
        mode: plan.options?.demo ? 'demo' : plan.options?.external ? 'external' : 'unknown',
        runCount,
        createdAt,
        artifactPath: `artifacts/batches/${batchId}`,
      };

      if (plan.industryPackId) {
        summary.industryPackId = plan.industryPackId;
      }

      // Validation
      const valPath = path.join(batchDir, 'batch-validation.json');
      if (fs.existsSync(valPath)) {
        const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
        summary.validationStatus = val.status ?? 'pass';
      }

      // Repair
      const repPath = path.join(batchDir, 'batch-repair.json');
      if (fs.existsSync(repPath)) {
        const rep = JSON.parse(fs.readFileSync(repPath, 'utf-8'));
        summary.repairStatus = rep.status ?? 'skipped';
      }

      batches.push(summary);
    } catch {
      // skip invalid batch-plan.json
    }
  }

  // Sort by createdAt descending
  batches.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  return batches;
}

export function collectReleaseSummaries(artifactRoot: string): DashboardReleaseSummary[] {
  const checks: DashboardReleaseSummary[] = [];
  const releaseDir = path.join(artifactRoot, 'release');
  if (!fs.existsSync(releaseDir)) return checks;

  const latestPath = path.join(releaseDir, 'latest-release-check.json');
  if (fs.existsSync(latestPath)) {
    try {
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
      checks.push({
        id: latest.id ?? 'unknown',
        status: latest.status ?? 'unknown',
        createdAt: latest.createdAt ?? new Date().toISOString(),
        checksTotal: latest.summary?.total ?? 0,
        checksPassed: latest.summary?.pass ?? 0,
        checksWarned: latest.summary?.warn ?? 0,
        checksFailed: latest.summary?.fail ?? 0,
        artifactPath: 'artifacts/release/latest-release-check.json',
      });
    } catch {
      // ignore invalid JSON
    }
  }

  return checks;
}

export function computeProjectHealthScore(
  runs: DashboardRunSummary[],
  batches: DashboardBatchSummary[],
  releaseChecks: DashboardReleaseSummary[],
): number {
  let score = 0;
  let maxScore = 0;

  // Runs score (max 60)
  if (runs.length > 0) {
    maxScore += 60;
    const readyRatio = runs.filter((r) => r.verdict === 'ready_for_demo').length / runs.length;
    const validRatio = runs.filter((r) => r.validationStatus === 'pass').length / runs.length;
    const noFailures = runs.filter((r) => r.status !== 'failed').length / runs.length;
    score += Math.round(60 * (readyRatio * 0.4 + validRatio * 0.3 + noFailures * 0.3));
  }

  // Batches score (max 20)
  if (batches.length > 0) {
    maxScore += 20;
    const passRatio = batches.filter((b) => b.validationStatus === 'pass').length / batches.length;
    score += Math.round(20 * passRatio);
  } else {
    maxScore += 20;
    score += 20; // no batches means nothing failed
  }

  // Release checks score (max 20)
  if (releaseChecks.length > 0) {
    maxScore += 20;
    const latest = releaseChecks[releaseChecks.length - 1];
    if (latest.status === 'pass') score += 20;
    else if (latest.status === 'warn') score += 10;
  } else {
    maxScore += 20;
    // no release check yet, neutral
  }

  if (maxScore === 0) return 100; // no artifacts yet, assume healthy start
  return Math.round((score / maxScore) * 100);
}

function determineOverallStatus(
  summary: DashboardSummary,
  validation: ProjectDashboard['validation'],
  repair: ProjectDashboard['repair'],
): ProjectDashboard['status'] {
  if (summary.failedRunCount > 0 || summary.batchFailCount > 0) return 'not_ready';
  if (summary.warningRunCount > 0 || validation.totalRunsWithWarnings > 0 || validation.totalBatchesWithWarnings > 0) return 'local_ready_with_warnings';
  if (repair.totalManualReviewItems > 0) return 'needs_human_review';
  if (summary.totalRuns === 0 && summary.totalBatches === 0) return 'not_ready';
  return 'local_ready';
}

export function generateProjectRecommendations(ctx: {
  summary: DashboardSummary;
  runs: DashboardRunSummary[];
  batches: DashboardBatchSummary[];
  releaseChecks: DashboardReleaseSummary[];
  validation: ProjectDashboard['validation'];
  repair: ProjectDashboard['repair'];
}): DashboardRecommendation[] {
  const recommendations: DashboardRecommendation[] = [];

  if (ctx.releaseChecks.length === 0) {
    recommendations.push({
      priority: 'high',
      category: 'release',
      message: 'No release check found. Run release-check to validate MVP readiness.',
      suggestedCommand: 'forgeqa release-check --json',
      reason: 'Release check validates core engine loadability and artifact structure.',
    });
  }

  const latestRun = ctx.runs.length > 0 ? ctx.runs[ctx.runs.length - 1] : undefined;
  const latestBatch = ctx.batches.length > 0 ? ctx.batches[ctx.batches.length - 1] : undefined;

  if (latestRun && latestRun.validationStatus === 'warn') {
    recommendations.push({
      priority: 'medium',
      category: 'validation',
      message: `Latest run ${latestRun.runId} has validation warnings.`,
      suggestedCommand: `forgeqa run-validate ${latestRun.runId} --fix --json`,
      reason: 'Validation warnings may indicate missing artifacts or portability issues.',
    });
  }

  if (latestBatch && latestBatch.validationStatus === 'warn') {
    recommendations.push({
      priority: 'medium',
      category: 'batch',
      message: `Latest batch ${latestBatch.batchId} has validation warnings.`,
      suggestedCommand: `forgeqa batch-validate ${latestBatch.batchId} --fix --json`,
      reason: 'Batch validation warnings may indicate missing files or broken links.',
    });
  }

  if (latestRun && !latestRun.repairStatus) {
    recommendations.push({
      priority: 'low',
      category: 'repair',
      message: `Latest run ${latestRun.runId} has no repair report.`,
      suggestedCommand: `forgeqa repair-report ${latestRun.runId}`,
      reason: 'Repair report consolidates validation and repair status for founder review.',
    });
  }

  if (latestBatch && !latestBatch.repairStatus) {
    recommendations.push({
      priority: 'low',
      category: 'batch',
      message: `Latest batch ${latestBatch.batchId} has no repair report.`,
      suggestedCommand: `forgeqa batch-report ${latestBatch.batchId}`,
      reason: 'Batch report consolidates batch-level validation and repair status.',
    });
  }

  if (ctx.runs.length > 0 && ctx.validation.totalRunsValidated === 0) {
    recommendations.push({
      priority: 'medium',
      category: 'validation',
      message: 'No runs have been validated yet. Validate recent runs.',
      suggestedCommand: `forgeqa run-validate ${latestRun?.runId ?? '<runId>'} --json`,
      reason: 'Validation ensures artifact integrity and report completeness.',
    });
  }

  if (ctx.summary.overallHealthScore >= 80 && ctx.releaseChecks.length > 0 && ctx.releaseChecks[ctx.releaseChecks.length - 1].status === 'pass') {
    recommendations.push({
      priority: 'low',
      category: 'packaging',
      message: 'Project health score is good. Ready for packaging/CI review.',
      reason: 'Release check passes and health score is above 80.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      category: 'testing',
      message: 'Project is in good shape. Continue testing or add new templates.',
      reason: 'No immediate issues detected.',
    });
  }

  return recommendations;
}
