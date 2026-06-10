import type { WorkflowStep, WorkflowPlan } from '../schemas/core.js';
import type { WorkflowTemplate } from '../templates/types.js';

export type ExecutionMode = 'demo' | 'external' | 'dry-run-plan' | 'diagnostic';
export type ActionRiskLevel = 'safe' | 'caution' | 'blocked';

export interface StepPolicyDecision {
  allowed: boolean;
  riskLevel: ActionRiskLevel;
  reasonCode: string;
  message: string;
  stepId: string;
  stepIndex: number;
  action: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface WorkflowPolicyDecision {
  stepDecisions: StepPolicyDecision[];
  overallAllowed: boolean;
  overallRiskLevel: ActionRiskLevel;
  blockedCount: number;
  cautionCount: number;
  allowedCount: number;
}

export interface ExecutionPolicyContext {
  mode: ExecutionMode;
  strictPolicy: boolean;
  allowSubmit: boolean;
  allowUpload: boolean;
  approvedRiskReason?: string;
  template?: WorkflowTemplate;
  baseUrl?: string;
}

// Keyword lists for risk classification
const DESTRUCTIVE_KEYWORDS = [
  'delete', 'remove', 'drop', 'destroy', 'purge', 'wipe',
  'reset database', 'truncate', 'disable rls', 'revoke',
  'deactivate', 'suspend', 'archive all',
];

const PAYMENT_KEYWORDS = [
  'pay', 'checkout', 'subscribe', 'purchase', 'card',
  'stripe', 'razorpay', 'paypal', 'braintree', 'billing',
];

const AUTH_SOCIAL_KEYWORDS = [
  'google', 'facebook', 'microsoft', 'github',
  'oauth', 'sso', 'login with', 'sign in with',
];

const EMAIL_SEND_KEYWORDS = [
  'send email', 'send invite', 'invite users',
  'notify', 'broadcast', 'campaign',
];

const CREDENTIAL_KEYWORDS = [
  'password', 'api key', 'token', 'secret',
  'service_role', 'private key',
];

function textContainsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function isDestructiveSelector(selectorOrText: string): boolean {
  return textContainsKeyword(selectorOrText, DESTRUCTIVE_KEYWORDS);
}

export function isCredentialField(selectorOrLabel: string): boolean {
  return textContainsKeyword(selectorOrLabel, CREDENTIAL_KEYWORDS);
}

export function isPaymentAction(step: WorkflowStep): boolean {
  return textContainsKeyword(step.description + ' ' + (step.target ?? ''), PAYMENT_KEYWORDS);
}

export function isAuthSocialAction(step: WorkflowStep): boolean {
  return textContainsKeyword(step.description + ' ' + (step.target ?? ''), AUTH_SOCIAL_KEYWORDS);
}

export function isEmailSendAction(step: WorkflowStep): boolean {
  return textContainsKeyword(step.description + ' ' + (step.target ?? ''), EMAIL_SEND_KEYWORDS);
}

export function isSubmitAction(step: WorkflowStep): boolean {
  const combined = (step.description + ' ' + (step.target ?? '')).toLowerCase();
  return (
    step.action === 'click' &&
    (combined.includes('submit') ||
      combined.includes('register') ||
      combined.includes('signup') ||
      combined.includes('sign up') ||
      combined.includes('create account') ||
      combined.includes('apply') ||
      combined.includes('save changes') ||
      combined.includes('update profile') ||
      combined.includes('send') ||
      combined.includes('post') ||
      combined.includes('confirm'))
  );
}

export function isExternalMutationRisk(step: WorkflowStep, _context: ExecutionPolicyContext): boolean {
  if (step.action === 'fill') return true;
  if (step.action === 'click' && isSubmitAction(step)) return true;
  if (step.action === 'upload') return true;
  if (step.action === 'click' && isDestructiveSelector(step.description + ' ' + (step.target ?? ''))) return true;
  return false;
}

export function classifyActionRisk(step: WorkflowStep, context: ExecutionPolicyContext): ActionRiskLevel {
  // Diagnostic mode: safe if local diagnostic fixture only
  if (context.mode === 'diagnostic') {
    return 'safe';
  }

  // Dry-run-plan: no action execution
  if (context.mode === 'dry-run-plan') {
    return 'safe';
  }

  // Always safe actions
  if (['assertText', 'assertVisible', 'assertHidden', 'screenshot', 'wait', 'stop'].includes(step.action)) {
    return 'safe';
  }

  // Navigate: depends on URL policy
  if (step.action === 'navigate') {
    return 'safe';
  }

  // Demo mode defaults
  if (context.mode === 'demo') {
    if (step.action === 'upload') return 'safe';
    if (step.action === 'fill') return 'safe';
    if (step.action === 'click') {
      if (isDestructiveSelector(step.description + ' ' + (step.target ?? ''))) return 'blocked';
      if (isPaymentAction(step)) return 'blocked';
      if (isEmailSendAction(step)) return 'blocked';
      return 'safe';
    }
    return 'safe';
  }

  // External mode: more restrictive
  if (context.mode === 'external') {
    if (step.action === 'upload') {
      const templateAllows = context.template?.allowExternalUpload ?? false;
      if (!templateAllows) return 'blocked';
      if (!context.allowUpload) return 'blocked';
      return 'caution';
    }

    if (step.action === 'fill') {
      if (isCredentialField(step.description + ' ' + (step.target ?? ''))) return 'blocked';
      return 'caution';
    }

    if (step.action === 'click') {
      if (isDestructiveSelector(step.description + ' ' + (step.target ?? ''))) return 'blocked';
      if (isPaymentAction(step)) return 'blocked';
      if (isAuthSocialAction(step)) return 'blocked';
      if (isEmailSendAction(step)) return 'blocked';
      if (isSubmitAction(step)) {
        const templateAllows = context.template?.allowExternalSubmit ?? false;
        if (!templateAllows) return 'blocked';
        if (!context.allowSubmit) return 'blocked';
        return 'caution';
      }
      return 'caution';
    }
  }

  return 'safe';
}

export function evaluateStepPolicy(step: WorkflowStep, index: number, context: ExecutionPolicyContext): StepPolicyDecision {
  const riskLevel = classifyActionRisk(step, context);

  // Strict policy: upgrade caution to blocked
  const effectiveRisk = context.strictPolicy && riskLevel === 'caution' ? 'blocked' : riskLevel;
  const allowed = effectiveRisk !== 'blocked';

  let reasonCode = 'action_safe';
  let message = `${step.action} is safe in ${context.mode} mode.`;
  let suggestedFix: string | undefined;

  if (effectiveRisk === 'blocked') {
    if (step.action === 'upload' && context.mode === 'external') {
      const templateAllows = context.template?.allowExternalUpload ?? false;
      if (!templateAllows) {
        reasonCode = 'external_upload_blocked';
        message = `Upload blocked: template "${context.template?.id ?? 'unknown'}" does not allow external upload.`;
        suggestedFix = 'Set template.allowExternalUpload=true to enable external upload for this workflow.';
      } else {
        reasonCode = 'external_upload_blocked';
        message = `Upload blocked in external mode without --allow-upload.`;
        suggestedFix = 'Add --allow-upload --approve-risk "<reason>" only after reviewing the target URL.';
      }
    } else if (step.action === 'fill' && isCredentialField(step.description + ' ' + (step.target ?? ''))) {
      reasonCode = 'credential_field_blocked';
      message = `Credential-like field fill blocked in external mode.`;
      suggestedFix = 'Use demo mode for credential handling. Never send real credentials externally.';
    } else if (isDestructiveSelector(step.description + ' ' + (step.target ?? ''))) {
      reasonCode = 'destructive_action_blocked';
      message = `Destructive action blocked: ${step.description}`;
      suggestedFix = 'Destructive actions are never allowed. Review the workflow template.';
    } else if (isPaymentAction(step)) {
      reasonCode = 'payment_action_blocked';
      message = `Payment-related action blocked: ${step.description}`;
      suggestedFix = 'Payment flows are blocked. Use dedicated payment testing environments.';
    } else if (isAuthSocialAction(step)) {
      reasonCode = 'auth_provider_action_blocked';
      message = `OAuth/social login action blocked: ${step.description}`;
      suggestedFix = 'Social auth actions are blocked. Use mock auth or demo mode.';
    } else if (isEmailSendAction(step)) {
      reasonCode = 'email_send_action_blocked';
      message = `Email-sending action blocked: ${step.description}`;
      suggestedFix = 'Email sending is blocked. Use demo mode or mock email services.';
    } else if (step.action === 'click' && isSubmitAction(step)) {
      const templateAllows = context.template?.allowExternalSubmit ?? false;
      if (!templateAllows) {
        reasonCode = 'external_submit_requires_approval';
        message = `Submit action blocked: template "${context.template?.id ?? 'unknown'}" does not allow external submit.`;
        suggestedFix = 'Set template.allowExternalSubmit=true to enable external submit for this workflow.';
      } else {
        reasonCode = 'external_submit_requires_approval';
        message = `Submit action blocked in external mode without --allow-submit.`;
        suggestedFix = 'Add --allow-submit --approve-risk "<reason>" only after reviewing the target URL and form.';
      }
    } else if (context.strictPolicy && riskLevel === 'caution') {
      reasonCode = 'strict_policy_caution_blocked';
      message = `Caution-level action blocked due to --strict-policy: ${step.description}`;
      suggestedFix = 'Remove --strict-policy to allow caution-level actions.';
    } else {
      reasonCode = 'action_blocked_by_policy';
      message = `Action blocked by execution policy: ${step.description}`;
      suggestedFix = 'Review the workflow template and execution mode.';
    }
  } else if (effectiveRisk === 'caution') {
    if (step.action === 'click' && isSubmitAction(step)) {
      reasonCode = 'external_submit_with_approval';
      message = `Submit action allowed with caution (--allow-submit active).`;
      suggestedFix = 'Ensure the form target is a test/staging environment.';
    } else if (step.action === 'upload') {
      reasonCode = 'external_upload_with_approval';
      message = `Upload allowed with caution (--allow-upload active).`;
      suggestedFix = 'Ensure the upload target accepts ForgeQA-generated files only.';
    } else {
      reasonCode = 'external_action_caution';
      message = `${step.action} allowed with caution in external mode.`;
      suggestedFix = 'Monitor for unexpected side effects.';
    }
  }

  return {
    allowed,
    riskLevel: effectiveRisk,
    reasonCode,
    message,
    stepId: step.id,
    stepIndex: index,
    action: step.action,
    evidence: `mode=${context.mode}, action=${step.action}, target=${step.target ?? 'none'}, description=${step.description}`,
    suggestedFix,
  };
}

export function evaluateWorkflowPolicy(plan: WorkflowPlan, context: ExecutionPolicyContext): WorkflowPolicyDecision {
  const stepDecisions: StepPolicyDecision[] = [];
  let blockedCount = 0;
  let cautionCount = 0;
  let allowedCount = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    const decision = evaluateStepPolicy(plan.steps[i], i, context);
    stepDecisions.push(decision);
    if (decision.riskLevel === 'blocked') blockedCount++;
    else if (decision.riskLevel === 'caution') cautionCount++;
    else allowedCount++;
  }

