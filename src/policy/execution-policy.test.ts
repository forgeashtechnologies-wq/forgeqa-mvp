import { describe, it, expect } from 'vitest';
import {
  evaluateStepPolicy,
  evaluateWorkflowPolicy,
  classifyActionRisk,
  isDestructiveSelector,
  isCredentialField,
  isSubmitAction,
  isPaymentAction,
  isAuthSocialAction,
  isEmailSendAction,
} from './execution-policy.js';
import type { WorkflowStep } from '../schemas/core.js';

function makeStep(overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: 's0',
    order: 0,
    description: 'Test step',
    action: 'navigate',
    target: '/test',
    screenshot: false,
    continueOnFailure: false,
    ...overrides,
  };
}

const demoContext = {
  mode: 'demo' as const,
  strictPolicy: false,
  allowSubmit: false,
  allowUpload: false,
};

const externalContext = {
  mode: 'external' as const,
  strictPolicy: false,
  allowSubmit: false,
  allowUpload: false,
};

const strictExternalContext = {
  mode: 'external' as const,
  strictPolicy: true,
  allowSubmit: false,
  allowUpload: false,
};

const mockTemplate: import('../templates/types.js').WorkflowTemplate = {
  id: 'test.template',
  name: 'Test',
  description: 'Test template',
  category: 'test',
  difficulty: 'easy',
  estimatedDurationSeconds: 60,
  requiredData: 'none',
  tags: [],
  roles: [],
  supportedModes: ['demo', 'external'],
  demoRoutes: ['/test'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: [],
  promptMatchers: [],
  matchers: [],
  baseUrl: 'http://localhost:3000',
  steps: [],
  allowExternalSubmit: true,
  allowExternalUpload: true,
};

const allowSubmitContext = {
  mode: 'external' as const,
  strictPolicy: false,
  allowSubmit: true,
  allowUpload: false,
  template: mockTemplate,
};

describe('classifyActionRisk', () => {
  it('navigate is safe in demo mode', () => {
    const step = makeStep({ action: 'navigate', target: '/test' });
    expect(classifyActionRisk(step, demoContext)).toBe('safe');
  });

  it('fill is safe in demo mode', () => {
    const step = makeStep({ action: 'fill', target: '[data-testid="email-input"]' });
    expect(classifyActionRisk(step, demoContext)).toBe('safe');
  });

  it('click is safe in demo mode for normal buttons', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="next-btn"]', description: 'Click next' });
    expect(classifyActionRisk(step, demoContext)).toBe('safe');
  });

  it('click is blocked in demo mode for destructive actions', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="delete-btn"]', description: 'Click delete user' });
    expect(classifyActionRisk(step, demoContext)).toBe('blocked');
  });

  it('click is blocked in demo mode for payment actions', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="pay-btn"]', description: 'Click checkout' });
    expect(classifyActionRisk(step, demoContext)).toBe('blocked');
  });

  it('assertions are always safe', () => {
    const visible = makeStep({ action: 'assertVisible', target: '#header' });
    const hidden = makeStep({ action: 'assertHidden', target: '#spinner' });
    const text = makeStep({ action: 'assertText', target: '#msg', value: 'Done' });
    expect(classifyActionRisk(visible, externalContext)).toBe('safe');
    expect(classifyActionRisk(hidden, externalContext)).toBe('safe');
    expect(classifyActionRisk(text, externalContext)).toBe('safe');
  });

  it('screenshot and wait are always safe', () => {
    const screenshot = makeStep({ action: 'screenshot' });
    const wait = makeStep({ action: 'wait', value: '1000' });
    expect(classifyActionRisk(screenshot, externalContext)).toBe('safe');
    expect(classifyActionRisk(wait, externalContext)).toBe('safe');
  });

  it('external fill is caution', () => {
    const step = makeStep({ action: 'fill', target: '[data-testid="email-input"]' });
    expect(classifyActionRisk(step, externalContext)).toBe('caution');
  });

  it('external fill on credential field is blocked', () => {
    const step = makeStep({ action: 'fill', target: '[data-testid="password-input"]' });
    expect(classifyActionRisk(step, externalContext)).toBe('blocked');
  });

  it('external click is caution by default', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="next-btn"]' });
    expect(classifyActionRisk(step, externalContext)).toBe('caution');
  });

  it('external submit is blocked without --allow-submit', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="submit-btn"]', description: 'Click submit registration' });
    expect(classifyActionRisk(step, externalContext)).toBe('blocked');
  });

  it('external submit is caution with --allow-submit', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="submit-btn"]', description: 'Click submit registration' });
    expect(classifyActionRisk(step, allowSubmitContext)).toBe('caution');
  });

  it('external upload is blocked by default', () => {
    const step = makeStep({ action: 'upload', target: '[data-testid="file-input"]' });
    expect(classifyActionRisk(step, externalContext)).toBe('blocked');
  });

  it('external destructive click is always blocked', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="delete-btn"]', description: 'Click delete user' });
    expect(classifyActionRisk(step, allowSubmitContext)).toBe('blocked');
  });

  it('external payment click is always blocked', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="pay-btn"]', description: 'Click checkout' });
    expect(classifyActionRisk(step, allowSubmitContext)).toBe('blocked');
  });

  it('external oauth click is always blocked', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="google-login"]', description: 'Login with Google' });
    expect(classifyActionRisk(step, allowSubmitContext)).toBe('blocked');
  });

  it('external email send is always blocked', () => {
    const step = makeStep({ action: 'click', target: '[data-testid="send-btn"]', description: 'Send email to users' });
    expect(classifyActionRisk(step, allowSubmitContext)).toBe('blocked');
  });

  it('strict policy upgrades caution to blocked in evaluateStepPolicy', () => {
    const step = makeStep({ action: 'fill', target: '[data-testid="email-input"]' });
    const decision = evaluateStepPolicy(step, 0, strictExternalContext);
    expect(decision.riskLevel).toBe('blocked');
    expect(decision.reasonCode).toBe('strict_policy_caution_blocked');
  });
});

