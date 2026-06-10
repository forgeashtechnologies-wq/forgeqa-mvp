# ForgeQA Safety Model

## Golden Data Safety

Every generated item in ForgeQA must have:
- `runId` / `e2eRunId` — unique identifier
- `createdByForgeQA: true` — provenance tag
- `safeToDelete: true` — cleanup eligibility (dry-run only)

## What ForgeQA Never Does

- **No real credentials.** All login flows use synthetic test data.
- **No real email.** Email steps are simulated or stubbed.
- **No real payments.** Payment steps are policy-blocked in MVP.
- **No real OAuth.** Social login steps are detected but not executed.
- **No production writes.** All database writes are tagged and scoped.
- **No unrestricted browsing.** Every test follows an approved template.

## Cleanup Policy

- Cleanup is **dry-run only** in MVP.
- Actual deletion requires manual confirmation.
- All cleanup targets are tagged `safeToDelete: true`.
- Cleanup report is generated for every run.

## Report Safety

- All reports include a **readiness-not-certification disclaimer**.
- Reports never claim compliance, security certification, or production readiness.
- Reports use relative paths only. No absolute paths.
- Reports contain no external links.

## Execution Policy

Every run is subject to an execution policy that:
- Blocks external URLs in demo mode.
- Warns on payment-like fields.
- Requires explicit approval for risky actions.
- Tags all generated data.

## Artifact Safety

- Artifacts live only in `artifacts/` directory.
- Never modify source files, fixtures, or package configuration.
- Never delete artifacts automatically.
- Repair only modifies files within the run/batch directory.

## Browser Safety

- Playwright Chromium runs in a controlled context.
- Demo mode targets localhost only.
- External mode requires explicit `--external` flag.
- URL policy validates all targets before execution.
