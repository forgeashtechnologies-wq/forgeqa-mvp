import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.missingLabel',
  name: 'Diagnostic: Missing Label',
  description: 'Navigates to a page with unlabeled interactive elements to trigger accessibility pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'accessibility', 'label', 'aria'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/missing-label'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic missing label',
    'diagnostic aria label',
    'diagnostic accessibility',
  ],
  matchers: [
    'missing label',
    'aria label',
    'accessibility',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/missing-label',
  requiredFixtureTestIds: ['[data-testid="missing-label-input"]'],
  expectedMissingSelectors: true,
  fixtureValidationMode: 'diagnostic' as const,
  scopeCovered: ['Detector behavior under known bad conditions', 'Pattern finding generation', 'Error classification accuracy'],
  scopeNotCovered: ['Production site behavior', 'Real user flows', 'Performance benchmarking', 'Cross-browser compatibility'],
  scopeAssumptions: ['Diagnostic fixture contains known defects by design'],
  scopeBoundaries: ['Local demo fixture only', 'Detector validation only'],
  humanReviewRecommended: ['Detector sensitivity tuning'],

  steps: [
    {
      order: 0,
      description: 'Navigate to missing label diagnostic page',
      action: 'navigate',
      target: '/diagnostics/missing-label',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Fill unlabeled input to trigger DOM analysis',
      action: 'fill',
      target: '[data-testid="unlabeled-input"]',
      value: 'test',
      screenshot: true,
    },
    {
      order: 2,
      description: 'Click empty button',
      action: 'click',
      target: '[data-testid="empty-btn"]',
      screenshot: true,
    },
  ],
};

export default template;
