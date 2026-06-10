import type { IndustryPack } from './types.js';
import { listTemplates, listDiagnosticTemplates, listPolicyTemplates } from '../templates/registry.js';

export interface IndustryPackValidationResult {
  valid: boolean;
  packId: string;
  errors: string[];
  warnings: string[];
}

export function validateIndustryPack(pack: IndustryPack): IndustryPackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const templateIds = new Set([
    ...listTemplates().map((t) => t.id),
    ...listDiagnosticTemplates().map((t) => t.id),
    ...listPolicyTemplates().map((t) => t.id),
  ]);

  // Unique pack IDs across built-in packs
  // (checked at registry level, not per-pack)

  // Referenced template IDs must exist
  for (const t of pack.recommendedTemplates) {
    if (!templateIds.has(t.templateId)) {
      errors.push(`Recommended template "${t.templateId}" does not exist in template registry.`);
    }
  }
  for (const t of pack.optionalTemplates) {
    if (!templateIds.has(t.templateId)) {
      errors.push(`Optional template "${t.templateId}" does not exist in template registry.`);
    }
  }
  for (const id of pack.blockedTemplates) {
    if (!templateIds.has(id)) {
      warnings.push(`Blocked template "${id}" does not exist in template registry.`);
    }
  }

  // Required scope items non-empty
  if (pack.requiredScopeItems.length === 0) {
    errors.push('Pack must define at least one required scope item.');
  }

  // Readiness criteria non-empty
  if (pack.readinessCriteria.length === 0) {
    errors.push('Pack must define at least one readiness criterion.');
  }

  // Caveats present
  if (pack.caveats.length === 0) {
    errors.push('Pack must include at least one caveat.');
  }

  // References present
  if (pack.references.length === 0) {
    errors.push('Pack must include at least one reference.');
  }

  // No compliance certification claims
  const complianceKeywords = ['compliant', 'compliance', 'certified', 'certification', 'legal', 'regulatory', 'gdpr', 'hipaa', 'pci', 'ferpa', 'soc2'];
  const packText = `${pack.description} ${pack.caveats.join(' ')} ${pack.name}`;
  const caveatText = pack.caveats.join(' ').toLowerCase();
  for (const kw of complianceKeywords) {
    if (packText.toLowerCase().includes(kw)) {
      // Allow if caveats properly disclaim the keyword
      const caveatHasKeyword = caveatText.includes(kw);
      const caveatDisclaims = caveatText.includes('not') && caveatText.includes('certification');
      if (!caveatHasKeyword || !caveatDisclaims) {
        errors.push(`Pack must not claim ${kw} compliance/certification. Use caveats to clarify this is readiness guidance only.`);
      }
    }
  }

  // Ecommerce pack must block real payment
  if (pack.id === 'ecommerce-checkout-safe') {
    const hasPaymentBlock = pack.policyFocus.some((f) => f.toLowerCase().includes('payment'));
    const hasPaymentNotTested = pack.notTestedWarnings.some((w) => w.toLowerCase().includes('payment'));
    if (!hasPaymentBlock) {
      errors.push('Ecommerce pack must include policy focus blocking real payment.');
    }
    if (!hasPaymentNotTested) {
      errors.push('Ecommerce pack must include not-tested warning for real payment execution.');
    }
  }

  // Healthcare pack must warn against PHI
  if (pack.id === 'healthcare-appointment-safe') {
    const hasPhiWarning = pack.notTestedWarnings.some((w) => w.toLowerCase().includes('phi')) ||
      pack.dataSafetyFocus.some((f) => f.toLowerCase().includes('phi')) ||
      pack.caveats.some((c) => c.toLowerCase().includes('hipaa'));
    if (!hasPhiWarning) {
      errors.push('Healthcare pack must include PHI warning or HIPAA caveat.');
    }
  }

  // All packs must include not-tested warnings
  if (pack.notTestedWarnings.length === 0) {
    errors.push('Pack must include at least one not-tested warning.');
  }

  return {
    valid: errors.length === 0,
    packId: pack.id,
    errors,
    warnings,
  };
}

export function validateAllIndustryPacks(packs: IndustryPack[]): {
  valid: boolean;
  results: IndustryPackValidationResult[];
} {
  const results: IndustryPackValidationResult[] = [];
  const seenIds = new Set<string>();

  for (const pack of packs) {
    const result = validateIndustryPack(pack);
    if (seenIds.has(pack.id)) {
      result.errors.push(`Duplicate pack ID: ${pack.id}`);
      result.valid = false;
    }
    seenIds.add(pack.id);
    results.push(result);
  }

  const valid = results.every((r) => r.valid);
  return { valid, results };
}
