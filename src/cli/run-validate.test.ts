import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateRunArtifacts } from '../artifacts/validator.js';
import type { RunManifest } from '../schemas/core.js';

function createMockManifest(overrides?: Partial<RunManifest>): RunManifest {
  return {
    runId: 'test-run',
    e2eRunId: 'e2e-test',
    templateId: 't1',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [
      { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, screenshotPath: 'screenshots/s0.png' },
    ],
    artifactsDir: 'artifacts/runs/test-run',
    isFinalized: true,
    ...overrides,
  };
}

describe('Run Validate (via artifact validator)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-run-validate-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates a complete run folder', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ users: [], files: [] }));
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report\nscreenshot-gallery.html screenshot-gallery.md');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.json'), JSON.stringify({ summary: { testedCount: 1, notTestedCount: 0, needsHumanReviewCount: 0, coveragePercent: 100 } }));
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.md'), '# Scope Analysis');
    fs.writeFileSync(path.join(tempDir, 'failure-classification.json'), JSON.stringify({ summary: { totalFailedSteps: 0 } }));
    fs.writeFileSync(path.join(tempDir, 'failure-classification.md'), '# Failure Classification');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.html'), '<html><img src="screenshots/s0.png"/></html>');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.md'), '# Gallery');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.json'), JSON.stringify({ screenshotCount: 1 }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    // Build artifact manifest with correct sizes
    const artifactFiles = [
      'plan.json', 'data.json', 'run.json', 'report.md', 'report.html',
      'cleanup-report.md', 'data-safety-audit.json', 'data-safety-audit.md',
      'fixture-validation.json', 'fixture-validation.md',
      'scope-analysis.json', 'scope-analysis.md',
      'failure-classification.json', 'failure-classification.md',
      'screenshot-gallery.html', 'screenshot-gallery.md', 'screenshot-gallery.json',
    ];
    const artifacts = artifactFiles.map((f) => ({
      name: f,
      relativePath: f,
      sizeBytes: fs.statSync(path.join(tempDir, f)).size,
      category: f.endsWith('.png') || f === 'trace.zip' ? 'evidence' : f.startsWith('data-safety') ? 'audit' : f.startsWith('screenshot') ? 'evidence' : 'core' as 'core' | 'evidence' | 'report' | 'audit' | 'validation' | 'data' | 'fixture' | 'policy',
      required: true,
      present: true,
    }));
    artifacts.push({
      name: 's0.png',
      relativePath: 'screenshots/s0.png',
      sizeBytes: fs.statSync(path.join(tempDir, 'screenshots', 's0.png')).size,
      category: 'evidence' as const,
      required: false,
      present: true,
    });
    artifacts.push({
      name: 'trace.zip',
      relativePath: 'trace.zip',
      sizeBytes: fs.statSync(path.join(tempDir, 'trace.zip')).size,
      category: 'evidence' as const,
      required: false,
      present: true,
    });
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({ artifacts }));

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const nonPass = result.checks.filter((c) => c.status !== 'pass');
    expect(nonPass, `Non-pass checks: ${JSON.stringify(nonPass)}`).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('fails missing run.json', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report\nscreenshot-gallery.html screenshot-gallery.md');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.json'), JSON.stringify({ summary: { testedCount: 1, notTestedCount: 0, needsHumanReviewCount: 0, coveragePercent: 100 } }));
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.md'), '# Scope Analysis');
    fs.writeFileSync(path.join(tempDir, 'failure-classification.json'), JSON.stringify({ summary: { totalFailedSteps: 0 } }));
    fs.writeFileSync(path.join(tempDir, 'failure-classification.md'), '# Failure Classification');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.md'), '# Gallery');
    fs.writeFileSync(path.join(tempDir, 'screenshot-gallery.json'), JSON.stringify({ screenshotCount: 1 }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({ artifacts: [] }));

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const runCheck = result.checks.find((c) => c.name === 'run.json');
    expect(runCheck?.status).toBe('fail');
    expect(result.isValid).toBe(false);
  });

  it('fails missing screenshot-gallery', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report\nscreenshot-gallery.html screenshot-gallery.md');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.json'), JSON.stringify({ summary: { testedCount: 1, notTestedCount: 0, needsHumanReviewCount: 0, coveragePercent: 100 } }));
    fs.writeFileSync(path.join(tempDir, 'scope-analysis.md'), '# Scope Analysis');
    fs.writeFileSync(path.join(tempDir, 'failure-classification.json'), JSON.stringify({ summary: { totalFailedSteps: 0 } }));
    fs.writeFileSync(path.join(tempDir, 'failure-classification.md'), '# Failure Classification');
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({ artifacts: [] }));

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const galleryCheck = result.checks.find((c) => c.name === 'screenshot-gallery.html');
    expect(galleryCheck?.status).toBe('fail');
  });
});
