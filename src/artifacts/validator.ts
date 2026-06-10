import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RunManifest } from '../schemas/core.js';
import type { PatternFinding } from '../patterns/types.js';
import { enrichFinding } from '../patterns/analyzer.js';

export interface ArtifactValidationResult {
  isValid: boolean;
  checks: ArtifactCheck[];
  findings: PatternFinding[];
}

export interface ArtifactCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

function checkFileExists(filePath: string, description: string): ArtifactCheck {
  return {
    name: description,
    status: fs.existsSync(filePath) ? 'pass' : 'fail',
    message: fs.existsSync(filePath) ? `${description} found` : `${description} missing: ${filePath}`,
  };
}

function sha256File(filePath: string): string | undefined {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

function checkDirectoryExists(dirPath: string, description: string): ArtifactCheck {
  return {
    name: description,
    status: fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory() ? 'pass' : 'fail',
    message: fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory() ? `${description} found` : `${description} missing: ${dirPath}`,
  };
}

export function validateRunArtifacts(runDir: string, manifest: RunManifest): ArtifactValidationResult {
  const checks: ArtifactCheck[] = [];
  const findings: PatternFinding[] = [];

  // Required files
  const requiredFiles = [
    { file: 'plan.json', desc: 'plan.json' },
    { file: 'data.json', desc: 'data.json' },
    { file: 'run.json', desc: 'run.json' },
    { file: 'report.md', desc: 'report.md' },
    { file: 'report.html', desc: 'report.html' },
    { file: 'cleanup-report.md', desc: 'cleanup-report.md' },
    { file: 'data-safety-audit.json', desc: 'data-safety-audit.json' },
    { file: 'data-safety-audit.md', desc: 'data-safety-audit.md' },
    { file: 'scope-analysis.json', desc: 'scope-analysis.json' },
    { file: 'scope-analysis.md', desc: 'scope-analysis.md' },
    { file: 'failure-classification.json', desc: 'failure-classification.json' },
    { file: 'failure-classification.md', desc: 'failure-classification.md' },
    { file: 'screenshot-gallery.html', desc: 'screenshot-gallery.html' },
    { file: 'screenshot-gallery.md', desc: 'screenshot-gallery.md' },
    { file: 'screenshot-gallery.json', desc: 'screenshot-gallery.json' },
  ];

  for (const req of requiredFiles) {
    const filePath = path.join(runDir, req.file);
    checks.push(checkFileExists(filePath, req.desc));
  }

  // Screenshots directory
  const screenshotsDir = path.join(runDir, 'screenshots');
  checks.push(checkDirectoryExists(screenshotsDir, 'screenshots directory'));

  // Trace check
  const tracePath = path.join(runDir, 'trace.zip');
  const hasTrace = fs.existsSync(tracePath);
  const isDryRun = manifest.dryRun === true;
  const traceCheck: ArtifactCheck = {
    name: 'trace.zip',
    status: hasTrace ? 'pass' : (isDryRun ? 'pass' : 'warn'),
    message: hasTrace ? 'trace.zip found' : (isDryRun ? 'trace.zip not applicable for dry-run' : 'trace.zip missing — browser may not have launched or trace was disabled'),
  };
  checks.push(traceCheck);
  if (!hasTrace && !isDryRun) {
    findings.push(enrichFinding({
      patternId: 'trace_missing_network_tab',
      message: 'trace.zip is missing from the artifact folder.',
      severity: 'warning',
      evidence: `runDir=${runDir}, tracePath=${tracePath}`,
    }));
  }

  // Screenshot consistency — verify each referenced screenshot file exists
  let screenshotCount = 0;
  if (fs.existsSync(screenshotsDir)) {
    screenshotCount = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png')).length;
  }
  const referencedScreenshots = manifest.steps
    .map((s) => s.screenshotPath)
    .filter((p): p is string => !!p)
    .map((p) => path.basename(p));
  const missingScreenshots = referencedScreenshots.filter((ss) => !fs.existsSync(path.join(screenshotsDir, ss)));
  const screenshotCheck: ArtifactCheck = {
    name: 'screenshot consistency',
    status: missingScreenshots.length === 0 ? 'pass' : 'warn',
    message: missingScreenshots.length === 0
      ? `Found ${screenshotCount} screenshot(s), all ${referencedScreenshots.length} referenced screenshots exist`
      : `Missing ${missingScreenshots.length} referenced screenshot(s): ${missingScreenshots.join(', ')}`,
  };
  checks.push(screenshotCheck);

  // Cleanup dry-run statement
  const cleanupPath = path.join(runDir, 'cleanup-report.md');
  let hasDryRun = false;
  if (fs.existsSync(cleanupPath)) {
    const content = fs.readFileSync(cleanupPath, 'utf-8');
    hasDryRun = content.includes('No items were deleted. This was a dry-run cleanup report only.');
  }
  const dryRunCheck: ArtifactCheck = {
    name: 'cleanup dry-run statement',
    status: hasDryRun ? 'pass' : 'fail',
    message: hasDryRun ? 'Cleanup dry-run statement present' : 'Cleanup dry-run statement missing from cleanup-report.md',
  };
  checks.push(dryRunCheck);
  if (!hasDryRun) {
    findings.push(enrichFinding({
      patternId: 'cleanup_report_missing_dry_run_statement',
      message: 'Cleanup report does not contain the mandatory dry-run statement.',
      severity: 'error',
      evidence: `cleanupPath=${cleanupPath}`,
    }));
  }

  // Manifest finalized
  const finalizedCheck: ArtifactCheck = {
    name: 'manifest finalized',
    status: manifest.isFinalized ? 'pass' : 'warn',
    message: manifest.isFinalized ? 'run.json isFinalized=true' : 'run.json isFinalized=false — run may not have completed cleanly',
  };
  checks.push(finalizedCheck);

  // CompletedAt exists
  const completedCheck: ArtifactCheck = {
    name: 'manifest completedAt',
    status: manifest.completedAt ? 'pass' : 'warn',
    message: manifest.completedAt ? `completedAt=${manifest.completedAt}` : 'run.json missing completedAt',
  };
  checks.push(completedCheck);

  // Check report.html for absolute paths
  const reportHtmlPath = path.join(runDir, 'report.html');
  let hasAbsolutePaths = false;
  if (fs.existsSync(reportHtmlPath)) {
    const html = fs.readFileSync(reportHtmlPath, 'utf-8');
    // Detect filesystem absolute paths (Unix /Users/... /home/... or Windows C:\...)
    // Require at least one path separator after the root to avoid false positives
    const absPathRegex = /(?:"|'|\`)(?:\/Users\/[^"'\s]+|\/home\/[^"'\s]+|[A-Z]:\\[^"'\s]+)/;
    hasAbsolutePaths = absPathRegex.test(html);
    if (hasAbsolutePaths) {
      findings.push(enrichFinding({
        patternId: 'report_html_broken_on_other_machine',
        message: 'report.html contains absolute filesystem paths that may break on other machines.',
        severity: 'warning',
        evidence: 'Absolute path pattern found in report.html',
      }));
    }
  }
  checks.push({
    name: 'report.html absolute paths',
    status: hasAbsolutePaths ? 'warn' : 'pass',
    message: hasAbsolutePaths ? 'report.html contains absolute paths' : 'report.html uses relative paths',
  });

  // Check report.html for external CDN/script/font references
  const reportHtmlPath2 = path.join(runDir, 'report.html');
  let hasExternalRefs = false;
  if (fs.existsSync(reportHtmlPath2)) {
    const html = fs.readFileSync(reportHtmlPath2, 'utf-8');
    // Only flag actual HTML attribute references to external URLs, not plain text mentions
    const externalAttrRegex = /(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi;
    const matches = Array.from(html.matchAll(externalAttrRegex));
    hasExternalRefs = matches.length > 0;
    if (hasExternalRefs) {
      const urls = matches.map((m) => m[1]).join(', ');
      findings.push(enrichFinding({
        patternId: 'flaky_due_to_external_dependency',
        message: 'report.html contains clickable external asset references.',
        severity: 'warning',
        evidence: `External href/src found: ${urls}`,
      }));
    }
  }
  checks.push({
    name: 'report.html external references',
    status: hasExternalRefs ? 'warn' : 'pass',
    message: hasExternalRefs ? 'report.html contains external href/src attributes' : 'report.html has no external href/src dependencies',
  });

  // Check data.json for safeToDelete
  const dataPath = path.join(runDir, 'data.json');
  let allSafe = true;
  if (fs.existsSync(dataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const users = data.users ?? [];
      for (const user of users) {
        if (user.safeToDelete !== true) {
          allSafe = false;
          findings.push(enrichFinding({
            patternId: 'cleanup_target_missing_safe_tags',
            message: `User data missing safeToDelete=true: ${user.email ?? 'unknown'}`,
            severity: 'error',
            evidence: `email=${user.email}, safeToDelete=${user.safeToDelete}`,
          }));
        }
      }
      const files = data.files ?? [];
      for (const file of files) {
        if (file.safeToDelete !== true) {
          allSafe = false;
          findings.push(enrichFinding({
            patternId: 'cleanup_target_missing_safe_tags',
            message: `File data missing safeToDelete=true: ${file.filename ?? 'unknown'}`,
            severity: 'error',
            evidence: `filename=${file.filename}, safeToDelete=${file.safeToDelete}`,
          }));
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  checks.push({
    name: 'data.json safety tags',
    status: allSafe ? 'pass' : 'fail',
    message: allSafe ? 'All data items have safeToDelete=true' : 'Some data items missing safeToDelete=true',
  });

  // Check data.json for approved email domains and file paths
  let allEmailsSafe = true;
  let allFilesInRunDir = true;
  let allFilesHaveSha256 = true;
  const safeDomains = ['forgeqa.test', 'forgecircle.test', 'example.test'];
  if (fs.existsSync(dataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      for (const user of data.users ?? []) {
        const domain = user.email?.split('@')[1];
        if (!safeDomains.includes(domain)) {
          allEmailsSafe = false;
        }
      }
      for (const file of data.files ?? []) {
        const rel = file.relativePath ?? file.filename;
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          allFilesInRunDir = false;
        }
        if (!file.sha256 || file.sha256.length !== 64) {
          allFilesHaveSha256 = false;
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  checks.push({
    name: 'data.json email domains',
    status: allEmailsSafe ? 'pass' : 'fail',
    message: allEmailsSafe ? 'All emails use approved test domains' : 'Some emails use unapproved domains',
  });
  checks.push({
    name: 'data.json file paths',
    status: allFilesInRunDir ? 'pass' : 'fail',
    message: allFilesInRunDir ? 'All file paths are relative' : 'Some file paths are absolute or outside run folder',
  });
  checks.push({
    name: 'data.json file sha256',
    status: allFilesHaveSha256 ? 'pass' : 'warn',
    message: allFilesHaveSha256 ? 'All files have sha256' : 'Some files missing sha256',
  });

  // Check data-safety-audit.json status
  const auditPath = path.join(runDir, 'data-safety-audit.json');
  checks.push({
    name: 'data-safety-audit present',
    status: fs.existsSync(auditPath) ? 'pass' : 'fail',
    message: fs.existsSync(auditPath) ? 'data-safety-audit.json found' : 'data-safety-audit.json missing',
  });

  // Check execution policy artifacts
  const policyJsonPath = path.join(runDir, 'execution-policy-preview.json');
  const policyMdPath = path.join(runDir, 'execution-policy-preview.md');
  const hasPolicyPreview = fs.existsSync(policyJsonPath) || fs.existsSync(policyMdPath);
  checks.push({
    name: 'execution-policy preview optional',
    status: 'pass',
    message: hasPolicyPreview ? 'Execution policy preview artifacts found' : 'No execution policy preview (optional for non-preview runs)',
  });

  // Check run.json contains executionPolicy for full runs
  const runJsonPath = path.join(runDir, 'run.json');
  let hasExecutionPolicy = false;
  let blockedStepsExecuted = false;
  if (fs.existsSync(runJsonPath)) {
    try {
      const runManifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      hasExecutionPolicy = !!runManifest.executionPolicy;
      if (runManifest.policyDecisions) {
        const blockedIds = new Set(runManifest.policyDecisions.filter((d: { riskLevel: string }) => d.riskLevel === 'blocked').map((d: { stepId: string }) => d.stepId));
        const executedBlocked = runManifest.steps.some((s: { stepId: string; status: string }) => blockedIds.has(s.stepId) && s.status !== 'failed');
        blockedStepsExecuted = executedBlocked;
      }
    } catch {
      // ignore
    }
  }
  checks.push({
    name: 'run.json execution policy',
    status: hasExecutionPolicy ? 'pass' : 'warn',
    message: hasExecutionPolicy ? 'run.json contains executionPolicy' : 'run.json missing executionPolicy',
  });
  checks.push({
    name: 'no blocked steps executed',
    status: blockedStepsExecuted ? 'fail' : 'pass',
    message: blockedStepsExecuted ? 'A blocked step appears to have been executed' : 'No blocked steps were executed',
  });
  if (blockedStepsExecuted) {
    findings.push(enrichFinding({
      patternId: 'action_blocked_by_policy',
      message: 'A step blocked by execution policy appears to have been executed.',
      severity: 'error',
      evidence: `runDir=${runDir}`,
    }));
  }

  // Artifact manifest integrity checks
  const manifestPath = path.join(runDir, 'artifact-manifest.json');
  const hasManifest = fs.existsSync(manifestPath);
  checks.push({
    name: 'artifact-manifest.json exists',
    status: 'pass',
    message: hasManifest ? 'artifact-manifest.json found' : 'artifact-manifest.json will be generated after validation',
  });

  if (hasManifest) {
    try {
      const artifactManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const requiredArtifacts = artifactManifest.artifacts?.filter((a: { required: boolean }) => a.required) ?? [];
      const missingRequired = requiredArtifacts.filter((a: { present: boolean; relativePath: string }) => !a.present);
      
      if (missingRequired.length > 0) {
        checks.push({
          name: 'artifact manifest required artifacts present',
          status: 'fail',
          message: `Missing required artifacts: ${missingRequired.map((a: { relativePath: string }) => a.relativePath).join(', ')}`,
        });
        findings.push(enrichFinding({
          patternId: 'artifact_integrity_mismatch',
          message: `Artifact manifest lists missing required artifacts: ${missingRequired.map((a: { relativePath: string }) => a.relativePath).join(', ')}`,
          severity: 'error',
          evidence: `runDir=${runDir}`,
        }));
      } else {
        checks.push({
          name: 'artifact manifest required artifacts present',
          status: 'pass',
          message: 'All required artifacts present according to manifest',
        });
      }

      // Check sha256 and size for present artifacts
      let sha256Mismatches = 0;
      let sizeMismatches = 0;
      for (const entry of artifactManifest.artifacts ?? []) {
        if (!entry.present) continue;
        const entryPath = path.join(runDir, entry.relativePath);
        if (!fs.existsSync(entryPath)) {
          sha256Mismatches++;
          continue;
        }
        const stats = fs.statSync(entryPath);
        if (entry.sizeBytes !== stats.size) {
          sizeMismatches++;
        }
        if (entry.sha256) {
          const actualSha256 = sha256File(entryPath);
          if (actualSha256 && actualSha256 !== entry.sha256) {
            sha256Mismatches++;
          }
        }
      }

      if (sha256Mismatches > 0 || sizeMismatches > 0) {
        checks.push({
          name: 'artifact manifest integrity',
          status: 'fail',
          message: `${sha256Mismatches} file(s) missing or checksum mismatch, ${sizeMismatches} size mismatch(es)`,
        });
        findings.push(enrichFinding({
          patternId: 'artifact_integrity_mismatch',
          message: `Artifact integrity mismatch: ${sha256Mismatches} missing/checksum mismatch, ${sizeMismatches} size mismatches`,
          severity: 'error',
          evidence: `runDir=${runDir}`,
        }));
      } else {
        checks.push({
          name: 'artifact manifest integrity',
          status: 'pass',
          message: 'All present artifacts match manifest metadata',
        });
      }

      // Check for extra files not in manifest
      const manifestPaths = new Set((artifactManifest.artifacts ?? []).map((a: { relativePath: string }) => a.relativePath));
      const extraFiles: string[] = [];
      function scanDir(dir: string, prefix: string) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), relPath);
          } else if (!manifestPaths.has(relPath) && relPath !== 'artifact-manifest.json') {
            extraFiles.push(relPath);
          }
        }
      }
      scanDir(runDir, '');
      if (extraFiles.length > 0) {
        checks.push({
          name: 'unexpected extra files',
          status: 'warn',
          message: `Found ${extraFiles.length} extra file(s) not in manifest: ${extraFiles.slice(0, 5).join(', ')}${extraFiles.length > 5 ? '...' : ''}`,
        });
      } else {
        checks.push({
          name: 'unexpected extra files',
          status: 'pass',
          message: 'No extra files found outside manifest',
        });
      }
    } catch {
      checks.push({
        name: 'artifact manifest integrity',
        status: 'warn',
        message: 'Could not parse artifact-manifest.json',
      });
    }
  }

  // Fixture validation files
  const fixtureJsonPath = path.join(runDir, 'fixture-validation.json');
  const fixtureMdPath = path.join(runDir, 'fixture-validation.md');
  const hasFixtureValidation = fs.existsSync(fixtureJsonPath) || fs.existsSync(fixtureMdPath);
  checks.push({
    name: 'fixture validation artifacts',
    status: hasFixtureValidation ? 'pass' : 'warn',
    message: hasFixtureValidation ? 'fixture-validation artifacts found' : 'fixture-validation artifacts missing',
  });

  // Check for unexpected absolute paths in report artifacts
  const reportMdPath = path.join(runDir, 'report.md');
  if (fs.existsSync(reportMdPath)) {
    const mdContent = fs.readFileSync(reportMdPath, 'utf-8');
    const absPathRegex = /(?:\/Users\/[^\s]+|\/home\/[^\s]+|[A-Z]:\\[^\s]+)/;
    const hasAbsInMd = absPathRegex.test(mdContent);
    if (hasAbsInMd) {
      findings.push(enrichFinding({
        patternId: 'report_html_broken_on_other_machine',
        message: 'report.md contains absolute filesystem paths.',
        severity: 'warning',
        evidence: 'Absolute path pattern found in report.md',
      }));
    }
    checks.push({
      name: 'report.md absolute paths',
      status: hasAbsInMd ? 'warn' : 'pass',
      message: hasAbsInMd ? 'report.md contains absolute paths' : 'report.md uses relative paths',
    });

    // Check report.md for external CDN/script/font/image references
    const externalAttrRegex = /(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi;
    const externalMatches = Array.from(mdContent.matchAll(externalAttrRegex));
    const hasExternalInMd = externalMatches.length > 0;
    if (hasExternalInMd) {
      const urls = externalMatches.map((m) => m[1]).join(', ');
      findings.push(enrichFinding({
        patternId: 'flaky_due_to_external_dependency',
        message: 'report.md contains external asset references.',
        severity: 'warning',
        evidence: `External href/src found: ${urls}`,
      }));
    }
    checks.push({
      name: 'report.md external references',
      status: hasExternalInMd ? 'warn' : 'pass',
      message: hasExternalInMd ? 'report.md contains external href/src attributes' : 'report.md has no external href/src dependencies',
    });

    // Check report.md references missing screenshots
    const ssRefRegex = /screenshots\/([^\s`\]]+)\.png/g;
    const ssRefs = Array.from(mdContent.matchAll(ssRefRegex)).map((m) => m[1] + '.png');
    const screenshotsDir = path.join(runDir, 'screenshots');
    const missingSsRefs = ssRefs.filter((ss) => !fs.existsSync(path.join(screenshotsDir, ss)));
    if (missingSsRefs.length > 0) {
      findings.push(enrichFinding({
        patternId: 'artifact_integrity_mismatch',
        message: 'report.md references missing screenshot files.',
        severity: 'error',
        evidence: `Missing screenshots: ${missingSsRefs.join(', ')}`,
      }));
    }
    checks.push({
      name: 'report.md screenshot references',
      status: missingSsRefs.length > 0 ? 'fail' : 'pass',
      message: missingSsRefs.length > 0
        ? `report.md references ${missingSsRefs.length} missing screenshot(s): ${missingSsRefs.join(', ')}`
        : 'report.md screenshot references are valid',
    });
  }

  // Gallery validation
  const galleryHtmlPath = path.join(runDir, 'screenshot-gallery.html');
  const galleryMdPath = path.join(runDir, 'screenshot-gallery.md');
  const galleryJsonPath = path.join(runDir, 'screenshot-gallery.json');

  const galleryFilesExist = fs.existsSync(galleryHtmlPath) && fs.existsSync(galleryMdPath) && fs.existsSync(galleryJsonPath);
  checks.push({
    name: 'screenshot gallery files exist',
    status: galleryFilesExist ? 'pass' : 'fail',
    message: galleryFilesExist
      ? 'screenshot-gallery.html, .md, .json all found'
      : 'Missing screenshot gallery files',
  });

  if (fs.existsSync(galleryHtmlPath)) {
    const galleryHtml = fs.readFileSync(galleryHtmlPath, 'utf-8');
    const absPathRegex = /(?:"|'|`)(?:\/Users\/[^"'\s]+|\/home\/[^"'\s]+|[A-Z]:\\[^"'\s]+)/;
    const hasAbsInGallery = absPathRegex.test(galleryHtml);
    checks.push({
      name: 'screenshot-gallery.html absolute paths',
      status: hasAbsInGallery ? 'warn' : 'pass',
      message: hasAbsInGallery ? 'screenshot-gallery.html contains absolute paths' : 'screenshot-gallery.html uses relative paths',
    });

    const externalAttrRegex = /(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi;
    const externalMatches = Array.from(galleryHtml.matchAll(externalAttrRegex));
    const hasExternalInGallery = externalMatches.length > 0;
    checks.push({
      name: 'screenshot-gallery.html external references',
      status: hasExternalInGallery ? 'warn' : 'pass',
      message: hasExternalInGallery ? 'screenshot-gallery.html contains external href/src attributes' : 'screenshot-gallery.html has no external href/src dependencies',
    });

    const ssRefRegex = /screenshots\/([^"\s]+\.png)/g;
    const ssRefs = Array.from(galleryHtml.matchAll(ssRefRegex)).map((m) => m[1]);
    const screenshotsDir = path.join(runDir, 'screenshots');
    const missingSsRefs = ssRefs.filter((ss) => !fs.existsSync(path.join(screenshotsDir, ss)));
    checks.push({
      name: 'screenshot-gallery.html screenshot links valid',
      status: missingSsRefs.length > 0 ? 'fail' : 'pass',
      message: missingSsRefs.length > 0
        ? `Gallery references ${missingSsRefs.length} missing screenshot(s): ${missingSsRefs.join(', ')}`
        : 'Gallery screenshot links are valid',
    });
  }

  // Check reports link to gallery
  const reportMdPath2 = path.join(runDir, 'report.md');
  let reportsLinkToGallery = false;
  if (fs.existsSync(reportMdPath2)) {
    const mdContent = fs.readFileSync(reportMdPath2, 'utf-8');
    reportsLinkToGallery = mdContent.includes('screenshot-gallery.html') || mdContent.includes('screenshot-gallery.md');
  }
  checks.push({
    name: 'reports link to gallery',
    status: reportsLinkToGallery ? 'pass' : 'warn',
    message: reportsLinkToGallery ? 'report.md references gallery files' : 'report.md does not reference gallery files',
  });

  const isValid = checks.every((c) => c.status !== 'fail');
  return { isValid, checks, findings };
}
