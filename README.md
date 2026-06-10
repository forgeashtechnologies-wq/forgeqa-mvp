# ForgeQA

> QA Proof OS for AI-built web apps — local CLI engine.

ForgeQA is a local-first, prompt-driven QA engine that validates AI-built web applications by executing approved workflow templates against a browser, producing evidence-based artifacts, and reporting readiness — not certification.

## What ForgeQA Is

- A **local CLI** that turns natural language prompts into structured browser tests.
- An **artifact generator** that produces founder-readable evidence: screenshots, traces, reports, and validation summaries.
- A **safe execution engine** that never uses real credentials, real email, real payments, or real OAuth.
- A **readiness validator** that checks artifacts for completeness, portability, and safety before sharing.

## What ForgeQA Is Not

- **Not an unrestricted AI browser agent.** Every test follows an approved template.
- **Not a SaaS dashboard.** All data lives on your local filesystem.
- **Not a compliance certification tool.** Reports prove QA readiness, not legal compliance.
- **Not a production testing service.** Cleanup is dry-run only. No real user data.

## Core Safety Model

- Every run gets a unique `runId`.
- All generated data is tagged `createdByForgeQA: true`.
- All cleanup targets are tagged `safeToDelete: true`.
- Cleanup is **dry-run only** in MVP.
- No production writes.
- No real user data.
- No real credentials, email, payments, or OAuth execution.

## Requirements

- Node.js >= 20.0.0
- pnpm (or npm/yarn with `packageManager` override)
- Playwright Chromium (installed via `pnpm setup:browsers`)

## Install

```bash
pnpm install
```

## Browser Setup

ForgeQA uses Playwright Chromium for browser execution.

```bash
pnpm setup:browsers
# or directly:
pnpm exec playwright install chromium
```

On Linux/CI:

```bash
pnpm exec playwright install --with-deps chromium
```

Unit tests can run without browsers. Browser/integration tests require Chromium.

## Quick Start

```bash
# See all commands
pnpm exec tsx src/cli.ts --help

# Check local status
pnpm exec tsx src/cli.ts status --json

# Run a demo workflow
pnpm exec tsx src/cli.ts run "password reset" --demo --validate --json

# Check release readiness
pnpm exec tsx src/cli.ts release-check --json
```

## First Demo Run

```bash
pnpm exec tsx src/cli.ts run "password reset" --demo --validate --json
```

This creates artifacts in `artifacts/runs/<runId>/`:
- `run.json` — run manifest
- `plan.json` — generated test plan
- `data.json` — golden test data
- `report.md` / `report.html` — human-readable reports
- `screenshots/` — evidence screenshots
- `trace.zip` — Playwright trace (when browser runs)

## Validate a Run

```bash
pnpm exec tsx src/cli.ts run-validate <runId> --json
# or alias:
pnpm exec tsx src/cli.ts validate-run <runId> --json
```

Checks artifact completeness, portability (no absolute paths), and safety (no certification claims).

## Repair a Run

```bash
pnpm exec tsx src/cli.ts run-validate <runId> --fix --json
```

Auto-fixes safe issues: absolute paths, missing disclaimers, missing validation aliases. Re-validates after repair.

## Generate Unified Run Report

```bash
pnpm exec tsx src/cli.ts repair-report <runId> --json
# or alias:
pnpm exec tsx src/cli.ts report-run <runId> --json
```

Merges run.json, artifact-validation.json, artifact-repair.json, and other run artifacts into a single `unified-report.md` and `unified-report.json`.

## Run a Batch

```bash
pnpm exec tsx src/cli.ts batch-run \
  --prompt "search and pagination" \
  --prompt "mobile responsive check" \
  --demo --json
```

Runs multiple prompts in sequence. Creates `artifacts/batches/<batchId>/` with plan, results, and manifest.

## Validate a Batch

```bash
pnpm exec tsx src/cli.ts batch-validate <batchId> --json
# or alias:
pnpm exec tsx src/cli.ts validate-batch <batchId> --json
```

## Generate Unified Batch Report

```bash
pnpm exec tsx src/cli.ts batch-report <batchId> --json
# or alias:
pnpm exec tsx src/cli.ts report-batch <batchId> --json
```

