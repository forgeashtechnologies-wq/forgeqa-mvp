import type { PromptMatchResult, WorkflowTemplate } from './types.js';
import alumniRegistration from './workflows/alumni-registration.js';
import passwordResetRequest from './workflows/password-reset-request.js';
import multiStepFormValidation from './workflows/multi-step-form-validation.js';
import fileUploadWithPreview from './workflows/file-upload-with-preview.js';
import paginationAndSearch from './workflows/pagination-and-search.js';
import mobileResponsiveCheck from './workflows/mobile-responsive-check.js';
import diagnosticBrokenSelector from './workflows/diagnostics/broken-selector.js';
import diagnosticSlowLoading from './workflows/diagnostics/slow-loading.js';
import diagnosticDuplicateTestId from './workflows/diagnostics/duplicate-testid.js';
import diagnosticMissingLabel from './workflows/diagnostics/missing-label.js';
import diagnosticMediaAccessibility from './workflows/diagnostics/media-accessibility.js';
import diagnosticGenericTitle from './workflows/diagnostics/generic-title.js';
import externalRiskForm from './workflows/external-risk-form.js';
import externalSafeSubmit from './workflows/external-safe-submit.js';
import policyDestructiveActionGate from './workflows/policy/destructive-action-gate.js';
import policyPaymentFlowGate from './workflows/policy/payment-flow-gate.js';
import policyOAuthFlowGate from './workflows/policy/oauth-flow-gate.js';

const NORMAL_TEMPLATES: readonly WorkflowTemplate[] = [
  alumniRegistration,
  passwordResetRequest,
  multiStepFormValidation,
  fileUploadWithPreview,
  paginationAndSearch,
  mobileResponsiveCheck,
  externalSafeSubmit,
];

const DIAGNOSTIC_TEMPLATES: readonly WorkflowTemplate[] = [
  diagnosticBrokenSelector,
  diagnosticSlowLoading,
  diagnosticDuplicateTestId,
  diagnosticMissingLabel,
  diagnosticMediaAccessibility,
  diagnosticGenericTitle,
];

const POLICY_TEMPLATES: readonly WorkflowTemplate[] = [
  externalRiskForm,
  policyDestructiveActionGate,
  policyPaymentFlowGate,
  policyOAuthFlowGate,
];

const ALL_TEMPLATES: readonly WorkflowTemplate[] = [...NORMAL_TEMPLATES, ...DIAGNOSTIC_TEMPLATES, ...POLICY_TEMPLATES];

export function listTemplates(): readonly WorkflowTemplate[] {
  return NORMAL_TEMPLATES;
}

export function listDiagnosticTemplates(): readonly WorkflowTemplate[] {
  return DIAGNOSTIC_TEMPLATES;
}

export function listPolicyTemplates(): readonly WorkflowTemplate[] {
  return POLICY_TEMPLATES;
}

