import fs from 'node:fs';
import path from 'node:path';
import type { BatchResult } from './types.js';
import type {
  BatchValidationResult,
  BatchValidationCheck,
  BatchValidationFinding,
  BatchValidationSummary,
} from './validator-types.js';

function addCheck(
  checks: BatchValidationCheck[],
  id: string,
  label: string,
  category: BatchValidationCheck['category'],
  status: BatchValidationCheck['status'],
  message: string,
  severity: BatchValidationCheck['severity'],
  evidence?: string,
) {
  checks.push({ id, label, category, status, message, severity, evidence });
}

function addFinding(
  findings: BatchValidationFinding[],
  id: string,
  severity: BatchValidationFinding['severity'],
  title: string,
  message: string,
  file?: string,
  suggestedFix?: string,
  relatedPatternId?: string,
) {
  findings.push({ id, severity, title, message, file, suggestedFix, relatedPatternId });
}

export interface ValidateBatchOptions {
  strict?: boolean;
  isPreview?: boolean;
}

export function validateBatchArtifacts(
  batchId: string,
  options: ValidateBatchOptions = {},
): BatchValidationResult {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchId);
  const checks: BatchValidationCheck[] = [];
  const findings: BatchValidationFinding[] = [];
  const summary: BatchValidationSummary = {
    totalChecks: 0,
    passCount: 0,
    warnCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    missingFiles: [],
    brokenLinks: [],
    invalidJsonFiles: [],
    absolutePathFindings: [],
    certificationClaimFindings: [],
    missingDisclaimerFindings: [],
    linkedRunFailures: [],
  };

  // 1. Required files
  const requiredFiles = ['batch-plan.json', 'batch-plan.md'];
  const resultFiles = ['batch-result.json', 'batch-result.md'];

  let hasBatchResult = false;
  for (const f of resultFiles) {
    const p = path.join(batchDir, f);
    if (fs.existsSync(p)) {
      hasBatchResult = true;
    }
  }

  const allExpected = [...requiredFiles, ...(hasBatchResult ? resultFiles : [])];

  for (const f of allExpected) {
    const p = path.join(batchDir, f);
    const exists = fs.existsSync(p);
    if (exists) {
      addCheck(checks, `req_${f}`, `Required file: ${f}`, 'required_file', 'pass', `${f} present`, 'info');
      summary.passCount++;
    } else {
      addCheck(checks, `req_${f}`, `Required file: ${f}`, 'required_file', 'fail', `${f} missing`, 'error');
      summary.failCount++;
      summary.missingFiles.push(f);
      addFinding(findings, `missing_${f}`, 'error', `Missing ${f}`, `Required file ${f} is not present in batch directory.`, f, `Ensure batch generation writes ${f}.`);
    }
  }

  // 2. JSON validity
  const jsonFiles = fs.readdirSync(batchDir).filter((f) => f.endsWith('.json'));
  let batchResult: BatchResult | null = null;

  for (const f of jsonFiles) {
    const p = path.join(batchDir, f);
    try {
      const content = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(content);
      addCheck(checks, `json_${f}`, `JSON valid: ${f}`, 'json_validity', 'pass', `${f} is valid JSON`, 'info');
      summary.passCount++;

      if (f === 'batch-result.json') {
        batchResult = parsed as BatchResult;
      }
    } catch {
      addCheck(checks, `json_${f}`, `JSON valid: ${f}`, 'json_validity', 'fail', `${f} is invalid JSON`, 'error');
      summary.failCount++;
      summary.invalidJsonFiles.push(f);
      addFinding(findings, `invalid_json_${f}`, 'error', `Invalid JSON: ${f}`, `File ${f} could not be parsed as JSON.`, f, 'Regenerate the batch artifact.');
    }
  }

  // 3. batchId consistency
  if (batchResult) {
    if (batchResult.batchId === batchId) {
      addCheck(checks, 'batch_id_match', 'Batch ID consistency', 'schema', 'pass', `batchId matches across files`, 'info');
      summary.passCount++;
    } else {
      addCheck(checks, 'batch_id_match', 'Batch ID consistency', 'schema', 'fail', `batchId mismatch: expected ${batchId}, got ${batchResult.batchId}`, 'error');
      summary.failCount++;
      addFinding(findings, 'batch_id_mismatch', 'error', 'Batch ID mismatch', `batch-result.json contains batchId "${batchResult.batchId}" but folder is "${batchId}".`, 'batch-result.json');
    }

    // runIds unique
    const uniqueRunIds = new Set(batchResult.runIds);
    if (uniqueRunIds.size === batchResult.runIds.length) {
      addCheck(checks, 'runids_unique', 'Run IDs unique', 'schema', 'pass', 'All runIds are unique', 'info');
      summary.passCount++;
    } else {
      addCheck(checks, 'runids_unique', 'Run IDs unique', 'schema', 'fail', 'Duplicate runIds detected', 'error');
      summary.failCount++;
    }

    // status values valid
    const validStatuses = ['completed', 'completed_with_failures', 'failed', 'blocked'];
    if (validStatuses.includes(batchResult.status)) {
      addCheck(checks, 'status_valid', 'Batch status valid', 'schema', 'pass', `Status "${batchResult.status}" is valid`, 'info');
      summary.passCount++;
    } else {
      addCheck(checks, 'status_valid', 'Batch status valid', 'schema', 'fail', `Unknown status "${batchResult.status}"`, 'error');
      summary.failCount++;
    }
  }

  // 4. Markdown integrity
  const mdFiles = fs.readdirSync(batchDir).filter((f) => f.endsWith('.md'));
  const bannedCertWords = ['certified', 'compliant', 'compliance', 'guaranteed', 'zero bugs', '100% secure', 'hipaa-compliant', 'gdpr-compliant', 'pci-compliant'];

  for (const f of mdFiles) {
    const p = path.join(batchDir, f);
    const content = fs.readFileSync(p, 'utf-8');

    // Check for absolute paths
    const absolutePatterns = [/\/Users\//, /file:\/\//, /[a-zA-Z]:\\/, /\/home\//, /\/var\//];
    let hasAbsolute = false;
    for (const pat of absolutePatterns) {
      if (pat.test(content)) {
        hasAbsolute = true;
        break;
      }
    }

    if (hasAbsolute) {
      addCheck(checks, `md_abs_${f}`, `No absolute paths: ${f}`, 'portability', 'fail', `${f} contains absolute paths`, 'error');
      summary.failCount++;
      summary.absolutePathFindings.push(f);
      addFinding(findings, `abs_path_${f}`, 'error', `Absolute path in ${f}`, `Markdown file contains absolute filesystem paths.`, f, 'Use relative paths only.');
    } else {
      addCheck(checks, `md_abs_${f}`, `No absolute paths: ${f}`, 'portability', 'pass', `${f} uses relative paths only`, 'info');
      summary.passCount++;
    }

    // Check for external URLs
    const externalUrlPattern = /https?:\/\/[^\s\)]+/;
    if (externalUrlPattern.test(content)) {
      addCheck(checks, `md_ext_${f}`, `No external URLs: ${f}`, 'portability', 'warn', `${f} contains external URLs`, 'warning');
      summary.warnCount++;
    } else {
      addCheck(checks, `md_ext_${f}`, `No external URLs: ${f}`, 'portability', 'pass', `${f} has no external URLs`, 'info');
      summary.passCount++;
    }

    // Check for certification claims
    const lowerContent = content.toLowerCase();
    // If file contains a proper disclaimer ("not ... certification"), allow all
    const hasDisclaimer = lowerContent.includes('not') && (lowerContent.includes('certification') || lowerContent.includes('compliant'));
    const foundBanned = hasDisclaimer ? [] : bannedCertWords.filter((w) => lowerContent.includes(w));
    if (foundBanned.length > 0) {
      addCheck(checks, `md_cert_${f}`, `No certification claims: ${f}`, 'disclaimer', 'fail', `${f} contains banned words: ${foundBanned.join(', ')}`, 'error');
      summary.failCount++;
      summary.certificationClaimFindings.push(f);
      addFinding(findings, `cert_claim_${f}`, 'error', `Certification claim in ${f}`, `File contains prohibited compliance/certification words: ${foundBanned.join(', ')}`, f, 'Remove certification claims; use readiness disclaimers only.');
    } else {
      addCheck(checks, `md_cert_${f}`, `No certification claims: ${f}`, 'disclaimer', 'pass', `${f} has no certification claims`, 'info');
      summary.passCount++;
    }

    // Check for disclaimer in industry assessment
    if (f === 'industry-batch-assessment.md') {
      const hasDisclaimer = lowerContent.includes('not legal') || lowerContent.includes('not compliance') || lowerContent.includes('not certification');
      if (hasDisclaimer) {
        addCheck(checks, 'md_disclaimer', 'Industry assessment disclaimer', 'disclaimer', 'pass', 'Disclaimer present in industry-batch-assessment.md', 'info');
        summary.passCount++;
      } else {
        addCheck(checks, 'md_disclaimer', 'Industry assessment disclaimer', 'disclaimer', 'fail', 'Missing disclaimer in industry-batch-assessment.md', 'error');
        summary.failCount++;
        summary.missingDisclaimerFindings.push('industry-batch-assessment.md');
      }
    }
  }

  // 5. Linked run artifacts
  if (batchResult && batchResult.runIds.length > 0) {
    for (const runId of batchResult.runIds) {
      const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
      const requiredRunFiles = ['run.json', 'report.md', 'report.html', 'artifact-validation.json', 'data-safety-audit.json', 'scope-analysis.json', 'failure-classification.json', 'screenshot-gallery.html'];

      let allRunFilesPresent = true;
      for (const rf of requiredRunFiles) {
        const rfPath = path.join(runDir, rf);
        if (!fs.existsSync(rfPath)) {
          allRunFilesPresent = false;
          summary.brokenLinks.push(`artifacts/runs/${runId}/${rf}`);
          addFinding(findings, `missing_run_${runId}_${rf}`, 'error', `Missing run artifact: ${rf}`, `Run ${runId} is missing required file ${rf}.`, `artifacts/runs/${runId}/${rf}`, `Re-execute run or regenerate artifact.`);
        }
      }

      // Industry-specific run artifacts
      if (batchResult.industryPackId) {
        const industryPath = path.join(runDir, 'industry-assessment.json');
        if (!fs.existsSync(industryPath)) {
          allRunFilesPresent = false;
          summary.brokenLinks.push(`artifacts/runs/${runId}/industry-assessment.json`);
          addFinding(findings, `missing_run_industry_${runId}`, 'warning', `Missing industry assessment`, `Run ${runId} is missing industry-assessment.json.`, `artifacts/runs/${runId}/industry-assessment.json`, 'Run with --industry to generate.');
        }
      }

      if (allRunFilesPresent) {
        addCheck(checks, `linked_${runId}`, `Linked run artifacts: ${runId}`, 'linked_run', 'pass', `All required artifacts present for ${runId}`, 'info');
        summary.passCount++;
      } else {
        addCheck(checks, `linked_${runId}`, `Linked run artifacts: ${runId}`, 'linked_run', 'fail', `Missing artifacts for run ${runId}`, 'error');
        summary.failCount++;
        summary.linkedRunFailures.push(runId);
      }
    }
  }

  // 6. Industry batch assessment files (when industry used)
  if (batchResult && batchResult.industryPackId) {
    const industryFiles = ['industry-batch-assessment.json', 'industry-batch-assessment.md'];
    for (const f of industryFiles) {
      const p = path.join(batchDir, f);
      if (fs.existsSync(p)) {
        addCheck(checks, `ind_${f}`, `Industry artifact: ${f}`, 'industry_assessment', 'pass', `${f} present`, 'info');
        summary.passCount++;
      } else {
        addCheck(checks, `ind_${f}`, `Industry artifact: ${f}`, 'industry_assessment', 'fail', `${f} missing for industry pack ${batchResult.industryPackId}`, 'error');
        summary.failCount++;
        summary.missingFiles.push(f);
      }
    }
  }

  // 7. Portability in JSON files
  for (const f of jsonFiles) {
    const p = path.join(batchDir, f);
    const content = fs.readFileSync(p, 'utf-8');
    const hasAbsolute = /\/Users\/|file:\/\/|[a-zA-Z]:\\\/|\/home\/|\/var\//.test(content);
    if (hasAbsolute) {
      addCheck(checks, `json_port_${f}`, `JSON portability: ${f}`, 'portability', 'fail', `${f} contains absolute paths`, 'error');
      summary.failCount++;
      summary.absolutePathFindings.push(f);
      addFinding(findings, `json_abs_${f}`, 'error', `Absolute path in ${f}`, 'JSON artifact contains absolute filesystem paths.', f, 'Rewrite artifact using relative paths only.');
    } else {
      addCheck(checks, `json_port_${f}`, `JSON portability: ${f}`, 'portability', 'pass', `${f} is portable`, 'info');
      summary.passCount++;
    }
  }

  summary.totalChecks = checks.length;

  // Determine overall status
  let status: BatchValidationResult['status'] = 'pass';
  if (summary.failCount > 0) {
    status = 'fail';
  } else if (summary.warnCount > 0) {
    status = 'warn';
  }

  if (options.strict && summary.warnCount > 0) {
    status = 'fail';
  }

  return {
    batchId,
    status,
    validatedAt: new Date().toISOString(),
    batchDir: `artifacts/batches/${batchId}`,
    checks,
    findings,
    summary,
  };
}

