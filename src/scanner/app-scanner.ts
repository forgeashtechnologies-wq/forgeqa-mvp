import { chromium, type Page, type Browser } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type {
  AppTestabilityScan,
  ScannerFinding,
  TestabilityScore,
  ScanContext,
} from './types.js';
import { getDeviceProfile } from '../executor/device-profiles.js';
import {
  parseAndValidateBaseUrl,
  isAllowedNavigation,
  createNavigationPolicy,
} from '../policy/url-policy.js';
import { startIsolatedDemoServer } from '../demo/server.js';
import { generateScanMarkdown, generateScanHtml } from './reports.js';
import { recommendTemplates } from './template-recommender.js';

export async function runAppTestabilityScan(
  url: string,
  context: ScanContext,
): Promise<{ scan: AppTestabilityScan; browser: Browser; page: Page }> {
  let profile = context.viewport
    ? getDeviceProfile(context.viewport)
    : getDeviceProfile('desktop');
  if (!profile) {
    profile = getDeviceProfile('desktop')!;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    deviceScaleFactor: profile.deviceScaleFactor,
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(500);

  const allFindings: ScannerFinding[] = [];

  const selectorFindings = await scanSelectors(page);
  const accessibilityFindings = await scanAccessibilityBasics(page);
  const formFindings = await scanForms(page);
  const riskFindings = await scanRiskyActions(page);
  const externalAssetFindings = await scanExternalAssets(page, context.mode, url);
  const routeFindings = await scanRoute(page, context);

  allFindings.push(
    ...selectorFindings,
    ...accessibilityFindings,
    ...formFindings,
    ...riskFindings,
    ...externalAssetFindings,
    ...routeFindings,
  );

  const score = calculateTestabilityScore(allFindings);
  const recommendations = generateTestabilityRecommendations(allFindings);

  const criticalCount = allFindings.filter((f) => f.severity === 'critical').length;
  const errorCount = allFindings.filter((f) => f.severity === 'error').length;
  const warningCount = allFindings.filter((f) => f.severity === 'warning').length;
  const infoCount = allFindings.filter((f) => f.severity === 'info').length;

  const status: AppTestabilityScan['status'] =
    criticalCount > 0 ? 'fail' :
    errorCount > 0 ? 'needs_human_review' :
    warningCount > 0 ? 'warn' :
    'pass';

  const scan: AppTestabilityScan = {
    scanId: nanoid(),
    createdAt: new Date().toISOString(),
    mode: context.mode,
    targetUrl: url,
    baseUrl: context.baseUrl,
    templateId: context.templateId,
    viewport: {
      profile: profile.name,
      width: profile.width,
      height: profile.height,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      deviceScaleFactor: profile.deviceScaleFactor,
    },
    status,
    score,
    summary: {
      totalFindings: allFindings.length,
      infoCount,
      warningCount,
      errorCount,
      criticalCount,
      selectorCount: selectorFindings.length,
      accessibilityCount: accessibilityFindings.length,
      formCount: formFindings.length,
      riskCount: riskFindings.length,
      externalAssetCount: externalAssetFindings.length,
      testabilityCount: routeFindings.length,
    },
    findings: allFindings,
    routeFindings,
    selectorFindings,
    accessibilityFindings,
    formFindings,
    riskFindings,
    mediaFindings: allFindings.filter((f) => f.category === 'media'),
    externalAssetFindings,
    recommendations,
    artifacts: {
      scanResultJson: '',
      scanReportMd: '',
    },
  };

  return { scan, browser, page };
}

// ─── Selector Readiness ───────────────────────────────────────────────────

async function scanSelectors(page: Page): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];

  const selectorData = await page.evaluate(`(() => {
    const doc = document;
    const win = window;
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    const testIdElements = Array.from(doc.querySelectorAll('[data-testid]'));
    const allIds = Array.from(doc.querySelectorAll('[id]')).map((el) => el.getAttribute('id'));
    const interactive = Array.from(doc.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]'));

    const visibleTestIds = testIdElements.filter(isVisible);
    const testIdCounts = {};
    for (const el of visibleTestIds) {
      const tid = el.getAttribute('data-testid');
      testIdCounts[tid] = (testIdCounts[tid] || 0) + 1;
    }

    const idCounts = {};
    for (const id of allIds) {
      idCounts[id] = (idCounts[id] || 0) + 1;
    }

    const noStableSelector = [];
    for (const el of interactive) {
      if (el.getAttribute('data-testid')) continue;
      if (el.getAttribute('data-qa')) continue;
      if (el.getAttribute('data-test')) continue;
      const id = el.getAttribute('id');
      if (id && !/^\\d/.test(id) && !/\\d{4,}/.test(id)) continue;
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent || '').trim().slice(0, 30);
      const classes = (el.getAttribute('class') || '').split(' ').slice(0, 3).join(' ');
      noStableSelector.push({ tag, text, classes });
    }

    return {
      totalTestIds: testIdElements.length,
      visibleTestIds: visibleTestIds.length,
      duplicateTestIds: Object.entries(testIdCounts).filter(([, c]) => c > 1).map(([tid, count]) => ({ tid, count })),
      duplicateIds: Object.entries(idCounts).filter(([, c]) => c > 1).map(([id, count]) => ({ id, count })),
      noStableSelectorCount: noStableSelector.length,
      noStableSelectorSamples: noStableSelector.slice(0, 5),
    };
  })()`) as {
    totalTestIds: number;
    visibleTestIds: number;
    duplicateTestIds: { tid: string; count: number }[];
    duplicateIds: { id: string; count: number }[];
    noStableSelectorCount: number;
    noStableSelectorSamples: { tag: string; text: string; classes: string }[];
  };

  if (selectorData.totalTestIds === 0) {
    findings.push({
      id: nanoid(),
      category: 'selector',
      severity: 'warning',
      title: 'No data-testid selectors found',
      message: 'The page has no elements with data-testid attributes. ForgeQA relies on stable selectors for reliable automation.',
      suggestedFix: 'Add data-testid attributes to key interactive elements (buttons, inputs, links, form sections).',
      confidence: 'high',
    });
  }

  for (const dup of selectorData.duplicateTestIds) {
    findings.push({
      id: nanoid(),
      category: 'selector',
      severity: 'error',
      title: `Duplicate visible data-testid: "${dup.tid}"`,
      message: `Found ${dup.count} visible elements with the same data-testid="${dup.tid}". This breaks strict locator mode and causes flaky tests.`,
      evidence: `data-testid="${dup.tid}" appears ${dup.count} times visibly`,
      selectorHint: `[data-testid="${dup.tid}"]`,
      suggestedFix: 'Ensure each visible data-testid is unique, or use distinct testids per instance.',
      confidence: 'high',
    });
  }

  for (const dup of selectorData.duplicateIds) {
    findings.push({
      id: nanoid(),
      category: 'selector',
      severity: 'error',
      title: `Duplicate HTML id: "${dup.id}"`,
      message: `The id "${dup.id}" appears ${dup.count} times. Duplicate IDs break label associations, anchor links, and some selectors.`,
      evidence: `id="${dup.id}" appears ${dup.count} times`,
      suggestedFix: 'Ensure each element has a unique id attribute.',
      confidence: 'high',
    });
  }

  if (selectorData.noStableSelectorCount > 0) {
    const samples = selectorData.noStableSelectorSamples
      .map((s) => `<${s.tag}>${s.text ? ` "${s.text}"` : ''}${s.classes ? ` class="${s.classes}"` : ''}`)
      .join('; ');
    findings.push({
      id: nanoid(),
      category: 'selector',
      severity: 'warning',
      title: 'Interactive elements without stable selectors',
      message: `${selectorData.noStableSelectorCount} interactive element(s) lack data-testid, data-qa, or stable id. They may only be addressable by brittle class or text selectors.`,
      evidence: samples,
      suggestedFix: 'Add data-testid attributes to buttons, links, inputs, and other interactive elements.',
      confidence: 'medium',
    });
  }

  return findings;
}

