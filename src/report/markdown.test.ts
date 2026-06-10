import { describe, it, expect } from 'vitest';
import { generateMarkdownReport, computeReadinessVerdict } from './markdown.js';
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
      {
        id: 's1',
        order: 1,
        description: 'Fill email',
        action: 'fill',
        target: '[data-testid="email-input"]',
        screenshot: false,
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
    users: [
      {
        runId: 'run_abc',
        e2eRunId: 'e2e_def',
        createdByForgeQA: true,
        safeToDelete: true,
        email: 'fq_user@forgeqa.test',
        username: 'fq_user_1',
        displayName: 'Test User',
        password: 'Fq_SecurePass123!',
        role: 'alumni',
      },
    ],
    files: [],
  };
}

function createMockManifest(passed = true): RunManifest {
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    templateId: 't1',
    status: passed ? 'completed' : 'failed',
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
      {
        stepId: 's1',
        status: passed ? 'passed' : 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 50,
        error: passed ? undefined : 'Element not found',
      },
    ],
    artifactsDir: 'artifacts/runs/run_abc',
    isFinalized: true,
  };
}

describe('generateMarkdownReport', () => {
  it('includes the prompt', () => {
    const report = generateMarkdownReport({
      prompt: 'register alumni complete profile upload avatar',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('register alumni complete profile upload avatar');
  });

  it('includes run metadata', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('ForgeQA Run Report');
    expect(report).toContain('run_abc');
    expect(report).toContain('Test Template');
  });

  it('includes step results table', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('Step Results');
    expect(report).toContain('Navigate');
    expect(report).toContain('Fill email');
  });

  it('includes safety notes', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('Safety Notes');
    expect(report).toContain('forgeqa.test');
    expect(report).toContain('createdByForgeQA=true');
  });

  it('includes cleanup dry-run summary', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('Cleanup Dry-Run Summary');
    expect(report).toContain('Actual deletions:');
  });

  it('includes failed step details when there are failures', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(false),
      runDir: '/tmp/run',
      verdict: 'not_ready',
    });
    expect(report).toContain('Failed Step Details');
    expect(report).toContain('Element not found');
  });

  it('includes disclaimer', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
    });
    expect(report).toContain('This report was generated automatically by ForgeQA MVP');
  });

  it('includes Fixture Integrity section when fixtureValidation provided', () => {
    const report = generateMarkdownReport({
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
          { name: 'no external assets', status: 'pass', message: 'none' },
          { name: 'required selectors present', status: 'pass', message: 'All required selectors found' },
        ],
        findings: [],
        route: '/register/alumni',
        fixturePath: 'fixtures/demo-target/alumni-registration.html',
      },
    });
    expect(report).toContain('Fixture Integrity');
    expect(report).toContain('/register/alumni');
    expect(report).toContain('pass');
  });

  it('includes artifact integrity finding in validation section', () => {
    const report = generateMarkdownReport({
      prompt: 'test',
      plan: createMockPlan(),
      data: createMockData(),
      manifest: createMockManifest(),
      runDir: '/tmp/run',
      verdict: 'ready_for_demo',
      validation: {
        isValid: false,
        checks: [
          { name: 'artifact manifest integrity', status: 'fail', message: 'checksum mismatch' },
        ],
        findings: [
          { patternId: 'artifact_integrity_mismatch', message: 'sha256 mismatch', severity: 'error' },
        ],
      },
    });
    expect(report).toContain('Report Health');
    expect(report).toContain('artifact_integrity_mismatch');
  });
});

describe('computeReadinessVerdict', () => {
  it('returns ready_for_demo when all steps pass', () => {
    const manifest = createMockManifest(true);
    expect(computeReadinessVerdict(manifest)).toBe('ready_for_demo');
  });

  it('returns not_ready when any step fails', () => {
    const manifest = createMockManifest(false);
    expect(computeReadinessVerdict(manifest)).toBe('not_ready');
  });

  it('returns needs_human_review when no steps exist', () => {
    const manifest: RunManifest = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      templateId: 't1',
      status: 'planned',
      startedAt: new Date().toISOString(),
      steps: [],
      artifactsDir: 'artifacts/runs/run_abc',
      isFinalized: true,
    };
    expect(computeReadinessVerdict(manifest)).toBe('needs_human_review');
  });
});
