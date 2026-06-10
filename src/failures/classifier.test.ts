import { describe, it, expect } from 'vitest';
import { classifyFailures, generateFailureClassificationMarkdown } from './classifier.js';
import type { WorkflowTemplate } from '../templates/types.js';
import type { WorkflowPlan, RunManifest } from '../schemas/core.js';

function createMockTemplate(category = 'test', expectedMissingSelectors?: boolean): WorkflowTemplate {
  return {
    id: 'test.template',
    name: 'Test Template',
    description: 'Test',
    category,
    difficulty: 'easy',
    estimatedDurationSeconds: 60,
    requiredData: 'none',
    tags: [],
    roles: [],
    supportedModes: ['demo'],
    demoRoutes: ['/test'],
    riskLevel: 'low',
    requiresAuth: false,
    requiresNetwork: false,
    requiresFileUpload: false,
    destructiveAction: false,
    expectedArtifacts: [],
    promptMatchers: [],
    matchers: [],
    baseUrl: 'https://forgeqa.test',
    steps: [],
    expectedMissingSelectors,
  };
}

function createMockPlan(): WorkflowPlan {
  return {
    runId: 'run_001',
    templateId: 'test.template',
    templateName: 'Test Template',
    description: 'Test plan',
    steps: [
      { id: 's0', order: 0, description: 'Navigate', action: 'navigate', target: '/test', screenshot: true },
      { id: 's1', order: 1, description: 'Click button', action: 'click', target: '[data-testid="btn"]', screenshot: false },
      { id: 's2', order: 2, description: 'Fill input', action: 'fill', target: '[data-testid="input"]', screenshot: false },
    ],
    createdAt: new Date().toISOString(),
  };
}

function createMockManifest(errors: Record<string, string> = {}, policyBlocked: string[] = []): RunManifest {
  return {
    runId: 'run_001',
    e2eRunId: 'e2e_001',
    templateId: 'test.template',
    status: 'failed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [
      { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100 },
      { stepId: 's1', status: errors.s1 ? 'failed' : 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, error: errors.s1 },
      { stepId: 's2', status: errors.s2 ? 'failed' : 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, error: errors.s2 },
    ],
    artifactsDir: 'artifacts/runs/run_001',
    isFinalized: true,
    policyDecisions: policyBlocked.map((stepId) => ({
      stepId,
      stepIndex: 1,
      allowed: false,
      riskLevel: 'blocked' as const,
      reasonCode: 'policy_blocked',
      message: 'Blocked by policy',
      action: 'click',
    })),
  };
}

describe('Failure Classifier', () => {
  it('maps policy block to policy_block', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest({ s1: 'POLICY_BLOCKED: Blocked by policy' }, ['s1']),
    );
    const classification = report.classifications.find((c) => c.stepId === 's1');
    expect(classification?.failureType).toBe('policy_block');
    expect(classification?.suggestedOwner).toBe('security');
  });

  it('maps diagnostic expected failure to expected_diagnostic_failure', () => {
    const report = classifyFailures(
      createMockTemplate('diagnostic', true),
      createMockPlan(),
      createMockManifest({ s1: 'Selector not found' }),
    );
    const classification = report.classifications.find((c) => c.stepId === 's1');
    expect(classification?.failureType).toBe('expected_diagnostic_failure');
  });

  it('maps missing selector to app_bug/test_bug with confidence', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest({ s1: 'Selector not found' }),
    );
    const classification = report.classifications.find((c) => c.stepId === 's1');
    expect(classification?.failureType).toBe('app_bug');
    expect(classification?.confidence).toBe('medium');
  });

  it('maps browser missing to environment_issue', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest({ s1: 'Browser executable not found' }),
    );
    const classification = report.classifications.find((c) => c.stepId === 's1');
    expect(classification?.failureType).toBe('environment_issue');
    expect(classification?.suggestedOwner).toBe('devops');
  });

  it('maps unknown error to needs_human_review', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest({ s1: 'Some completely unexpected error xyz123' }),
    );
    const classification = report.classifications.find((c) => c.stepId === 's1');
    expect(classification?.failureType).toBe('unknown_needs_human_review');
    expect(classification?.suggestedOwner).toBe('human_review');
  });

  it('generates markdown with summary and classifications', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest({ s1: 'Selector not found' }),
    );
    const md = generateFailureClassificationMarkdown(report);
    expect(md).toContain('Failure Classification');
    expect(md).toContain('app_bug');
    expect(md).toContain('Next Action');
  });

  it('shows no classification needed when no failures', () => {
    const report = classifyFailures(
      createMockTemplate(),
      createMockPlan(),
      createMockManifest(),
    );
    expect(report.classifications.length).toBe(0);
    expect(report.summary.totalFailedSteps).toBe(0);
    const md = generateFailureClassificationMarkdown(report);
    expect(md).toContain('No failed steps required classification');
  });
});
