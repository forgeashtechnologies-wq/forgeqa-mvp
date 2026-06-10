import type { WorkflowTemplate } from './types.js';

export interface TemplateValidationIssue {
  templateId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateTemplate(template: WorkflowTemplate): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  if (!template.id || template.id.trim().length === 0) {
    issues.push({ templateId: template.id ?? '(missing)', field: 'id', message: 'Template ID is required', severity: 'error' });
  }

  if (!template.name || template.name.trim().length === 0) {
    issues.push({ templateId: template.id, field: 'name', message: 'Template name is required', severity: 'error' });
  }

  if (!template.description || template.description.trim().length === 0) {
    issues.push({ templateId: template.id, field: 'description', message: 'Template description is required', severity: 'error' });
  }

  if (!template.category || template.category.trim().length === 0) {
    issues.push({ templateId: template.id, field: 'category', message: 'Template category is required', severity: 'error' });
  }

  if (!template.steps || template.steps.length < 3) {
    issues.push({ templateId: template.id, field: 'steps', message: `Template must have at least 3 steps, has ${template.steps?.length ?? 0}`, severity: 'error' });
  }

  if (template.destructiveAction === true) {
    issues.push({ templateId: template.id, field: 'destructiveAction', message: 'MVP templates must not have destructiveAction=true', severity: 'error' });
  }

  if (!template.promptMatchers || template.promptMatchers.length === 0) {
    issues.push({ templateId: template.id, field: 'promptMatchers', message: 'Template must have at least one prompt matcher', severity: 'error' });
  }

  if (!template.matchers || template.matchers.length === 0) {
    issues.push({ templateId: template.id, field: 'matchers', message: 'Template must have at least one secondary matcher', severity: 'warning' });
  }

  if (template.supportedModes.includes('demo')) {
    if (!template.demoRoutes || template.demoRoutes.length === 0) {
      issues.push({ templateId: template.id, field: 'demoRoutes', message: 'Demo template must have at least one demo route', severity: 'error' });
    }
  }

  if (!template.baseUrl || !template.baseUrl.startsWith('https://')) {
    issues.push({ templateId: template.id, field: 'baseUrl', message: 'Template baseUrl must use https://', severity: 'warning' });
  }

  for (const step of template.steps ?? []) {
    if ((step.action === 'click' || step.action === 'fill' || step.action === 'upload' || step.action === 'assertVisible') && (!step.target || step.target.trim().length === 0)) {
      issues.push({ templateId: template.id, field: 'steps.target', message: `Step "${step.description}" action "${step.action}" requires a target`, severity: 'error' });
    }
  }

  if (!template.expectedArtifacts || template.expectedArtifacts.length === 0) {
    issues.push({ templateId: template.id, field: 'expectedArtifacts', message: 'Template should declare expectedArtifacts', severity: 'warning' });
  }

  return issues;
}

export function validateAllTemplates(templates: readonly WorkflowTemplate[]): { valid: boolean; issues: TemplateValidationIssue[] } {
  const issues: TemplateValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const template of templates) {
    if (seenIds.has(template.id)) {
      issues.push({ templateId: template.id, field: 'id', message: `Duplicate template ID: ${template.id}`, severity: 'error' });
    }
    seenIds.add(template.id);
    issues.push(...validateTemplate(template));
  }

  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}
