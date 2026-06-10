import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildUnifiedBatchReport, generateUnifiedBatchReportMarkdown, generateUnifiedBatchReportJson, writeUnifiedBatchReport } from './batch-unified-report.js';

describe('Unified Batch Report', () => {
  let batchDir: string;
  let batchId: string;

  beforeEach(() => {
    const batchesDir = path.join(process.cwd(), 'artifacts', 'batches');
    fs.mkdirSync(batchesDir, { recursive: true });
    batchId = `test-batch-${Date.now()}`;
    batchDir = path.join(batchesDir, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    // Minimal batch-plan.json
    fs.writeFileSync(
      path.join(batchDir, 'batch-plan.json'),
      JSON.stringify({
        batchId,
        createdAt: new Date().toISOString(),
        resolvedTemplates: [
          { prompt: 'test prompt 1', templateId: 't1' },
          { prompt: 'test prompt 2', templateId: 't2' },
        ],
        options: { demo: true },
      }),
      'utf-8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(batchDir)) {
      fs.rmSync(batchDir, { recursive: true, force: true });
    }
  });

  it('builds report with complete batch folder', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-result.json'),
      JSON.stringify({
        batchId,
        status: 'completed',
        items: [
          { status: 'completed', verdict: 'ready_for_demo' },
          { status: 'completed', verdict: 'ready_for_demo' },
        ],
        runIds: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 10, passCount: 10, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    expect(report.batchId).toBe(batchId);
    expect(report.status).toBe('pass');
    expect(report.result?.totalRuns).toBe(2);
    expect(report.result?.completedRuns).toBe(2);
    expect(report.result?.readyRuns).toBe(2);
  });

  it('preview-only batch without batch-result still generates report', () => {
    const report = buildUnifiedBatchReport(batchId);
    expect(report.status).toBe('preview');
    expect(report.result).toBeUndefined();
    expect(report.recommendedNextSteps.some((s) => s.includes('preview'))).toBe(true);
  });

  it('missing batch-plan.json fails helpfully', () => {
    fs.rmSync(path.join(batchDir, 'batch-plan.json'));
    expect(() => buildUnifiedBatchReport(batchId)).toThrow('Batch plan not found');
  });

  it('missing linked run becomes finding, not crash', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-result.json'),
      JSON.stringify({ batchId, status: 'completed', items: [], runIds: ['nonexistent-run-12345'] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    const missingRunFinding = report.findings.find((f) => f.title === 'Missing Linked Run');
    expect(missingRunFinding).toBeDefined();
    expect(missingRunFinding?.severity).toBe('error');
    expect(report.summary.missingLinkedRuns).toBe(1);
  });

  it('validation findings appear in unified batch report', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({
        status: 'fail',
        summary: { totalChecks: 5, passCount: 3, warnCount: 0, failCount: 2, missingFiles: ['missing.json'], brokenLinks: [] },
        findings: [{ title: 'Missing file', severity: 'error', message: 'file missing', file: 'missing.json' }],
      }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    expect(report.validation.status).toBe('fail');
    expect(report.validation.failures).toBe(2);
    expect(report.findings.some((f) => f.title === 'Missing file')).toBe(true);
  });

  it('repair actions appear in unified batch report', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'batch-repair.json'),
      JSON.stringify({
        status: 'fixed',
        summary: { totalActions: 2, fixedCount: 2, skippedCount: 0, manualReviewCount: 0, failedCount: 0, safeCount: 2, unsafeCount: 0 },
        actions: [
          { id: 'fix1', category: 'absolute_path', status: 'fixed', message: 'fixed path', file: 'plan.md', safe: true },
        ],
        findings: [],
      }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    expect(report.repair?.status).toBe('fixed');
    expect(report.repairActions.length).toBe(1);
    expect(report.repairActions[0].id).toBe('fix1');
  });

  it('industry summary appears when industry assessment exists', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-plan.json'),
      JSON.stringify({
        batchId,
        createdAt: new Date().toISOString(),
        resolvedTemplates: [],
        options: { demo: true },
        industryPackId: 'education-alumni',
        industryPackName: 'Education Alumni',
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'industry-batch-assessment.json'),
      JSON.stringify({
        packId: 'education-alumni',
        packName: 'Education Alumni',
        status: 'pass',
        score: 85,
        requiredItemsTested: ['item1'],
        requiredItemsMissing: ['item2'],
        recommendedItemsMissing: [],
        blockedByPolicyItems: [],
        recommendations: ['rec1'],
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    expect(report.industry).toBeDefined();
    expect(report.industry?.packId).toBe('education-alumni');
    expect(report.industry?.score).toBe(85);
    expect(report.findings.some((f) => f.source === 'industry')).toBe(true);
  });

  it('manual_review repair action appears as manual review item', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(batchDir, 'batch-repair.json'),
      JSON.stringify({
        status: 'manual_review',
        summary: { totalActions: 1, fixedCount: 0, skippedCount: 0, manualReviewCount: 1, failedCount: 0, safeCount: 0, unsafeCount: 1 },
        actions: [{ id: 'manual1', category: 'absolute_path', status: 'manual_review', message: 'needs review', file: 'plan.md', safe: false }],
        findings: [],
      }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    expect(report.summary.manualReviewItems).toBe(1);
    expect(report.repairActions.some((a) => a.status === 'manual_review')).toBe(true);
  });

  it('artifact links are relative only', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    for (const link of report.artifactLinks) {
      expect(link.path.startsWith('artifacts/batches/')).toBe(true);
      expect(link.path).not.toContain(process.cwd());
    }
  });

  it('no absolute paths in markdown', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    const md = generateUnifiedBatchReportMarkdown(report);
    expect(md).not.toContain(process.cwd());
    expect(md).not.toContain('/Users/');
  });

  it('no external links in markdown', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    const md = generateUnifiedBatchReportMarkdown(report);
    expect(md).not.toMatch(/https?:\/\//);
  });

  it('disclaimer present in markdown', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    const md = generateUnifiedBatchReportMarkdown(report);
    expect(md).toContain('Disclaimer');
    expect(md).toContain('does not certify');
  });

  it('JSON output parseable', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    const json = generateUnifiedBatchReportJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.batchId).toBe(batchId);
    expect(parsed.validation).toBeDefined();
  });

  it('writeUnifiedBatchReport writes md and json', () => {
    fs.writeFileSync(
      path.join(batchDir, 'batch-validation.json'),
      JSON.stringify({ status: 'pass', summary: { totalChecks: 5, passCount: 5, warnCount: 0, failCount: 0, missingFiles: [], brokenLinks: [] }, findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedBatchReport(batchId);
    writeUnifiedBatchReport(batchId, report);

    expect(fs.existsSync(path.join(batchDir, 'batch-unified-report.json'))).toBe(true);
    expect(fs.existsSync(path.join(batchDir, 'batch-unified-report.md'))).toBe(true);
  });
});
