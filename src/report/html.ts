import fs from 'node:fs';
import path from 'node:path';
import type { StepResult, ReadinessVerdict } from '../schemas/core.js';
import type { ReportOptions } from './markdown.js';

function statusClass(status: string): string {
  switch (status) {
    case 'passed': return 'badge-pass';
    case 'failed': return 'badge-fail';
    case 'skipped': return 'badge-skip';
    default: return 'badge-neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'passed': return 'Passed';
    case 'failed': return 'Failed';
    case 'skipped': return 'Skipped';
    default: return status;
  }
}

function verdictClass(verdict: ReadinessVerdict): string {
  switch (verdict) {
    case 'ready_for_demo': return 'verdict-ready';
    case 'conditionally_ready': return 'verdict-caution';
    case 'not_ready': return 'verdict-fail';
    case 'needs_human_review': return 'verdict-review';
  }
}

function verdictLabel(verdict: ReadinessVerdict): string {
  switch (verdict) {
    case 'ready_for_demo': return 'Ready for Demo';
    case 'conditionally_ready': return 'Conditionally Ready';
    case 'not_ready': return 'Not Ready';
    case 'needs_human_review': return 'Needs Human Review';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function collectScreenshots(runDir: string): string[] {
  const ssDir = path.join(runDir, 'screenshots');
  if (!fs.existsSync(ssDir)) return [];
  return fs
    .readdirSync(ssDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => path.join('screenshots', f));
}

function hasTrace(runDir: string): boolean {
  return fs.existsSync(path.join(runDir, 'trace.zip'));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateHtmlReport(options: ReportOptions): string {
  const { prompt, plan, data, manifest, runDir, verdict } = options;
  const screenshots = collectScreenshots(runDir);
  const traceExists = hasTrace(runDir);
  const failedSteps = manifest.steps.filter((s: StepResult) => s.status === 'failed');

  const totalDuration = manifest.completedAt && manifest.startedAt
    ? new Date(manifest.completedAt).getTime() - new Date(manifest.startedAt).getTime()
    : 0;

  const stepRows = manifest.steps.map((step: StepResult) => {
    const planStep = plan.steps.find((ps: { id: string }) => ps.id === step.stepId);
    const desc = planStep?.description ?? step.stepId;
    const action = planStep?.action ?? '—';
    const dur = step.durationMs !== undefined ? formatDuration(step.durationMs) : '—';
    return `<tr>
      <td>${planStep?.order ?? '?'}</td>
      <td>${desc}</td>
      <td><code>${action}</code></td>
      <td><span class="badge ${statusClass(step.status)}">${statusLabel(step.status)}</span></td>
      <td>${dur}</td>
    </tr>`;
  }).join('\n');

  const screenshotLinks = screenshots.length === 0
    ? '<p><em>No screenshots captured.</em></p>'
    : `<ul>${screenshots.map((s: string) => `<li><a href="${s}">${s}</a></li>`).join('')}</ul>`;

  const findings = options.findings ?? [];
  const findingsSection = findings.length === 0
    ? ''
    : `<div class="card">
      <h2>Pattern Findings</h2>
      <table>
        <thead>
          <tr><th>Severity</th><th>Pattern</th><th>Message</th><th>Step</th></tr>
        </thead>
        <tbody>
          ${findings.map((f) => {
            const severityClass = f.severity === 'error' ? 'badge-fail' : f.severity === 'warning' ? 'badge-skip' : 'badge-neutral';
            const severityLabel = f.severity === 'error' ? 'Error' : f.severity === 'warning' ? 'Warning' : 'Info';
            return `<tr>
              <td><span class="badge ${severityClass}">${severityLabel}</span></td>
              <td><strong>${f.title ?? f.patternId}</strong><br/><code>${f.patternId}</code></td>
              <td>${f.message}</td>
              <td>${f.stepId ? `<code>${f.stepId}</code>` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${findings.map((f) => {
        const details = [];
        if (f.evidence) details.push(`<p><strong>Evidence:</strong> ${f.evidence}</p>`);
        if (f.rootCause) details.push(`<p><strong>Root Cause:</strong> ${f.rootCause}</p>`);
        if (f.howToConfirm) details.push(`<p><strong>How to Confirm:</strong> ${f.howToConfirm}</p>`);
        if (f.safeFix) details.push(`<p><strong>Safe Fix:</strong> ${f.safeFix}</p>`);
        if (f.preventionRule) details.push(`<p><strong>Prevention:</strong> ${f.preventionRule}</p>`);
        if (f.sourceConfidence) details.push(`<p><strong>Source Confidence:</strong> <span class="badge badge-neutral">${f.sourceConfidence}</span></p>`);
        if (f.relatedPatterns && f.relatedPatterns.length > 0) {
          details.push(`<p><strong>Related:</strong> ${f.relatedPatterns.map((r) => `<code>${r}</code>`).join(', ')}</p>`);
        }
        if (f.sourceUrl) details.push(`<p><strong>Source:</strong> ${f.sourceType ?? 'docs'} — ${f.sourceUrl}</p>`);
        if (details.length === 0) return '';
        return `<details class="finding-detail">
          <summary>${f.title ?? f.patternId}</summary>
          <div class="detail-body">${details.join('')}</div>
        </details>`;
      }).join('')}
    </div>`;

  const domFindings = manifest.domFindings ?? [];
  const domSection = domFindings.length === 0
    ? ''
    : `<div class="card">
      <h2>DOM Analysis</h2>
      <table>
        <thead>
          <tr><th>Severity</th><th>Pattern</th><th>Message</th><th>Step</th></tr>
        </thead>
        <tbody>
          ${domFindings.map((f) => {
            const severityClass = f.severity === 'error' ? 'badge-fail' : f.severity === 'warning' ? 'badge-skip' : 'badge-neutral';
            const severityLabel = f.severity === 'error' ? 'Error' : f.severity === 'warning' ? 'Warning' : 'Info';
            return `<tr>
              <td><span class="badge ${severityClass}">${severityLabel}</span></td>
              <td><strong>${f.title ?? f.patternId}</strong><br/><code>${f.patternId}</code></td>
              <td>${f.message}</td>
              <td>${f.stepId ? `<code>${f.stepId}</code>` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${domFindings.map((f) => {
        const details = [];
        if (f.evidence) details.push(`<p><strong>Evidence:</strong> ${f.evidence}</p>`);
        if (f.rootCause) details.push(`<p><strong>Root Cause:</strong> ${f.rootCause}</p>`);
        if (f.safeFix) details.push(`<p><strong>Safe Fix:</strong> ${f.safeFix}</p>`);
        if (f.sourceConfidence) details.push(`<p><strong>Source Confidence:</strong> <span class="badge badge-neutral">${f.sourceConfidence}</span></p>`);
        if (details.length === 0) return '';
        return `<details class="finding-detail">
          <summary>${f.title ?? f.patternId}</summary>
          <div class="detail-body">${details.join('')}</div>
        </details>`;
      }).join('')}
    </div>`;

  const failedDetails = failedSteps.length === 0
    ? ''
    : `<h2>Failed Step Details</h2>${failedSteps.map((step: StepResult) => {
      const planStep = plan.steps.find((ps: { id: string }) => ps.id === step.stepId);
      const ssNote = step.screenshotPath
        ? `<p><strong>Screenshot:</strong> <code>${path.basename(step.screenshotPath)}</code></p>`
        : '';
      return `<h3>${planStep?.description ?? step.stepId}</h3>
        <p><strong>Status:</strong> <span class="badge badge-fail">Failed</span></p>
        <p><strong>Error:</strong> <code>${step.error ?? 'No error message'}</code></p>
        ${ssNote}`;
    }).join('')}`;

  const verdictExplanation = (() => {
    switch (verdict) {
      case 'ready_for_demo': return 'All critical steps passed. The workflow is safe to demonstrate.';
      case 'not_ready': return 'One or more critical steps failed. Do not demo without review.';
      case 'conditionally_ready': return 'Some non-critical issues detected. Demo with caution.';
      default: return 'Insufficient evidence for a clear verdict. Human review required.';
    }
  })();

  const impactSection = (() => {
    if (findings.length === 0) return '';
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    const info = findings.filter((f) => f.severity === 'info').length;
    const hasDangerous = findings.some(
      (f) => f.category === 'Dangerous Fix' || f.patternId.startsWith('drop_') || f.patternId.startsWith('disable_') || f.patternId.startsWith('real_') || f.patternId === 'broad_delete_cleanup' || f.patternId === 'production_key_used_in_test'
    );
    const impactVerdict = hasDangerous ? 'not_ready' : errors > 0 ? 'not_ready' : warnings > 0 ? 'ready_with_warnings' : 'no_impact';
    const impactReason = hasDangerous
      ? 'Dangerous fix pattern detected — do not proceed without review.'
      : errors > 0
      ? `${errors} error-level pattern(s) detected.`
      : warnings > 0
      ? `${warnings} warning-level pattern(s) detected — review recommended.`
      : 'No significant pattern findings.';
    return `<div class="card">
      <h2>Readiness Impact from Patterns</h2>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Errors</td><td>${errors}</td></tr>
        <tr><td>Warnings</td><td>${warnings}</td></tr>
        <tr><td>Info</td><td>${info}</td></tr>
        <tr><td>Impact</td><td><strong>${impactVerdict}</strong> — ${impactReason}</td></tr>
      </table>
    </div>`;
  })();

  const fixtureValidation = options.fixtureValidation;
  const fixtureIntegritySection = (() => {
    if (!fixtureValidation) return '';
    const missingSelectors = fixtureValidation.checks
      .filter((c) => c.name === 'required selectors present' && c.status === 'fail')
      .flatMap((c) => {
        const match = c.message.match(/Missing required selectors: (.*)/);
        return match ? match[1].split(',').map((s) => s.trim()) : [];
      });
    const hasExternalAssets = fixtureValidation.checks.some((c) => c.name === 'no external assets' && c.status === 'fail');
    const routeRegistered = !fixtureValidation.findings.some((f) => f.patternId === 'fixture_route_missing_file');
    const diagnosticException = fixtureValidation.checks.some((c) => c.name === 'required selectors present' && c.status === 'info' && c.message.includes('diagnostic'));
    return `<div class="card">
      <h2>Fixture Integrity</h2>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Fixture Route</td><td>${fixtureValidation.route ?? 'N/A'}</td></tr>
        <tr><td>Fixture Path</td><td>${fixtureValidation.fixturePath ?? 'N/A'}</td></tr>
        <tr><td>Validation Status</td><td><span class="badge ${fixtureValidation.status === 'pass' ? 'badge-pass' : fixtureValidation.status === 'warn' ? 'badge-skip' : 'badge-fail'}">${fixtureValidation.status}</span></td></tr>
        <tr><td>Missing Selectors</td><td>${missingSelectors.length > 0 ? missingSelectors.join(', ') : 'none'}</td></tr>
        <tr><td>External Asset Check</td><td>${hasExternalAssets ? '<span class="badge badge-fail">failed</span>' : '<span class="badge badge-pass">passed</span>'}</td></tr>
        <tr><td>Route Registration</td><td>${routeRegistered ? '<span class="badge badge-pass">passed</span>' : '<span class="badge badge-fail">failed</span>'}</td></tr>
        ${diagnosticException ? '<tr><td>Diagnostic Exception</td><td><span class="badge badge-neutral">expected missing selectors declared</span></td></tr>' : ''}
      </table>
    </div>`;
  })();

  const validation = options.validation;
  const healthSection = (() => {
    if (!validation) return '';
    const checkRows = validation.checks.map((c) => {
      const badgeClass = c.status === 'pass' ? 'badge-pass' : c.status === 'warn' ? 'badge-skip' : 'badge-fail';
      const badgeLabel = c.status === 'pass' ? 'Pass' : c.status === 'warn' ? 'Warn' : 'Fail';
      return `<tr><td>${c.name}</td><td><span class="badge ${badgeClass}">${badgeLabel}</span></td><td>${c.message}</td></tr>`;
    }).join('');
    const findingsHtml = validation.findings.length > 0
      ? `<h3>Validation Findings</h3><ul>${validation.findings.map((f) => {
          const sevClass = f.severity === 'error' ? 'badge-fail' : f.severity === 'warning' ? 'badge-skip' : 'badge-neutral';
          const sevLabel = f.severity === 'error' ? 'Error' : f.severity === 'warning' ? 'Warning' : 'Info';
          return `<li><span class="badge ${sevClass}">${sevLabel}</span> <strong>${f.title ?? f.patternId}</strong>: ${f.message}</li>`;
        }).join('')}</ul>`
      : '';
    return `<div class="card">
      <h2>Report Health</h2>
      <table>
        <tr><th>Check</th><th>Status</th><th>Message</th></tr>
        ${checkRows}
      </table>
      ${findingsHtml}
    </div>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ForgeQA Run Report — ${manifest.runId}</title>
<style>
  :root {
    --bg: #f8f9fa;
    --card: #ffffff;
    --text: #1a1a1a;
    --muted: #6c757d;
    --border: #dee2e6;
    --pass: #198754;
    --pass-bg: #d1e7dd;
    --fail: #dc3545;
    --fail-bg: #f8d7da;
    --skip: #6c757d;
    --skip-bg: #e2e3e5;
    --ready: #198754;
    --ready-bg: #d1e7dd;
    --caution: #ffc107;
    --caution-bg: #fff3cd;
    --review: #0dcaf0;
    --review-bg: #cff4fc;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    margin: 0;
    padding: 24px;
  }
  .container { max-width: 960px; margin: 0 auto; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }
  h1 { font-size: 1.75rem; margin: 0 0 8px; }
  h2 { font-size: 1.25rem; margin: 0 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 1rem; margin: 16px 0 8px; }
  p { margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  th { background: var(--bg); font-weight: 600; }
  tr:hover { background: var(--bg); }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .badge-pass { background: var(--pass-bg); color: var(--pass); }
  .badge-fail { background: var(--fail-bg); color: var(--fail); }
  .badge-skip { background: var(--skip-bg); color: var(--skip); }
  .badge-neutral { background: var(--border); color: var(--muted); }
  .verdict-box {
    padding: 16px;
    border-radius: 8px;
    margin: 12px 0;
    font-weight: 600;
  }
  .verdict-ready { background: var(--ready-bg); color: var(--ready); }
  .verdict-caution { background: var(--caution-bg); color: #856404; }
  .verdict-fail { background: var(--fail-bg); color: var(--fail); }
  .verdict-review { background: var(--review-bg); color: #055160; }
  code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.875em;
  }
  a { color: #0d6efd; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul { margin: 8px 0; padding-left: 20px; }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  .meta-item { background: var(--bg); padding: 12px; border-radius: 6px; }
  .meta-item .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-item .value { font-weight: 600; margin-top: 4px; }
  .disclaimer {
    font-size: 0.875rem;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding-top: 16px;
    margin-top: 24px;
  }
  details.finding-detail {
    margin: 8px 0;
    padding: 8px 12px;
    background: var(--bg);
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  details.finding-detail summary {
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  details.finding-detail summary::-webkit-details-marker {
    display: none;
  }
  details.finding-detail .detail-body {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }
  details.finding-detail .detail-body p {
    margin: 6px 0;
  }
</style>
</head>
<body>
<div class="container">

  <div class="card">
    <h1>ForgeQA Run Report</h1>
    <p style="color:var(--muted)">Workflow execution proof package</p>
  </div>

  <div class="card">
    <h2>Executive Summary</h2>
    <div class="meta-grid">
      <div class="meta-item">
        <div class="label">Run ID</div>
        <div class="value"><code>${manifest.runId}</code></div>
      </div>
      <div class="meta-item">
        <div class="label">E2E Run ID</div>
        <div class="value"><code>${manifest.e2eRunId}</code></div>
      </div>
      <div class="meta-item">
        <div class="label">Status</div>
        <div class="value"><span class="badge ${statusClass(manifest.status)}">${statusLabel(manifest.status)}</span></div>
      </div>
      <div class="meta-item">
        <div class="label">Template</div>
        <div class="value">${plan.templateName}</div>
      </div>
      <div class="meta-item">
        <div class="label">Duration</div>
        <div class="value">${formatDuration(totalDuration)}</div>
      </div>
      <div class="meta-item">
        <div class="label">Steps</div>
        <div class="value">${manifest.steps.length} total, ${manifest.steps.filter((s: StepResult) => s.status === 'passed').length} passed, ${failedSteps.length} failed</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Demo Readiness Verdict</h2>
    <div class="verdict-box ${verdictClass(verdict)}">${verdictLabel(verdict)}</div>
    <p>${verdictExplanation}</p>
  </div>

  <div class="card">
    <h2>Prompt Executed</h2>
    <p><code>${prompt}</code></p>
  </div>

  ${options.preflightScan ? `
  <div class="card">
    <h2>Preflight Testability Scan</h2>
    <p><strong>Scan ID:</strong> <code>${options.preflightScan.scanId}</code></p>
    <p><strong>Status:</strong> <span class="badge badge-${options.preflightScan.status === 'pass' ? 'pass' : options.preflightScan.status === 'warn' ? 'skip' : 'fail'}">${options.preflightScan.status}</span></p>
    <p><strong>Score:</strong> ${options.preflightScan.score.overall}/100</p>
    <table>
      <tr><th>Category</th><th>Score</th></tr>
      <tr><td>Selector</td><td>${options.preflightScan.score.selectorScore}</td></tr>
      <tr><td>Accessibility</td><td>${options.preflightScan.score.accessibilityScore}</td></tr>
      <tr><td>Form</td><td>${options.preflightScan.score.formScore}</td></tr>
      <tr><td>Risk</td><td>${options.preflightScan.score.riskScore}</td></tr>
      <tr><td>Route</td><td>${options.preflightScan.score.routeScore}</td></tr>
    </table>
    <p><strong>Findings:</strong> ${options.preflightScan.summary.totalFindings} total (critical: ${options.preflightScan.summary.criticalCount}, error: ${options.preflightScan.summary.errorCount}, warning: ${options.preflightScan.summary.warningCount}, info: ${options.preflightScan.summary.infoCount})</p>
    ${options.preflightScan.recommendations.length > 0 ? `<p><strong>Recommendations:</strong></p><ul>${options.preflightScan.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
    ${options.preflightScan.suggestedTemplates && options.preflightScan.suggestedTemplates.length > 0 ? `<p><strong>Suggested Templates:</strong></p><ul>${options.preflightScan.suggestedTemplates.map((st) => `<li><strong>${escapeHtml(st.templateName)}</strong> (${st.confidence}) — ${escapeHtml(st.reason)}</li>`).join('')}</ul>` : ''}
    <p><em>Full scan report available in <code>preflight-scan/scan-report.md</code>.</em></p>
  </div>
  ` : ''}

  <div class="card">
    <h2>Workflow Matched</h2>
    <p><strong>Name:</strong> ${plan.templateName}</p>
    <p><strong>ID:</strong> <code>${plan.templateId}</code></p>
    <p><strong>Description:</strong> ${plan.description}</p>
    ${options.template ? `
    <p><strong>Category:</strong> ${options.template.category}</p>
    <p><strong>Difficulty:</strong> ${options.template.difficulty}</p>
    <p><strong>Estimated Duration:</strong> ${Math.round(options.template.estimatedDurationSeconds / 60)} min</p>
    <p><strong>Tags:</strong> ${options.template.tags.join(', ')}</p>
    <p><strong>Risk Level:</strong> ${options.template.riskLevel}</p>
    <p><strong>Requires Auth:</strong> ${options.template.requiresAuth ? 'yes' : 'no'}</p>
    <p><strong>File Upload:</strong> ${options.template.requiresFileUpload ? 'yes' : 'no'}</p>
    <p><strong>Supported Modes:</strong> ${options.template.supportedModes.join(', ')}</p>
    ` : ''}
  </div>

  ${options.template?.category === 'diagnostic' ? `
  <div class="card">
    <h2>Diagnostic Scenario</h2>
    <p><strong>Scenario ID:</strong> <code>${plan.templateId}</code></p>
    <p><strong>Expected Findings:</strong> This scenario is designed to trigger ForgeQA pattern detection.</p>
    <p><strong>Detected Findings:</strong> ${options.findings?.length ?? 0}</p>
    <p><strong>Tags:</strong> ${options.template.tags.join(', ')}</p>
    <p><strong>Diagnostic Verdict:</strong> ${(options.findings?.length ?? 0) > 0 ? 'diagnostic_pass' : 'diagnostic_fail'}</p>
    <p><em>This is a diagnostic run, not a product readiness assessment. Pattern findings here are expected by design.</em></p>
  </div>
  ` : ''}

  ${(() => {
    if (!options.scopeAnalysis) return '';
    const tested = options.scopeAnalysis.items.filter((i) => i.status === 'tested');
    const notTested = options.scopeAnalysis.items.filter((i) => i.status === 'not_tested');
    const testedList = tested.length > 0
      ? `<ul>${tested.map((i) => `<li><strong>${i.label}</strong> (${i.confidence} confidence)${i.evidenceStepIds.length > 0 ? ` — Evidence: ${i.evidenceStepIds.join(', ')}` : ''}</li>`).join('')}</ul>`
      : '<p><em>No fully tested scope items.</em></p>';
    const notTestedList = notTested.length > 0
      ? `<ul>${notTested.map((i) => `<li><strong>${i.label}</strong> — ${i.reason}${i.recommendation ? ` <em>(${i.recommendation})</em>` : ''}</li>`).join('')}</ul>`
      : '<p><em>All declared scope items were tested or partially tested.</em></p>';
    return `
    <div class="card">
      <h2>Tested Scope</h2>
      ${testedList}
    </div>
    <div class="card">
      <h2>Not Tested / Out of Scope</h2>
      ${notTestedList}
    </div>
    <div class="card">
      <h2>Scoped Readiness Statement</h2>
      <p><em>${escapeHtml(options.scopeAnalysis.scopedReadinessStatement)}</em></p>
    </div>
    `;
  })()}

  ${(() => {
    const policyFindings = options.findings?.filter((f) =>
      ['external_url_blocked', 'likely_production_target', 'external_host_requires_allowlist',
       'payment_domain_blocked', 'oauth_domain_blocked', 'unsafe_protocol_blocked',
       'credential_input_not_supported'].includes(f.patternId),
    ) ?? [];
    if (policyFindings.length === 0 && !options.template?.supportedModes.includes('external')) return '';
    const findingItems = policyFindings.map((f) => {
      const sevClass = f.severity === 'error' ? 'badge-fail' : 'badge-skip';
      const sevLabel = f.severity === 'error' ? 'Error' : 'Warning';
      return `<li><span class="badge ${sevClass}">${sevLabel}</span> <strong>${f.patternId}</strong>: ${f.message}</li>`;
    }).join('');
    return `<div class="card">
      <h2>URL Safety / External Mode Policy</h2>
      <p><strong>Mode:</strong> ${options.template?.supportedModes.includes('external') ? 'external' : 'demo'}</p>
      ${options.template?.baseUrl ? `<p><strong>Base URL:</strong> ${options.template.baseUrl}</p>` : ''}
      ${findingItems ? `<ul>${findingItems}</ul>` : '<p><em>No policy findings.</em></p>'}
      <p><em>ForgeQA executed only the approved workflow template. It did not crawl the site or perform unrestricted browser actions.</em></p>
    </div>`;
  })()}

  <div class="card">
    <h2>Run Metadata</h2>
    <p><strong>Started:</strong> ${manifest.startedAt}</p>
    ${manifest.completedAt ? `<p><strong>Completed:</strong> ${manifest.completedAt}</p>` : ''}
    <p><strong>Artifacts:</strong> <code>${manifest.artifactsDir}</code></p>
    ${manifest.viewport ? `
    <p><strong>Viewport:</strong> ${manifest.viewport.profile ?? 'custom'} (${manifest.viewport.width}x${manifest.viewport.height})</p>
    <p><strong>Mobile:</strong> ${manifest.viewport.isMobile ? 'yes' : 'no'}</p>
    <p><strong>Touch:</strong> ${manifest.viewport.hasTouch ? 'yes' : 'no'}</p>
    <p><strong>Scale Factor:</strong> ${manifest.viewport.deviceScaleFactor ?? 1}</p>
    ` : ''}
  </div>

  <div class="card">
    <h2>Golden Data Safety</h2>
    <ul>
      <li><strong>Data Profile:</strong> ${data.profileType ?? 'default'}</li>
      <li><strong>Users generated:</strong> ${data.users.length}</li>
      <li><strong>Files generated:</strong> ${data.files.length}</li>
      <li><strong>Forms generated:</strong> ${data.forms?.length ?? 0}</li>
      <li><strong>Table records generated:</strong> ${data.tableRecords?.length ?? 0}</li>
      <li><strong>Approved domains:</strong> forgeqa.test, forgecircle.test, example.test</li>
      <li><strong>Data safety audit status:</strong> ${(() => {
        try {
          const auditPath = path.join(options.runDir, 'data-safety-audit.json');
          if (fs.existsSync(auditPath)) {
            const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
            return audit.status;
          }
        } catch { /* ignore */ }
        return 'not_run';
      })()}</li>
      ${data.users.length > 0 ? `<li><strong>Sample user:</strong> ${data.users[0].displayName} (${data.users[0].email})</li>` : ''}
    </ul>
    <p><em>ForgeQA generated only synthetic test data. No real user data was used. No cleanup execution occurred.</em></p>
  </div>

  ${manifest.executionPolicy ? `
  <div class="card">
    <h2>Execution Policy / Safe Action Gates</h2>
    <ul>
      <li><strong>Mode:</strong> ${manifest.executionPolicy.mode}</li>
      <li><strong>Strict Policy:</strong> ${manifest.executionPolicy.strictPolicy ? 'yes' : 'no'}</li>
      <li><strong>Submit Allowed:</strong> ${manifest.executionPolicy.allowSubmit ? 'yes' : 'no'}</li>
      <li><strong>Upload Allowed:</strong> ${manifest.executionPolicy.allowUpload ? 'yes' : 'no'}</li>
      ${manifest.executionPolicy.approvedRiskReason ? `<li><strong>Approved Risk Reason:</strong> ${manifest.executionPolicy.approvedRiskReason}</li>` : ''}
      <li><strong>Allowed steps:</strong> ${manifest.executionPolicy.allowedCount}</li>
      <li><strong>Caution steps:</strong> ${manifest.executionPolicy.cautionCount}</li>
      <li><strong>Blocked steps:</strong> ${manifest.executionPolicy.blockedCount}</li>
    </ul>
    ${options.template ? `
    <h3>Template Policy Metadata</h3>
    <ul>
      <li><strong>Template ID:</strong> ${options.template.id}</li>
      <li><strong>Template allows external submit:</strong> ${options.template.allowExternalSubmit ? 'yes' : 'no'}</li>
      <li><strong>Template allows external upload:</strong> ${options.template.allowExternalUpload ? 'yes' : 'no'}</li>
      <li><strong>Mutation risk:</strong> ${options.template.mutationRisk ?? 'unspecified'}</li>
      <li><strong>Expected mutation scope:</strong> ${options.template.expectedMutationScope ?? 'unspecified'}</li>
    </ul>
    ` : ''}
    ${manifest.policyDecisions && manifest.policyDecisions.filter((d) => d.riskLevel === 'blocked').length > 0 ? `
    <h3>Blocked Actions</h3>
    <ul>
      ${manifest.policyDecisions.filter((d) => d.riskLevel === 'blocked').map((b) => `<li><strong>Step ${b.stepIndex + 1} (${b.action}):</strong> ${b.message}${b.suggestedFix ? `<br><em>Fix: ${b.suggestedFix}</em>` : ''}</li>`).join('')}
    </ul>
    ` : ''}
    ${manifest.policyDecisions && manifest.policyDecisions.filter((d) => d.riskLevel === 'caution').length > 0 ? `
    <h3>Caution Actions</h3>
    <ul>
      ${manifest.policyDecisions.filter((d) => d.riskLevel === 'caution').map((c) => `<li><strong>Step ${c.stepIndex + 1} (${c.action}):</strong> ${c.message}${c.suggestedFix ? `<br><em>Fix: ${c.suggestedFix}</em>` : ''}</li>`).join('')}
    </ul>
    ` : ''}
    <p><em>ForgeQA evaluated each step before execution. Blocked steps were not executed. Policy gates are separate from Playwright actionability checks.</em></p>
    <p><em><strong>Warning:</strong> Overrides cannot bypass hard safety blocks: destructive, payment, email-sending, OAuth, and credential actions are always blocked regardless of flags.</em></p>
  </div>
  ` : ''}

  <div class="card">
    <h2>Step Results</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Step</th><th>Action</th><th>Status</th><th>Duration</th></tr>
      </thead>
      <tbody>
        ${stepRows}
      </tbody>
    </table>
  </div>

  ${(() => {
    if (!options.failureClassification || options.failureClassification.classifications.length === 0) {
      return '<div class="card"><h2>Failure Type Classification</h2><p>No failed steps required classification.</p></div>';
    }
    const rows = options.failureClassification.classifications.map((c) => `
      <tr>
        <td><code>${c.stepId}</code></td>
        <td><span class="badge badge-fail">${c.failureType}</span></td>
        <td>${c.confidence}</td>
        <td>${c.suggestedOwner}</td>
        <td>${escapeHtml(c.recommendedNextAction)}</td>
      </tr>
    `).join('');
    const diagNote = options.failureClassification.summary.expectedDiagnosticCount > 0
      ? `<p><em>${options.failureClassification.summary.expectedDiagnosticCount} expected diagnostic failure(s) detected. These validate the detector, not a product defect.</em></p>`
      : '';
    return `<div class="card">
      <h2>Failure Type Classification</h2>
      <table>
        <thead><tr><th>Step</th><th>Type</th><th>Confidence</th><th>Owner</th><th>Next Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${diagNote}
    </div>`;
  })()}

  ${findingsSection}

  ${impactSection}

  ${domSection}

  ${fixtureIntegritySection}

  ${healthSection}

  ${failedDetails}

  <div class="card">
    <h2>Screenshot Index</h2>
    ${screenshotLinks}
  </div>

  ${(() => {
    if (!options.galleryData) return '';
    return `<div class="card">
      <h2>Evidence Gallery</h2>
      <ul>
        <li><strong>Screenshots:</strong> ${options.galleryData.screenshotCount}</li>
        <li><strong>Failed-step screenshots:</strong> ${options.galleryData.failedStepScreenshotCount}</li>
        <li><strong>Blocked-step screenshots:</strong> ${options.galleryData.blockedStepScreenshotCount}</li>
        <li><strong>Gallery files:</strong> <a href="screenshot-gallery.html">screenshot-gallery.html</a>, <a href="screenshot-gallery.md">screenshot-gallery.md</a></li>
        ${options.galleryData.traceZipAvailable
          ? '<li><strong>Trace ZIP:</strong> Available. View locally with: <code>pnpm exec playwright show-trace trace.zip</code></li>'
          : '<li><strong>Trace ZIP:</strong> Not available for this run.</li>'}
      </ul>
    </div>`;
  })()}

  <div class="card">
    <h2>Trace Artifact</h2>
    ${traceExists
      ? '<p>Trace archive available: <code>trace.zip</code></p><p>To inspect the trace locally, run: <code>npx playwright show-trace trace.zip</code></p>'
      : '<p><em>No trace archive generated.</em></p>'}
  </div>

  ${options.industryAssessment ? `
  <div class="card">
    <h2>Industry Readiness Pack</h2>
    <p><strong>Pack:</strong> ${escapeHtml(options.industryAssessment.packName)} (<code>${options.industryAssessment.packId}</code>)</p>
    <p><strong>Status:</strong> <span class="badge badge-${options.industryAssessment.status === 'ready' ? 'pass' : options.industryAssessment.status === 'ready_with_warnings' ? 'skip' : 'fail'}">${options.industryAssessment.status}</span></p>
    <p><strong>Score:</strong> ${options.industryAssessment.score}/100</p>
    <p><strong>Required Coverage:</strong> ${Math.round(options.industryAssessment.requiredCoverage * 100)}%</p>
    ${options.industryAssessment.missingRequiredItems.length > 0 ? `<h3>Missing Required Items</h3><ul>${options.industryAssessment.missingRequiredItems.map((item) => `<li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : ''}
    ${options.industryAssessment.blockedByPolicyItems.length > 0 ? `<h3>Blocked by Policy</h3><ul>${options.industryAssessment.blockedByPolicyItems.map((item) => `<li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : ''}
    ${options.industryAssessment.warnings.length > 0 ? `<h3>Warnings</h3><ul>${options.industryAssessment.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
    ${options.industryAssessment.recommendations.length > 0 ? `<h3>Recommendations</h3><ul>${options.industryAssessment.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
    ${options.industryAssessment.notTestedItems.length > 0 ? `<h3>Not Tested</h3><ul>${options.industryAssessment.notTestedItems.map((item) => `<li><strong>${escapeHtml(item.label)}</strong> (${item.severity}) — ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : ''}
    <h3>Caveats</h3>
    <ul>${options.industryAssessment.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    <p><em>${escapeHtml(options.industryAssessment.disclaimer)}</em></p>
  </div>
  ` : ''}

  <div class="card">
    <h2>Safety Notes</h2>
    <ul>
      <li>All generated data uses the <code>forgeqa.test</code> domain.</li>
      <li>All entities are tagged <code>createdByForgeQA=true</code>.</li>
      <li>All cleanup targets are tagged <code>safeToDelete=true</code>.</li>
      <li>No real user data was used.</li>
      <li>Cleanup is dry-run only in MVP.</li>
    </ul>
  </div>

  <div class="card">
    <h2>Cleanup Dry-Run Summary</h2>
    <ul>
      <li><strong>Users that would be removed:</strong> ${data.users.length}</li>
      <li><strong>Files that would be removed:</strong> ${data.files.length}</li>
      <li><strong>Actual deletions:</strong> 0 (dry-run)</li>
    </ul>
  </div>

  <div class="disclaimer">
    <p><em>This report was generated automatically by ForgeQA MVP. It reflects the state of the workflow at the time of execution and should be reviewed before any demo or delivery decision.</em></p>
  </div>

</div>
</body>
</html>`;
}
