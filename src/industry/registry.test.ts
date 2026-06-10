import { describe, it, expect } from 'vitest';
import {
  listIndustryPacks,
  getIndustryPackById,
  searchIndustryPacks,
  recommendIndustryPacks,
  getPackTemplateIds,
} from './registry.js';
import { INDUSTRY_PACKS } from './registry.js';

describe('Industry Pack Registry', () => {
  it('lists all built-in packs', () => {
    const packs = listIndustryPacks();
    expect(packs.length).toBeGreaterThanOrEqual(5);
    expect(packs.some((p) => p.id === 'generic-saas-admin')).toBe(true);
    expect(packs.some((p) => p.id === 'education-alumni')).toBe(true);
    expect(packs.some((p) => p.id === 'ecommerce-checkout-safe')).toBe(true);
    expect(packs.some((p) => p.id === 'healthcare-appointment-safe')).toBe(true);
    expect(packs.some((p) => p.id === 'content-marketing-site')).toBe(true);
  });

  it('gets pack by ID', () => {
    const pack = getIndustryPackById('generic-saas-admin');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('Generic SaaS Admin Dashboard');
  });

  it('returns undefined for unknown pack ID', () => {
    expect(getIndustryPackById('nonexistent')).toBeUndefined();
  });

  it('no duplicate IDs in built-in packs', () => {
    const ids = INDUSTRY_PACKS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('search finds packs by keyword', () => {
    const results = searchIndustryPacks('healthcare');
    expect(results.some((p) => p.id === 'healthcare-appointment-safe')).toBe(true);
  });

  it('search finds packs by user type', () => {
    const results = searchIndustryPacks('student');
    expect(results.some((p) => p.id === 'education-alumni')).toBe(true);
  });

  it('recommendIndustryPacks returns suggestions for ecommerce indicators', () => {
    const recs = recommendIndustryPacks({
      riskFindings: [{ category: 'risk', title: 'Payment action detected' }],
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].packId).toBe('ecommerce-checkout-safe');
    expect(recs[0].confidence).toBeGreaterThan(0.5);
  });

  it('recommendIndustryPacks returns fallback when no indicators', () => {
    const recs = recommendIndustryPacks({});
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].packId).toBe('content-marketing-site');
  });

  it('getPackTemplateIds returns all template IDs', () => {
    const pack = getIndustryPackById('generic-saas-admin');
    expect(pack).toBeDefined();
    const ids = getPackTemplateIds(pack!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.some((id) => id.includes('pagination')) || ids.some((id) => id.includes('form'))).toBe(true);
  });
});
