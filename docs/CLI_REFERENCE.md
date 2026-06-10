# ForgeQA CLI Reference

## Global Options

All commands support:
- `--json` — Output machine-readable JSON.
- `--quiet` — Suppress non-essential output.

## Commands

### `run <prompt>`

Execute a single QA workflow from a natural language prompt.

```bash
forgeqa run "password reset" --demo --validate --json
```

Options:
- `--demo` — Use the demo fixture server.
- `--external` — Target an external URL (requires `--base-url`).
- `--base-url <url>` — Base URL for external runs.
- `--industry <pack>` — Enable industry-specific assessment.
- `--validate` — Include validation in JSON output.
- `--dry-run` — Plan only, do not execute.
- `--json` — Machine-readable output.

### `run-validate <runId>` / `validate-run <runId>`

Validate artifacts for a specific run.

```bash
forgeqa run-validate <runId> --json
forgeqa validate-run <runId> --json
```

Options:
- `--strict` — Treat warnings as failures.
- `--fix` — Auto-repair safe issues.
- `--force-fix` — Overwrite existing aliases.
- `--json` — Machine-readable output.

### `repair-report <runId>` / `report-run <runId>`

Generate a unified repair + validation report for a run.

```bash
forgeqa repair-report <runId> --json
forgeqa report-run <runId> --json
```

Options:
- `--json` — Machine-readable output.
- `--markdown` — Output markdown to stdout.
- `--output <path>` — Write extra copy.

### `batch-run`

Execute multiple QA workflows from prompts.

```bash
forgeqa batch-run \
  --prompt "search and pagination" \
  --prompt "mobile responsive check" \
  --demo --json
```

Options:
- `--prompt <text>` — Add a prompt (repeatable).
- `--demo` — Use demo fixture.
- `--external` — External target mode.
- `--base-url <url>` — Base URL.
- `--industry <pack>` — Industry pack.
- `--dry-run` — Plan only.
- `--json` — Machine-readable output.

### `batch-validate <batchId>` / `validate-batch <batchId>`

Validate batch artifacts.

```bash
forgeqa batch-validate <batchId> --json
forgeqa validate-batch <batchId> --json
```

Options:
- `--strict` — Treat warnings as failures.
- `--fix` — Auto-repair safe issues.
- `--force-fix` — Overwrite existing aliases.
- `--fix-linked-runs` — Also fix linked runs.
- `--json` — Machine-readable output.

### `batch-report <batchId>` / `report-batch <batchId>`

Generate a unified batch report.

```bash
forgeqa batch-report <batchId> --json
forgeqa report-batch <batchId> --json
```

Options:
- `--json` — Machine-readable output.
- `--markdown` — Output markdown to stdout.
- `--output <path>` — Write extra copy.

### `dashboard`

Generate a project-level overview.

```bash
forgeqa dashboard --json
```

Options:
- `--json` — Machine-readable output.
- `--markdown` — Output markdown to stdout.
- `--limit <n>` — Limit displayed runs/batches.

### `release-check`

Run local MVP release readiness gate.

```bash
forgeqa release-check --json
```

Options:
- `--strict` — Treat warnings as failures.
- `--include-browser` — Check browser readiness.
- `--include-repair-smoke` — Repair engine smoke test.
- `--include-unified-report-smoke` — Unified report smoke test.
- `--include-batch-report-smoke` — Batch report smoke test.
- `--include-dashboard-smoke` — Dashboard smoke test.
- `--json` — Machine-readable output.

### `status`

Show local MVP status summary.

```bash
forgeqa status --json
```

### `scan`

Scan a page for testability before running workflows.

```bash
forgeqa scan --demo-route /multi-step-form --json
```

Options:
- `--demo-route <route>` — Demo fixture route.
- `--external` — External target.
- `--base-url <url>` — Base URL.
- `--industry <pack>` — Industry pack.
- `--json` — Machine-readable output.

### `rerun <runId>`

Rerun a previous workflow.

```bash
forgeqa rerun <runId> --dry-run --json
```

Options:
- `--dry-run` — Plan only.
- `--json` — Machine-readable output.

### `compare <runA> <runB>`

Compare two runs.

```bash
forgeqa compare <runA> <runB> --json
```

### `open <runId>`

Open run artifacts.

```bash
forgeqa open <runId> --trace --dry-run
```

Options:
- `--trace` — Open trace.zip.
- `--report` — Open report.html.
- `--screenshots` — Open screenshots directory.
- `--dry-run` — Print command, do not execute.

### `templates`

List available workflow templates.

### `search <query>`

Search templates by keyword.

### `diagnostics`

List diagnostic templates.

### `config`

Show effective configuration.

```bash
forgeqa config --json
```

### `list`

List recent runs.

### `--help`

Show help for all commands.

```bash
forgeqa --help
```