// ─── Accessibility Basics ─────────────────────────────────────────────────

async function scanAccessibilityBasics(page: Page): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];

  const a11yData = await page.evaluate(`(() => {
    const doc = document;
    const win = window;
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    const buttons = Array.from(doc.querySelectorAll('button, [role="button"]'));
    const links = Array.from(doc.querySelectorAll('a'));
    const inputs = Array.from(doc.querySelectorAll('input:not([type="hidden"]), select, textarea'));
    const images = Array.from(doc.querySelectorAll('img'));

    const buttonsWithoutName = [];
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const text = (btn.textContent || '').trim();
      const ariaLabel = btn.getAttribute('aria-label');
      const ariaLabelledBy = btn.getAttribute('aria-labelledby');
      const title = btn.getAttribute('title');
      const hasLabel = !!(text || ariaLabel || ariaLabelledBy || title);
      if (!hasLabel) {
        buttonsWithoutName.push({ tag: btn.tagName.toLowerCase(), text: text.slice(0, 20), ariaLabel: ariaLabel || undefined });
      }
    }

    const linksWithoutText = [];
    for (const a of links) {
      if (!isVisible(a)) continue;
      const text = (a.textContent || '').trim();
      const ariaLabel = a.getAttribute('aria-label');
      const ariaLabelledBy = a.getAttribute('aria-labelledby');
      const img = a.querySelector('img');
      const imgAlt = img ? img.getAttribute('alt') : null;
      if (!text && !ariaLabel && !ariaLabelledBy && !imgAlt) {
        linksWithoutText.push({ href: a.getAttribute('href') || '', classes: (a.getAttribute('class') || '').split(' ').slice(0, 2).join(' ') });
      }
    }

    const inputsWithoutLabel = [];
    for (const inp of inputs) {
      if (!isVisible(inp)) continue;
      const id = inp.getAttribute('id');
      const ariaLabel = inp.getAttribute('aria-label');
      const ariaLabelledBy = inp.getAttribute('aria-labelledby');
      const placeholder = inp.getAttribute('placeholder');
      let hasLabel = !!(ariaLabel || ariaLabelledBy || placeholder);
      if (id) {
        const label = doc.querySelector('label[for="' + id + '"]');
        if (label) hasLabel = true;
      }
      const parent = inp.closest('label');
      if (parent) hasLabel = true;
      if (!hasLabel) {
        inputsWithoutLabel.push({ type: inp.type || inp.tagName.toLowerCase(), id: id || undefined, placeholder: placeholder || undefined });
      }
    }

    const imagesWithoutAlt = [];
    for (const img of images) {
      if (!isVisible(img)) continue;
      if (!img.hasAttribute('alt')) {
        imagesWithoutAlt.push({ src: (img.getAttribute('src') || '').slice(0, 40) });
      }
    }

    return {
      buttonsWithoutName,
      linksWithoutText,
      inputsWithoutLabel,
      imagesWithoutAlt,
    };
  })()`) as {
    buttonsWithoutName: { tag: string; text: string; ariaLabel?: string }[];
    linksWithoutText: { href: string; classes: string }[];
    inputsWithoutLabel: { type: string; id?: string; placeholder?: string }[];
    imagesWithoutAlt: { src: string }[];
  };

  if (a11yData.buttonsWithoutName.length > 0) {
    const samples = a11yData.buttonsWithoutName.slice(0, 3).map((b) => `<${b.tag}>${b.text ? ` "${b.text}"` : ''}`).join('; ');
    findings.push({
      id: nanoid(),
      category: 'accessibility',
      severity: 'warning',
      title: 'Buttons without accessible names',
      message: `${a11yData.buttonsWithoutName.length} visible button(s) lack text, aria-label, or title. Screen readers cannot identify them.`,
      evidence: samples,
      suggestedFix: 'Add visible text, aria-label, or title to every button.',
      confidence: 'high',
    });
  }

  if (a11yData.linksWithoutText.length > 0) {
    findings.push({
      id: nanoid(),
      category: 'accessibility',
      severity: 'warning',
      title: 'Links without text or aria-label',
      message: `${a11yData.linksWithoutText.length} visible link(s) have no text content, aria-label, or image alt text.`,
      evidence: a11yData.linksWithoutText.map((l) => l.href).slice(0, 3).join(', '),
      suggestedFix: 'Add link text or aria-label to every anchor element.',
      confidence: 'high',
    });
  }

  if (a11yData.inputsWithoutLabel.length > 0) {
    const samples = a11yData.inputsWithoutLabel.slice(0, 3).map((i) => `<${i.type}>${i.id ? ` id="${i.id}"` : ''}`).join('; ');
    findings.push({
      id: nanoid(),
      category: 'accessibility',
      severity: 'error',
      title: 'Inputs without labels',
      message: `${a11yData.inputsWithoutLabel.length} visible input/select/textarea(s) are missing labels. This breaks accessibility and makes form automation brittle.`,
      evidence: samples,
      suggestedFix: 'Add <label for="id">, wrap in <label>, or add aria-label to every form control.',
      confidence: 'high',
    });
  }

  if (a11yData.imagesWithoutAlt.length > 0) {
    findings.push({
      id: nanoid(),
      category: 'accessibility',
      severity: 'warning',
      title: 'Images missing alt text',
      message: `${a11yData.imagesWithoutAlt.length} visible <img> element(s) lack alt attributes.`,
      evidence: a11yData.imagesWithoutAlt.map((i) => i.src).slice(0, 3).join(', '),
      suggestedFix: 'Add descriptive alt text, or alt="" for decorative images.',
      confidence: 'high',
    });
  }

  return findings;
}

