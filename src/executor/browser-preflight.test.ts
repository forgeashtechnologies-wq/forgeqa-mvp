import { describe, it, expect } from 'vitest';
import {
  checkPlaywrightChromiumInstalled,
  getBrowserInstallHint,
  assertBrowserReadyForTests,
} from './browser-preflight.js';

describe('Browser Preflight', () => {
  it('checkPlaywrightChromiumInstalled returns boolean', async () => {
    const result = await checkPlaywrightChromiumInstalled();
    expect(typeof result).toBe('boolean');
  });

  it('getBrowserInstallHint returns actionable string', () => {
    const hint = getBrowserInstallHint();
    expect(hint).toContain('playwright install chromium');
  });

  it('assertBrowserReadyForTests does not throw when installed', async () => {
    const installed = await checkPlaywrightChromiumInstalled();
    if (installed) {
      await expect(assertBrowserReadyForTests()).resolves.not.toThrow();
    } else {
      // Skip this assertion if browser is not installed in environment
      expect(true).toBe(true);
    }
  });
});
