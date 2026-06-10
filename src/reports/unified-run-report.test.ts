import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildUnifiedRunReport, generateUnifiedRunReportMarkdown, generateUnifiedRunReportJson, writeUnifiedRunReport } from './unified-run-report.js';

describe('Unified Run Report', () => {
  let runDir: string;
  let runId: string;

  beforeEach(() => {
    const runsDir = path.join(process.cwd(), 'artifacts', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    runId = `test-unified-${Date.now()}`;
    runDir = path.join(runsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // Create a minimal run.json
    fs.writeFileSync(
      path.join(runDir, 'run.json'),
      JSON.stringify({
        runId,
        status: 'completed',
        verdict: 'ready_for_demo',
        templateId: 'test-template',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executionPolicy: { mode: 'demo', findings: [] },
        viewport: { profile: 'desktop', width: 1280, height: 720, isMobile: false },
      }, null, 2),
      'utf-8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  });

  it('builds report with complete run folder', () => {
    // Write validation
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [{ status: 'pass', name: 'test', message: 'ok' }], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    expect(report.runId).toBe(runId);
    expect(report.status).toBe('completed');
    expect(report.validation.status).toBe('pass');
    expect(report.validation.checkCount).toBe(1);
  });

  it('missing repair files still generates report', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    expect(report.repair).toBeUndefined();
    expect(report.repairActions).toEqual([]);
  });

  it('missing run.json fails helpfully', () => {
    fs.rmSync(path.join(runDir, 'run.json'));
    expect(() => buildUnifiedRunReport(runId)).toThrow('Run manifest not found');
  });

  it('validation findings appear in unified report', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({
        isValid: true,
        checks: [],
        findings: [{ patternId: 'test-finding', severity: 'warning', message: 'test message', evidence: 'test-evidence' }],
      }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    const finding = report.findings.find((f) => f.title === 'test-finding');
    expect(finding).toBeDefined();
    expect(finding?.message).toBe('test message');
    expect(finding?.source).toBe('validation');
  });

  it('repair actions appear in unified report', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(runDir, 'artifact-repair.json'),
      JSON.stringify({
        status: 'fixed',
        summary: { totalActions: 1, fixedCount: 1, skippedCount: 0, manualReviewCount: 0, failedCount: 0, safeCount: 1, unsafeCount: 0 },
        actions: [{ id: 'test-action', category: 'absolute_path', status: 'fixed', message: 'fixed path', file: 'report.md', safe: true }],
        findings: [],
      }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    expect(report.repair?.status).toBe('fixed');
    expect(report.repairActions.length).toBe(1);
    expect(report.repairActions[0].id).toBe('test-action');
  });

  it('manual_review repair action appears as manual review item', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(runDir, 'artifact-repair.json'),
      JSON.stringify({
        status: 'manual_review',
        summary: { totalActions: 1, fixedCount: 0, skippedCount: 0, manualReviewCount: 1, failedCount: 0, safeCount: 0, unsafeCount: 1 },
        actions: [{ id: 'manual-action', category: 'absolute_path', status: 'manual_review', message: 'needs review', file: 'report.md', safe: false }],
        findings: [],
      }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    expect(report.summary.manualReviewItems).toBe(1);
    expect(report.repairActions.some((a) => a.status === 'manual_review')).toBe(true);
  });

  it('artifact links are relative only', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    for (const link of report.artifactLinks) {
      expect(link.path.startsWith('artifacts/runs/')).toBe(true);
      expect(link.path).not.toContain(process.cwd());
    }
  });

  it('no absolute paths in markdown', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    const md = generateUnifiedRunReportMarkdown(report);
    expect(md).not.toContain(process.cwd());
    expect(md).not.toContain('/Users/');
  });

  it('no external links in markdown', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    const md = generateUnifiedRunReportMarkdown(report);
    // External links would be http:// or https://
    expect(md).not.toMatch(/https?:\/\//);
  });

  it('disclaimer present in markdown', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    const md = generateUnifiedRunReportMarkdown(report);
    expect(md).toContain('Disclaimer');
    expect(md).toContain('does not certify');
  });

  it('JSON output parseable', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    const json = generateUnifiedRunReportJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.runId).toBe(runId);
    expect(parsed.validation).toBeDefined();
  });

  it('writeUnifiedRunReport writes md and json', () => {
    fs.writeFileSync(
      path.join(runDir, 'artifact-validation.json'),
      JSON.stringify({ isValid: true, checks: [], findings: [] }),
      'utf-8',
    );

    const report = buildUnifiedRunReport(runId);
    writeUnifiedRunReport(runId, report);

    expect(fs.existsSync(path.join(runDir, 'unified-report.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'unified-report.md'))).toBe(true);
  });
});
