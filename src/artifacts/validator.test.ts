import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateRunArtifacts } from './validator.js';
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

describe('Artifact Validator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes complete run folder', () => {
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

    // Build a correct artifact manifest to satisfy integrity checks
    const artifacts = [
      { name: 'plan.json', relativePath: 'plan.json', sizeBytes: fs.statSync(path.join(tempDir, 'plan.json')).size, category: 'core', required: true, present: true },
      { name: 'data.json', relativePath: 'data.json', sizeBytes: fs.statSync(path.join(tempDir, 'data.json')).size, category: 'data', required: true, present: true },
      { name: 'run.json', relativePath: 'run.json', sizeBytes: fs.statSync(path.join(tempDir, 'run.json')).size, category: 'core', required: true, present: true },
      { name: 'report.md', relativePath: 'report.md', sizeBytes: fs.statSync(path.join(tempDir, 'report.md')).size, category: 'report', required: true, present: true },
      { name: 'report.html', relativePath: 'report.html', sizeBytes: fs.statSync(path.join(tempDir, 'report.html')).size, category: 'report', required: true, present: true },
      { name: 'cleanup-report.md', relativePath: 'cleanup-report.md', sizeBytes: fs.statSync(path.join(tempDir, 'cleanup-report.md')).size, category: 'report', required: true, present: true },
      { name: 'data-safety-audit.json', relativePath: 'data-safety-audit.json', sizeBytes: fs.statSync(path.join(tempDir, 'data-safety-audit.json')).size, category: 'audit', required: true, present: true },
      { name: 'data-safety-audit.md', relativePath: 'data-safety-audit.md', sizeBytes: fs.statSync(path.join(tempDir, 'data-safety-audit.md')).size, category: 'audit', required: true, present: true },
      { name: 'fixture-validation.json', relativePath: 'fixture-validation.json', sizeBytes: fs.statSync(path.join(tempDir, 'fixture-validation.json')).size, category: 'fixture', required: true, present: true },
      { name: 'fixture-validation.md', relativePath: 'fixture-validation.md', sizeBytes: fs.statSync(path.join(tempDir, 'fixture-validation.md')).size, category: 'fixture', required: true, present: true },
      { name: 'scope-analysis.json', relativePath: 'scope-analysis.json', sizeBytes: fs.statSync(path.join(tempDir, 'scope-analysis.json')).size, category: 'report', required: true, present: true },
      { name: 'scope-analysis.md', relativePath: 'scope-analysis.md', sizeBytes: fs.statSync(path.join(tempDir, 'scope-analysis.md')).size, category: 'report', required: true, present: true },
      { name: 'failure-classification.json', relativePath: 'failure-classification.json', sizeBytes: fs.statSync(path.join(tempDir, 'failure-classification.json')).size, category: 'report', required: true, present: true },
      { name: 'failure-classification.md', relativePath: 'failure-classification.md', sizeBytes: fs.statSync(path.join(tempDir, 'failure-classification.md')).size, category: 'report', required: true, present: true },
      { name: 'screenshot-gallery.html', relativePath: 'screenshot-gallery.html', sizeBytes: fs.statSync(path.join(tempDir, 'screenshot-gallery.html')).size, category: 'evidence', required: true, present: true },
      { name: 'screenshot-gallery.md', relativePath: 'screenshot-gallery.md', sizeBytes: fs.statSync(path.join(tempDir, 'screenshot-gallery.md')).size, category: 'evidence', required: true, present: true },
      { name: 'screenshot-gallery.json', relativePath: 'screenshot-gallery.json', sizeBytes: fs.statSync(path.join(tempDir, 'screenshot-gallery.json')).size, category: 'evidence', required: true, present: true },
      { name: 'screenshots/s0.png', relativePath: 'screenshots/s0.png', sizeBytes: fs.statSync(path.join(tempDir, 'screenshots', 's0.png')).size, category: 'evidence', required: false, present: true },
      { name: 'trace.zip', relativePath: 'trace.zip', sizeBytes: fs.statSync(path.join(tempDir, 'trace.zip')).size, category: 'evidence', required: false, present: true },
    ];
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({ artifacts }));

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const nonPass = result.checks.filter((c) => c.status !== 'pass');
    expect(nonPass, `Non-pass checks: ${JSON.stringify(nonPass)}`).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('catches missing trace.zip when browser launched', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.mkdirSync(path.join(tempDir, 'screenshots'));

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const traceCheck = result.checks.find((c) => c.name === 'trace.zip');
    expect(traceCheck?.status).toBe('warn');
    expect(result.findings.some((f) => f.patternId === 'trace_missing_network_tab')).toBe(true);
  });

  it('catches missing cleanup dry-run statement', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), 'Some other content');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'abc', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const dryRunCheck = result.checks.find((c) => c.name === 'cleanup dry-run statement');
    expect(dryRunCheck?.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'cleanup_report_missing_dry_run_statement')).toBe(true);
  });

  it('catches absolute local paths in report.html', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<img src="/Users/ashwin/projects/image.png">');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'abc', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const absCheck = result.checks.find((c) => c.name === 'report.html absolute paths');
    expect(absCheck?.status).toBe('warn');
    expect(result.findings.some((f) => f.patternId === 'report_html_broken_on_other_machine')).toBe(true);
  });

  it('catches external CDN references in report.html', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<script src="https://cdn.example.com/lib.js"></script>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'abc', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const extCheck = result.checks.find((c) => c.name === 'report.html external references');
    expect(extCheck?.status).toBe('warn');
    expect(result.findings.some((f) => f.patternId === 'flaky_due_to_external_dependency')).toBe(true);
  });

  it('catches unsafe data item missing safeToDelete', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({
      users: [{ email: 'test@forgeqa.test', safeToDelete: false }],
      files: [],
    }));
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'abc', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const safeCheck = result.checks.find((c) => c.name === 'data.json safety tags');
    expect(safeCheck?.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'cleanup_target_missing_safe_tags')).toBe(true);
  });

  it('emits enriched PatternFinding[]', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), 'missing dry-run');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'abc', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].title).toBeDefined();
    expect(result.findings[0].rootCause).toBeDefined();
    expect(result.findings[0].safeFix).toBeDefined();
  });

  it('fails checksum mismatch in manifest', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, sha256: 'badhash1234567890badhash1234567890badhash1234567890badhash12345678', category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const integrityCheck = result.checks.find((c) => c.name === 'artifact manifest integrity');
    expect(integrityCheck?.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'artifact_integrity_mismatch')).toBe(true);
  });

  it('fails missing required file from manifest', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, category: 'core', required: true, present: true },
        { name: 'missing-required.json', relativePath: 'missing-required.json', sizeBytes: 0, category: 'core', required: true, present: false },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const requiredCheck = result.checks.find((c) => c.name === 'artifact manifest required artifacts present');
    expect(requiredCheck?.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'artifact_integrity_mismatch')).toBe(true);
  });

  it('warns extra file not in manifest', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'extra-file.txt'), 'unexpected');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const manifest = createMockManifest();
    const result = validateRunArtifacts(tempDir, manifest);
    const extraCheck = result.checks.find((c) => c.name === 'unexpected extra files');
    expect(extraCheck?.status).toBe('warn');
  });

  it('ignores trace missing for dry-run', () => {
    fs.writeFileSync(path.join(tempDir, 'plan.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'run.json'), JSON.stringify({
      executionPolicy: { mode: 'demo', strictPolicy: false, allowSubmit: false, allowUpload: false, blockedCount: 0, cautionCount: 0, allowedCount: 1 },
    }));
    fs.writeFileSync(path.join(tempDir, 'report.md'), '# Report');
    fs.writeFileSync(path.join(tempDir, 'report.html'), '<html></html>');
    fs.writeFileSync(path.join(tempDir, 'cleanup-report.md'), '**No items were deleted. This was a dry-run cleanup report only.**');
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.json'), JSON.stringify({ status: 'pass', summary: {} }));
    fs.writeFileSync(path.join(tempDir, 'data-safety-audit.md'), '# Data Safety Audit');
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.json'), JSON.stringify({ status: 'pass', checks: [], findings: [] }));
    fs.writeFileSync(path.join(tempDir, 'fixture-validation.md'), '# Fixture Validation');
    fs.writeFileSync(path.join(tempDir, 'artifact-manifest.json'), JSON.stringify({
      artifacts: [
        { name: 'plan.json', relativePath: 'plan.json', sizeBytes: 2, category: 'core', required: true, present: true },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'screenshots'));
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake-png');
    // trace.zip intentionally missing

    const manifest = createMockManifest({ dryRun: true });
    const result = validateRunArtifacts(tempDir, manifest);
    const traceCheck = result.checks.find((c) => c.name === 'trace.zip');
    expect(traceCheck?.status).toBe('pass');
  });
});