// ─── Form Readiness ────────────────────────────────────────────────────────

async function scanForms(page: Page): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];

  const formData = await page.evaluate(`(() => {
    const doc = document;
    const win = window;
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    const forms = Array.from(doc.querySelectorAll('form'));
    const visibleForms = forms.filter(isVisible);
    const fileInputs = Array.from(doc.querySelectorAll('input[type="file"]')).filter(isVisible);
    const passwordInputs = Array.from(doc.querySelectorAll('input[type="password"], input[name*="password"], input[name*="token"], input[name*="secret"], input[name*="api_key"], input[name*="apikey"]')).filter(isVisible);
    const paymentInputs = Array.from(doc.querySelectorAll('input[name*="card"], input[name*="cvv"], input[name*="cc"], input[name*="payment"], input[name*="billing"]')).filter(isVisible);
    const submitButtons = Array.from(doc.querySelectorAll('button[type="submit"], input[type="submit"]')).filter(isVisible);

    return {
      formCount: visibleForms.length,
      fileInputCount: fileInputs.length,
      passwordInputCount: passwordInputs.length,
      paymentInputCount: paymentInputs.length,
      submitButtonCount: submitButtons.length,
    };
  })()`) as {
    formCount: number;
    fileInputCount: number;
    passwordInputCount: number;
    paymentInputCount: number;
    submitButtonCount: number;
  };

  if (formData.formCount > 0) {
    findings.push({
      id: nanoid(),
      category: 'form',
      severity: 'info',
      title: `Detected ${formData.formCount} form(s)`,
      message: 'Forms present on the page. Ensure each has a stable submit selector and clear success/error message regions.',
      suggestedFix: 'Add data-testid to forms, submit buttons, and message regions.',
      confidence: 'high',
    });
  }

  if (formData.fileInputCount > 0) {
    findings.push({
      id: nanoid(),
      category: 'form',
      severity: 'warning',
      title: 'File input detected',
      message: `${formData.fileInputCount} file input(s) found. File upload tests require generated test files and proper cleanup.`,
      suggestedFix: 'Ensure file upload is testable with data-testid and supports generated files.',
      confidence: 'high',
    });
  }

  if (formData.passwordInputCount > 0) {
    findings.push({
      id: nanoid(),
      category: 'form',
      severity: 'warning',
      title: 'Credential/token input detected',
      message: `${formData.passwordInputCount} password/token-like input(s) found. ForgeQA blocks real credential handling.`,
      suggestedFix: 'Use generated safe test data only. Do not automate real login with production credentials.',
      confidence: 'high',
      relatedPatternId: 'credential_input_not_supported',
    });
  }

  if (formData.paymentInputCount > 0) {
    findings.push({
      id: nanoid(),
      category: 'form',
      severity: 'error',
      title: 'Payment-like input detected',
      message: 'Payment or billing inputs detected. ForgeQA blocks payment action execution in all modes.',
      suggestedFix: 'Test only non-payment UI paths. Do not automate real checkout.',
      confidence: 'high',
      relatedPatternId: 'payment_domain_blocked',
    });
  }

  if (formData.formCount > 0 && formData.submitButtonCount === 0) {
    findings.push({
      id: nanoid(),
      category: 'form',
      severity: 'error',
      title: 'No submit button found in form',
      message: 'A form exists but no visible submit button was detected. This makes form submission automation unreliable.',
      suggestedFix: 'Add a visible submit button with data-testid inside or near the form.',
      confidence: 'medium',
    });
  }

  return findings;
}

