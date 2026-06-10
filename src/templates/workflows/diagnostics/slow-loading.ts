import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.slowLoading',
  name: 'Diagnostic: Slow Loading',
  description: 'Intentionally asserts on content that appears after a delay to trigger slow-loading pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'slow-loading', 'timeout', 'wait'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/slow-loading'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic slow loading',
    'diagnostic timeout',
    'diynamic content loaded after assertion',
  ],
  matchers: [
    'slow loading',
    'timeout',
    'dynamic content',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/slow-loading',
  requiredFixtureTestIds: ['[data-testid="slow-loading-content"]'],
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
      description: 'Navigate to slow loading diagnostic page',
      action: 'navigate',
      target: '/diagnostics/slow-loading',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Immediately assert on content that appears after 3s delay',
      action: 'assertVisible',
      target: '[data-testid="delayed-content"]',
      screenshot: true,
      continueOnFailure: true,
    },
  ],
};

export default template;
