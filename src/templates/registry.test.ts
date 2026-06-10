import { describe, it, expect } from 'vitest';
import { matchPrompt, listTemplates, listDiagnosticTemplates } from './registry.js';

describe('listTemplates', () => {
  it('returns at least one template', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('includes new workflow templates', () => {
    const templates = listTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('forgecircle.registerAlumniCompleteProfile');
    expect(ids).toContain('generic.passwordResetRequest');
    expect(ids).toContain('generic.multiStepFormValidation');
    expect(ids).toContain('generic.fileUploadWithPreview');
    expect(ids).toContain('generic.paginationAndSearch');
    expect(ids).toContain('generic.mobileResponsiveCheck');
  });
});

describe('matchPrompt', () => {
  it('matches "register alumni complete profile upload avatar" exactly', () => {
    const result = matchPrompt('register alumni complete profile upload avatar');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('forgecircle.registerAlumniCompleteProfile');
      expect(result.confidence).toBe('exact');
    }
  });

  it('is case-insensitive', () => {
    const result = matchPrompt('Register Alumni Complete Profile Upload Avatar');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('forgecircle.registerAlumniCompleteProfile');
    }
  });

  it('matches password reset by tag', () => {
    const result = matchPrompt('forgot password reset flow');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('generic.passwordResetRequest');
    }
  });

  it('matches multi step form by matcher', () => {
    const result = matchPrompt('multi step form validation');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('generic.multiStepFormValidation');
    }
  });

  it('matches file upload preview by tag', () => {
    const result = matchPrompt('file upload preview');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('generic.fileUploadWithPreview');
    }
  });

  it('matches search pagination by matcher', () => {
    const result = matchPrompt('search and pagination');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('generic.paginationAndSearch');
    }
  });

  it('matches mobile responsive by tag', () => {
    const result = matchPrompt('mobile responsive check');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('generic.mobileResponsiveCheck');
    }
  });

  it('returns NO_MATCH for unknown prompt', () => {
    const result = matchPrompt('do something completely unrelated xyz123');
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.error).toBe('NO_MATCH');
      expect(result.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('returns suggestions for ambiguous prompt', () => {
    const result = matchPrompt('form validation check something');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(['matcher', 'tag', 'fuzzy']).toContain(result.confidence);
    }
  });

  it('excludes diagnostic templates from normal recommendations', () => {
    const templates = listTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).not.toContain('diagnostic.brokenSelector');
    expect(ids).not.toContain('diagnostic.slowLoading');
    expect(ids).not.toContain('diagnostic.duplicateTestId');
  });

  it('includes diagnostic templates in listDiagnosticTemplates', () => {
    const diagnostics = listDiagnosticTemplates();
    const ids = diagnostics.map((t) => t.id);
    expect(ids).toContain('diagnostic.brokenSelector');
    expect(ids).toContain('diagnostic.slowLoading');
    expect(ids).toContain('diagnostic.duplicateTestId');
    expect(ids).toContain('diagnostic.missingLabel');
    expect(ids).toContain('diagnostic.mediaAccessibility');
    expect(ids).toContain('diagnostic.genericTitle');
    expect(diagnostics.length).toBe(6);
  });

  it('matches diagnostic template when prompt includes diagnostic', () => {
    const result = matchPrompt('diagnostic broken selector');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('diagnostic.brokenSelector');
      expect(result.confidence).toBe('exact');
    }
  });

  it('matches diagnostic slow loading template', () => {
    const result = matchPrompt('diagnostic slow loading');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.template.id).toBe('diagnostic.slowLoading');
    }
  });
});
