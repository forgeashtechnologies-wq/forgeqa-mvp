import { describe, it, expect } from 'vitest';
import { buildPlan, createPlanContext } from './planner.js';
import type { WorkflowTemplate } from '../templates/types.js';

const mockTemplate: WorkflowTemplate = {
  id: 'test.template',
  name: 'Test Template',
  description: 'A test template',
  category: 'test',
  difficulty: 'easy',
  estimatedDurationSeconds: 30,
  requiredData: 'none',
  tags: ['test'],
  roles: ['user'],
  supportedModes: ['demo'],
  demoRoutes: ['/'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json'],
  promptMatchers: ['test'],
  matchers: ['test'],
  baseUrl: 'https://test.example',
  steps: [
    {
      order: 0,
      description: 'Navigate to home',
      action: 'navigate',
      target: '/',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Fill name',
      action: 'fill',
      target: 'input[name="name"]',
      screenshot: false,
    },
    {
      order: 2,
      description: 'Click submit',
      action: 'click',
      target: 'button[type="submit"]',
      screenshot: true,
    },
  ],
};

describe('createPlanContext', () => {
  it('generates runId and e2eRunId by default', () => {
    const ctx = createPlanContext(mockTemplate);
    expect(ctx.runId).toBeDefined();
    expect(ctx.e2eRunId).toBeDefined();
    expect(ctx.templateId).toBe(mockTemplate.id);
    expect(ctx.baseUrl).toBe(mockTemplate.baseUrl);
  });

  it('accepts overrides', () => {
    const ctx = createPlanContext(mockTemplate, {
      runId: 'custom-run',
      e2eRunId: 'custom-e2e',
      baseUrl: 'https://override.test',
    });
    expect(ctx.runId).toBe('custom-run');
    expect(ctx.e2eRunId).toBe('custom-e2e');
    expect(ctx.baseUrl).toBe('https://override.test');
  });
});

describe('buildPlan', () => {
  it('produces a valid plan with correct step count', () => {
    const ctx = createPlanContext(mockTemplate, {
      runId: 'run_123',
      e2eRunId: 'e2e_456',
    });
    const plan = buildPlan(mockTemplate, ctx);

    expect(plan.runId).toBe('run_123');
    expect(plan.templateId).toBe('test.template');
    expect(plan.templateName).toBe('Test Template');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].id).toBe('run_123-step-0');
    expect(plan.steps[0].action).toBe('navigate');
    expect(plan.steps[1].id).toBe('run_123-step-1');
  });

  it('assigns sequential order numbers', () => {
    const ctx = createPlanContext(mockTemplate, { runId: 'run_789' });
    const plan = buildPlan(mockTemplate, ctx);
    expect(plan.steps[0].order).toBe(0);
    expect(plan.steps[1].order).toBe(1);
  });
});