// ─── Risky Actions ──────────────────────────────────────────────────────────

const RISK_PATTERNS: Array<{ id: string; keywords: string[]; category: ScannerFinding['category']; severity: ScannerFinding['severity']; title: string; message: string; fix: string; patternId?: string }> = [
  { id: 'destructive-delete', keywords: ['delete', 'remove', 'destroy', 'purge'], category: 'risk', severity: 'critical', title: 'Destructive action detected', message: 'A destructive action button/link was found. ForgeQA always blocks delete/remove actions.', fix: 'Do not automate destructive actions. Test read-only views instead.', patternId: 'destructive_action_blocked' },
  { id: 'destructive-reset', keywords: ['reset database', 'reset all', 'archive all'], category: 'risk', severity: 'critical', title: 'Destructive bulk action detected', message: 'A bulk destructive action was found. This is permanently blocked.', fix: 'Remove or isolate bulk destructive actions from testable UI.', patternId: 'destructive_action_blocked' },
  { id: 'payment-checkout', keywords: ['pay', 'checkout', 'subscribe', 'billing', 'purchase'], category: 'risk', severity: 'error', title: 'Payment action detected', message: 'Payment-related button/link found. ForgeQA blocks all payment actions.', fix: 'Test pricing/info views only. Do not automate checkout.', patternId: 'payment_domain_blocked' },
  { id: 'payment-card', keywords: ['card number', 'cvv', 'credit card', 'debit card'], category: 'risk', severity: 'error', title: 'Card input detected', message: 'Card input fields found. These are blocked by policy.', fix: 'Do not include card inputs in automated tests.', patternId: 'payment_domain_blocked' },
  { id: 'email-send', keywords: ['send email', 'broadcast', 'notify all'], category: 'risk', severity: 'error', title: 'Email-sending action detected', message: 'An email-sending action was found. ForgeQA blocks real email sending.', fix: 'Test form submission only; do not trigger real email delivery.', patternId: 'email_domain_blocked' },
  { id: 'oauth-login', keywords: ['google signin', 'github signin', 'microsoft signin', 'sso login', 'sign in with google', 'login with google', 'login with github'], category: 'risk', severity: 'error', title: 'OAuth/social login detected', message: 'OAuth or social login button found. ForgeQA blocks OAuth execution.', fix: 'Test login form mock only. Do not automate real OAuth handshake.', patternId: 'oauth_domain_blocked' },
  { id: 'invite-users', keywords: ['invite users', 'send invites', 'bulk invite'], category: 'risk', severity: 'warning', title: 'User invitation action detected', message: 'A user-invitation action was found. This may trigger real emails or notifications.', fix: 'Test invitation form UI only; do not send real invites.', patternId: 'email_domain_blocked' },
];

