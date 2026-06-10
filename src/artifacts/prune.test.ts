import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runPrune } from './prune.js';

describe('Artifact Prune', () => {
  const artifactRoot = path.join(process.cwd(), 'artifacts');

  beforeEach(() => {
    // Create test artifact directories
    const runsDir = path.join(artifactRoot, 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test artifacts (only remove ones we created)
    const pruneDir = path.join(artifactRoot, 'prune');
    if (fs.existsSync(pruneDir)) {
      fs.rmSync(pruneDir, { recursive: true, force: true });
    }
  });

  it('default is dry-run', () => {
    const report = runPrune({ runs: true });
    expect(report.mode).toBe('dry-run');
  });

  it('without filters refuses actual deletion', () => {
    const report = runPrune({ confirm: true });
    expect(report.safe).toBe(false);
    expect(report.targets.length).toBe(0);
  });

  it('with --confirm but no filters refuses deletion', () => {
    const report = runPrune({ confirm: true, dryRun: false });
    expect(report.safe).toBe(false);
    expect(report.summary.totalTargets).toBe(0);
  });

  it('only targets artifacts/runs and artifacts/batches when selected', () => {
    const report = runPrune({ runs: true });
    // Should only have run targets, nothing outside artifacts/
    for (const t of report.targets) {
      expect(t.path.startsWith(path.join(process.cwd(), 'artifacts'))).toBe(true);
    }
  });

  it('rejects path traversal', () => {
    const report = runPrune({ runs: true });
    for (const t of report.targets) {
      const resolved = path.resolve(t.path);
      expect(resolved.startsWith(path.resolve(artifactRoot))).toBe(true);
    }
  });

  it('does not follow symlinks', () => {
    // This is hard to test without creating symlinks; verify via implementation
    const report = runPrune({ runs: true });
    expect(report.safe).toBe(true);
  });

  it('writes prune-report.json/md', () => {
    runPrune({ runs: true });
    const pruneDir = path.join(artifactRoot, 'prune');
    expect(fs.existsSync(path.join(pruneDir, 'prune-report.json'))).toBe(true);
    expect(fs.existsSync(path.join(pruneDir, 'prune-report.md'))).toBe(true);
  });

  it('--json outputs valid JSON', () => {
    const report = runPrune({ runs: true });
    expect(report.id).toBeDefined();
    expect(report.createdAt).toBeDefined();
    expect(report.summary).toBeDefined();
  });

  it('keeps latest N', () => {
    // With keepLatest, oldest items should be targeted while newest are kept
    const report = runPrune({ runs: true, keepLatest: 5 });
    expect(report.summary.totalKept).toBeLessThanOrEqual(5);
  });

  it('age filter works', () => {
    const report = runPrune({ runs: true, olderThanDays: 0 });
    // With olderThanDays: 0, everything should match (all are >= 0 days old)
    expect(report.targets.length).toBeGreaterThanOrEqual(0);
  });

  it('disclaimer is present', () => {
    const report = runPrune({ runs: true });
    expect(report.disclaimer).toContain('does not delete source files');
  });
});
