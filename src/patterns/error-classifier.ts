import type { PatternFinding } from './types.js';
import { ANTI_PATTERNS } from './registry.js';

export function classifyErrorMessage(errorMessage: string): PatternFinding[] {
  const findings: PatternFinding[] = [];
  const msg = errorMessage.toLowerCase();

  for (const pattern of ANTI_PATTERNS) {
    for (const phrase of pattern.commonErrorMessages) {
      const phraseLower = phrase.toLowerCase();
      if (msg.includes(phraseLower) || phraseLower.includes(msg)) {
        findings.push({
          patternId: pattern.id,
          message: `Error message matched pattern "${pattern.title}": ${errorMessage}`,
          severity: pattern.severity,
          confidence: pattern.sourceConfidence,
          evidence: `Matched phrase: "${phrase}"`,
        });
        break; // only one match per pattern
      }
    }
  }

  // Conservative exact-phrase overrides for high-confidence matches
  if (msg.includes('strict mode violation') || msg.includes('resolved to multiple elements')) {
    findings.push({
      patternId: 'locator_strict_mode_multiple_matches',
      message: `Locator strict mode violation detected: ${errorMessage}`,
      severity: 'warning',
      confidence: 'high',
      evidence: 'Exact phrase match: strict mode violation',
    });
  }
  if (msg.includes('executable') && (msg.includes('does not exist') || msg.includes('timeout') || msg.includes('missing'))) {
    findings.push({
      patternId: 'chromium_not_installed',
      message: `Browser executable missing or timeout: ${errorMessage}`,
      severity: 'error',
      confidence: 'high',
      evidence: 'Exact phrase match: executable missing',
    });
  }
  if (msg.includes('timeout') && msg.includes('selector')) {
    findings.push({
      patternId: 'inaccessible_element_targeted',
      message: `Element not found within timeout — may be hidden or obscured: ${errorMessage}`,
      severity: 'error',
      confidence: 'medium',
      evidence: 'Timeout waiting for selector',
    });
  }
  if (msg.includes('element is not visible') || msg.includes('not visible')) {
    findings.push({
      patternId: 'inaccessible_element_targeted',
      message: `Element visibility issue: ${errorMessage}`,
      severity: 'error',
      confidence: 'high',
      evidence: 'Exact phrase match: element is not visible',
    });
  }
  if (msg.includes('element is not enabled') || msg.includes('not enabled')) {
    findings.push({
      patternId: 'inaccessible_element_targeted',
      message: `Element enabled state issue: ${errorMessage}`,
      severity: 'error',
      confidence: 'high',
      evidence: 'Exact phrase match: element is not enabled',
    });
  }
  if (msg.includes('page closed') || msg.includes('target closed')) {
    findings.push({
      patternId: 'browser_launch_failed_in_ci',
      message: `Browser page closed unexpectedly: ${errorMessage}`,
      severity: 'error',
      confidence: 'medium',
      evidence: 'Page or target closed mid-test',
    });
  }
  if (msg.includes('navigation timeout') || msg.includes('navigating')) {
    findings.push({
      patternId: 'network_idle_misuse',
      message: `Navigation timeout — page may not have finished loading: ${errorMessage}`,
      severity: 'warning',
      confidence: 'medium',
      evidence: 'Navigation timeout detected',
    });
  }
  if (msg.includes('external url') || msg.includes('blocked') || msg.includes('forgeqa.test')) {
    findings.push({
      patternId: 'flaky_due_to_external_dependency',
      message: `External URL access attempted or blocked: ${errorMessage}`,
      severity: 'warning',
      confidence: 'medium',
      evidence: 'External URL or blocked domain reference',
    });
  }
  if (msg.includes('safetodelete') || msg.includes('safe to delete')) {
    findings.push({
      patternId: 'cleanup_target_missing_safe_tags',
      message: `Cleanup safety tag issue: ${errorMessage}`,
      severity: 'error',
      confidence: 'high',
      evidence: 'Exact phrase match: safeToDelete',
    });
  }
  if (msg.includes('screenshot') && msg.includes('missing')) {
    findings.push({
      patternId: 'failure_without_trace_or_screenshot',
      message: `Screenshot missing from evidence: ${errorMessage}`,
      severity: 'error',
      confidence: 'high',
      evidence: 'Exact phrase match: screenshot + missing',
    });
  }

  // Diagnostic scenario mappings
  if (msg.includes('timeout') && msg.includes('wait for selector')) {
    findings.push({
      patternId: 'dynamic_content_loaded_after_assertion',
      message: `Content may have loaded after assertion timeout: ${errorMessage}`,
      severity: 'error',
      confidence: 'medium',
      evidence: 'Timeout waiting for selector suggests delayed content',
    });
  }
  if (msg.includes('no element found') || msg.includes('could not find') || msg.includes('selector not found') || msg.includes('failed to find')) {
    findings.push({
      patternId: 'brittle_css_selector',
      message: `Selector not found — may be brittle or missing: ${errorMessage}`,
      severity: 'warning',
      confidence: 'high',
      evidence: 'Selector resolution failure',
    });
  }

  // Deduplicate by patternId, keeping highest severity
  const deduped = new Map<string, PatternFinding>();
  for (const f of findings) {
    const existing = deduped.get(f.patternId);
    if (!existing || (f.severity === 'error' && existing.severity !== 'error') || (f.severity === 'warning' && existing.severity === 'info')) {
      deduped.set(f.patternId, f);
    }
  }

  return Array.from(deduped.values());
}
