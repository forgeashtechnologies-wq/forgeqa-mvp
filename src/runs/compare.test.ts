import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compareRuns, generateComparisonMarkdown, generateComparisonJson } from './compare.js';

describe('Run Comparison', () => {
  let tempArtifactsDir: string;

  beforeEach(() => {
    tempArtifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-compare-'));
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
      startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T00:01:00.000Z',
      steps: [
        { stepId: 's0', status: 'passed', startedAt: '2024-01-01T00:00:00.000Z', completedAt: '2024-01-01T00:00:30.000Z', durationMs: 30000, screenshotPath: 'screenshots/s0.png' },
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
    fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), JSON.stringify({ reportHealth: 'pass', checks: [], findings: [] }), 'utf-8');
    fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'screenshots', 's0.png'), 'fake', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'trace.zip'), 'fake', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass' }), 'utf-8');

    return runDir;
  }

  it('compare identical-style runs returns mostly unchanged', () => {
    createMockRun('run-a');
    createMockRun('run-b');

    const result = compareRuns('run-a', 'run-b', tempArtifactsDir);
    expect(result.overallVerdict).toBe('unchanged');
    expect(result.differences.filter((d) => d.type === 'unchanged').length).toBeGreaterThan(0);
  });

  it('compare failed vs passed run highlights verdict change', () => {
    createMockRun('run-pass', { status: 'completed' });
    createMockRun('run-fail', { status: 'failed' });

    const result = compareRuns('run-pass', 'run-fail', tempArtifactsDir);
    expect(result.overallVerdict).toBe('worsened');
    const verdictDiff = result.differences.find((d) => d.field === 'verdict');
    expect(verdictDiff?.type).toBe('worsened');
  });

  it('compare blocked policy run vs safe submit run highlights policy delta', () => {
    createMockRun('run-blocked', {
      executionPolicy: { mode: 'external', strictPolicy: true, allowSubmit: false, allowUpload: false, blockedCount: 2, cautionCount: 0, allowedCount: 0 },
      policyDecisions: [
        { riskLevel: 'blocked', stepId: 's1', stepIndex: 0, action: 'click', allowed: false, reasonCode: 'test', message: 'blocked' },
      ],
    });
    createMockRun('run-safe', {
      executionPolicy: { mode: 'external', strictPolicy: false, allowSubmit: true, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 3 },
    });

    const result = compareRuns('run-blocked', 'run-safe', tempArtifactsDir);
    const blockedDiff = result.differences.find((d) => d.field === 'blockedCount');
    expect(blockedDiff?.type).toBe('improved');
  });

  it('compare --json valid output', () => {
    createMockRun('run-a');
    createMockRun('run-b');

    const result = compareRuns('run-a', 'run-b', tempArtifactsDir);
    const json = generateComparisonJson(result);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('runA');
    expect(parsed).toHaveProperty('runB');
    expect(parsed).toHaveProperty('overallVerdict');
    expect(parsed).toHaveProperty('differences');
    expect(Array.isArray(parsed.differences)).toBe(true);
  });

  it('compare markdown output generated', () => {
    createMockRun('run-a');
    createMockRun('run-b');

    const result = compareRuns('run-a', 'run-b', tempArtifactsDir);
    const md = generateComparisonMarkdown(result);
    expect(md).toContain('# ForgeQA Run Comparison');
    expect(md).toContain(result.shortA);
    expect(md).toContain(result.shortB);
  });
});
