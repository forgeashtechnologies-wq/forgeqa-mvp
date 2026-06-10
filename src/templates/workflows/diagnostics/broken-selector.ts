import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.brokenSelector',
  name: 'Diagnostic: Broken Selector',
  description: 'Intentionally uses unstable CSS selectors and missing selectors to trigger pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'selector', 'brittle', 'css-only'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/broken-selector'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic broken selector',
    'diagnostic brittle selector',
    'diagnostic css only selector',
  ],
  matchers: [
    'broken selector',
    'brittle selector',
    'css only selector',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/broken-selector',
  requiredFixtureTestIds: ['[data-testid="broken-target"]'],
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
      description: 'Navigate to broken selector diagnostic page',
      action: 'navigate',
      target: '/diagnostics/broken-selector',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Attempt to click element with missing data-testid',
      action: 'click',
      target: '[data-testid="missing-cta"]',
      screenshot: true,
      continueOnFailure: true,
    },
    {
      order: 2,
      description: 'Verify page wrapper is visible',
      action: 'assertVisible',
      target: 'body',
      screenshot: true,
    },
  ],
};

export default template;