async function scanRiskyActions(page: Page): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];

  const riskScript = `(() => {
    const patterns = ${JSON.stringify(RISK_PATTERNS)};
    const doc = document;
    const win = window;
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    const results = [];
    const allText = (doc.body ? doc.body.textContent : '').toLowerCase();

    for (const p of patterns) {
      for (const kw of p.keywords) {
        if (allText.includes(kw)) {
          const els = Array.from(doc.querySelectorAll('button, a, input, [role="button"]'));
          for (const el of els) {
            if (!isVisible(el)) continue;
            const elText = (el.textContent || '').toLowerCase();
            if (elText.includes(kw)) {
              const tid = el.getAttribute('data-testid');
              const id = el.getAttribute('id');
              const classes = (el.getAttribute('class') || '').split(' ').slice(0, 2).join(' ');
              const hint = tid ? '[data-testid="' + tid + '"]' : id ? '#' + id : classes ? '.' + classes.replace(/ /g, '.') : el.tagName.toLowerCase();
              results.push({ patternId: p.id, matchedText: elText.slice(0, 60), tag: el.tagName.toLowerCase(), selectorHint: hint });
              break;
            }
          }
        }
      }
    }
    return results;
  })()`;
  const riskData = await page.evaluate(riskScript) as { patternId: string; matchedText: string; tag: string; selectorHint: string }[];

  const seen = new Set<string>();
  for (const r of riskData) {
    if (seen.has(r.patternId)) continue;
    seen.add(r.patternId);
    const pattern = RISK_PATTERNS.find((p) => p.id === r.patternId)!;
    findings.push({
      id: nanoid(),
      category: pattern.category,
      severity: pattern.severity,
      title: pattern.title,
      message: pattern.message,
      evidence: `Matched element: <${r.tag}> "${r.matchedText}"`,
      selectorHint: r.selectorHint,
      suggestedFix: pattern.fix,
      relatedPatternId: pattern.patternId,
      confidence: 'medium',
    });
  }

  return findings;
}

