import { describe, it, expect } from 'vitest';
import { analyzePatterns } from './analyzer.js';
import type { WorkflowPlan, GoldenDataSet, RunManifest, GoldenUser } from '../schemas/core.js';

function createMockPlan(overrides?: Partial<WorkflowPlan>): WorkflowPlan {
  return {
    runId: 'run_abc',
    templateId: 't1',
    templateName: 'Test Template',
    description: 'A test plan',
    baseUrl: 'https://forgeqa.test',
    steps: [
      {
        id: 's0',
        order: 0,
        description: 'Navigate',
        action: 'navigate',
        target: '/register/alumni',
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
    ...overrides,
  };
}

function createMockData(overrides?: Partial<GoldenDataSet>): GoldenDataSet {
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
    ...overrides,
  };
}

function createMockManifest(overrides?: Partial<RunManifest>): RunManifest {
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
        screenshotPath: 'screenshots/s0.png',
      },
      {
        stepId: 's1',
        status: 'passed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 50,
      },
    ],
    artifactsDir: 'artifacts/runs/run_abc',
    isFinalized: true,
    ...overrides,
  };
}

describe('analyzePatterns', () => {
  it('returns empty findings for a clean run', () => {
    const result = analyzePatterns(createMockPlan(), createMockData(), createMockManifest());
    expect(result.findings.length).toBe(0);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.summary.info).toBe(0);
  });

  it('detects hard_sleep_instead_of_semantic_wait', () => {
    const plan = createMockPlan({
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Wait for page',
          action: 'wait',
          value: '2000',
          screenshot: false,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'hard_sleep_instead_of_semantic_wait')).toBe(true);
    expect(result.summary.warnings).toBeGreaterThan(0);
  });

  it('detects relative_url_without_base_url', () => {
    const plan = createMockPlan({ baseUrl: undefined });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'relative_url_without_base_url')).toBe(true);
  });

  it('detects assertion_without_retry', () => {
    const plan = createMockPlan({
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Assert heading',
          action: 'assertText',
          target: 'h1',
          value: 'Welcome',
          screenshot: false,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'assertion_without_retry')).toBe(true);
  });

  it('detects real_email_domain_used_in_test_data', () => {
    const data = createMockData({
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true,
          safeToDelete: true,
          email: 'user@gmail.com',
          username: 'fq_user_1',
          displayName: 'Test User',
          password: 'Fq_SecurePass123!',
          role: 'alumni',
        },
      ],
    });
    const result = analyzePatterns(createMockPlan(), data, createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'real_email_domain_used_in_test_data')).toBe(true);
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('detects cleanup_target_missing_safe_tags', () => {
    const data = createMockData({
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true,
          safeToDelete: false,
          email: 'fq_user@forgeqa.test',
          username: 'fq_user_1',
          displayName: 'Test User',
          password: 'Fq_SecurePass123!',
          role: 'alumni',
        } as unknown as GoldenUser,
      ],
    });
    const result = analyzePatterns(createMockPlan(), data, createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'cleanup_target_missing_safe_tags')).toBe(true);
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('detects duplicate_seed_data_on_rerun', () => {
    const data = createMockData({
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true,
          safeToDelete: true,
          email: 'same@forgeqa.test',
          username: 'fq_user_1',
          displayName: 'User A',
          password: 'Fq_SecurePass123!',
          role: 'alumni',
        },
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true,
          safeToDelete: true,
          email: 'same@forgeqa.test',
          username: 'fq_user_2',
          displayName: 'User B',
          password: 'Fq_SecurePass123!',
          role: 'alumni',
        },
      ],
    });
    const result = analyzePatterns(createMockPlan(), data, createMockManifest());
    expect(result.findings.some((f) => f.patternId === 'duplicate_seed_data_on_rerun')).toBe(true);
  });

  it('detects failure_without_trace_or_screenshot', () => {
    const manifest = createMockManifest({
      status: 'failed',
      steps: [
        {
          stepId: 's0',
          status: 'failed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
          error: 'Timeout',
        },
      ],
    });
    const result = analyzePatterns(createMockPlan(), createMockData(), manifest);
    expect(result.findings.some((f) => f.patternId === 'failure_without_trace_or_screenshot')).toBe(true);
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('detects report_claims_pass_without_screenshot', () => {
    const plan = createMockPlan({
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
    });
    const manifest = createMockManifest({
      steps: [
        {
          stepId: 's0',
          status: 'passed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), manifest);
    expect(result.findings.some((f) => f.patternId === 'report_claims_pass_without_screenshot')).toBe(true);
  });

  it('detects readiness_score_not_linked_to_failed_steps', () => {
    const manifest = createMockManifest({
      status: 'completed',
      steps: [
        {
          stepId: 's0',
          status: 'failed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
          error: 'Oops',
        },
      ],
    });
    const result = analyzePatterns(createMockPlan(), createMockData(), manifest);
    expect(result.findings.some((f) => f.patternId === 'readiness_score_not_linked_to_failed_steps')).toBe(true);
  });

  it('enriches findings with v2 fields from registry', () => {
    const plan = createMockPlan({
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Wait for page',
          action: 'wait',
          value: '2000',
          screenshot: false,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    const finding = result.findings.find((f) => f.patternId === 'hard_sleep_instead_of_semantic_wait');
    expect(finding).toBeDefined();
    expect(finding?.title).toBe('Hard Sleep Instead of Semantic Wait');
    expect(finding?.category).toBe('Wait / Flakiness');
    expect(finding?.rootCause).toBeDefined();
    expect(finding?.safeFix).toBeDefined();
    expect(finding?.howToConfirm).toBeDefined();
    expect(finding?.preventionRule).toBeDefined();
    expect(finding?.sourceConfidence).toBeDefined();
    expect(finding?.relatedPatterns).toBeInstanceOf(Array);
  });

  it('hard_sleep finding includes rootCause and safeFix', () => {
    const plan = createMockPlan({
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Wait for redirect',
          action: 'wait',
          value: '3000',
          screenshot: false,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    const finding = result.findings.find((f) => f.patternId === 'hard_sleep_instead_of_semantic_wait');
    expect(finding?.rootCause).toContain('Fixed sleeps');
    expect(finding?.safeFix).toContain('waitForSelector');
  });

  it('computes impact for warning-only findings', () => {
    const plan = createMockPlan({
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Wait for page',
          action: 'wait',
          value: '2000',
          screenshot: false,
        },
      ],
    });
    const result = analyzePatterns(plan, createMockData(), createMockManifest());
    expect(result.impact).toBeDefined();
    expect(result.impact?.verdict).toBe('ready_with_warnings');
  });

  it('computes not_ready impact for error findings', () => {
    const data = createMockData({
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true,
          safeToDelete: true,
          email: 'user@gmail.com',
          username: 'fq_user_1',
          displayName: 'Test User',
          password: 'Fq_SecurePass123!',
          role: 'alumni',
        },
      ],
    });
    const result = analyzePatterns(createMockPlan(), data, createMockManifest());
    expect(result.impact?.verdict).toBe('not_ready');
  });
});
