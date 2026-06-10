import { describe, it, expect } from 'vitest';
import {
  ANTI_PATTERNS,
  getPatternById,
  findDuplicatePatterns,
  validateUniquePatternIds,
  validateRelatedPatternIds,
} from './registry.js';

describe('Pattern Registry', () => {
  it('contains at least 100 patterns', () => {
    expect(ANTI_PATTERNS.length).toBeGreaterThanOrEqual(100);
  });

  it('all pattern IDs are unique', () => {
    const ids = ANTI_PATTERNS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all patterns have required v2 fields', () => {
    for (const p of ANTI_PATTERNS) {
      expect(p.id).toBeDefined();
      expect(p.title).toBeDefined();
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.category).toBeDefined();
      expect(p.category.length).toBeGreaterThan(0);
      expect(p.severity).toMatch(/^(error|warning|info)$/);
      expect(p.symptom).toBeDefined();
      expect(p.detectionSignals).toBeInstanceOf(Array);
      expect(p.commonErrorMessages).toBeInstanceOf(Array);
      expect(p.rootCause).toBeDefined();
      expect(p.howToConfirm).toBeDefined();
      expect(p.safeFix).toBeDefined();
      expect(p.preventionRule).toBeDefined();
      expect(p.regressionTest).toBeDefined();
      expect(p.sourceType).toMatch(/^(official_docs|research_paper|major_project_github_issue|popular_public_repo|blog_post|forum)$/);
      expect(p.sourceUrl).toBeDefined();
      expect(p.sourceUrl.length).toBeGreaterThan(0);
      expect(p.sourceConfidence).toMatch(/^(high|medium|low)$/);
      expect(p.appliesTo).toBeDefined();
      expect(p.appliesTo.engines).toBeInstanceOf(Array);
      expect(p.appliesTo.engines.length).toBeGreaterThan(0);
      expect(p.appliesTo.ciEnvironments).toBeInstanceOf(Array);
      expect(p.appliesTo.ciEnvironments.length).toBeGreaterThan(0);
      expect(p.relatedPatterns).toBeInstanceOf(Array);
    }
  });

  it('v1 compatibility fields exist (description and mitigation)', () => {
    for (const p of ANTI_PATTERNS) {
      expect(p.description).toBe(p.symptom);
      expect(p.mitigation).toBe(p.safeFix);
    }
  });

  it('getPatternById returns the correct pattern', () => {
    const pattern = getPatternById('hard_sleep_instead_of_semantic_wait');
    expect(pattern).toBeDefined();
    expect(pattern?.title).toBe('Hard Sleep Instead of Semantic Wait');
    expect(pattern?.category).toBe('Wait / Flakiness');
  });

  it('getPatternById returns undefined for unknown id', () => {
    expect(getPatternById('nonexistent_pattern')).toBeUndefined();
  });

  it('all source URLs are non-empty strings', () => {
    for (const p of ANTI_PATTERNS) {
      expect(p.sourceUrl).toBeTruthy();
      expect(typeof p.sourceUrl).toBe('string');
    }
  });

  it('all sourceConfidence values are valid', () => {
    const valid = new Set(['high', 'medium', 'low']);
    for (const p of ANTI_PATTERNS) {
      expect(valid.has(p.sourceConfidence)).toBe(true);
    }
  });

  it('relatedPatterns reference existing pattern IDs', () => {
    const validIds = new Set(ANTI_PATTERNS.map((p) => p.id));
    for (const p of ANTI_PATTERNS) {
      for (const related of p.relatedPatterns) {
        expect(validIds.has(related), `${p.id} references unknown pattern: ${related}`).toBe(true);
      }
    }
  });

  it('no category is empty', () => {
    const categories = new Set(ANTI_PATTERNS.map((p) => p.category));
    for (const cat of categories) {
      expect(cat.length).toBeGreaterThan(0);
    }
  });

  it('findDuplicatePatterns finds no duplicate IDs', () => {
    const result = findDuplicatePatterns(ANTI_PATTERNS);
    expect(result.duplicateIds).toEqual([]);
  });

  it('validateUniquePatternIds returns empty for current registry', () => {
    expect(validateUniquePatternIds(ANTI_PATTERNS)).toEqual([]);
  });

  it('validateRelatedPatternIds returns empty for current registry', () => {
    expect(validateRelatedPatternIds(ANTI_PATTERNS)).toEqual([]);
  });

  it('duplicate detection catches duplicate IDs', () => {
    const duplicate = [...ANTI_PATTERNS, ANTI_PATTERNS[0]];
    const result = findDuplicatePatterns(duplicate);
    expect(result.duplicateIds).toContain(ANTI_PATTERNS[0].id);
  });

  it('validateUniquePatternIds catches duplicate IDs', () => {
    const duplicate = [...ANTI_PATTERNS, ANTI_PATTERNS[0]];
    expect(validateUniquePatternIds(duplicate)).toContain(ANTI_PATTERNS[0].id);
  });
});
