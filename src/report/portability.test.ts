import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateMarkdownReport } from './markdown.js';
import { generateHtmlReport } from './html.js';
import type { WorkflowPlan, GoldenDataSet, RunManifest } from '../schemas/core.js';

function createMockPlan(): WorkflowPlan {
  return {
    runId: 'run_abc',
    templateId: 't1',
    templateName: 'Test Template',
    description: 'A test plan',
    baseUrl: 'https://forgeqa.test',
    steps: [
      { id: 's0', order: 0, description: 'Navigate', action: 'navigate', target: '/register/alumni', screenshot: true },
    ],
    createdAt: new Date().toISOString(),
  };
}

function createMockData(): GoldenDataSet {
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    createdByForgeQA: true,
    safeToDelete: true,
    generatedAt: new Date().toISOString(),
    users: [{ runId: 'run_abc', e2eRunId: 'e2e_def', createdByForgeQA: true, safeToDelete: true, email: 'fq_user@forgeqa.test', username: 'fq_user_1', displayName: 'Test User', password: 'Fq_SecurePass123!', role: 'alumni' }],
    files: [],
  };
}

function createMockManifest(): RunManifest {
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    templateId: 't1',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [{ stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, screenshotPath: 'screenshots/s0.png' }],
    artifactsDir: 'artifacts/runs/run_abc',
    isFinalized: true,
  };
}

describe('Report Portability', () => {
  it('report.html has no /Users/ absolute paths', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/fake-run-dir',
      verdict: 'ready_for_demo',
    });
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('/home/');
  });

  it('report.html has no file:/// references', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/fake-run-dir',
      verdict: 'ready_for_demo',
    });
    expect(html).not.toContain('file:///');
  });

  it('report.html has no external href="https://..."', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/fake-run-dir',
      verdict: 'ready_for_demo',
    });
    const externalHrefs = Array.from(html.matchAll(/href\s*=\s*"(https?:\/\/[^"]+)"/g));
    expect(externalHrefs.length).toBe(0);
  });

  it('report.html has no external src="https://..."', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/fake-run-dir',
      verdict: 'ready_for_demo',
    });
    const externalSrcs = Array.from(html.matchAll(/src\s*=\s*"(https?:\/\/[^"]+)"/g));
    expect(externalSrcs.length).toBe(0);
  });

  it('report.md uses relative screenshot links', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-port-'));
    fs.mkdirSync(path.join(tempDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake');

    const md = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: tempDir,
      verdict: 'ready_for_demo',
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    expect(md).toContain('screenshots/s0.png');
    expect(md).not.toContain('/Users/');
    expect(md).not.toContain(tempDir);
  });

  it('report.md trace section has no external markdown links', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-trace-'));
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const md = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: tempDir,
      verdict: 'ready_for_demo',
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    // Should contain plain text guidance, not a clickable link
    expect(md).toContain('npx playwright show-trace trace.zip');
    expect(md).not.toMatch(/\[.*\]\(https:\/\/trace\.playwright\.dev/);
  });

  it('report.html trace section has no external anchor tags', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-trace-'));
    fs.writeFileSync(path.join(tempDir, 'trace.zip'), 'fake');

    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: tempDir,
      verdict: 'ready_for_demo',
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    expect(html).toContain('npx playwright show-trace trace.zip');
    expect(html).not.toContain('trace.playwright.dev');
  });
});