Merges batch-plan.json, batch-result.json, batch-validation.json, batch-repair.json, and linked run summaries into `batch-unified-report.md` and `batch-unified-report.json`.

## Generate Dashboard

```bash
pnpm exec tsx src/cli.ts dashboard --json
```

Reads all local artifacts and produces a project-level overview with health score, recommendations, and status summary.

## Industry Packs

Test industry-specific readiness:

```bash
pnpm exec tsx src/cli.ts batch-run \
  --prompt "register alumni complete profile upload avatar" \
  --prompt "password reset" \
  --demo --industry education-alumni --json
```

## Scanner / Preflight Scan

Scan a page for testability before running workflows:

```bash
pnpm exec tsx src/cli.ts scan --demo-route /multi-step-form --json
```

## Release Check

Validate local MVP readiness:

```bash
pnpm exec tsx src/cli.ts release-check --json
```

Checks engine loadability, artifact structure, required scripts, forbidden dependencies, and optional smoke tests.

## JSON Mode

All commands support `--json` for machine-readable output:

```bash
pnpm exec tsx src/cli.ts run "password reset" --demo --json
pnpm exec tsx src/cli.ts run-validate <runId> --json
pnpm exec tsx src/cli.ts release-check --json
pnpm exec tsx src/cli.ts status --json
```

## Artifact Folder Structure

```
artifacts/
  runs/
    <runId>/
      run.json
      plan.json
      data.json
      report.md
      report.html
      screenshots/
      trace.zip
      artifact-validation.json
      artifact-repair.json
      unified-report.json
  batches/
    <batchId>/
      batch-plan.json
      batch-result.json
      batch-manifest.json
      batch-validation.json
      batch-repair.json
      batch-unified-report.json
  release/
    latest-release-check.json
    release-check-<timestamp>.json
  dashboard/
    project-overview.json
    project-overview.md
```

## Scripts

- `pnpm dev` — Run CLI via tsx.
- `pnpm build` — Compile to `dist/`.
- `pnpm start` — Run compiled CLI.
- `pnpm test` — Run Vitest in watch mode.
- `pnpm test:unit` — Run all non-browser tests (no Chromium required).
- `pnpm test:browser` — Run browser-dependent tests only (Chromium required).
- `pnpm test:run` — Run the full test suite.
- `pnpm test:ci` — Run the full test suite (CI alias).
- `pnpm check` — Run release-check in JSON mode.
- `pnpm setup:browsers` — Install Playwright Chromium.
- `pnpm lint` — TypeScript strict check.
- `pnpm demo:password-reset` — Quick demo run.
- `pnpm demo:dashboard` — Quick dashboard generation.

## Safety Guarantees

- Only reads/writes within `artifacts/` directory.
- Never modifies source files, fixtures, or package.json.
- Never deletes artifacts.
- Never executes cleanup (dry-run only).
- No certification or compliance claims in reports.
- All links in reports are relative. No external links.

## Limitations

- Local filesystem only. No database, no SaaS, no external storage.
- Templates are curated, not AI-generated on the fly.
- Browser tests require Chromium installation.
- Batch execution is sequential, not parallel.
- Cleanup is dry-run only. Manual confirmation required for actual cleanup.

## Roadmap

- **Backend/SaaS deferred.** All features work locally first.
- Future: optional Supabase/Redis for team collaboration.
- Future: CI/CD integration templates.
- Future: web dashboard for non-technical stakeholders.

## Troubleshooting

**Chromium not found:**
```bash
pnpm setup:browsers
```

**TypeScript errors:**
```bash
pnpm lint
```

**Tests failing:**
```bash
pnpm test:unit      # non-browser tests
pnpm test:browser   # browser tests (requires Chromium)
```

**Artifacts missing:**
Ensure the run completed. Check `artifacts/runs/<runId>/run.json`.

## Documentation

- [AGENTS.md](AGENTS.md) — Agent rules and identity for ForgeQA.
- [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md) — Full command reference.
- [docs/ARTIFACTS.md](docs/ARTIFACTS.md) — Artifact structure and validation.
- [docs/SAFETY_MODEL.md](docs/SAFETY_MODEL.md) — Safety model and guarantees.
- [docs/LOCAL_MVP_RELEASE.md](docs/LOCAL_MVP_RELEASE.md) — Release readiness guide.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — Common issues and fixes.

## License

MIT