// ─── External Assets ──────────────────────────────────────────────────────

async function scanExternalAssets(page: Page, mode: string, pageUrl: string): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];

  const assetScript = `(() => {
    const pageUrlStr = ${JSON.stringify(pageUrl)};
    const doc = document;
    let pageHost = '';
    try { pageHost = new URL(pageUrlStr).hostname; } catch { pageHost = ''; }

    const isExternal = (url) => {
      if (!url) return false;
      if (url.startsWith('//')) return true;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
          return new URL(url).hostname !== pageHost;
        } catch { return false; }
      }
      return false;
    };

    const scripts = Array.from(doc.querySelectorAll('script[src]')).map((el) => el.getAttribute('src'));
    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]')).map((el) => el.getAttribute('href'));
    const images = Array.from(doc.querySelectorAll('img[src]')).map((el) => el.getAttribute('src'));
    const iframes = Array.from(doc.querySelectorAll('iframe[src]')).map((el) => el.getAttribute('src'));
    const fonts = Array.from(doc.querySelectorAll('link[href]')).filter((el) => {
      const asAttr = el.getAttribute('as');
      const rel = el.getAttribute('rel');
      return asAttr === 'font' || (rel && rel.includes('font'));
    }).map((el) => el.getAttribute('href'));
    const forms = Array.from(doc.querySelectorAll('form[action]')).map((el) => el.getAttribute('action'));

    return {
      externalScripts: scripts.filter(isExternal),
      externalStyles: styles.filter(isExternal),
      externalImages: images.filter(isExternal),
      externalIframes: iframes.filter(isExternal),
      externalFonts: fonts.filter(isExternal),
      externalFormActions: forms.filter(isExternal),
    };
  })()`;
  const assetData = await page.evaluate(assetScript) as {
    externalScripts: string[];
    externalStyles: string[];
    externalImages: string[];
    externalIframes: string[];
    externalFonts: string[];
    externalFormActions: string[];
  };

  const reportExternal = (items: string[], type: string, severity: ScannerFinding['severity']) => {
    if (items.length === 0) return;
    findings.push({
      id: nanoid(),
      category: 'external_asset',
      severity,
      title: `External ${type} detected`,
      message: `Found ${items.length} external ${type}(s). ${mode === 'demo' ? 'External assets can cause flakiness in demo mode.' : 'External assets are expected in external mode but should be reviewed.'}`,
      evidence: items.slice(0, 3).join(', '),
      suggestedFix: 'For demo fixtures, inline or serve assets locally. For external mode, document approved external hosts.',
      confidence: 'medium',
    });
  };

  const sev: ScannerFinding['severity'] = mode === 'demo' ? 'warning' : 'info';
  reportExternal(assetData.externalScripts, 'script', sev);
  reportExternal(assetData.externalStyles, 'stylesheet', sev);
  reportExternal(assetData.externalImages, 'image', sev);
  reportExternal(assetData.externalIframes, 'iframe', 'warning');
  reportExternal(assetData.externalFonts, 'font', sev);
  reportExternal(assetData.externalFormActions, 'form action', mode === 'demo' ? 'error' : 'warning');

  return findings;
}

