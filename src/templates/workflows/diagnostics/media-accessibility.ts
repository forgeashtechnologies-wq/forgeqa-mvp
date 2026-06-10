import type { WorkflowTemplate } from '../../types.js';

const template: WorkflowTemplate = {
  id: 'diagnostic.mediaAccessibility',
  name: 'Diagnostic: Media Accessibility',
  description: 'Navigates to a page with missing alt text on images to trigger media accessibility pattern detection.',
  category: 'diagnostic',
  difficulty: 'medium',
  estimatedDurationSeconds: 15,
  requiredData: 'none',
  tags: ['diagnostic', 'accessibility', 'image', 'alt-text'],
  roles: ['user'],
  supportedModes: ['demo'],
  allowExternalSubmit: false,
  allowExternalUpload: false,
  demoRoutes: ['/diagnostics/media-accessibility'],
  riskLevel: 'low',
  requiresAuth: false,
  requiresNetwork: false,
  requiresFileUpload: false,
  destructiveAction: false,
  expectedArtifacts: ['plan.json', 'data.json', 'run.json', 'screenshots/', 'trace.zip', 'report.md', 'report.html', 'cleanup-report.md'],
  promptMatchers: [
    'diagnostic media accessibility',
    'diagnostic alt text',
    'diagnostic image accessibility',
  ],
  matchers: [
    'media accessibility',
    'alt text',
    'image accessibility',
  ],
  baseUrl: 'https://forgeqa.test',

  fixtureRoute: '/diagnostics/media-accessibility',
  requiredFixtureTestIds: ['[data-testid="media-accessibility-page"]'],
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
      description: 'Navigate to media accessibility diagnostic page',
      action: 'navigate',
      target: '/diagnostics/media-accessibility',
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
