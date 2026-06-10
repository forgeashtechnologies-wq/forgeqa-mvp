import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectProjectDashboard,
  collectRunSummaries,
  collectBatchSummaries,
  collectReleaseSummaries,
  computeProjectHealthScore,
  generateProjectRecommendations,
} from './collector.js';
import { writeProjectDashboard } from './report.js';

describe('Dashboard Collector', () => {
  const artifactRoot = path.join(process.cwd(), 'artifacts');

  beforeEach(() => {
    // Clean up any test artifacts that might interfere
  });

  afterEach(() => {
    // no cleanup needed since we use existing artifacts
  });

  it('dashboard works with existing artifacts', () => {
    const dashboard = collectProjectDashboard({ limit: 10 });
    expect(dashboard.dashboardId).toBeDefined();
    expect(dashboard.createdAt).toBeDefined();
    expect(dashboard.artifactRoot).toBe('artifacts/');
    expect(typeof dashboard.summary.totalRuns).toBe('number');
    expect(typeof dashboard.summary.totalBatches).toBe('number');
    expect(typeof dashboard.summary.overallHealthScore).toBe('number');
    expect(dashboard.summary.overallHealthScore).toBeGreaterThanOrEqual(0);
    expect(dashboard.summary.overallHealthScore).toBeLessThanOrEqual(100);
  });

  it('collectRunSummaries returns array', () => {
    const runs = collectRunSummaries(artifactRoot);
    expect(Array.isArray(runs)).toBe(true);
  });

  it('collectBatchSummaries returns array', () => {
    const batches = collectBatchSummaries(artifactRoot);
    expect(Array.isArray(batches)).toBe(true);
  });

  it('collectReleaseSummaries returns array', () => {
    const checks = collectReleaseSummaries(artifactRoot);
    expect(Array.isArray(checks)).toBe(true);
  });

  it('health score computes between 0 and 100', () => {
    const runs = collectRunSummaries(artifactRoot);
    const batches = collectBatchSummaries(artifactRoot);
    const checks = collectReleaseSummaries(artifactRoot);
    const score = computeProjectHealthScore(runs, batches, checks);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('recommendations include release-check when missing', () => {
    const recs = generateProjectRecommendations({
      summary: { totalRuns: 1, totalBatches: 0, totalReleaseChecks: 0, overallHealthScore: 50, latestRunId: 'r1', latestBatchId: undefined, latestReleaseCheckId: undefined, readyRunCount: 1, notReadyRunCount: 0, failedRunCount: 0, warningRunCount: 0, validatedRunCount: 1, repairedRunCount: 0, batchPassCount: 0, batchWarnCount: 0, batchFailCount: 0 },
      runs: [{ runId: 'r1', templateId: 't1', status: 'completed', verdict: 'ready_for_demo', artifactPath: 'artifacts/runs/r1' }],
      batches: [],
      releaseChecks: [],
      validation: { totalRunsValidated: 1, totalRunsWithWarnings: 0, totalRunsWithFailures: 0, totalBatchesValidated: 0, totalBatchesWithWarnings: 0, totalBatchesWithFailures: 0 },
      repair: { totalRunsRepaired: 0, totalBatchesRepaired: 0, totalManualReviewItems: 0 },
    });
    expect(recs.some((r) => r.category === 'release')).toBe(true);
  });

  it('recommendations include repair-report when missing', () => {
    const recs = generateProjectRecommendations({
      summary: { totalRuns: 1, totalBatches: 0, totalReleaseChecks: 1, overallHealthScore: 50, latestRunId: 'r1', latestBatchId: undefined, latestReleaseCheckId: 'rc1', readyRunCount: 1, notReadyRunCount: 0, failedRunCount: 0, warningRunCount: 0, validatedRunCount: 1, repairedRunCount: 0, batchPassCount: 0, batchWarnCount: 0, batchFailCount: 0 },
      runs: [{ runId: 'r1', templateId: 't1', status: 'completed', verdict: 'ready_for_demo', validationStatus: 'pass', artifactPath: 'artifacts/runs/r1' }],
      batches: [],
      releaseChecks: [{ id: 'rc1', status: 'pass', createdAt: new Date().toISOString(), checksTotal: 10, checksPassed: 10, checksWarned: 0, checksFailed: 0, artifactPath: 'artifacts/release/rc1.json' }],
      validation: { totalRunsValidated: 1, totalRunsWithWarnings: 0, totalRunsWithFailures: 0, totalBatchesValidated: 0, totalBatchesWithWarnings: 0, totalBatchesWithFailures: 0 },
      repair: { totalRunsRepaired: 0, totalBatchesRepaired: 0, totalManualReviewItems: 0 },
    });
    expect(recs.some((r) => r.message.includes('repair report'))).toBe(true);
  });

  it('recommendations say packaging ready only when gates pass', () => {
    const recs = generateProjectRecommendations({
      summary: { totalRuns: 5, totalBatches: 0, totalReleaseChecks: 1, overallHealthScore: 90, latestRunId: 'r1', latestBatchId: undefined, latestReleaseCheckId: 'rc1', readyRunCount: 5, notReadyRunCount: 0, failedRunCount: 0, warningRunCount: 0, validatedRunCount: 5, repairedRunCount: 0, batchPassCount: 0, batchWarnCount: 0, batchFailCount: 0 },
      runs: [{ runId: 'r1', templateId: 't1', status: 'completed', verdict: 'ready_for_demo', validationStatus: 'pass', artifactPath: 'artifacts/runs/r1' }],
      batches: [],
      releaseChecks: [{ id: 'rc1', status: 'pass', createdAt: new Date().toISOString(), checksTotal: 10, checksPassed: 10, checksWarned: 0, checksFailed: 0, artifactPath: 'artifacts/release/rc1.json' }],
      validation: { totalRunsValidated: 5, totalRunsWithWarnings: 0, totalRunsWithFailures: 0, totalBatchesValidated: 0, totalBatchesWithWarnings: 0, totalBatchesWithFailures: 0 },
      repair: { totalRunsRepaired: 0, totalBatchesRepaired: 0, totalManualReviewItems: 0 },
    });
    expect(recs.some((r) => r.category === 'packaging')).toBe(true);
  });

  it('writeProjectDashboard writes files', () => {
    const dashboard = collectProjectDashboard({ limit: 5 });
    writeProjectDashboard(dashboard);

    const dashboardDir = path.join(process.cwd(), 'artifacts', 'dashboard');
    expect(fs.existsSync(path.join(dashboardDir, 'project-overview.json'))).toBe(true);
    expect(fs.existsSync(path.join(dashboardDir, 'project-overview.md'))).toBe(true);
  });
});
