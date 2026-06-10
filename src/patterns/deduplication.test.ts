import { describe, it, expect } from 'vitest';
import { deduplicateFindings, mergePatternAndDomFindings } from './deduplication.js';

describe('Deduplication', () => {
  it('removes cross-step duplicate DOM findings', () => {
    const findings = [
      { patternId: 'aria_label_missing', message: 'Missing label', stepId: 's0', severity: 'info' as const, evidence: 'tagName=input' },
      { patternId: 'aria_label_missing', message: 'Missing label', stepId: 's1', severity: 'info' as const, evidence: 'tagName=input' },
    ];
    const result = deduplicateFindings(findings);
    expect(result.length).toBe(1);
    expect(result[0].occurrenceCount).toBe(2);
    expect(result[0].affectedStepIds).toContain('s0');
    expect(result[0].affectedStepIds).toContain('s1');
  });

  it('merges pattern-time and DOM-time findings', () => {
    const patternFindings = [
      { patternId: 'hard_sleep_instead_of_semantic_wait', message: 'Sleep 2000ms', stepId: 's0', severity: 'warning' as const, evidence: 'wait=2000' },
    ];
    const domFindings = [
      { patternId: 'aria_label_missing', message: 'Missing label', stepId: 's0', severity: 'info' as const, evidence: 'tagName=input' },
    ];
    const result = mergePatternAndDomFindings(patternFindings, domFindings);
    expect(result.length).toBe(2);
  });

  it('preserves occurrenceCount', () => {
    const findings = [
      { patternId: 'aria_label_missing', message: 'A', stepId: 's0', severity: 'info' as const, evidence: 'same' },
      { patternId: 'aria_label_missing', message: 'B', stepId: 's1', severity: 'info' as const, evidence: 'same' },
      { patternId: 'aria_label_missing', message: 'C', stepId: 's2', severity: 'info' as const, evidence: 'same' },
    ];
    const result = deduplicateFindings(findings);
    expect(result[0].occurrenceCount).toBe(3);
  });

  it('preserves affectedStepIds', () => {
    const findings = [
      { patternId: 'p1', message: 'A', stepId: 's0', severity: 'info' as const, evidence: 'e1' },
      { patternId: 'p1', message: 'B', stepId: 's1', severity: 'info' as const, evidence: 'e1' },
    ];
    const result = deduplicateFindings(findings);
    expect(result[0].affectedStepIds).toEqual(['s0', 's1']);
  });

  it('preserves highest severity', () => {
    const findings = [
      { patternId: 'p1', message: 'A', stepId: 's0', severity: 'info' as const, evidence: 'e1' },
      { patternId: 'p1', message: 'B', stepId: 's1', severity: 'warning' as const, evidence: 'e1' },
    ];
    const result = deduplicateFindings(findings);
    expect(result[0].severity).toBe('warning');
  });

  it('sorts by severity then occurrence count', () => {
    const findings = [
      { patternId: 'p1', message: 'A', stepId: 's0', severity: 'info' as const, evidence: 'e1' },
      { patternId: 'p2', message: 'B', stepId: 's1', severity: 'error' as const, evidence: 'e2' },
      { patternId: 'p3', message: 'C', stepId: 's2', severity: 'info' as const, evidence: 'e3' },
      { patternId: 'p3', message: 'D', stepId: 's3', severity: 'info' as const, evidence: 'e3' },
    ];
    const result = deduplicateFindings(findings);
    expect(result[0].patternId).toBe('p2');
    expect(result[1].patternId).toBe('p3');
    expect(result[2].patternId).toBe('p1');
  });

  it('keeps firstDetectedStep', () => {
    const findings = [
      { patternId: 'p1', message: 'A', stepId: 's2', severity: 'info' as const, evidence: 'e1' },
      { patternId: 'p1', message: 'B', stepId: 's1', severity: 'info' as const, evidence: 'e1' },
    ];
    const result = deduplicateFindings(findings);
    expect(result[0].firstDetectedStep).toBe('s2');
  });
});
