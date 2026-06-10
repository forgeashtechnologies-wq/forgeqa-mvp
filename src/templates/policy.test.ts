import { describe, it, expect } from 'vitest';
import { matchPrompt, listPolicyTemplates } from './registry.js';

describe('Policy Templates', () => {
  it('lists policy templates including new gates', () => {
    const policies = listPolicyTemplates();
    const ids = policies.map((t) => t.id);
    expect(ids).toContain('policy.destructiveActionGate');
    expect(ids).toContain('policy.paymentFlowGate');
    expect(ids).toContain('policy.oauthFlowGate');
  });

  it('matches destructive action gate prompt', () => {
    const result = matchPrompt('policy destructive action gate');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('policy.destructiveActionGate');
      expect(result.template.category).toBe('policy');
      expect(result.template.destructiveAction).toBe(true);
      expect(result.template.riskLevel).toBe('high');
    }
  });

  it('matches payment flow gate prompt', () => {
    const result = matchPrompt('policy payment flow gate');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('policy.paymentFlowGate');
      expect(result.template.category).toBe('policy');
      expect(result.template.riskLevel).toBe('high');
    }
  });

  it('matches oauth flow gate prompt', () => {
    const result = matchPrompt('policy oauth flow gate');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('policy.oauthFlowGate');
      expect(result.template.category).toBe('policy');
      expect(result.template.riskLevel).toBe('high');
    }
  });
});
