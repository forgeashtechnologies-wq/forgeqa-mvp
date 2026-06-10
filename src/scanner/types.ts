export type ScannerSeverity = 'info' | 'warning' | 'error' | 'critical';

export type ScannerCategory =
  | 'selector'
  | 'accessibility'
  | 'form'
  | 'route'
  | 'risk'
  | 'media'
  | 'external_asset'
  | 'testability';

export interface ScannerFinding {
  id: string;
  category: ScannerCategory;
  severity: ScannerSeverity;
  title: string;
  message: string;
  evidence?: string;
  selectorHint?: string;
  affectedElement?: string;
  suggestedFix: string;
  relatedPatternId?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface TestabilityScore {
  overall: number;
  selectorScore: number;
  accessibilityScore: number;
  formScore: number;
  riskScore: number;
  routeScore: number;
  evidenceScore: number;
}

export interface AppTestabilityScan {
  scanId: string;
  createdAt: string;
  mode: 'demo' | 'external';
  targetUrl: string;
  baseUrl?: string;
  templateId?: string;
  viewport: {
    profile?: string;
    width: number;
    height: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    deviceScaleFactor?: number;
  };
  status: 'pass' | 'warn' | 'fail' | 'needs_human_review';
  score: TestabilityScore;
  summary: {
    totalFindings: number;
    infoCount: number;
    warningCount: number;
    errorCount: number;
    criticalCount: number;
    selectorCount: number;
    accessibilityCount: number;
    formCount: number;
    riskCount: number;
    externalAssetCount: number;
    testabilityCount: number;
  };
  findings: ScannerFinding[];
  routeFindings: ScannerFinding[];
  selectorFindings: ScannerFinding[];
  accessibilityFindings: ScannerFinding[];
  formFindings: ScannerFinding[];
  riskFindings: ScannerFinding[];
  mediaFindings: ScannerFinding[];
  externalAssetFindings: ScannerFinding[];
  recommendations: string[];
  suggestedTemplates?: {
    templateId: string;
    templateName: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  }[];
  artifacts: {
    scanResultJson: string;
    scanReportMd: string;
    scanReportHtml?: string;
    scanScreenshot?: string;
  };
}

export interface ScanContext {
  mode: 'demo' | 'external';
  baseUrl?: string;
  route?: string;
  viewport?: string;
  templateId?: string;
  isMobile?: boolean;
  strictPolicy?: boolean;
}