// ─── Route Check ────────────────────────────────────────────────────────────

async function scanRoute(page: Page, context: ScanContext): Promise<ScannerFinding[]> {
  const findings: ScannerFinding[] = [];
  const currentUrl = page.url();

  findings.push({
    id: nanoid(),
    category: 'route',
    severity: 'info',
    title: 'Page loaded successfully',
    message: `Scanner loaded ${currentUrl} without navigation errors.`,
    evidence: currentUrl,
    suggestedFix: 'N/A',
    confidence: 'high',
  });

  if (context.mode === 'external' && context.baseUrl) {
    const validation = parseAndValidateBaseUrl(context.baseUrl);
    if (!validation.valid) {
      findings.push({
        id: nanoid(),
        category: 'route',
        severity: 'critical',
        title: 'Invalid or unsafe base URL',
        message: validation.warnings.join('; ') || 'The provided base URL failed validation.',
        suggestedFix: 'Use an approved test domain or localhost URL.',
        confidence: 'high',
      });
    } else if (!isAllowedNavigation(context.baseUrl, createNavigationPolicy(context.baseUrl))) {
      findings.push({
        id: nanoid(),
        category: 'route',
        severity: 'critical',
        title: 'Base URL blocked by policy',
        message: 'The provided base URL is not on the approved navigation allowlist.',
        suggestedFix: 'Use forgeqa.test, forgecircle.test, example.test, or localhost.',
        confidence: 'high',
      });
    }
  }

  return findings;
}

// ─── Score Calculation ────────────────────────────────────────────────────

function calculateTestabilityScore(findings: ScannerFinding[]): TestabilityScore {
  const base = 100;
  const criticalDeduction = findings.filter((f) => f.severity === 'critical').length * 15;
  const errorDeduction = findings.filter((f) => f.severity === 'error').length * 10;
  const warningDeduction = findings.filter((f) => f.severity === 'warning').length * 5;

  const overall = Math.max(0, Math.min(100, base - criticalDeduction - errorDeduction - warningDeduction));

  const selectorFindings = findings.filter((f) => f.category === 'selector');
  const accessibilityFindings = findings.filter((f) => f.category === 'accessibility');
  const formFindings = findings.filter((f) => f.category === 'form');
  const riskFindings = findings.filter((f) => f.category === 'risk');
  const routeFindings = findings.filter((f) => f.category === 'route');

  const calc = (catFindings: ScannerFinding[]) => {
    const c = catFindings.filter((f) => f.severity === 'critical').length * 15;
    const e = catFindings.filter((f) => f.severity === 'error').length * 10;
    const w = catFindings.filter((f) => f.severity === 'warning').length * 5;
    return Math.max(0, Math.min(100, 100 - c - e - w));
  };

  return {
    overall,
    selectorScore: calc(selectorFindings),
    accessibilityScore: calc(accessibilityFindings),
    formScore: calc(formFindings),
    riskScore: calc(riskFindings),
    routeScore: calc(routeFindings),
    evidenceScore: overall,
  };
}