export function generateBatchValidationMarkdown(result: BatchValidationResult): string {
  const lines: string[] = [];
  lines.push('# Batch Validation Report');
  lines.push('');
  lines.push(`- **Batch ID:** \`${result.batchId}\``);
  lines.push(`- **Status:** ${result.status.toUpperCase()}`);
  lines.push(`- **Validated At:** ${result.validatedAt}`);
  lines.push(`- **Total Checks:** ${result.summary.totalChecks}`);
  lines.push(`- **Passed:** ${result.summary.passCount}`);
  lines.push(`- **Warnings:** ${result.summary.warnCount}`);
  lines.push(`- **Failures:** ${result.summary.failCount}`);
  lines.push('');

  if (result.summary.missingFiles.length > 0) {
    lines.push('## Missing Files');
    for (const f of result.summary.missingFiles) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (result.summary.brokenLinks.length > 0) {
    lines.push('## Broken Links');
    for (const l of result.summary.brokenLinks) {
      lines.push(`- ${l}`);
    }
    lines.push('');
  }

  if (result.summary.absolutePathFindings.length > 0) {
    lines.push('## Portability Findings');
    for (const f of result.summary.absolutePathFindings) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (result.summary.certificationClaimFindings.length > 0) {
    lines.push('## Certification Claim Findings');
    for (const f of result.summary.certificationClaimFindings) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (result.summary.missingDisclaimerFindings.length > 0) {
    lines.push('## Missing Disclaimer Findings');
    for (const f of result.summary.missingDisclaimerFindings) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (result.summary.linkedRunFailures.length > 0) {
    lines.push('## Linked Run Failures');
    for (const r of result.summary.linkedRunFailures) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  if (result.findings.length > 0) {
    lines.push('## All Findings');
    lines.push('');
    for (const f of result.findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`- **File:** ${f.file ?? 'N/A'}`);
      lines.push(`- **Message:** ${f.message}`);
      if (f.suggestedFix) {
        lines.push(`- **Fix:** ${f.suggestedFix}`);
      }
      lines.push('');
    }
  }

  lines.push('## Disclaimer');
  lines.push('This validation checks artifact integrity and report completeness. It does not certify the customer app as secure, compliant, bug-free, or production-ready.');
  lines.push('');

  return lines.join('\n');
}

export function generateBatchValidationJson(result: BatchValidationResult): string {
  return JSON.stringify(result, null, 2);
}