describe('evaluateStepPolicy', () => {
  it('allows safe steps', () => {
    const step = makeStep({ action: 'navigate' });
    const decision = evaluateStepPolicy(step, 0, demoContext);
    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('safe');
  });

  it('blocks destructive steps', () => {
    const step = makeStep({ action: 'click', description: 'Click delete user' });
    const decision = evaluateStepPolicy(step, 0, demoContext);
    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
    expect(decision.reasonCode).toBe('destructive_action_blocked');
    expect(decision.suggestedFix).toBeDefined();
  });

  it('blocks external submit without approval', () => {
    const step = makeStep({ action: 'click', description: 'Click submit' });
    const decision = evaluateStepPolicy(step, 0, externalContext);
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('external_submit_requires_approval');
  });

  it('allows external submit with approval', () => {
    const step = makeStep({ action: 'click', description: 'Click submit' });
    const decision = evaluateStepPolicy(step, 0, allowSubmitContext);
    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('caution');
    expect(decision.reasonCode).toBe('external_submit_with_approval');
  });

  it('includes step metadata in evidence', () => {
    const step = makeStep({ action: 'navigate', id: 's1', target: '/home' });
    const decision = evaluateStepPolicy(step, 2, demoContext);
    expect(decision.stepId).toBe('s1');
    expect(decision.stepIndex).toBe(2);
    expect(decision.evidence).toContain('navigate');
    expect(decision.evidence).toContain('/home');
  });
});

describe('evaluateWorkflowPolicy', () => {
  it('all safe workflow is allowed', () => {
    const plan = {
      runId: 'r1',
      templateId: 't1',
      templateName: 'Test',
      description: 'Test',
      steps: [
        makeStep({ action: 'navigate', id: 's0' }),
        makeStep({ action: 'assertVisible', id: 's1', target: '#header' }),
      ],
      createdAt: new Date().toISOString(),
    };
    const decision = evaluateWorkflowPolicy(plan, demoContext);
    expect(decision.overallAllowed).toBe(true);
    expect(decision.allowedCount).toBe(2);
    expect(decision.blockedCount).toBe(0);
  });

  it('workflow with blocked step is not allowed', () => {
    const plan = {
      runId: 'r1',
      templateId: 't1',
      templateName: 'Test',
      description: 'Test',
      steps: [
        makeStep({ action: 'navigate', id: 's0' }),
        makeStep({ action: 'click', id: 's1', description: 'Click delete user' }),
      ],
      createdAt: new Date().toISOString(),
    };
    const decision = evaluateWorkflowPolicy(plan, demoContext);
    expect(decision.overallAllowed).toBe(false);
    expect(decision.blockedCount).toBe(1);
    expect(decision.allowedCount).toBe(1);
  });
});

describe('keyword detection', () => {
  it('detects destructive keywords', () => {
    expect(isDestructiveSelector('Click delete user')).toBe(true);
    expect(isDestructiveSelector('Remove item')).toBe(true);
    expect(isDestructiveSelector('Archive all records')).toBe(true);
    expect(isDestructiveSelector('Update profile')).toBe(false);
  });

  it('detects credential keywords', () => {
    expect(isCredentialField('Enter password')).toBe(true);
    expect(isCredentialField('API key input')).toBe(true);
    expect(isCredentialField('Username')).toBe(false);
  });

  it('detects submit actions', () => {
    expect(isSubmitAction(makeStep({ action: 'click', description: 'Click submit' }))).toBe(true);
    expect(isSubmitAction(makeStep({ action: 'click', description: 'Click register' }))).toBe(true);
    expect(isSubmitAction(makeStep({ action: 'click', description: 'Click save changes' }))).toBe(true);
    expect(isSubmitAction(makeStep({ action: 'click', description: 'Click next' }))).toBe(false);
  });

  it('detects payment actions', () => {
    expect(isPaymentAction(makeStep({ action: 'click', description: 'Click checkout' }))).toBe(true);
    expect(isPaymentAction(makeStep({ action: 'click', description: 'Click pay now' }))).toBe(true);
    expect(isPaymentAction(makeStep({ action: 'click', description: 'Click next' }))).toBe(false);
  });

  it('detects auth provider actions', () => {
    expect(isAuthSocialAction(makeStep({ action: 'click', description: 'Login with Google' }))).toBe(true);
    expect(isAuthSocialAction(makeStep({ action: 'click', description: 'Sign in with Microsoft' }))).toBe(true);
    expect(isAuthSocialAction(makeStep({ action: 'click', description: 'Click next' }))).toBe(false);
  });

  it('detects email send actions', () => {
    expect(isEmailSendAction(makeStep({ action: 'click', description: 'Send email to users' }))).toBe(true);
    expect(isEmailSendAction(makeStep({ action: 'click', description: 'Invite users' }))).toBe(true);
    expect(isEmailSendAction(makeStep({ action: 'click', description: 'Click next' }))).toBe(false);
  });
});
