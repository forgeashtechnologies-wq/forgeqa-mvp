import fs from 'node:fs';
import path from 'node:path';
import type { RunManifest, StepResult } from '../schemas/core.js';
import type { WorkflowPlan } from '../schemas/core.js';

export interface ScreenshotCard {
  stepId: string;
  stepLabel: string;
  stepAction: string;
  stepStatus: string;
  screenshotRelativePath: string;
  isFailure: boolean;
  isPolicyBlocked: boolean;
  isPolicyCaution: boolean;
  timestamp?: string;
}

export interface GalleryData {
  runId: string;
  templateName: string;
  verdict: string;
  reportHealth: string;
  viewportProfile?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  cards: ScreenshotCard[];
  screenshotCount: number;
  failedStepScreenshotCount: number;
  blockedStepScreenshotCount: number;
  traceZipAvailable: boolean;
}

function buildCards(plan: WorkflowPlan, manifest: RunManifest, runDir: string): ScreenshotCard[] {
  const cards: ScreenshotCard[] = [];
  const screenshotsDir = path.join(runDir, 'screenshots');
  const existingFiles = fs.existsSync(screenshotsDir)
    ? new Set(fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png')))
    : new Set<string>();

  const blockedStepIds = new Set(
    (manifest.policyDecisions ?? [])
      .filter((d) => d.riskLevel === 'blocked')
      .map((d) => d.stepId),
  );
  const cautionStepIds = new Set(
    (manifest.policyDecisions ?? [])
      .filter((d) => d.riskLevel === 'caution')
      .map((d) => d.stepId),
  );

  for (const step of plan.steps) {
    const result = manifest.steps.find((s: StepResult) => s.stepId === step.id);
    const screenshotFile = result?.screenshotPath ? path.basename(result.screenshotPath) : `${step.id}.png`;
    const hasScreenshot = existingFiles.has(screenshotFile);
    if (!hasScreenshot && !result?.screenshotPath) continue;

    const isFailure = result?.status === 'failed';
    const isPolicyBlocked = blockedStepIds.has(step.id);
    const isPolicyCaution = cautionStepIds.has(step.id);

    cards.push({
      stepId: step.id,
      stepLabel: step.description,
      stepAction: step.action,
      stepStatus: result?.status ?? 'unknown',
      screenshotRelativePath: `screenshots/${screenshotFile}`,
      isFailure,
      isPolicyBlocked,
      isPolicyCaution,
      timestamp: result?.completedAt,
    });
  }

  return cards;
}

export function buildGalleryData(
  plan: WorkflowPlan,
  manifest: RunManifest,
  runDir: string,
  verdict: string,
  reportHealth: string,
): GalleryData {
  const cards = buildCards(plan, manifest, runDir);
  const traceZipAvailable = fs.existsSync(path.join(runDir, 'trace.zip'));

  return {
    runId: manifest.runId,
    templateName: plan.templateName,
    verdict,
    reportHealth,
    viewportProfile: manifest.viewport?.profile,
    viewportWidth: manifest.viewport?.width,
    viewportHeight: manifest.viewport?.height,
    cards,
    screenshotCount: cards.length,
    failedStepScreenshotCount: cards.filter((c) => c.isFailure).length,
    blockedStepScreenshotCount: cards.filter((c) => c.isPolicyBlocked).length,
    traceZipAvailable,
  };
}

export function generateGalleryHtml(data: GalleryData): string {
  const cardsHtml = data.cards.map((card) => {
    const markers: string[] = [];
    if (card.isFailure) markers.push('<span class="marker-fail">FAIL</span>');
    if (card.isPolicyBlocked) markers.push('<span class="marker-blocked">BLOCKED</span>');
    if (card.isPolicyCaution) markers.push('<span class="marker-caution">CAUTION</span>');

    return `<div class="card">
      <div class="card-header">
        <span class="step-id">${card.stepId}</span>
        <span class="step-action">${card.stepAction}</span>
        <span class="step-status ${card.stepStatus}">${card.stepStatus.toUpperCase()}</span>
        ${markers.join('')}
      </div>
      <div class="card-label">${escapeHtml(card.stepLabel)}</div>
      <img src="${card.screenshotRelativePath}" alt="${escapeHtml(card.stepLabel)}" loading="lazy" />
    </div>`;
  }).join('\n');

  const traceNote = data.traceZipAvailable
    ? '<p>Trace ZIP is available. View locally with: <code>pnpm exec playwright show-trace trace.zip</code></p>'
    : '<p>No trace ZIP available for this run.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Screenshot Gallery - ${escapeHtml(data.templateName)}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 1rem; background: #f5f5f5; color: #222; }
header { background: #fff; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
header h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
.meta { color: #555; font-size: 0.9rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
.card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card-header { padding: 0.5rem 0.75rem; background: #fafafa; border-bottom: 1px solid #eee; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.8rem; }
.step-id { font-weight: bold; color: #333; }
.step-action { color: #666; }
.step-status { padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
.step-status.passed { background: #d4edda; color: #155724; }
.step-status.failed { background: #f8d7da; color: #721c24; }
.step-status.skipped { background: #fff3cd; color: #856404; }
.marker-fail { background: #dc3545; color: #fff; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
.marker-blocked { background: #6c757d; color: #fff; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
.marker-caution { background: #ffc107; color: #212529; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
.card-label { padding: 0.5rem 0.75rem; font-size: 0.85rem; color: #444; }
.card img { width: 100%; height: auto; display: block; border-top: 1px solid #eee; }
footer { margin-top: 1rem; padding: 1rem; background: #fff; border-radius: 8px; font-size: 0.85rem; color: #555; }
</style>
</head>
<body>
<header>
  <h1>Screenshot Gallery: ${escapeHtml(data.templateName)}</h1>
  <div class="meta">
    Run: ${data.runId} | Verdict: ${data.verdict} | Health: ${data.reportHealth} | Screenshots: ${data.screenshotCount}
    ${data.viewportProfile ? `| Viewport: ${data.viewportProfile} (${data.viewportWidth}x${data.viewportHeight})` : ''}
  </div>
</header>
<div class="grid">
  ${cardsHtml}
</div>
<footer>
  <p>Failed step screenshots: ${data.failedStepScreenshotCount} | Blocked step screenshots: ${data.blockedStepScreenshotCount}</p>
  ${traceNote}
</footer>
</body>
</html>`;
}

export function generateGalleryMarkdown(data: GalleryData): string {
  const lines: string[] = [];
  lines.push('# Screenshot Gallery');
  lines.push('');
  lines.push(`- **Run ID:** \`${data.runId}\``);
  lines.push(`- **Template:** ${data.templateName}`);
  lines.push(`- **Verdict:** ${data.verdict}`);
  lines.push(`- **Report Health:** ${data.reportHealth}`);
  lines.push(`- **Screenshots:** ${data.screenshotCount}`);
  if (data.viewportProfile) {
    lines.push(`- **Viewport:** ${data.viewportProfile} (${data.viewportWidth}x${data.viewportHeight})`);
  }
  lines.push('');

  for (const card of data.cards) {
    const markers: string[] = [];
    if (card.isFailure) markers.push('**FAIL**');
    if (card.isPolicyBlocked) markers.push('**BLOCKED**');
    if (card.isPolicyCaution) markers.push('**CAUTION**');

    lines.push(`### ${card.stepId}: ${card.stepLabel}`);
    lines.push(`- **Action:** ${card.stepAction}`);
    lines.push(`- **Status:** ${card.stepStatus}`);
    if (markers.length > 0) {
      lines.push(`- **Markers:** ${markers.join(' | ')}`);
    }
    lines.push(`![${card.stepLabel}](${card.screenshotRelativePath})`);
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Failed step screenshots: ${data.failedStepScreenshotCount}`);
  lines.push(`- Blocked step screenshots: ${data.blockedStepScreenshotCount}`);
  if (data.traceZipAvailable) {
    lines.push('- Trace ZIP is available. View locally with: `pnpm exec playwright show-trace trace.zip`');
  } else {
    lines.push('- No trace ZIP available for this run.');
  }
  lines.push('');

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
