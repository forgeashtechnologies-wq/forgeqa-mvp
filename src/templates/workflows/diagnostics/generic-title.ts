import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.genericTitle',
  name: 'Diagnostic: Generic Title',
  description: 'Navigates to a page with a generic document title to trigger page-title quality pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'title', 'page-title', 'seo'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/generic-title'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic generic title',
    'diagnostic page title',
    'diagnostic untitled',
  ],
  matchers: [
    'generic title',
    'page title',
    'untitled',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/generic-title',
  requiredFixtureTestIds: ['[data-testid="generic-title-page"]'],
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
      description: 'Navigate to generic title diagnostic page',
      action: 'navigate',
      target: '/diagnostics/generic-title',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Verify page is visible',
      action: 'assertVisible',
      target: 'body',
      screenshot: true,
    },
  ],
};

export default template;
