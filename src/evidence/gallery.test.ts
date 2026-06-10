import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildGalleryData, generateGalleryHtml, generateGalleryMarkdown } from './gallery.js';
import type { WorkflowPlan, RunManifest } from '../schemas/core.js';

function createMockPlan(): WorkflowPlan {
  return {
    runId: 'run_001',
    templateId: 'test.template',
    templateName: 'Test Template',
    description: 'Test plan',
    steps: [
      { id: 's0', order: 0, description: 'Navigate', action: 'navigate', target: '/test', screenshot: true },
      { id: 's1', order: 1, description: 'Click button', action: 'click', target: '[data-testid="btn"]', screenshot: true },
      { id: 's2', order: 2, description: 'Fill input', action: 'fill', target: '[data-testid="input"]', screenshot: false },
    ],
    createdAt: new Date().toISOString(),
  };
}

function createMockManifest(): RunManifest {
  return {
    runId: 'run_001',
    e2eRunId: 'e2e_001',
    templateId: 'test.template',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [
      { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, screenshotPath: 'screenshots/s0.png' },
      { stepId: 's1', status: 'failed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, screenshotPath: 'screenshots/s1-failure.png' },
      { stepId: 's2', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100 },
    ],
    artifactsDir: 'artifacts/runs/run_001',
    isFinalized: true,
    viewport: { profile: 'desktop', width: 1280, height: 720, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  };
}

describe('Screenshot Gallery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-gallery-test-'));
    fs.mkdirSync(path.join(tempDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's0.png'), 'fake');
    fs.writeFileSync(path.join(tempDir, 'screenshots', 's1-failure.png'), 'fake');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds gallery data from manifest and screenshots', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    expect(data.runId).toBe('run_001');
    expect(data.screenshotCount).toBe(2);
    expect(data.failedStepScreenshotCount).toBe(1);
    expect(data.cards.length).toBe(2);
  });

  it('generates HTML gallery with relative paths only', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    const html = generateGalleryHtml(data);
    expect(html).toContain('screenshots/s0.png');
    expect(html).toContain('screenshots/s1-failure.png');
    expect(html).not.toMatch(/\/Users\//);
    expect(html).not.toMatch(/\/home\//);
  });

  it('generates markdown gallery with relative paths', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    const md = generateGalleryMarkdown(data);
    expect(md).toContain('screenshots/s0.png');
    expect(md).toContain('screenshots/s1-failure.png');
    expect(md).not.toMatch(/\/Users\//);
  });

  it('marks failed steps in gallery data', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    const failedCard = data.cards.find((c) => c.stepId === 's1');
    expect(failedCard?.isFailure).toBe(true);
  });

  it('includes viewport metadata', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    expect(data.viewportProfile).toBe('desktop');
    expect(data.viewportWidth).toBe(1280);
    expect(data.viewportHeight).toBe(720);
  });

  it('has no external refs in HTML', () => {
    const data = buildGalleryData(createMockPlan(), createMockManifest(), tempDir, 'ready_for_demo', 'pass');
    const html = generateGalleryHtml(data);
    const externalAttrRegex = /(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi;
    const matches = Array.from(html.matchAll(externalAttrRegex));
    expect(matches.length).toBe(0);
  });
});
