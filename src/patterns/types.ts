export interface AntiPatternV2 {
  id: string;
  title: string;
  category: string;
  severity: 'error' | 'warning' | 'info';

  symptom: string;
  detectionSignals: string[];
  commonErrorMessages: string[];

  rootCause: string;
  howToConfirm: string;
  safeFix: string;
  preventionRule: string;

  regressionTest: string;

  sourceType: 'official_docs' | 'research_paper' | 'major_project_github_issue' | 'popular_public_repo' | 'blog_post' | 'forum';
  sourceUrl: string;
  sourceConfidence: 'high' | 'medium' | 'low';

  appliesTo: {
    engines: ('playwright' | 'cypress' | 'selenium' | 'testing-library' | 'generic')[];
    ciEnvironments: ('local' | 'github-actions' | 'docker' | 'generic')[];
  };

  relatedPatterns: string[];
}

export type AntiPattern = AntiPatternV2 & {
  description: string;
  mitigation: string;
};

export interface PatternFinding {
  patternId: string;
  message: string;
  stepId?: string;
  severity: 'error' | 'warning' | 'info';

  // Enriched v2 fields
  title?: string;
  category?: string;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string;
  rootCause?: string;
  howToConfirm?: string;
  safeFix?: string;
  preventionRule?: string;
  regressionTest?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceConfidence?: 'high' | 'medium' | 'low';
  relatedPatterns?: string[];
}

export interface PatternAnalysis {
  findings: PatternFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  impact?: ReadinessImpact;
}

export interface ReadinessImpact {
  verdict: 'not_ready' | 'conditionally_ready' | 'ready_with_warnings' | 'no_impact';
  reason: string;
}

export function normalizePattern(pattern: AntiPatternV2): AntiPattern {
  return {
    ...pattern,
    description: pattern.symptom,
    mitigation: pattern.safeFix,
  };
}
