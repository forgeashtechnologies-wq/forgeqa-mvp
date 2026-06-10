import { describe, it, expect } from 'vitest';
import { analyzeScope, generateScopeAnalysisMarkdown } from './analyzer.js';
import type { WorkflowTemplate } from '../templates/types.js';
import type { WorkflowPlan, RunManifest } from '../schemas/core.js';

function createMockTemplate(): WorkflowTemplate {
  return {
    id: 'test.template',
    name: 'Test Template',
    description: 'Test',
    category: 'test',
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
    scopeCovered: ['Form loads', 'Input accepts data', 'Submit navigates'],
    scopeNotCovered: ['Real backend persistence', 'Email delivery'],
    scopeAssumptions: ['Demo fixture renders'],
    scopeBoundaries: ['Local demo only'],
    humanReviewRecommended: ['Mobile UX'],
    steps: [],
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
      { id: 's1', order: 1, description: 'Fill input', action: 'fill', target: '[data-testid="input"]', screenshot: false },
      { id: 's2', order: 2, description: 'Click submit', action: 'click', target: '[data-testid="submit"]', screenshot: true },
    ],
    createdAt: new Date().toISOString(),
  };
}

function createMockManifest(status: 'completed' | 'failed' = 'completed'): RunManifest {
  return {
    runId: 'run_001',
    e2eRunId: 'e2e_001',
    templateId: 'test.template',
    status,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [
      { stepId: 's0', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100 },
      { stepId: 's1', status: 'passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100 },
      { stepId: 's2', status: status === 'completed' ? 'passed' : 'failed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, error: status === 'failed' ? 'Selector not found' : undefined },
    ],
    artifactsDir: 'artifacts/runs/run_001',
    isFinalized: true,
  };
}

describe('Scope Analyzer', () => {
  it('marks passed workflow coverage as tested', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest());
    const tested = analysis.items.filter((i) => i.status === 'tested');
    expect(tested.length).toBeGreaterThan(0);
    expect(tested.some((i) => i.category === 'covered')).toBe(true);
  });

  it('includes not tested areas in scope-analysis', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest());
    const notTested = analysis.items.filter((i) => i.status === 'not_tested');
    expect(notTested.length).toBe(2);
    expect(notTested.some((i) => i.label === 'Real backend persistence')).toBe(true);
  });

  it('creates partial/needs human review item for failed step', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest('failed'));
    const reviewItems = analysis.items.filter((i) => i.status === 'needs_human_review');
    expect(reviewItems.length).toBeGreaterThan(0);
  });

  it('coverage percent never claims whole app coverage', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest());
    expect(analysis.summary.coveragePercent).toBeLessThanOrEqual(100);
    // With not_tested items, coverage should be less than 100
    expect(analysis.summary.notTestedCount).toBeGreaterThan(0);
  });

  it('report contains scoped readiness statement', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest());
    expect(analysis.scopedReadinessStatement).toContain('scoped readiness');
    expect(analysis.scopedReadinessStatement).toContain('does not claim');
  });

  it('generates markdown with tested and not tested sections', () => {
    const analysis = analyzeScope(createMockTemplate(), createMockPlan(), createMockManifest());
    const md = generateScopeAnalysisMarkdown(analysis);
    expect(md).toContain('ForgeQA Scope Analysis');
    expect(md).toContain('Scoped Readiness Statement');
    expect(md).toContain('Covered');
    expect(md).toContain('Not_covered');
  });
});
