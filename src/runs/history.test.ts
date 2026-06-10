import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readRunSummary,
  listRunSummaries,
  getRunShortId,
  formatRunTimestamp,
  computeRunHistoryStats,
} from './history.js';

describe('Run History', () => {
  let tempArtifactsDir: string;

  beforeEach(() => {
    tempArtifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-history-'));
  });

  afterEach(() => {
    fs.rmSync(tempArtifactsDir, { recursive: true, force: true });
  });

  function createMockRun(runId: string, overrides: Record<string, unknown> = {}) {
    const runDir = path.join(tempArtifactsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const manifest = {
      runId,
      e2eRunId: 'e2e_' + runId,
      templateId: 'test.template',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      steps: [
        { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, screenshotPath: 'screenshots/s0.png' },
      ],
      artifactsDir: `artifacts/runs/${runId}`,
      isFinalized: true,
      executionPolicy: {
        mode: 'demo',
        strictPolicy: false,
        allowSubmit: false,
        allowUpload: false,
        blockedCount: 0,
        cautionCount: 0,
        allowedCount: 1,
      },
      ...overrides,
    };

    fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(manifest), 'utf-8');
    fs.writeFileSync(path.join(runDir, 'artifact-manifest.json'), JSON.stringify({ templateName: 'Test Template' }), 'utf-8');
    fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), JSON.stringify({ reportHealth: 'pass' }), 'utf-8');
    fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'screenshots', 's0.png'), 'fake', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'trace.zip'), 'fake', 'utf-8');

    return runDir;
  }

  it('getRunShortId returns first 8 characters', () => {
    expect(getRunShortId('abc123def456')).toBe('abc123de');
    expect(getRunShortId('short')).toBe('short');
  });

  it('formatRunTimestamp formats ISO string', () => {
    const ts = '2024-01-15T10:30:00.000Z';
    const formatted = formatRunTimestamp(ts);
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('10');
  });

  it('readRunSummary parses a valid run', () => {
    const runId = 'test-run-001';
    createMockRun(runId);

    const summary = readRunSummary(runId, tempArtifactsDir);
    expect(summary).toBeDefined();
    expect(summary!.runId).toBe(runId);
    expect(summary!.shortRunId).toBe(getRunShortId(runId));
    expect(summary!.templateId).toBe('test.template');
    expect(summary!.status).toBe('completed');
    expect(summary!.mode).toBe('demo');
    expect(summary!.blockedCount).toBe(0);
    expect(summary!.cautionCount).toBe(0);
    expect(summary!.allowedCount).toBe(1);
    expect(summary!.screenshotCount).toBe(1);
    expect(summary!.traceZipPresent).toBe(true);
    expect(summary!.reportHealth).toBe('pass');
  });

  it('readRunSummary returns undefined for missing run', () => {
    const summary = readRunSummary('non-existent-run', tempArtifactsDir);
    expect(summary).toBeUndefined();
  });

  it('listRunSummaries returns newest first', () => {
    createMockRun('run-older', { startedAt: '2024-01-01T00:00:00.000Z' });
    createMockRun('run-newer', { startedAt: '2024-01-15T00:00:00.000Z' });

    const runs = listRunSummaries({}, tempArtifactsDir);
    expect(runs.length).toBe(2);
    expect(runs[0].runId).toBe('run-newer');
    expect(runs[1].runId).toBe('run-older');
  });

  it('listRunSummaries respects limit option', () => {
    createMockRun('run-1', { startedAt: '2024-01-01T00:00:00.000Z' });
    createMockRun('run-2', { startedAt: '2024-01-02T00:00:00.000Z' });
    createMockRun('run-3', { startedAt: '2024-01-03T00:00:00.000Z' });

    const runs = listRunSummaries({ limit: 2 }, tempArtifactsDir);
    expect(runs.length).toBe(2);
    expect(runs[0].runId).toBe('run-3');
    expect(runs[1].runId).toBe('run-2');
  });

  it('listRunSummaries respects status filter', () => {
    createMockRun('run-pass', { status: 'completed' });
    createMockRun('run-fail', { status: 'failed' });

    const completed = listRunSummaries({ status: 'completed' }, tempArtifactsDir);
    expect(completed.length).toBe(1);
    expect(completed[0].runId).toBe('run-pass');

    const failed = listRunSummaries({ status: 'failed' }, tempArtifactsDir);
    expect(failed.length).toBe(1);
    expect(failed[0].runId).toBe('run-fail');
  });

  it('computeRunHistoryStats aggregates correctly', () => {
    createMockRun('run-1', {
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 1, cautionCount: 2, allowedCount: 3 },
    });
    createMockRun('run-2', {
      status: 'failed',
      executionPolicy: { mode: 'external', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 1, allowedCount: 4 },
    });

    const stats = computeRunHistoryStats(tempArtifactsDir);
    expect(stats.totalRuns).toBe(2);
    expect(stats.completedRuns).toBe(1);
    expect(stats.failedRuns).toBe(1);
    expect(stats.totalScreenshots).toBe(2);
    expect(stats.totalBlockedSteps).toBe(1);
    expect(stats.totalCautionSteps).toBe(3);
    expect(stats.totalAllowedSteps).toBe(7);
  });

  it('run summary computes verdict correctly', () => {
    createMockRun('run-blocked', {
      policyDecisions: [{ riskLevel: 'blocked', stepId: 's1', stepIndex: 0, action: 'click', allowed: false, reasonCode: 'test', message: 'blocked' }],
    });
    createMockRun('run-caution', {
      policyDecisions: [{ riskLevel: 'caution', stepId: 's1', stepIndex: 0, action: 'fill', allowed: true, reasonCode: 'test', message: 'caution' }],
    });
    createMockRun('run-safe', {
      policyDecisions: [{ riskLevel: 'safe', stepId: 's1', stepIndex: 0, action: 'navigate', allowed: true, reasonCode: 'test', message: 'safe' }],
    });

    const runs = listRunSummaries({}, tempArtifactsDir);
    const blocked = runs.find((r) => r.runId === 'run-blocked');
    const caution = runs.find((r) => r.runId === 'run-caution');
    const safe = runs.find((r) => r.runId === 'run-safe');

    expect(blocked!.verdict).toBe('not_ready');
    expect(caution!.verdict).toBe('needs_human_review');
    expect(safe!.verdict).toBe('ready_for_demo');
  });
});

