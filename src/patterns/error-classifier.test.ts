import { describe, it, expect } from 'vitest';
import { classifyErrorMessage } from './error-classifier.js';

describe('Error Classifier', () => {
  it('matches TimeoutError to relevant patterns', () => {
    const findings = classifyErrorMessage('TimeoutError: page.waitForSelector("#btn")');
    expect(findings.length).toBeGreaterThan(0);
    const ids = findings.map((f) => f.patternId);
    expect(ids).toContain('inaccessible_element_targeted');
  });

  it('matches strict mode violation to locator_strict_mode_multiple_matches', () => {
    const findings = classifyErrorMessage('strict mode violation: locator resolved to 2 elements');
    expect(findings.some((f) => f.patternId === 'locator_strict_mode_multiple_matches')).toBe(true);
  });

  it('matches browser executable missing', () => {
    const findings = classifyErrorMessage('browserType.launch: Executable does not exist');
    expect(findings.some((f) => f.patternId === 'chromium_not_installed')).toBe(true);
  });

  it('matches element not visible', () => {
    const findings = classifyErrorMessage('Element is not visible');
    expect(findings.some((f) => f.patternId === 'inaccessible_element_targeted')).toBe(true);
  });

  it('matches page closed', () => {
    const findings = classifyErrorMessage('page closed');
    expect(findings.some((f) => f.patternId === 'browser_launch_failed_in_ci')).toBe(true);
  });

  it('matches navigation timeout', () => {
    const findings = classifyErrorMessage('Navigation timeout of 30000ms exceeded');
    expect(findings.some((f) => f.patternId === 'network_idle_misuse')).toBe(true);
  });

  it('matches cleanup missing safeToDelete', () => {
    const findings = classifyErrorMessage('safeToDelete flag missing');
    expect(findings.some((f) => f.patternId === 'cleanup_target_missing_safe_tags')).toBe(true);
  });

  it('matches screenshot missing', () => {
    const findings = classifyErrorMessage('screenshot missing from evidence');
    expect(findings.some((f) => f.patternId === 'failure_without_trace_or_screenshot')).toBe(true);
  });

  it('maps timeout + wait for selector to dynamic_content_loaded_after_assertion', () => {
    const findings = classifyErrorMessage('TimeoutError: wait for selector "[data-testid=content]"');
    expect(findings.some((f) => f.patternId === 'dynamic_content_loaded_after_assertion')).toBe(true);
  });

  it('maps selector not found to brittle_css_selector', () => {
    const findings = classifyErrorMessage('no element found for selector: [data-testid="missing-cta"]');
    expect(findings.some((f) => f.patternId === 'brittle_css_selector')).toBe(true);
  });

  it('returns empty for unknown messages', () => {
    const findings = classifyErrorMessage('some random unknown message xyzabc');
    expect(findings).toEqual([]);
  });

  it('deduplicates by patternId', () => {
    const findings = classifyErrorMessage('Element is not visible and Element is not visible');
    const ids = findings.map((f) => f.patternId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
