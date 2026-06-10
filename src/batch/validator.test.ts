import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateBatchArtifacts, generateBatchValidationMarkdown, generateBatchValidationJson } from './validator.js';
import { generateBatchManifest } from './manifest.js';
import type { BatchResult } from './types.js';

const TEST_BATCH_ID = 'test_batch_validator';

function getBatchDir() {
  return path.join(process.cwd(), 'artifacts', 'batches', TEST_BATCH_ID);
}

function writeBatchFile(filename: string, content: string) {
  const dir = getBatchDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

function clearBatchDir() {
  const dir = getBatchDir();
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function makeBatchResult(overrides?: Partial<BatchResult>): BatchResult {
  return {
    batchId: TEST_BATCH_ID,
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    items: [],
    runIds: [],
    passCount: 0,
    failCount: 0,
    blockedCount: 0,
    skippedCount: 0,
    reportHealthSummary: {},
    dataSafetySummary: {},
    policySummary: {},
    artifactPath: `artifacts/batches/${TEST_BATCH_ID}`,
    ...overrides,
  };
}

describe('Batch Validator', () => {
  beforeEach(() => {
    clearBatchDir();
  });

  afterEach(() => {
    clearBatchDir();
  });

  it('passes complete batch folder', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID, createdAt: new Date().toISOString() }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('pass');
    expect(result.summary.passCount).toBeGreaterThan(0);
  });

  it('fails missing batch-plan.json', () => {
    writeBatchFile('batch-plan.md', '# Batch Plan');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.missingFiles).toContain('batch-plan.json');
    expect(result.findings.some((f) => f.title.includes('Missing batch-plan.json'))).toBe(true);
  });

  it('fails invalid batch-result.json', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', 'not json {');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.invalidJsonFiles).toContain('batch-result.json');
  });

  it('warns missing optional industry files when industry not used', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    // Industry files not required when no industry pack
    const industryChecks = result.checks.filter((c) => c.category === 'industry_assessment');
    expect(industryChecks.length).toBe(0);
  });

  it('fails missing industry-batch-assessment when industry used', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult({ industryPackId: 'education-alumni' })));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.missingFiles).toContain('industry-batch-assessment.json');
    expect(result.summary.missingFiles).toContain('industry-batch-assessment.md');
  });

  it('fails missing linked run artifact', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult({ runIds: ['nonexistent_run'] })));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.linkedRunFailures).toContain('nonexistent_run');
    expect(result.summary.brokenLinks.some((l) => l.includes('nonexistent_run'))).toBe(true);
  });

  it('fails absolute path in batch-result.md', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result\nSee /Users/test/report.md');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.absolutePathFindings).toContain('batch-result.md');
  });

  it('fails external URL in markdown', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result\nSee https://example.com/report');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.summary.warnCount).toBeGreaterThan(0);
    const extCheck = result.checks.find((c) => c.id === 'md_ext_batch-result.md');
    expect(extCheck).toBeDefined();
    expect(extCheck!.status).toBe('warn');
  });

  it('fails banned certification claim', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result\nThis app is GDPR compliant.');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.status).toBe('fail');
    expect(result.summary.certificationClaimFindings).toContain('batch-result.md');
  });

  it('allows disclaimer with "not compliance"', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result\nThis is not a compliance certification.');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    expect(result.summary.certificationClaimFindings).not.toContain('batch-result.md');
  });

  it('validates runIds unique', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult({ runIds: ['run_1', 'run_1'] })));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    const uniqueCheck = result.checks.find((c) => c.id === 'runids_unique');
    expect(uniqueCheck).toBeDefined();
    expect(uniqueCheck!.status).toBe('fail');
  });

  it('validates status values', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult({ status: 'unknown_status' as any })));
    writeBatchFile('batch-result.md', '# Batch Result');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    const statusCheck = result.checks.find((c) => c.id === 'status_valid');
    expect(statusCheck).toBeDefined();
    expect(statusCheck!.status).toBe('fail');
  });

  it('generates markdown report', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    const md = generateBatchValidationMarkdown(result);
    expect(md).toContain('Batch Validation Report');
    expect(md).toContain(TEST_BATCH_ID);
    expect(md).toContain('Disclaimer');
  });

  it('generates valid JSON report', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');

    const result = validateBatchArtifacts(TEST_BATCH_ID);
    const json = generateBatchValidationJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.batchId).toBe(TEST_BATCH_ID);
    expect(parsed.status).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });

  it('strict mode upgrades warn to fail', () => {
    writeBatchFile('batch-plan.json', JSON.stringify({ batchId: TEST_BATCH_ID }));
    writeBatchFile('batch-plan.md', '# Batch Plan');
    writeBatchFile('batch-result.json', JSON.stringify(makeBatchResult()));
    writeBatchFile('batch-result.md', '# Batch Result\nSee https://example.com/report');

    const result = validateBatchArtifacts(TEST_BATCH_ID, { strict: true });
    expect(result.status).toBe('fail');
  });
});

describe('Batch Manifest', () => {
  beforeEach(() => {
    clearBatchDir();
  });

  afterEach(() => {
    clearBatchDir();
  });

  it('generated with relative paths only', () => {
    writeBatchFile('batch-plan.json', '{}');
    writeBatchFile('batch-plan.md', '# Plan');

    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    expect(manifest.batchId).toBe(TEST_BATCH_ID);
    expect(manifest.artifacts.every((a) => !a.relativePath.includes('/Users/'))).toBe(true);
  });

  it('includes sha256', () => {
    writeBatchFile('batch-plan.json', '{}');

    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    const artifact = manifest.artifacts.find((a) => a.relativePath === 'batch-plan.json');
    expect(artifact).toBeDefined();
    expect(artifact!.sha256).toBeDefined();
    expect(artifact!.sha256.length).toBe(64);
  });

  it('includes required/present flags', () => {
    writeBatchFile('batch-plan.json', '{}');

    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    const artifact = manifest.artifacts.find((a) => a.relativePath === 'batch-plan.json');
    expect(artifact!.required).toBe(true);
    expect(artifact!.present).toBe(true);
  });

  it('marks missing required files as not present', () => {
    // Don't write batch-plan.md
    writeBatchFile('batch-plan.json', '{}');

    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    const missing = manifest.artifacts.find((a) => a.relativePath === 'batch-plan.md');
    expect(missing).toBeDefined();
    expect(missing!.required).toBe(true);
    expect(missing!.present).toBe(false);
  });

  it('includes validation status placeholder', () => {
    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    expect(manifest.validationStatus).toBe('unknown');
  });

  it('includes disclaimer', () => {
    const result = makeBatchResult();
    const manifest = generateBatchManifest(result);
    expect(manifest.disclaimer.length).toBeGreaterThan(0);
  });
});
