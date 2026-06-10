import type { IndustryPack, IndustryPackRecommendation } from './types.js';
import { BUILT_IN_PACKS } from './packs/index.js';

export const INDUSTRY_PACKS: IndustryPack[] = BUILT_IN_PACKS;

export function getIndustryPackById(id: string): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((p) => p.id === id);
}

export function listIndustryPacks(): IndustryPack[] {
  return [...INDUSTRY_PACKS];
}

export function searchIndustryPacks(query: string): IndustryPack[] {
  const q = query.toLowerCase();
  return INDUSTRY_PACKS.filter((p) =>
    p.id.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.appCategory.toLowerCase().includes(q) ||
    p.targetUsers.some((u) => u.toLowerCase().includes(q)),
  );
}

export function recommendIndustryPacks(
  scanResult?: {
    findings?: Array<{ category: string; title: string; severity: string }>;
    score?: { overall: number };
    url?: string;
    selectorFindings?: Array<{ category: string; title: string }>;
    accessibilityFindings?: Array<{ category: string; title: string }>;
    formFindings?: Array<{ category: string; title: string }>;
    riskFindings?: Array<{ category: string; title: string }>;
    externalAssetFindings?: Array<{ category: string; title: string }>;
  },
): IndustryPackRecommendation[] {
  const recommendations: IndustryPackRecommendation[] = [];
  const indicators: string[] = [];

  const riskTitles = scanResult?.riskFindings?.map((f) => f.title) ?? [];
  const formTitles = scanResult?.formFindings?.map((f) => f.title) ?? [];
  const a11yTitles = scanResult?.accessibilityFindings?.map((f) => f.title) ?? [];
  const selectorTitles = scanResult?.selectorFindings?.map((f) => f.title) ?? [];

  // Ecommerce indicators
  if (
    riskTitles.some((t) => t.includes('Payment')) ||
    riskTitles.some((t) => t.includes('Card')) ||
    formTitles.some((t) => t.includes('payment')) ||
    scanResult?.url?.includes('shop') ||
    scanResult?.url?.includes('store')
  ) {
    indicators.push('payment-related elements detected');
    recommendations.push({
      packId: 'ecommerce-checkout-safe',
      packName: 'Ecommerce / Checkout (Safe Mode)',
      confidence: 0.85,
      reason: 'Payment fields, checkout buttons, or ecommerce keywords detected in scan.',
      matchedIndicators: [...indicators],
    });
  }

  // Healthcare indicators
  if (
    riskTitles.some((t) => t.includes('patient')) ||
    riskTitles.some((t) => t.includes('appointment')) ||
    formTitles.some((t) => t.includes('appointment')) ||
    scanResult?.url?.includes('health') ||
    scanResult?.url?.includes('clinic') ||
    scanResult?.url?.includes('patient')
  ) {
    indicators.push('healthcare/appointment keywords detected');
    recommendations.push({
      packId: 'healthcare-appointment-safe',
      packName: 'Healthcare / Appointment (Safe Mode)',
      confidence: 0.8,
      reason: 'Appointment forms, patient-related keywords, or healthcare URLs detected.',
      matchedIndicators: [...indicators],
    });
  }

  // Education / Alumni indicators
  if (
    formTitles.some((t) => t.includes('File input')) ||
    selectorTitles.some((t) => t.includes('profile')) ||
    a11yTitles.some((t) => t.includes('form')) ||
    scanResult?.url?.includes('alumni') ||
    scanResult?.url?.includes('student') ||
    scanResult?.url?.includes('register')
  ) {
    indicators.push('registration/profile/file-upload elements detected');
    recommendations.push({
      packId: 'education-alumni',
      packName: 'Education / Alumni Portal',
      confidence: 0.75,
      reason: 'Registration forms, file uploads, or profile-related selectors detected.',
      matchedIndicators: [...indicators],
    });
  }

  // SaaS Admin indicators
  if (
    riskTitles.some((t) => t.includes('Destructive')) ||
    riskTitles.some((t) => t.includes('delete')) ||
    selectorTitles.some((t) => t.includes('table')) ||
    formTitles.some((t) => t.includes('form')) ||
    scanResult?.url?.includes('admin') ||
    scanResult?.url?.includes('dashboard')
  ) {
    indicators.push('admin/dashboard/destructive elements detected');
    recommendations.push({
      packId: 'generic-saas-admin',
      packName: 'Generic SaaS Admin Dashboard',
      confidence: 0.7,
      reason: 'Admin keywords, destructive actions, or dashboard-like selectors detected.',
      matchedIndicators: [...indicators],
    });
  }

  // Content / Marketing indicators
  if (
    a11yTitles.some((t) => t.includes('Images missing alt')) ||
    scanResult?.externalAssetFindings && scanResult.externalAssetFindings.length > 0 ||
    scanResult?.url?.includes('blog') ||
    scanResult?.url?.includes('landing') ||
    scanResult?.url?.includes('marketing')
  ) {
    indicators.push('media/external assets or marketing keywords detected');
    recommendations.push({
      packId: 'content-marketing-site',
      packName: 'Content / Marketing / Public Site',
      confidence: 0.65,
      reason: 'Media elements, external assets, or marketing-style URLs detected.',
      matchedIndicators: [...indicators],
    });
  }

  // If no specific indicators, suggest content-marketing as lowest-risk fallback
  if (recommendations.length === 0) {
    recommendations.push({
      packId: 'content-marketing-site',
      packName: 'Content / Marketing / Public Site',
      confidence: 0.4,
      reason: 'No strong industry indicators detected. Defaulting to lowest-risk content site pack.',
      matchedIndicators: ['no specific industry indicators'],
    });
  }

  // Sort by confidence descending
  recommendations.sort((a, b) => b.confidence - a.confidence);

  return recommendations;
}

export function getPackTemplateIds(pack: IndustryPack): string[] {
  const ids = new Set<string>();
  for (const t of pack.recommendedTemplates) ids.add(t.templateId);
  for (const t of pack.optionalTemplates) ids.add(t.templateId);
  return Array.from(ids);
}
