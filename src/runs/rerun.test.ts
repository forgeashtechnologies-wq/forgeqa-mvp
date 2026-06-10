import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readRunOptions,
  validateRerunEligibility,
  generateNewRunContextFromRun,
} from './rerun.js';

describe('Rerun Foundation', () => {
  let tempArtifactsDir: string;

  beforeEach(() => {
    tempArtifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-rerun-'));
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
        { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100 },
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
    return runDir;
  }

  it('readRunOptions extracts template/mode/viewport', () => {
    createMockRun('run-001');
    const options = readRunOptions('run-001', tempArtifactsDir);
    expect(options).toBeDefined();
    expect(options!.templateId).toBe('test.template');
    expect(options!.mode).toBe('demo');
    expect(options!.viewport).toBe('desktop');
  });

  it('generateNewRunContext produces new runId/e2eRunId', () => {
    createMockRun('run-002');
    const ctx = generateNewRunContextFromRun('run-002', tempArtifactsDir);
    expect(ctx.originalRunId).toBe('run-002');
    expect(ctx.newRunId).toBeDefined();
    expect(ctx.newRunId.length).toBeGreaterThan(8);
    expect(ctx.newE2ERunId).toBeDefined();
    expect(ctx.newE2ERunId.length).toBeGreaterThan(8);
    expect(ctx.newRunId).not.toBe(ctx.originalRunId);
  });

  it('validateRerunEligibility handles demo run as eligible', () => {
    createMockRun('run-demo');
    const { eligible, warnings } = validateRerunEligibility('run-demo', tempArtifactsDir);
    expect(eligible).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('validateRerunEligibility handles external dry-run as eligible', () => {
    createMockRun('run-dry', {
      executionPolicy: { mode: 'external', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
      dryRun: true,
    });
    const { eligible, warnings } = validateRerunEligibility('run-dry', tempArtifactsDir);
    expect(eligible).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('validateRerunEligibility warns for external browser runs', () => {
    createMockRun('run-ext', {
      executionPolicy: { mode: 'external', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
      dryRun: false,
    });
    const { eligible, warnings } = validateRerunEligibility('run-ext', tempArtifactsDir);
    expect(eligible).toBe(true);
    expect(warnings.some((w) => w.includes('explicit approval'))).toBe(true);
  });

  it('validateRerunEligibility returns not eligible for missing template', () => {
    createMockRun('run-no-template', { templateId: undefined });
    const { eligible, warnings } = validateRerunEligibility('run-no-template', tempArtifactsDir);
    expect(eligible).toBe(false);
    expect(warnings.some((w) => w.includes('templateId'))).toBe(true);
  });

  it('validateRerunEligibility returns not eligible for missing run.json', () => {
    const { eligible, warnings } = validateRerunEligibility('nonexistent', tempArtifactsDir);
    expect(eligible).toBe(false);
    expect(warnings.some((w) => w.includes('run.json'))).toBe(true);
  });
});
