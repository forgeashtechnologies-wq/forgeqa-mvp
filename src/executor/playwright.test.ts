import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execute } from './playwright.js';
import { finalizeRunManifest } from '../artifacts/manager.js';
import { startIsolatedDemoServer } from '../demo/server.js';
import type { WorkflowPlan, GoldenDataSet } from '../schemas/core.js';
import type { ExecutionPolicyContext } from '../policy/execution-policy.js';
import { evaluateWorkflowPolicy } from '../policy/execution-policy.js';
import { assertBrowserReadyForTests } from './browser-preflight.js';

const TEST_RUN_ID = 'executor_test_run_001';
const ARTIFACTS_ROOT = path.resolve(process.cwd(), 'artifacts', 'runs');

beforeAll(async () => {
  await assertBrowserReadyForTests();
});

function cleanup(runId: string) {
  const dir = path.join(ARTIFACTS_ROOT, runId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createMockPlan(): WorkflowPlan {
  return {
    runId: TEST_RUN_ID,
    templateId: 'test.template',
    templateName: 'Test Template',
    description: 'Test plan',
    steps: [
      {
        id: 's0',
        order: 0,
        description: 'Navigate',
        action: 'navigate',
        target: '/register/alumni',
        screenshot: true,
        continueOnFailure: false,
      },
      {
        id: 's1',
        order: 1,
        description: 'Fill email',
        action: 'fill',
        target: '[data-testid="email-input"]',
        screenshot: false,
        continueOnFailure: false,
      },
      {
        id: 's2',
        order: 2,
        description: 'Fill password',
        action: 'fill',
        target: '[data-testid="password-input"]',
        screenshot: false,
        continueOnFailure: false,
      },
      {
        id: 's3',
        order: 3,
        description: 'Fill name',
        action: 'fill',
        target: '[data-testid="full-name-input"]',
        screenshot: false,
        continueOnFailure: false,
      },
      {
        id: 's4',
        order: 4,
        description: 'Click submit',
        action: 'click',
        target: '[data-testid="register-submit"]',
        screenshot: true,
        continueOnFailure: false,
      },
      {
        id: 's5',
        order: 5,
        description: 'Wait',
        action: 'wait',
        value: '500',
        screenshot: false,
        continueOnFailure: false,
      },
      {
        id: 's6',
        order: 6,
        description: 'Assert profile page',
        action: 'assertVisible',
        target: '[data-testid="profile-page"]',
        screenshot: true,
        continueOnFailure: false,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function createMockData(): GoldenDataSet {
  return {
    runId: TEST_RUN_ID,
    e2eRunId: 'e2e_001',
    createdByForgeQA: true,
    safeToDelete: true,
    generatedAt: new Date().toISOString(),
    users: [
      {
        runId: TEST_RUN_ID,
        e2eRunId: 'e2e_001',
        createdByForgeQA: true,
        safeToDelete: true,
        email: 'fq_test@forgeqa.test',
        username: 'fq_testuser',
        displayName: 'Test User',
        password: 'Fq_SecurePass123!',
        role: 'alumni',
      },
    ],
    files: [],
  };
}

describe('Playwright Executor', () => {
  beforeEach(() => cleanup(TEST_RUN_ID));
  afterEach(() => cleanup(TEST_RUN_ID));

  it('loads demo fixture and executes steps', async () => {
    const handle = await startIsolatedDemoServer();
    const plan = createMockPlan();
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const result = await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    expect(result.status).toBe('completed');
    expect(result.steps.length).toBe(plan.steps.length);
    expect(result.steps.every((s: { status: string }) => s.status === 'passed')).toBe(true);
  });

  it('creates screenshots directory with PNG files', async () => {
    const handle = await startIsolatedDemoServer();
    const plan = createMockPlan();
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    const screenshotsDir = path.join(artifactsDir, 'screenshots');
    const files = fs.readdirSync(screenshotsDir);
    const pngs = files.filter((f) => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThan(0);
  });

  it('creates trace.zip when browser launches', async () => {
    const handle = await startIsolatedDemoServer();
    const plan = createMockPlan();
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    expect(fs.existsSync(path.join(artifactsDir, 'trace.zip'))).toBe(true);
  });

  it('rejects external URL in demo mode', async () => {
    const handle = await startIsolatedDemoServer();
    const plan: WorkflowPlan = {
      ...createMockPlan(),
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate to external',
          action: 'navigate',
          target: 'https://example.com',
          screenshot: false,
          continueOnFailure: false,
        },
      ],
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const result = await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    expect(result.status).toBe('failed');
    const failedStep = result.steps.find((s: { stepId: string }) => s.stepId === 's0');
    expect(failedStep?.status).toBe('failed');
    expect(failedStep?.error).toContain('Demo mode blocked external URL');
  });

  it('handles selector failure safely and continues', async () => {
    const handle = await startIsolatedDemoServer();
    const plan: WorkflowPlan = {
      ...createMockPlan(),
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate',
          action: 'navigate',
          target: '/register/alumni',
          screenshot: true,
          continueOnFailure: false,
        },
        {
          id: 's1',
          order: 1,
          description: 'Click non-existent',
          action: 'click',
          target: '[data-testid="does-not-exist"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's2',
          order: 2,
          description: 'Assert visible after failure',
          action: 'assertVisible',
          target: '[data-testid="registration-form"]',
          screenshot: true,
          continueOnFailure: false,
        },
      ],
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const result = await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('passed');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[2].status).toBe('passed');
  }, 30000);

  it('stops run and skips remaining steps when continueOnFailure is false', async () => {
    const handle = await startIsolatedDemoServer();
    const plan: WorkflowPlan = {
      ...createMockPlan(),
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate',
          action: 'navigate',
          target: '/register/alumni',
          screenshot: true,
          continueOnFailure: false,
        },
        {
          id: 's1',
          order: 1,
          description: 'Click non-existent',
          action: 'click',
          target: '[data-testid="does-not-exist"]',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's2',
          order: 2,
          description: 'Assert visible after failure',
          action: 'assertVisible',
          target: '[data-testid="registration-form"]',
          screenshot: true,
          continueOnFailure: false,
        },
      ],
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const result = await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    await handle.stop();

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('passed');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[2].status).toBe('skipped');
  }, 30000);

  it('finalizes run.json with step results', async () => {
    const handle = await startIsolatedDemoServer();
    const plan = createMockPlan();
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const result = await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });
    finalizeRunManifest(result, TEST_RUN_ID);
    await handle.stop();

    const runJsonPath = path.join(artifactsDir, 'run.json');
    expect(fs.existsSync(runJsonPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
    expect(manifest.steps.length).toBe(plan.steps.length);
    expect(manifest.isFinalized).toBe(true);
    expect(manifest.completedAt).toBeDefined();
  });

  it('does not stop injected demo server after execution', async () => {
    const handle = await startIsolatedDemoServer();
    const plan = createMockPlan();
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });

    expect(handle.isRunning()).toBe(true);
    await handle.stop();
  });

  it('does not stop injected demo server after failure', async () => {
    const handle = await startIsolatedDemoServer();
    const plan: WorkflowPlan = {
      ...createMockPlan(),
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate to external',
          action: 'navigate',
          target: 'https://example.com',
          screenshot: false,
          continueOnFailure: false,
        },
      ],
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    await execute({ plan, data, runId: TEST_RUN_ID, demo: true, demoBaseUrl: handle.baseUrl, artifactsDir });

    expect(handle.isRunning()).toBe(true);
    await handle.stop();
  });

  // External-mode regression tests
  it('runs in external mode against local demo server and records policy decisions', async () => {
    const handle = await startIsolatedDemoServer();
    const baseUrl = handle.baseUrl;

    const plan: WorkflowPlan = {
      runId: TEST_RUN_ID,
      templateId: 'policy.externalRiskForm',
      templateName: 'External Risk Form',
      description: 'Policy test',
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate to external risk form',
          action: 'navigate',
          target: '/policy/external-risk-form',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's1',
          order: 1,
          description: 'Fill search input',
          action: 'fill',
          target: '[data-testid="search-input"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's2',
          order: 2,
          description: 'Click safe action button',
          action: 'click',
          target: '[data-testid="safe-btn"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's3',
          order: 3,
          description: 'Click submit registration',
          action: 'click',
          target: '[data-testid="submit-btn"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's4',
          order: 4,
          description: 'Click delete user',
          action: 'click',
          target: '[data-testid="delete-btn"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's5',
          order: 5,
          description: 'Assert status box',
          action: 'assertText',
          target: '[data-testid="status-box"]',
          value: 'Status:',
          screenshot: false,
          continueOnFailure: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const policyContext: ExecutionPolicyContext = {
      mode: 'external',
      strictPolicy: false,
      allowSubmit: false,
      allowUpload: false,
      template: {
        id: 'policy.externalRiskForm',
        name: 'External Risk Form',
        description: 'Policy test',
        category: 'policy',
        difficulty: 'easy',
        estimatedDurationSeconds: 45,
        requiredData: 'none',
        tags: [],
        roles: [],
        supportedModes: ['demo', 'external'],
        demoRoutes: ['/policy/external-risk-form'],
        riskLevel: 'medium',
        requiresAuth: false,
        requiresNetwork: false,
        requiresFileUpload: false,
        destructiveAction: false,
        expectedArtifacts: [],
        promptMatchers: [],
        matchers: [],
        baseUrl,
        steps: [],
        allowExternalSubmit: true,
        allowExternalUpload: false,
      },
      baseUrl,
    };
    const policyDecision = evaluateWorkflowPolicy(plan, policyContext);

    const result = await execute({
      plan,
      data,
      runId: TEST_RUN_ID,
      demo: false,
      external: true,
      baseUrl,
      artifactsDir,
      policyContext,
      policyDecision,
    });
    await handle.stop();

    // Navigate and safe actions should pass
    expect(result.steps[0].status).toBe('passed'); // navigate
    expect(result.steps[1].status).toBe('passed'); // fill search (caution but allowed)
    expect(result.steps[2].status).toBe('passed'); // click safe button

    // Submit should be blocked by policy because allowSubmit=false
    expect(result.steps[3].status).toBe('failed');
    expect(result.steps[3].error).toContain('POLICY_BLOCKED');

    // Delete should be hard-blocked
    expect(result.steps[4].status).toBe('failed');
    expect(result.steps[4].error).toContain('POLICY_BLOCKED');

    // Assert should still run
    expect(result.steps[5].status).toBe('passed');

    // Policy decisions should be in manifest
    expect(result.policyDecisions).toBeDefined();
    expect(result.policyDecisions!.length).toBe(plan.steps.length);

    // Blocked steps should have blocked risk level
    const submitDecision = result.policyDecisions!.find((d) => d.stepId === 's3');
    expect(submitDecision).toBeDefined();
    expect(submitDecision!.riskLevel).toBe('blocked');

    const deleteDecision = result.policyDecisions!.find((d) => d.stepId === 's4');
    expect(deleteDecision).toBeDefined();
    expect(deleteDecision!.riskLevel).toBe('blocked');
  }, 30000);

  it('external mode hard-blocks payment, email, and credential actions', async () => {
    const handle = await startIsolatedDemoServer();
    const baseUrl = handle.baseUrl;

    const plan: WorkflowPlan = {
      runId: TEST_RUN_ID,
      templateId: 'policy.externalRiskForm',
      templateName: 'External Risk Form',
      description: 'Policy test',
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate',
          action: 'navigate',
          target: '/policy/external-risk-form',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's1',
          order: 1,
          description: 'Click checkout',
          action: 'click',
          target: '[data-testid="pay-btn"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's2',
          order: 2,
          description: 'Click send invite',
          action: 'click',
          target: '[data-testid="send-btn"]',
          screenshot: false,
          continueOnFailure: true,
        },
        {
          id: 's3',
          order: 3,
          description: 'Fill password',
          action: 'fill',
          target: '[data-testid="password-input"]',
          screenshot: false,
          continueOnFailure: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const policyContext: ExecutionPolicyContext = {
      mode: 'external',
      strictPolicy: false,
      allowSubmit: false,
      allowUpload: false,
      template: {
        id: 'policy.externalRiskForm',
        name: 'External Risk Form',
        description: 'Policy test',
        category: 'policy',
        difficulty: 'easy',
        estimatedDurationSeconds: 45,
        requiredData: 'none',
        tags: [],
        roles: [],
        supportedModes: ['demo', 'external'],
        demoRoutes: ['/policy/external-risk-form'],
        riskLevel: 'medium',
        requiresAuth: false,
        requiresNetwork: false,
        requiresFileUpload: false,
        destructiveAction: false,
        expectedArtifacts: [],
        promptMatchers: [],
        matchers: [],
        baseUrl,
        steps: [],
        allowExternalSubmit: true,
        allowExternalUpload: false,
      },
      baseUrl,
    };
    const policyDecision = evaluateWorkflowPolicy(plan, policyContext);

    const result = await execute({
      plan,
      data,
      runId: TEST_RUN_ID,
      demo: false,
      external: true,
      baseUrl,
      artifactsDir,
      policyContext,
      policyDecision,
    });
    await handle.stop();

    // Payment blocked
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[1].error).toContain('POLICY_BLOCKED');

    // Email blocked
    expect(result.steps[2].status).toBe('failed');
    expect(result.steps[2].error).toContain('POLICY_BLOCKED');

    // Credential fill blocked
    expect(result.steps[3].status).toBe('failed');
    expect(result.steps[3].error).toContain('POLICY_BLOCKED');

    // Policy decisions should record the reason codes
    expect(result.policyDecisions).toBeDefined();
    const payDecision = result.policyDecisions!.find((d) => d.stepId === 's1');
    expect(payDecision!.reasonCode).toBe('payment_action_blocked');

    const emailDecision = result.policyDecisions!.find((d) => d.stepId === 's2');
    expect(emailDecision!.reasonCode).toBe('email_send_action_blocked');

    const credDecision = result.policyDecisions!.find((d) => d.stepId === 's3');
    expect(credDecision!.reasonCode).toBe('credential_field_blocked');
  }, 30000);

  it('allows safe external submit with allowSubmit and approveRisk against localhost', async () => {
    const handle = await startIsolatedDemoServer();
    const baseUrl = handle.baseUrl;

    const plan: WorkflowPlan = {
      runId: TEST_RUN_ID,
      templateId: 'generic.externalSafeSubmit',
      templateName: 'External Safe Submit',
      description: 'Safe external submit test',
      steps: [
        {
          id: 's0',
          order: 0,
          description: 'Navigate to external safe submit',
          action: 'navigate',
          target: '/external-safe/submit-form',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's1',
          order: 1,
          description: 'Assert page visible',
          action: 'assertVisible',
          target: '[data-testid="external-safe-page"]',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's2',
          order: 2,
          description: 'Fill search query',
          action: 'fill',
          target: '[data-testid="search-query-input"]',
          screenshot: false,
          continueOnFailure: false,
        },
        {
          id: 's3',
          order: 3,
          description: 'Click safe submit',
          action: 'click',
          target: '[data-testid="safe-submit-button"]',
          screenshot: true,
          continueOnFailure: false,
        },
        {
          id: 's4',
          order: 4,
          description: 'Assert status text',
          action: 'assertText',
          target: '[data-testid="safe-submit-status"]',
          value: 'Submitted safely for local test',
          screenshot: false,
          continueOnFailure: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    const data = createMockData();
    const artifactsDir = path.join(ARTIFACTS_ROOT, TEST_RUN_ID);
    fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true });

    const policyContext: ExecutionPolicyContext = {
      mode: 'external',
      strictPolicy: false,
      allowSubmit: true,
      allowUpload: false,
      approvedRiskReason: 'local safe submit test only',
      template: {
        id: 'generic.externalSafeSubmit',
        name: 'External Safe Submit',
        description: 'Safe external submit test',
        category: 'policy',
        difficulty: 'easy',
        estimatedDurationSeconds: 45,
        requiredData: 'none',
        tags: [],
        roles: [],
        supportedModes: ['demo', 'external'],
        demoRoutes: ['/external-safe/submit-form'],
        riskLevel: 'low',
        requiresAuth: false,
        requiresNetwork: false,
        requiresFileUpload: false,
        destructiveAction: false,
        expectedArtifacts: [],
        promptMatchers: [],
        matchers: [],
        baseUrl,
        steps: [],
        allowExternalSubmit: true,
        allowExternalUpload: false,
      },
      baseUrl,
    };
    const policyDecision = evaluateWorkflowPolicy(plan, policyContext);

    const result = await execute({
      plan,
      data,
      runId: TEST_RUN_ID,
      demo: false,
      external: true,
      baseUrl,
      artifactsDir,
      policyContext,
      policyDecision,
    });
    await handle.stop();

    // All steps should pass because submit is allowed and safe
    expect(result.steps[0].status).toBe('passed'); // navigate
    expect(result.steps[1].status).toBe('passed'); // assertVisible
    expect(result.steps[2].status).toBe('passed'); // fill
    expect(result.steps[3].status).toBe('passed'); // click submit
    expect(result.steps[4].status).toBe('passed'); // assertText

    // Submit decision should be caution (allowed)
    expect(result.policyDecisions).toBeDefined();
    const submitDecision = result.policyDecisions!.find((d) => d.stepId === 's3');
    expect(submitDecision).toBeDefined();
    expect(submitDecision!.allowed).toBe(true);
    expect(submitDecision!.riskLevel).toBe('caution');

    // No blocked steps
    expect(result.policyDecisions!.filter((d) => d.riskLevel === 'blocked').length).toBe(0);

    // Execution policy should record approved risk reason
    expect(result.executionPolicy).toBeDefined();
    expect(result.executionPolicy!.approvedRiskReason).toBe('local safe submit test only');
  }, 30000);
});