  const overallAllowed = blockedCount === 0;
  const overallRiskLevel: ActionRiskLevel = blockedCount > 0 ? 'blocked' : cautionCount > 0 ? 'caution' : 'safe';

  return {
    stepDecisions,
    overallAllowed,
    overallRiskLevel,
    blockedCount,
    cautionCount,
    allowedCount,
  };
}

export interface ExecutionPolicySummary {
  mode: ExecutionMode;
  strictPolicy: boolean;
  allowSubmit: boolean;
  allowUpload: boolean;
  approvedRiskReason?: string;
  blockedCount: number;
  cautionCount: number;
  allowedCount: number;
}

export function buildExecutionPolicySummary(context: ExecutionPolicyContext, decision: WorkflowPolicyDecision): ExecutionPolicySummary {
  return {
    mode: context.mode,
    strictPolicy: context.strictPolicy,
    allowSubmit: context.allowSubmit,
    allowUpload: context.allowUpload,
    approvedRiskReason: context.approvedRiskReason,
    blockedCount: decision.blockedCount,
    cautionCount: decision.cautionCount,
    allowedCount: decision.allowedCount,
  };
}

export function generatePolicyPreviewMarkdown(
  prompt: string,
  plan: WorkflowPlan,
  context: ExecutionPolicyContext,
  decision: WorkflowPolicyDecision,
): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Execution Policy Preview');
  lines.push('');
  lines.push(`**Prompt:** ${prompt}`);
  lines.push(`**Template:** ${plan.templateName} (${plan.templateId})`);
  lines.push(`**Mode:** ${context.mode}`);
  if (context.baseUrl) {
    lines.push(`**Base URL:** ${context.baseUrl}`);
  }
  lines.push(`**Strict Policy:** ${context.strictPolicy ? 'yes' : 'no'}`);
  lines.push(`**Allow Submit:** ${context.allowSubmit ? 'yes' : 'no'}`);
  lines.push(`**Allow Upload:** ${context.allowUpload ? 'yes' : 'no'}`);
  if (context.approvedRiskReason) {
    lines.push(`**Approved Risk Reason:** ${context.approvedRiskReason}`);
  }
  if (context.template) {
    lines.push(`**Template allows external submit:** ${context.template.allowExternalSubmit ? 'yes' : 'no'}`);
    lines.push(`**Template allows external upload:** ${context.template.allowExternalUpload ? 'yes' : 'no'}`);
    const submitOverride = context.allowSubmit && !context.template.allowExternalSubmit;
    const uploadOverride = context.allowUpload && !context.template.allowExternalUpload;
    if (submitOverride) {
      lines.push(`**Override status:** --allow-submit REJECTED (template does not allow)`);
    }
    if (uploadOverride) {
      lines.push(`**Override status:** --allow-upload REJECTED (template does not allow)`);
    }
    if (!submitOverride && !uploadOverride && (context.allowSubmit || context.allowUpload)) {
      lines.push(`**Override status:** ACCEPTED`);
    }
  }
  lines.push('');

  lines.push('## Policy Summary');
  lines.push('');
  lines.push(`- **Allowed steps:** ${decision.allowedCount}`);
  lines.push(`- **Caution steps:** ${decision.cautionCount}`);
  lines.push(`- **Blocked steps:** ${decision.blockedCount}`);
  lines.push(`- **Overall verdict:** ${decision.overallRiskLevel}`);
  lines.push('');

  lines.push('## Step-by-Step Policy');
  lines.push('');
  lines.push('| # | Action | Risk | Verdict | Reason |');
  lines.push('|---|--------|------|---------|--------|');
  for (const d of decision.stepDecisions) {
    const verdict = d.allowed ? 'ALLOW' : 'BLOCK';
    const icon = d.riskLevel === 'blocked' ? '🔴' : d.riskLevel === 'caution' ? '🟡' : '🟢';
    lines.push(`| ${d.stepIndex + 1} | ${d.action} | ${icon} ${d.riskLevel} | ${verdict} | ${d.reasonCode} |`);
  }
  lines.push('');

  if (decision.blockedCount > 0) {
    lines.push('## Blocked Actions');
    lines.push('');
    for (const d of decision.stepDecisions.filter((s) => s.riskLevel === 'blocked')) {
      lines.push(`- **Step ${d.stepIndex + 1} (${d.action}):** ${d.message}`);
      if (d.suggestedFix) {
        lines.push(`  - *Suggested fix:* ${d.suggestedFix}`);
      }
    }
    lines.push('');
  }

  if (decision.cautionCount > 0) {
    lines.push('## Caution Actions');
    lines.push('');
    for (const d of decision.stepDecisions.filter((s) => s.riskLevel === 'caution')) {
      lines.push(`- **Step ${d.stepIndex + 1} (${d.action}):** ${d.message}`);
      if (d.suggestedFix) {
        lines.push(`  - *Suggested fix:* ${d.suggestedFix}`);
      }
    }
    lines.push('');
  }

  lines.push('## Safety Notes');
  lines.push('');
  lines.push('*This is a policy preview only. No browser was launched. No actions were executed.*');
  lines.push('*Blocked steps will be skipped during execution.*');
  lines.push('*Caution steps will execute but may be blocked with --strict-policy.*');
  lines.push('');

  return lines.join('\n');
}
