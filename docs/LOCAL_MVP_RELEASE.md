# ForgeQA Local MVP Release Guide

## Release Criteria

Before considering ForgeQA ready for founder use, verify:

1. **Lint passes.** `pnpm lint` must return zero errors.
2. **Unit tests pass.** `pnpm test:unit` must pass all tests.
3. **Browser tests pass.** `pnpm test:browser` must pass (requires Chromium).
4. **Full suite passes.** `pnpm test:run` must pass all tests.
5. **Release check passes.** `pnpm exec tsx src/cli.ts release-check --json` must report `status: pass`.
6. **No forbidden dependencies.** No backend/SaaS dependencies in package.json.
7. **README complete.** All required sections present.
8. **Docs folder exists.** CLI reference, artifacts, safety model documented.
9. **Browser setup documented.** `pnpm setup:browsers` works.
10. **CI readiness.** CI workflow or CI readiness doc exists.

## Release Check

Run the release readiness gate:

```bash
pnpm exec tsx src/cli.ts release-check --json
```

This validates:
- Required scripts exist (`lint`, `test:unit`, `test:browser`, `test:run`, `test:ci`, `setup:browsers`)
- Engine loadability (CLI, templates, validator, repair, reports, dashboard)
- No forbidden backend/SaaS dependencies
- Artifact manager loadable
- Report generators loadable
- Package bin field exists
- README required sections present
- Docs folder exists
- CI workflow or CI readiness doc exists

Optional checks (slower):
- `--include-browser` — Verify Chromium is installed
- `--include-repair-smoke` — Repair engine smoke test
- `--include-unified-report-smoke` — Unified report smoke test
- `--include-batch-report-smoke` — Batch report smoke test
- `--include-dashboard-smoke` — Dashboard smoke test

## Packaging

ForgeQA is designed to run from source with `tsx` during development:

```bash
pnpm exec tsx src/cli.ts --help
```

After building:

```bash
pnpm build
node dist/cli.js --help
```

For global installation:

```bash
pnpm link
forgeqa --help
```

## Versioning

Current version: `0.1.0` (MVP)

- Minor version bumps for new local features.
- Patch version bumps for bug fixes.
- Major version reserved for breaking changes or SaaS additions.

## Distribution

- Source-first: run from `src/` with `tsx`.
- Build output in `dist/` for packaged use.
- No npm publish in MVP.
- No Docker image in MVP.
