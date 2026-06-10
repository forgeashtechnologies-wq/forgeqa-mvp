# ForgeQA Artifacts

Every run and batch produces structured artifacts in `artifacts/`.

## Run Artifacts

Located in `artifacts/runs/<runId>/`.

### Required Artifacts

| File | Purpose |
|------|---------|
| `run.json` | Run manifest: status, verdict, template, steps, timestamps |
| `plan.json` | Generated test plan from template |
| `data.json` | Golden test data with `createdByForgeQA: true` tags |
| `report.md` | Human-readable Markdown report |
| `report.html` | Human-readable HTML report |
| `screenshots/` | Evidence screenshots (PNG) |
| `trace.zip` | Playwright trace (when browser executes) |

### Validation Artifacts

| File | Purpose |
|------|---------|
| `artifact-validation.json` | Validation results (checks, findings, summary) |
| `artifact-validation.md` | Human-readable validation report |
| `run-validation.json` | Alias of artifact-validation.json |
| `run-validation.md` | Alias of artifact-validation.md |

### Repair Artifacts

Created after `run-validate --fix`.

| File | Purpose |
|------|---------|
| `artifact-repair.json` | Repair actions and findings |
| `artifact-repair.md` | Human-readable repair report |
| `run-repair.json` | Alias of artifact-repair.json |
| `run-repair.md` | Alias of artifact-repair.md |

### Unified Report

Created after `repair-report <runId>`.

| File | Purpose |
|------|---------|
| `unified-report.json` | Consolidated run + validation + repair summary |
| `unified-report.md` | Human-readable unified report |

### Optional Artifacts

| File | Purpose |
|------|---------|
| `cleanup-report.md` | Cleanup analysis (dry-run only) |
| `scope-analysis.json` | Scope analysis findings |
| `failure-classification.json` | Failure type classification |
| `data-safety-audit.json` | Data safety audit results |
| `industry-assessment.json` | Industry pack assessment |

## Batch Artifacts

Located in `artifacts/batches/<batchId>/`.

| File | Purpose |
|------|---------|
| `batch-plan.json` | Batch plan with prompts and templates |
| `batch-plan.md` | Human-readable batch plan |
| `batch-result.json` | Batch execution results |
| `batch-result.md` | Human-readable batch results |
| `batch-manifest.json` | Batch artifact manifest |
| `batch-validation.json` | Batch validation results |
| `batch-validation.md` | Human-readable batch validation |
| `batch-repair.json` | Batch repair actions |
| `batch-repair.md` | Human-readable batch repair |
| `batch-unified-report.json` | Consolidated batch summary |
| `batch-unified-report.md` | Human-readable batch unified report |
| `industry-batch-assessment.json` | Industry assessment for batch |
| `industry-batch-assessment.md` | Human-readable industry assessment |

## Release Check Artifacts

Located in `artifacts/release/`.

| File | Purpose |
|------|---------|
| `latest-release-check.json` | Latest release check result |
| `latest-release-check.md` | Human-readable latest release check |
| `release-check-<timestamp>.json` | Timestamped release check |
| `release-check-<timestamp>.md` | Timestamped release check report |

## Dashboard Artifacts

Located in `artifacts/dashboard/`.

| File | Purpose |
|------|---------|
| `project-overview.json` | Latest project dashboard |
| `project-overview.md` | Human-readable project dashboard |
| `project-overview-<timestamp>.json` | Timestamped dashboard |
| `project-overview-<timestamp>.md` | Timestamped dashboard report |

## Validation Checks

Run validation checks include:
- Required files present
- No absolute paths in reports
- No external links in HTML reports
- Screenshots directory exists
- Report files exist and have content
- Data files tagged correctly
- No certification claims in reports
- Cleanup report exists (dry-run)

## Portability Rules

All artifacts must be:
- Self-contained within `artifacts/runs/<runId>/` or `artifacts/batches/<batchId>/`
- Referenced with relative paths only
- Free of absolute filesystem paths
- Free of `file://` URLs pointing outside the artifact directory
