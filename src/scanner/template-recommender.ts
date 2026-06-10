import type { ScannerFinding } from './types.js';

export interface TemplateRecommendation {
  templateId: string;
  templateName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export function recommendTemplates(findings: ScannerFinding[]): TemplateRecommendation[] {
  const recs: TemplateRecommendation[] = [];
  const seen = new Set<string>();

  const hasFinding = (category: string, titleIncludes?: string) =>
    findings.some((f) => f.category === category && (!titleIncludes || f.title.toLowerCase().includes(titleIncludes.toLowerCase())));

  const bodyText = findings.map((f) => `${f.title} ${f.message}`).join(' ').toLowerCase();

  if (hasFinding('form', 'password') || bodyText.includes('forgot password') || bodyText.includes('reset password')) {
    recs.push({ templateId: 'generic.passwordResetRequest', templateName: 'Password Reset Request', confidence: 'high', reason: 'Forgot-password or reset form detected.' });
  }

  if (hasFinding('form', 'file input') || bodyText.includes('file upload')) {
    recs.push({ templateId: 'generic.fileUploadWithPreview', templateName: 'File Upload with Preview', confidence: 'high', reason: 'File input element detected on page.' });
  }

  if (hasFinding('form') && (bodyText.includes('step') || bodyText.includes('wizard') || bodyText.includes('multi-step'))) {
    recs.push({ templateId: 'generic.multiStepFormValidation', templateName: 'Multi-step Form Validation', confidence: 'high', reason: 'Multi-step form or wizard structure detected.' });
  }

  if (hasFinding('form')) {
    recs.push({ templateId: 'generic.alumniRegistration', templateName: 'Alumni Registration', confidence: 'medium', reason: 'Form(s) present. Registration template is a good starting point if users need to create accounts.' });
  }

  if (bodyText.includes('search') || bodyText.includes('table') || bodyText.includes('pagination')) {
    recs.push({ templateId: 'generic.paginationAndSearch', templateName: 'Pagination and Search', confidence: 'high', reason: 'Search or table/pagination elements detected.' });
  }

  if (hasFinding('selector', 'responsive') || bodyText.includes('mobile') || bodyText.includes('nav')) {
    recs.push({ templateId: 'generic.mobileResponsiveCheck', templateName: 'Mobile Responsive Check', confidence: 'medium', reason: 'Navigation or responsive layout elements detected. Consider testing at mobile viewport.' });
  }

  if (hasFinding('risk', 'destructive') || hasFinding('risk', 'destructive bulk')) {
    recs.push({ templateId: 'policy.destructiveActionGate', templateName: 'Destructive Action Policy Gate', confidence: 'high', reason: 'Destructive actions detected. Use policy template to validate blocking.' });
  }

  if (hasFinding('risk', 'payment')) {
    recs.push({ templateId: 'policy.paymentFlowGate', templateName: 'Payment Flow Policy Gate', confidence: 'high', reason: 'Payment-related UI detected. Use policy template to validate blocking.' });
  }

  if (hasFinding('risk', 'OAuth')) {
    recs.push({ templateId: 'policy.oauthFlowGate', templateName: 'OAuth Flow Policy Gate', confidence: 'high', reason: 'OAuth/social login detected. Use policy template to validate blocking.' });
  }

  if (hasFinding('risk', 'Email-sending')) {
    recs.push({ templateId: 'policy.externalRiskForm', templateName: 'External Risk Form — Policy Test', confidence: 'medium', reason: 'Email-sending actions detected. Consider policy gate validation.' });
  }

  if (hasFinding('selector', 'duplicate') || hasFinding('selector', 'without stable')) {
    recs.push({ templateId: 'diagnostic.brokenSelector', templateName: 'Broken Selector Diagnostic', confidence: 'medium', reason: 'Selector issues detected. Run diagnostic to verify detector behavior.' });
  }

  for (const r of recs) {
    if (!seen.has(r.templateId)) {
      seen.add(r.templateId);
    }
  }

  return recs.filter((r, i, arr) => arr.findIndex((x) => x.templateId === r.templateId) === i);
}
