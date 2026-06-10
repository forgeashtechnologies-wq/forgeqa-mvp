import { describe, it, expect } from 'vitest';
import { assessIndustryReadiness, generateIndustryAssessmentMarkdown, generateIndustryAssessmentJson } from './assessor.js';
import { getIndustryPackById } from './registry.js';
import type { AppTestabilityScan } from '../scanner/types.js';

describe('Industry Pack Assessor', () => {
  const mockScan: AppTestabilityScan = {
    scanId: 'scan_001',
    targetUrl: 'https://forgeqa.test',
    mode: 'demo',
    createdAt: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
    status: 'pass',
    score: {
      overall: 85,
      selectorScore: 90,
      accessibilityScore: 80,
      formScore: 85,
      riskScore: 95,
      routeScore: 100,
      evidenceScore: 85,
    },
    summary: {
      totalFindings: 2,
      infoCount: 2,
      warningCount: 0,
      errorCount: 0,
      criticalCount: 0,
      selectorCount: 0,
      accessibilityCount: 0,
      formCount: 0,
      riskCount: 0,
      externalAssetCount: 0,
      testabilityCount: 1,
    },
    findings: [],
    routeFindings: [],
    selectorFindings: [],
    accessibilityFindings: [],
    formFindings: [],
    riskFindings: [],
    mediaFindings: [],
    externalAssetFindings: [],
    recommendations: ['Looks good'],
    artifacts: { scanResultJson: '', scanReportMd: '' },
  };

  it('assesses education pack with passing scan', () => {
    const pack = getIndustryPackById('education-alumni')!;
    const assessment = assessIndustryReadiness(pack, { scan: mockScan });
    expect(assessment.packId).toBe('education-alumni');
    expect(assessment.status).toBe('ready_with_warnings');
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
    expect(assessment.disclaimer).toContain('not legal');
  });

  it('assesses ecommerce pack with payment risk finding', () => {
    const pack = getIndustryPackById('ecommerce-checkout-safe')!;
    const scanWithPayment: AppTestabilityScan = {
      ...mockScan,
      score: { ...mockScan.score, overall: 60 },
      riskFindings: [
        { id: 'r1', category: 'risk', severity: 'error', title: 'Payment action detected', message: 'Payment found', confidence: 'high', suggestedFix: 'Remove payment from tests' },
      ],
    };
    const assessment = assessIndustryReadiness(pack, { scan: scanWithPayment });
    expect(assessment.packId).toBe('ecommerce-checkout-safe');
    expect(assessment.status).toBe('not_ready');
  });

  it('assesses healthcare pack and flags PHI risk', () => {
    const pack = getIndustryPackById('healthcare-appointment-safe')!;
    const assessment = assessIndustryReadiness(pack, { scan: mockScan });
    expect(assessment.packId).toBe('healthcare-appointment-safe');
    expect(assessment.caveats.some((c) => c.includes('HIPAA'))).toBe(true);
  });

  it('downgrades status for critical scan finding', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const scanWithCritical: AppTestabilityScan = {
      ...mockScan,
      findings: [
        { id: 'f1', category: 'selector', severity: 'critical', title: 'No selectors', message: 'Bad', confidence: 'high', suggestedFix: 'Add data-testid' },
      ],
    };
    const assessment = assessIndustryReadiness(pack, { scan: scanWithCritical });
    expect(assessment.status).toBe('not_ready');
  });

  it('never uses "certified" or "compliant" in status', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const assessment = assessIndustryReadiness(pack, { scan: mockScan });
    const allText = JSON.stringify(assessment).toLowerCase();
    expect(allText).not.toContain('certified');
    expect(allText).not.toContain('compliant');
  });

  it('generates markdown report', () => {
    const pack = getIndustryPackById('content-marketing-site')!;
    const assessment = assessIndustryReadiness(pack, { scan: mockScan });
    const md = generateIndustryAssessmentMarkdown(assessment);
    expect(md).toContain('Industry Readiness Pack');
    expect(md).toContain(pack.name);
    expect(md).toContain(assessment.status);
    expect(md).toContain(assessment.disclaimer);
  });

  it('generates valid JSON report', () => {
    const pack = getIndustryPackById('content-marketing-site')!;
    const assessment = assessIndustryReadiness(pack, { scan: mockScan });
    const json = generateIndustryAssessmentJson(assessment);
    const parsed = JSON.parse(json);
    expect(parsed.packId).toBe('content-marketing-site');
    expect(parsed.status).toBeDefined();
    expect(parsed.score).toBeDefined();
  });

  it('policy blocked payment is marked blocked_by_policy not failure', () => {
    const pack = getIndustryPackById('ecommerce-checkout-safe')!;
    const assessment = assessIndustryReadiness(pack, {
      scan: mockScan,
      policyFindings: [
        { patternId: 'payment_blocked', message: 'Payment blocked by policy', severity: 'info' },
      ],
    });
    expect(assessment.blockedByPolicyItems.some((b) => b.label === 'payment_blocked')).toBe(true);
  });
});