function generateTestabilityRecommendations(findings: ScannerFinding[]): string[] {
  const recs: string[] = [];
  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasError = findings.some((f) => f.severity === 'error');

  if (hasCritical) {
    recs.push('Address critical findings before running any ForgeQA workflow.');
  }
  if (hasError) {
    recs.push('Review and fix error-level findings to improve test reliability.');
  }
  if (findings.some((f) => f.category === 'selector' && f.severity === 'warning')) {
    recs.push('Add data-testid attributes to interactive elements for stable selectors.');
  }
  if (findings.some((f) => f.category === 'accessibility' && f.severity === 'error')) {
    recs.push('Label all form inputs to improve accessibility and automation reliability.');
  }
  if (findings.some((f) => f.category === 'risk')) {
    recs.push('Review risky actions. ForgeQA will block destructive, payment, email, and OAuth actions.');
  }
  if (findings.some((f) => f.category === 'external_asset')) {
    recs.push('For demo testing, inline or serve all assets locally to avoid flakiness.');
  }
  if (recs.length === 0) {
    recs.push('Page looks testable. Proceed with ForgeQA workflow execution.');
  }

  return recs;
}

// ─── Utility for demo scans ───────────────────────────────────────────────

export async function runDemoScan(route: string, viewport?: string, isMobile?: boolean): Promise<{ scan: AppTestabilityScan; artifactsDir: string }> {
  const handle = await startIsolatedDemoServer();
  try {
    const url = `${handle.baseUrl}${route}`;
    const context: ScanContext = { mode: 'demo', viewport, isMobile };
    const { scan, browser } = await runAppTestabilityScan(url, context);

    const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'scans', scan.scanId);
    fs.mkdirSync(artifactsDir, { recursive: true });

    const scanJsonPath = path.join(artifactsDir, 'scan-result.json');
    fs.writeFileSync(scanJsonPath, JSON.stringify(scan, null, 2), 'utf-8');

    const templateRecs = recommendTemplates(scan.findings);
    scan.suggestedTemplates = templateRecs;

    const mdReport = generateScanMarkdown(scan, templateRecs);
    const htmlReport = generateScanHtml(scan, templateRecs);
    const mdPath = path.join(artifactsDir, 'scan-report.md');
    const htmlPath = path.join(artifactsDir, 'scan-report.html');
    fs.writeFileSync(mdPath, mdReport, 'utf-8');
    fs.writeFileSync(htmlPath, htmlReport, 'utf-8');

    scan.artifacts.scanResultJson = scanJsonPath;
    scan.artifacts.scanReportMd = mdPath;
    scan.artifacts.scanReportHtml = htmlPath;

    await browser.close();
    return { scan, artifactsDir };
  } finally {
    await handle.stop();
  }
}

export async function runExternalScan(baseUrl: string, route?: string, viewport?: string, isMobile?: boolean): Promise<{ scan: AppTestabilityScan; artifactsDir: string }> {
  const url = route ? `${baseUrl.replace(/\/$/, '')}${route}` : baseUrl;
  const context: ScanContext = { mode: 'external', baseUrl, viewport, isMobile };
  const { scan, browser } = await runAppTestabilityScan(url, context);

  const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'scans', scan.scanId);
  fs.mkdirSync(artifactsDir, { recursive: true });

  const scanJsonPath = path.join(artifactsDir, 'scan-result.json');
  fs.writeFileSync(scanJsonPath, JSON.stringify(scan, null, 2), 'utf-8');

  const templateRecs = recommendTemplates(scan.findings);
  scan.suggestedTemplates = templateRecs;

  const mdReport = generateScanMarkdown(scan, templateRecs);
  const htmlReport = generateScanHtml(scan, templateRecs);
  const mdPath = path.join(artifactsDir, 'scan-report.md');
  const htmlPath = path.join(artifactsDir, 'scan-report.html');
  fs.writeFileSync(mdPath, mdReport, 'utf-8');
  fs.writeFileSync(htmlPath, htmlReport, 'utf-8');

  scan.artifacts.scanResultJson = scanJsonPath;
  scan.artifacts.scanReportMd = mdPath;
  scan.artifacts.scanReportHtml = htmlPath;

  await browser.close();
  return { scan, artifactsDir };
}
