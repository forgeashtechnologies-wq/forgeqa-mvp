import { nanoid } from 'nanoid';
import type { WorkflowPlan, WorkflowStep } from '../schemas/core.js';
import type { WorkflowTemplate, PlanContext } from '../templates/types.js';

export function createPlanContext(
  template: WorkflowTemplate,
  overrides?: Partial<PlanContext>,
): PlanContext {
  return {
    runId: overrides?.runId ?? nanoid(),
    e2eRunId: overrides?.e2eRunId ?? nanoid(),
    templateId: template.id,
    baseUrl: overrides?.baseUrl ?? template.baseUrl,
  };
}

export function buildPlan(
  template: WorkflowTemplate,
  context: PlanContext,
): WorkflowPlan {
  const steps: WorkflowStep[] = template.steps.map((step) => ({
    id: `${context.runId}-step-${step.order}`,
    order: step.order,
    description: step.description,
    action: step.action,
    target: step.target,
    value: step.value,
    screenshot: step.screenshot,
    continueOnFailure: step.continueOnFailure,
  }));

  return {
    runId: context.runId,
    templateId: context.templateId,
    templateName: template.name,
    description: template.description,
    baseUrl: context.baseUrl,
    steps,
    createdAt: new Date().toISOString(),
  };
}
