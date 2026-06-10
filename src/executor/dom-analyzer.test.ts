import { describe, it, expect, beforeAll } from 'vitest';
import { chromium } from 'playwright';
import { analyzeDom } from './dom-analyzer.js';
import { assertBrowserReadyForTests } from './browser-preflight.js';

beforeAll(async () => {
  await assertBrowserReadyForTests();
});

describe('DOM Analyzer', () => {
  it('detects hidden testid', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div data-testid="visible-btn">Click</div>
      <span data-testid="hidden-badge" style="display:none">Badge</span>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's0',
      stepIndex: 0,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'hidden_testid_on_non_interactive_element')).toBe(true);
  });

  it('detects inaccessible targeted element', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button data-testid="disabled-btn" disabled>Submit</button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's1',
      stepIndex: 1,
      currentUrl: 'http://localhost',
      action: 'click',
      selector: '[data-testid="disabled-btn"]',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'inaccessible_element_targeted')).toBe(true);
  });

  it('detects broad text locator false match', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <p>Submit</p>
      <button>Submit</button>
      <span>Submit form</span>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's2',
      stepIndex: 2,
      currentUrl: 'http://localhost',
      expectedText: 'Submit',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'broad_text_locator_false_match')).toBe(true);
  });

  it('detects locator strict-mode-style multiple matches (duplicate visible testid)', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div data-testid="info-panel">A</div>
      <div data-testid="info-panel">B</div>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's3',
      stepIndex: 3,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'locator_strict_mode_multiple_matches')).toBe(true);
  });

  it('detects aria label missing', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button></button>
      <button aria-label="Close">X</button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's4',
      stepIndex: 4,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing')).toBe(true);
  });

  it('detects duplicate visible data-testid', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div data-testid="card">Card 1</div>
      <div data-testid="card">Card 2</div>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's5',
      stepIndex: 5,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'locator_strict_mode_multiple_matches')).toBe(true);
  });

  it('returns enriched v2 fields', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button disabled data-testid="btn">Click</button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's6',
      stepIndex: 6,
      currentUrl: 'http://localhost',
      action: 'click',
      selector: '[data-testid="btn"]',
    });
    await browser.close();
    const finding = findings.find((f) => f.patternId === 'inaccessible_element_targeted');
    expect(finding?.title).toBeDefined();
    expect(finding?.rootCause).toBeDefined();
    expect(finding?.safeFix).toBeDefined();
    expect(finding?.sourceConfidence).toBeDefined();
  });

  it('does not mutate page state', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`<div id="counter">0</div>`);
    await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's7',
      stepIndex: 7,
      currentUrl: 'http://localhost',
    });
    const text = await page.textContent('#counter');
    await browser.close();
    expect(text).toBe('0');
  });

  it('skips input with label for', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <label for="email">Email</label>
      <input type="email" id="email" data-testid="email-input">
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's8',
      stepIndex: 8,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('email-input'))).toBe(false);
  });

  it('skips nested label input', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <label>
        Name
        <input type="text" data-testid="name-input">
      </label>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's9',
      stepIndex: 9,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('name-input'))).toBe(false);
  });

  it('skips button with text', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button data-testid="submit-btn">Submit</button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's10',
      stepIndex: 10,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('submit-btn'))).toBe(false);
  });

  it('skips aria-label', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button aria-label="Close dialog" data-testid="close-btn"></button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's11',
      stepIndex: 11,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('close-btn'))).toBe(false);
  });

  it('flags empty button', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <button data-testid="empty-btn"></button>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's12',
      stepIndex: 12,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('empty-btn'))).toBe(true);
  });

  it('flags unlabeled input', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <input type="text" data-testid="orphan-input">
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's13',
      stepIndex: 13,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'aria_label_missing' && f.evidence?.includes('orphan-input'))).toBe(true);
  });

  it('detects missing alt text on images', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-testid="no-alt-img">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt=" descriptive" data-testid="has-alt-img">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" data-testid="decorative-img" role="presentation">
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's14',
      stepIndex: 14,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'missing_alt_text_on_image' && f.evidence?.includes('no-alt-img'))).toBe(true);
    expect(findings.some((f) => f.patternId === 'missing_alt_text_on_image' && f.evidence?.includes('has-alt-img'))).toBe(false);
    expect(findings.some((f) => f.patternId === 'missing_alt_text_on_image' && f.evidence?.includes('decorative-img'))).toBe(false);
  });

  it('detects generic page title', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <!DOCTYPE html><html><head><title>Document</title></head><body></body></html>
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's15',
      stepIndex: 15,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'page_title_missing_or_generic' && f.evidence?.includes('Document'))).toBe(true);
  });

  it('detects duplicate id attributes', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <input id="email" type="email">
      <input id="email" type="email">
    `);
    const findings = await analyzeDom(page, {
      runId: 'test-run',
      stepId: 's16',
      stepIndex: 16,
      currentUrl: 'http://localhost',
    });
    await browser.close();
    expect(findings.some((f) => f.patternId === 'duplicate_id_attribute' && f.evidence?.includes('email'))).toBe(true);
  });
});
