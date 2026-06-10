import { describe, it, expect } from 'vitest';
import { validateTemplate, validateAllTemplates } from './validator.js';
import type { WorkflowTemplate } from './types.js';

function makeTemplate(overrides?: Partial<WorkflowTemplate>): WorkflowTemplate {
  return {
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
    demoRoutes: ['/test'],
    riskLevel: 'low',
    requiresAuth: false,
    requiresNetwork: false,
    requiresFileUpload: false,
    destructiveAction: false,
    expectedArtifacts: ['plan.json'],
    promptMatchers: ['test prompt'],
    matchers: ['test'],
    baseUrl: 'https://test.example',
    steps: [
      { order: 0, description: 'Step 1', action: 'navigate', target: '/1', screenshot: true },
      { order: 1, description: 'Step 2', action: 'click', target: 'button', screenshot: true },
      { order: 2, description: 'Step 3', action: 'assertVisible', target: 'div', screenshot: true },
    ],
    ...overrides,
  };
}

describe('validateTemplate', () => {
  it('passes a valid template', () => {
    const issues = validateTemplate(makeTemplate());
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('catches missing id', () => {
    const issues = validateTemplate(makeTemplate({ id: '' }));
    expect(issues.some((i) => i.field === 'id')).toBe(true);
  });

  it('catches fewer than 3 steps', () => {
    const issues = validateTemplate(makeTemplate({ steps: [{ order: 0, description: 'One', action: 'navigate', target: '/', screenshot: true }] }));
    expect(issues.some((i) => i.field === 'steps')).toBe(true);
  });

  it('catches destructiveAction=true', () => {
    const issues = validateTemplate(makeTemplate({ destructiveAction: true }));
    expect(issues.some((i) => i.field === 'destructiveAction')).toBe(true);
  });

  it('catches missing demo route for demo mode', () => {
    const issues = validateTemplate(makeTemplate({ demoRoutes: [] }));
    expect(issues.some((i) => i.field === 'demoRoutes')).toBe(true);
  });

  it('catches empty selector on click step', () => {
    const issues = validateTemplate(makeTemplate({
      steps: [
        { order: 0, description: 'S1', action: 'navigate', target: '/', screenshot: true },
        { order: 1, description: 'S2', action: 'click', target: '', screenshot: true },
        { order: 2, description: 'S3', action: 'assertVisible', target: 'div', screenshot: true },
      ],
    }));
    expect(issues.some((i) => i.field === 'steps.target')).toBe(true);
  });
});

describe('validateAllTemplates', () => {
  it('catches duplicate template IDs', () => {
    const templates = [makeTemplate({ id: 'dup' }), makeTemplate({ id: 'dup' })];
    const result = validateAllTemplates(templates);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
  });

  it('passes when all templates are valid', () => {
    const templates = [makeTemplate({ id: 'a' }), makeTemplate({ id: 'b' })];
    const result = validateAllTemplates(templates);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });
});
