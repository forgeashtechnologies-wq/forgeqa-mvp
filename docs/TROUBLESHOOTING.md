# ForgeQA Troubleshooting

## Chromium Not Found

**Error:**
```
Executable doesn't exist at .../chromium
```

**Fix:**
```bash
pnpm setup:browsers
# or
pnpm exec playwright install chromium
# Linux/CI:
pnpm exec playwright install --with-deps chromium
```

## TypeScript Errors

**Error:**
```
TS errors during lint or test
```

**Fix:**
```bash
pnpm lint
```

Fix reported errors. Common causes:
- Unused variables (remove or prefix with `_`)
- Missing imports
- Type mismatches

## Tests Failing

**Browser tests fail:**
```bash
pnpm test:browser
```

- Ensure Chromium is installed.
- Ensure demo server port is not in use.
- Check that no other Playwright processes are running.

**Unit tests fail:**
```bash
pnpm test:unit
```

- Should pass without browsers.
- If failures persist, check for stale artifacts in `artifacts/`.

## Artifacts Missing

**Error:**
```
Run not found: <runId>
```

**Fix:**
- Check `artifacts/runs/` for the run directory.
- Verify the run completed (check `run.json` for `status: "completed"`).
- Re-run the workflow if needed.

## Validation Warnings

**Error:**
```
Validation warnings: missing files, absolute paths, etc.
```

**Fix:**
```bash
forgeqa run-validate <runId> --fix --json
```

This auto-repairs safe issues (absolute paths, missing disclaimers, missing aliases).

## Repair Warnings

**Error:**
```
Manual review required for repair action
```

**Fix:**
- Review `artifact-repair.md` for manual review items.
- Check the specific file mentioned in the repair action.
- Manually fix if the automated repair was not safe.

## Release Check Failures

**Error:**
```
Release check: fail
```

**Fix:**
- Run `pnpm exec tsx src/cli.ts release-check --json` to see which checks failed.
- Common fixes:
  - `required_scripts`: Add missing scripts to package.json.
  - `forbidden_deps`: Remove forbidden dependencies from package.json.
  - `readme_sections`: Add missing sections to README.md.
  - `docs_folder`: Create `docs/` folder.
  - `ci_readiness`: Add `.github/workflows/ci.yml` or `docs/CI_READINESS.md`.

## Dashboard Not Generated

**Error:**
```
No dashboard found
```

**Fix:**
```bash
forgeqa dashboard --json
```

This reads all artifacts and generates `artifacts/dashboard/project-overview.json`.

## Batch Runs Not Found

**Error:**
```
Batch not found: <batchId>
```

**Fix:**
- Check `artifacts/batches/` for the batch directory.
- Verify `batch-plan.json` exists.
- Re-run the batch if needed.

## Portability Issues

**Error:**
```
Absolute paths found in report
```

**Fix:**
- Run `forgeqa run-validate <runId> --fix` to auto-repair.
- Manually replace absolute paths with relative paths if repair fails.

## Permission Errors

**Error:**
```
EACCES: permission denied
```

**Fix:**
- Ensure write permissions to `artifacts/` directory.
- On Linux/macOS: `chmod -R u+w artifacts/`

## Slow Tests

**Browser tests are slow:**
- This is expected. Each browser test launches Chromium.
- Use `pnpm test:unit` for faster feedback.
- Use `pnpm test:browser` only when browser logic changes.

## Memory Issues

**Out of memory during tests:**
- Close other applications.
- Reduce parallel test workers: `vitest run --maxWorkers 2`.
- Run browser tests separately: `pnpm test:browser`.
