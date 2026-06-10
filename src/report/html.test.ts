import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from './html.js';
import type { WorkflowPlan, GoldenDataSet, RunManifest } from '../schemas/core.js';

function createMockPlan(): WorkflowPlan {
  return {
    runId: 'run_abc',
    templateId: 't1',
    templateName: 'Test Template',
    description: 'A test plan',
    steps: [
      {
        id: 's0',
        order: 0,
        description: 'Navigate',
        action: 'navigate',
        target: '/',
        screenshot: true,
      },
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
    users: [],
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
    steps: [
      {
        stepId: 's0',
        status: 'passed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 100,
      },
    ],
    artifactsDir: 'artifacts/runs/run_abc',
    isFinalized: true,
  };
}

describe('generateHtmlReport', () => {
  it('produces self-contained HTML', () => {
    const html = generateHtmlReport({
      prompt: 'test prompt',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes inline CSS', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).toContain('<style>');
    expect(html).toContain('badge-pass');
  });

  it('includes readiness verdict', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).toContain('Ready for Demo');
    expect(html).toContain('verdict-ready');
  });

  it('includes step results table', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).toContain('<table>');
    expect(html).toContain('Navigate');
  });

  it('includes safety notes', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).toContain('Safety Notes');
    expect(html).toContain('forgeqa.test');
  });

  it('does not contain external CDN references', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(html).not.toContain('cdn');
    expect(html).not.toContain('googleapis');
    expect(html).not.toContain('bootstrap');
  });

  it('includes Fixture Integrity section when fixtureValidation provided', () => {
    const html = generateHtmlReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
      fixtureValidation: {
        status: 'pass',
        checks: [
          { name: 'fixture file exists', status: 'pass', message: 'found' },
        ],
        findings: [],
        route: '/register/alumni',
        fixturePath: 'fixtures/demo-target/alumni-registration.html',
      },
    });
    expect(html).toContain('Fixture Integrity');
    expect(html).toContain('/register/alumni');
  });
});
