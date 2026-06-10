import type { Page } from 'playwright';
import type { PatternFinding } from '../patterns/types.js';
import { enrichFinding } from '../patterns/analyzer.js';

export interface DomAnalyzerContext {
  runId: string;
  stepId?: string;
  stepIndex: number;
  currentUrl: string;
  selector?: string;
  action?: string;
  expectedText?: string;
}

interface DomElementInfo {
  tagName: string;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  hasLabelledByText: boolean;
  hasLabelFor: boolean;
  hasNestedLabel: boolean;
  placeholder?: string;
  textContent?: string;
  visible: boolean;
  disabled: boolean;
  ariaDisabled: boolean;
  rect: { width: number; height: number; top: number; left: number };
}

interface DomInspectionResult {
  url: string;
  title: string;
  testIdElements: DomElementInfo[];
  interactiveElements: DomElementInfo[];
  allVisibleText: string[];
}

export async function analyzeDom(page: Page, context: DomAnalyzerContext): Promise<PatternFinding[]> {
  const findings: PatternFinding[] = [];

  // Use string-based evaluate to avoid tsx/esbuild __name transformation issues
  // in serialized browser functions.
  const inspectScript = `(() => {
    const win = window;
    const doc = document;
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const extractInfo = (el) => {
      const r = el.getBoundingClientRect();
      const s = win.getComputedStyle(el);
      const id = el.getAttribute('id');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      let hasLabelledByText = false;
      if (ariaLabelledBy) {
        const ref = doc.getElementById(ariaLabelledBy);
        if (ref && ref.textContent && ref.textContent.trim().length > 0) {
          hasLabelledByText = true;
        }
      }
      let hasLabelFor = false;
      if (id) {
        const label = doc.querySelector('label[for="' + id + '"]');
        if (label && label.textContent && label.textContent.trim().length > 0) {
          hasLabelFor = true;
        }
      }
      let hasNestedLabel = false;
      const parentLabel = el.closest ? el.closest('label') : null;
      if (parentLabel && parentLabel.textContent && parentLabel.textContent.trim().length > 0) {
        hasNestedLabel = true;
      }
      return {
        tagName: el.tagName.toLowerCase(),
        testId: el.getAttribute('data-testid') || undefined,
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        ariaLabelledBy: ariaLabelledBy || undefined,
        hasLabelledByText,
        hasLabelFor,
        hasNestedLabel,
        placeholder: el.getAttribute('placeholder') || undefined,
        textContent: (el.textContent || '').trim().substring(0, 200) || undefined,
        visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden',
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        ariaDisabled: el.getAttribute('aria-disabled') === 'true',
        rect: { width: r.width, height: r.height, top: r.top, left: r.left },
      };
    };
    const testIdElements = Array.from(doc.querySelectorAll('[data-testid]')).map(extractInfo);
    const interactiveSelectors = [
      'button', 'input', 'select', 'textarea',
      'a[href]', '[role="button"]', '[role="link"]',
    ];
    const interactiveElements = Array.from(
      new Set(interactiveSelectors.flatMap((sel) => Array.from(doc.querySelectorAll(sel))))
    ).map(extractInfo);
    const allVisibleText = Array.from(doc.querySelectorAll('body *'))
      .filter((el) => isVisible(el))
      .map((el) => (el.textContent || '').trim())
      .filter((text) => text.length > 0 && text.length < 200);
    return {
      url: win.location.href,
      title: doc.title,
      testIdElements,
      interactiveElements,
      allVisibleText,
    };
  })()`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const domInfo: DomInspectionResult = await (page as any).evaluate(inspectScript);

  // A. hidden_testid_on_non_interactive_element
  for (const el of domInfo.testIdElements) {
    if (!el.visible && el.testId) {
      findings.push({
        patternId: 'hidden_testid_on_non_interactive_element',
        message: `Element with data-testid="${el.testId}" is not visible (tag=${el.tagName}).`,
        stepId: context.stepId,
        severity: 'info',
        evidence: `testId=${el.testId}, tagName=${el.tagName}, visible=${el.visible}`,
      });
    }
  }

  // B. inaccessible_element_targeted
  if (context.selector && (context.action === 'click' || context.action === 'fill' || context.action === 'upload')) {
    try {
      const targetScript = `(() => {
        const el = document.querySelector('${context.selector.replace(/'/g, "\\'")}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return {
          tagName: el.tagName.toLowerCase(),
          visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden',
          disabled: el.hasAttribute('disabled'),
          ariaDisabled: el.getAttribute('aria-disabled') === 'true',
          testId: el.getAttribute('data-testid') || undefined,
        };
      })()`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targetInfo = await (page as any).evaluate(targetScript);

      if (targetInfo && (!targetInfo.visible || targetInfo.disabled || targetInfo.ariaDisabled)) {
        findings.push({
          patternId: 'inaccessible_element_targeted',
          message: `Target element "${context.selector}" is not accessible: visible=${targetInfo.visible}, disabled=${targetInfo.disabled}, ariaDisabled=${targetInfo.ariaDisabled}.`,
          stepId: context.stepId,
          severity: 'warning',
          evidence: `selector=${context.selector}, visible=${targetInfo.visible}, disabled=${targetInfo.disabled}, ariaDisabled=${targetInfo.ariaDisabled}`,
        });
      }
    } catch {
      // ignore evaluation errors
    }
  }

  // C. broad_text_locator_false_match
  if (context.expectedText) {
    const matchCount = domInfo.allVisibleText.filter((t) => t.includes(context.expectedText!)).length;
    if (matchCount > 1) {
      findings.push({
        patternId: 'broad_text_locator_false_match',
        message: `Text "${context.expectedText}" matches ${matchCount} visible elements, which may cause ambiguous assertions.`,
        stepId: context.stepId,
        severity: 'warning',
        evidence: `text="${context.expectedText}", matchCount=${matchCount}`,
      });
    }
  }

  // D. locator_strict_mode_multiple_matches (duplicate visible testids)
  const testIdCounts = new Map<string, number>();
  for (const el of domInfo.testIdElements) {
    if (el.visible && el.testId) {
      testIdCounts.set(el.testId, (testIdCounts.get(el.testId) || 0) + 1);
    }
  }
  for (const [testId, count] of testIdCounts.entries()) {
    if (count > 1) {
      findings.push({
        patternId: 'locator_strict_mode_multiple_matches',
        message: `data-testid="${testId}" appears ${count} times in the visible DOM.`,
        stepId: context.stepId,
        severity: 'warning',
        evidence: `data-testid="${testId}", visibleCount=${count}`,
      });
    }
  }

  // E. aria_label_missing
  for (const el of domInfo.interactiveElements) {
    if (!el.visible) continue;

    const hasTextContent = !!(el.textContent && el.textContent.length > 0);
    const hasAriaLabel = !!(el.ariaLabel && el.ariaLabel.length > 0);
    const hasLabelledBy = el.hasLabelledByText;
    const hasLabelFor = el.hasLabelFor;
    const hasNestedLabel = el.hasNestedLabel;

    // Buttons and links: text content is sufficient
    if ((el.tagName === 'button' || el.tagName === 'a') && hasTextContent) continue;

    // Any element with explicit aria-label or valid aria-labelledby
    if (hasAriaLabel || hasLabelledBy) continue;

    // Input/select/textarea with label for="id" or nested label
    if ((el.tagName === 'input' || el.tagName === 'select' || el.tagName === 'textarea') && (hasLabelFor || hasNestedLabel)) continue;

    // Input with only placeholder is low-confidence, still flag but note source
    const hasPlaceholderOnly = !!(el.placeholder && el.placeholder.length > 0);
    if (hasPlaceholderOnly) {
      findings.push({
        patternId: 'aria_label_missing',
        message: `Visible interactive <${el.tagName}> relies on placeholder text as its only accessible name.`,
        stepId: context.stepId,
        severity: 'info',
        evidence: `tagName=${el.tagName}, accessibleNameSource=placeholder, testId=${el.testId ?? 'none'}`,
      });
      continue;
    }

    // Truly missing accessible name
    findings.push({
      patternId: 'aria_label_missing',
      message: `Visible interactive <${el.tagName}> lacks an accessible name (no text content, aria-label, associated label, or aria-labelledby).`,
      stepId: context.stepId,
      severity: 'info',
      evidence: `tagName=${el.tagName}, role=${el.role ?? 'none'}, testId=${el.testId ?? 'none'}, textContent=${hasTextContent}, ariaLabel=${hasAriaLabel}, hasLabelFor=${hasLabelFor}, hasNestedLabel=${hasNestedLabel}, hasLabelledBy=${hasLabelledBy}`,
    });
  }

  // F. duplicate_responsive_selector (overall duplicate testids, some hidden)
  const totalTestIdCounts = new Map<string, number>();
  for (const el of domInfo.testIdElements) {
    if (el.testId) {
      totalTestIdCounts.set(el.testId, (totalTestIdCounts.get(el.testId) || 0) + 1);
    }
  }
  for (const [testId, count] of totalTestIdCounts.entries()) {
    if (count > 1) {
      const visibleCount = testIdCounts.get(testId) || 0;
      if (visibleCount <= 1) {
        findings.push({
          patternId: 'duplicate_responsive_selector',
          message: `data-testid="${testId}" appears ${count} times total (${visibleCount} visible). May indicate responsive breakpoint duplication.`,
          stepId: context.stepId,
          severity: 'info',
          evidence: `data-testid="${testId}", totalCount=${count}, visibleCount=${visibleCount}`,
        });
      }
    }
  }

  // G. missing_alt_text_on_image
  try {
    const altScript = `(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.map((img) => ({
        src: img.src.substring(0, 100),
        alt: img.getAttribute('alt'),
        testid: img.getAttribute('data-testid') || undefined,
        role: img.getAttribute('role'),
        ariaHidden: img.getAttribute('aria-hidden') === 'true',
        width: img.naturalWidth,
        height: img.naturalHeight,
        visible: img.getBoundingClientRect().width > 0 && img.getBoundingClientRect().height > 0,
      }));
    })()`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const images: { src: string; alt: string | null; testid: string | undefined; role: string | null; ariaHidden: boolean; width: number; height: number; visible: boolean }[] = await (page as any).evaluate(altScript);
    for (const img of images) {
      // Skip decorative images
      if (img.ariaHidden || img.role === 'presentation' || img.role === 'none') continue;
      // Skip images with meaningful alt text
      if (img.alt && img.alt.trim().length > 0) continue;
      // Flag missing alt (including empty alt on informative images)
      const severity = img.alt === '' ? 'info' : 'warning';
      findings.push({
        patternId: 'missing_alt_text_on_image',
        message: `Image lacks descriptive alt text: ${img.src.substring(0, 60)}.`,
        stepId: context.stepId,
        severity,
        evidence: `src=${img.src.substring(0, 60)}, testid=${img.testid ?? 'none'}, alt="${img.alt ?? 'MISSING'}", visible=${img.visible}`,
      });
    }
  } catch {
    // ignore image analysis errors
  }

  // H. page_title_missing_or_generic
  try {
    const titleScript = `(() => {
      const title = document.title.trim();
      const genericTitles = ['document', 'untitled', 'react app', 'vite app', 'next app', 'angular app', 'vue app'];
      const isGeneric = genericTitles.some((g) => title.toLowerCase() === g);
      return { title, isGeneric, isEmpty: title.length === 0 };
    })()`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleInfo: { title: string; isGeneric: boolean; isEmpty: boolean } = await (page as any).evaluate(titleScript);
    if (titleInfo.isEmpty) {
      findings.push({
        patternId: 'page_title_missing_or_generic',
        message: 'Page title is missing or empty.',
        stepId: context.stepId,
        severity: 'info',
        evidence: `title=""`,
      });
    } else if (titleInfo.isGeneric) {
      findings.push({
        patternId: 'page_title_missing_or_generic',
        message: `Page title is generic: "${titleInfo.title}".`,
        stepId: context.stepId,
        severity: 'info',
        evidence: `title="${titleInfo.title}"`,
      });
    }
  } catch {
    // ignore title analysis errors
  }

  // I. duplicate_id_attribute
  try {
    const idScript = `(() => {
      const allElements = Array.from(document.querySelectorAll('[id]'));
      const idCounts = {};
      for (const el of allElements) {
        const id = el.getAttribute('id');
        if (id && id.trim().length > 0) {
          idCounts[id] = (idCounts[id] || 0) + 1;
        }
      }
      return Object.entries(idCounts).filter(([_, count]) => count > 1).map(([id, count]) => ({ id, count }));
    })()`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const duplicateIds: { id: string; count: number }[] = await (page as any).evaluate(idScript);
    for (const dup of duplicateIds) {
      findings.push({
        patternId: 'duplicate_id_attribute',
        message: `ID "${dup.id}" appears ${dup.count} times in the DOM.`,
        stepId: context.stepId,
        severity: 'warning',
        evidence: `id="${dup.id}", count=${dup.count}`,
      });
    }
  } catch {
    // ignore duplicate ID analysis errors
  }

  return findings.map(enrichFinding);
}
