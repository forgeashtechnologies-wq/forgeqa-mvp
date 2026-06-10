import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repairBatchArtifacts, generateBatchRepairMarkdown, writeBatchRepairArtifacts } from './repair.js';

describe('Batch Artifact Repair', () => {
  let batchDir: string;
  let batchId: string;

  beforeEach(() => {
    const batchesDir = path.join(process.cwd(), 'artifacts', 'batches');
    fs.mkdirSync(batchesDir, { recursive: true });
    batchId = `test-repair-${Date.now()}`;
    batchDir = path.join(batchesDir, batchId);
    fs.mkdirSync(batchDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(batchDir)) {
      fs.rmSync(batchDir, { recursive: true, force: true });
    }
  });

  it('converts absolute path inside batch folder to relative path', () => {
    const absPath = path.join(process.cwd(), 'artifacts', 'batches', batchId, 'batch-plan.json');
    fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), `# Plan\nSee ${absPath}\n`, 'utf-8');

    const result = repairBatchArtifacts(batchId);
    const absAction = result.actions.find((a) => a.id === 'abs_path_batch-plan.md');
    expect(absAction).toBeDefined();
    expect(absAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(batchDir, 'batch-plan.md'), 'utf-8');
    expect(content).not.toContain(process.cwd());
    expect(content).toContain('./batch-plan.json');
  });

  it('does not rewrite linked run path unless fix-linked-runs', () => {
    fs.writeFileSync(path.join(batchDir, 'batch-result.md'), `# Result\nSee artifacts/runs/some-run/report.md\n`, 'utf-8');

    repairBatchArtifacts(batchId);
    const content = fs.readFileSync(path.join(batchDir, 'batch-result.md'), 'utf-8');
    expect(content).toContain('artifacts/runs/some-run/report.md');
  });

  it('adds missing industry disclaimer', () => {
    fs.writeFileSync(path.join(batchDir, 'industry-batch-assessment.md'), '# Assessment\n', 'utf-8');

    const result = repairBatchArtifacts(batchId);
    const discAction = result.actions.find((a) => a.id === 'disclaimer_industry-batch-assessment.md');
    expect(discAction).toBeDefined();
    expect(discAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(batchDir, 'industry-batch-assessment.md'), 'utf-8');
    expect(content).toContain('does not certify');
  });

  it('writes batch-repair.json/md', () => {
    fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), '# Plan\n', 'utf-8');

    const result = repairBatchArtifacts(batchId);
    writeBatchRepairArtifacts(result);

    expect(fs.existsSync(path.join(batchDir, 'batch-repair.json'))).toBe(true);
    expect(fs.existsSync(path.join(batchDir, 'batch-repair.md'))).toBe(true);
  });

  it('re-validates after repair by producing a valid result object', () => {
    fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), '# Plan\n', 'utf-8');

    const result = repairBatchArtifacts(batchId);
    expect(result.status).toBe('fixed');
    expect(result.summary.fixedCount).toBeGreaterThan(0);
    expect(result.summary.totalActions).toBeGreaterThan(0);
  });

  it('generates valid repair markdown', () => {
    fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), '# Plan\n', 'utf-8');
    const result = repairBatchArtifacts(batchId);
    const md = generateBatchRepairMarkdown(result);
    expect(md).toContain('# Batch Repair Report');
    expect(md).toContain(batchId);
    expect(md).toContain('Disclaimer');
  });
});
