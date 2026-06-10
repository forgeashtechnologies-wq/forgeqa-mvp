import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.duplicateTestId',
  name: 'Diagnostic: Duplicate Test ID',
  description: 'Navigates to a page with duplicate data-testid values to trigger strict-mode and duplicate ID pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'duplicate', 'testid', 'strict-mode'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/duplicate-testid'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic duplicate test id',
    'diagnostic duplicate testid',
    'diagnostic strict mode',
  ],
  matchers: [
    'duplicate testid',
    'duplicate id',
    'strict mode',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/duplicate-testid',
  requiredFixtureTestIds: ['[data-testid="duplicate-target"]'],
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
      description: 'Navigate to duplicate testid diagnostic page',
      action: 'navigate',
      target: '/diagnostics/duplicate-testid',
      screenshot: true,
    },
    {
      order: 1,
      description: 'Click one of the duplicate testid elements',
      action: 'click',
      target: '[data-testid="card-item"]',
      screenshot: true,
    },
  ],
};

export default template;
