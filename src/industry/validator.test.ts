import { describe, it, expect } from 'vitest';
import { validateIndustryPack, validateAllIndustryPacks } from './validator.js';
import { listIndustryPacks, getIndustryPackById } from './registry.js';

describe('Industry Pack Validator', () => {
  it('all built-in packs validate successfully', () => {
    const { valid, results } = validateAllIndustryPacks(listIndustryPacks());
    for (const r of results) {
      if (!r.valid) {
        console.error(`Validation failed for ${r.packId}:`, r.errors);
      }
    }
    expect(valid).toBe(true);
  });

  it('fails when required scope items are empty', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = { ...pack, requiredScopeItems: [] };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('required scope item'))).toBe(true);
  });

  it('fails when readiness criteria are empty', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = { ...pack, readinessCriteria: [] };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('readiness criterion'))).toBe(true);
  });

  it('fails when caveats are missing', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = { ...pack, caveats: [] };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('caveat'))).toBe(true);
  });

  it('fails when references are missing', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = { ...pack, references: [] };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reference'))).toBe(true);
  });

  it('fails when pack claims compliance certification', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = { ...pack, description: 'This pack is GDPR compliant.' };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('compliant'))).toBe(true);
  });

  it('ecommerce pack must block real payment', () => {
    const pack = getIndustryPackById('ecommerce-checkout-safe')!;
    const result = validateIndustryPack(pack);
    expect(result.valid).toBe(true);
    expect(pack.policyFocus.some((f) => f.toLowerCase().includes('payment'))).toBe(true);
    expect(pack.notTestedWarnings.some((w) => w.toLowerCase().includes('payment'))).toBe(true);
  });

  it('healthcare pack must warn against PHI', () => {
    const pack = getIndustryPackById('healthcare-appointment-safe')!;
    const result = validateIndustryPack(pack);
    expect(result.valid).toBe(true);
    const hasPhiWarning =
      pack.notTestedWarnings.some((w) => w.toLowerCase().includes('phi')) ||
      pack.dataSafetyFocus.some((f) => f.toLowerCase().includes('phi')) ||
      pack.caveats.some((c) => c.toLowerCase().includes('hipaa'));
    expect(hasPhiWarning).toBe(true);
  });

  it('detects missing template ID in recommended templates', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const invalidPack = {
      ...pack,
      recommendedTemplates: [
        ...pack.recommendedTemplates,
        { templateId: 'nonexistent.template', priority: 'required' as const, reason: 'test', appliesToModes: ['both' as const] },
      ],
    };
    const result = validateIndustryPack(invalidPack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent.template'))).toBe(true);
  });
});