export function listAllTemplates(): readonly WorkflowTemplate[] {
  return ALL_TEMPLATES;
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function scoreMatch(prompt: string, template: WorkflowTemplate): number {
  const normPrompt = normalize(prompt);
  const words = normPrompt.split(' ').filter((w) => w.length > 2);

  // Exact matcher match
  for (const matcher of template.promptMatchers) {
    if (normPrompt === normalize(matcher)) return 100;
  }

  // Matcher phrase contains
  for (const matcher of template.promptMatchers) {
    const normMatcher = normalize(matcher);
    if (normPrompt.includes(normMatcher) || normMatcher.includes(normPrompt)) return 80;
  }

  // Secondary matchers
  for (const matcher of template.matchers) {
    const normMatcher = normalize(matcher);
    if (normPrompt.includes(normMatcher) || normMatcher.includes(normPrompt)) return 60;
  }

  // Tag matches
  let tagScore = 0;
  for (const tag of template.tags) {
    if (normPrompt.includes(tag.toLowerCase())) tagScore += 15;
  }

  // Word overlap
  let wordScore = 0;
  for (const word of words) {
    const allText = [
      ...template.promptMatchers,
      ...template.matchers,
      ...template.tags,
      template.name,
      template.description,
    ].join(' ').toLowerCase();
    if (allText.includes(word)) wordScore += 5;
  }

  return tagScore + wordScore;
}

export interface TemplateSearchResult {
  template: WorkflowTemplate;
  score: number;
  matchedFields: string[];
}

function searchTemplates(keyword: string, includeDiagnostics: boolean, includePolicy: boolean): TemplateSearchResult[] {
  const kw = keyword.toLowerCase();
  const pools: WorkflowTemplate[][] = [NORMAL_TEMPLATES as WorkflowTemplate[]];
  if (includeDiagnostics) pools.push(DIAGNOSTIC_TEMPLATES as WorkflowTemplate[]);
  if (includePolicy) pools.push(POLICY_TEMPLATES as WorkflowTemplate[]);

  const results: TemplateSearchResult[] = [];
  const seen = new Set<string>();

  for (const pool of pools) {
    for (const template of pool) {
      if (seen.has(template.id)) continue;
      seen.add(template.id);
      let score = 0;
      const fields: string[] = [];

      if (template.id.toLowerCase().includes(kw)) { score += 50; fields.push('id'); }
      if (template.name.toLowerCase().includes(kw)) { score += 40; fields.push('name'); }
      if (template.description.toLowerCase().includes(kw)) { score += 30; fields.push('description'); }
      if (template.category.toLowerCase().includes(kw)) { score += 25; fields.push('category'); }
      if (template.tags.some((t) => t.toLowerCase().includes(kw))) { score += 20; fields.push('tags'); }
      if (template.matchers.some((m) => m.toLowerCase().includes(kw))) { score += 15; fields.push('matchers'); }
      if (template.roles.some((r) => r.toLowerCase().includes(kw))) { score += 10; fields.push('roles'); }
      if (template.supportedModes.some((m) => m.toLowerCase().includes(kw))) { score += 10; fields.push('modes'); }

      if (score > 0) {
        results.push({ template, score, matchedFields: fields });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export { searchTemplates };

export function matchPrompt(prompt: string): PromptMatchResult {
  const normPrompt = normalize(prompt);

  // Determine which pool to search
  const isDiagnosticPrompt = normPrompt.includes('diagnostic');
  const isPolicyPrompt = normPrompt.includes('policy') || normPrompt.includes('risk') || normPrompt.includes('safety gate');
  const searchPool = isDiagnosticPrompt ? DIAGNOSTIC_TEMPLATES : isPolicyPrompt ? POLICY_TEMPLATES : NORMAL_TEMPLATES;
  const fallbackPool = isDiagnosticPrompt || isPolicyPrompt ? [] : DIAGNOSTIC_TEMPLATES;

  // Exact match first
  for (const template of searchPool) {
    for (const matcher of template.promptMatchers) {
      if (normPrompt === normalize(matcher)) {
        return {
          matched: true,
          template,
          confidence: 'exact',
        };
      }
    }
  }

  // Score all templates in search pool
  const scored = searchPool
    .map((template) => ({ template, score: scoreMatch(normPrompt, template) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // If no match in normal pool, try diagnostic as fallback only for non-diagnostic prompts
  if (scored.length === 0 && !isDiagnosticPrompt && fallbackPool.length > 0) {
    const fallbackScored = fallbackPool
      .map((template) => ({ template, score: scoreMatch(normPrompt, template) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (fallbackScored.length > 0 && fallbackScored[0].score >= 40) {
      return {
        matched: true,
        template: fallbackScored[0].template,
        confidence: 'fuzzy',
      };
    }
  }

  if (scored.length === 0) {
    return {
      matched: false,
      error: 'NO_MATCH',
      suggestions: searchPool.slice(0, 3).map((t) => `${t.id}: ${t.name}`),
    };
  }

  const best = scored[0];
  // Require a minimum confidence threshold
  if (best.score < 20) {
    return {
      matched: false,
      error: 'NO_MATCH',
      suggestions: scored.slice(0, 3).map((s) => `${s.template.id}: ${s.template.name}`),
    };
  }

  const confidence = best.score >= 80 ? 'matcher' : best.score >= 40 ? 'tag' : 'fuzzy';
  return {
    matched: true,
    template: best.template,
    confidence,
  };
}
