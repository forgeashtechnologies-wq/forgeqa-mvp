# ForgeQA Agent Rules

## Identity

ForgeQA is a QA Proof OS for AI-built web apps.
It is not an AI testing tool.
It is not a generic browser agent.
It is not a full coding IDE.
It is not a SaaS dashboard first.

## Core Pillars

### 1. Prompt-driven QA

- User gives a natural language prompt.
- System maps prompt to approved workflow templates.
- No unrestricted AI browser wandering in MVP.

### 2. Golden Data Safety

- Every generated item must have `runId` / `e2eRunId`.
- Every generated item must have `createdByForgeQA = true`.
- Every cleanup target must have `safeToDelete = true`.
- No real user data.
- No production writes by default.
- Cleanup is dry-run only in MVP.

### 3. Watched / Evidence-based Execution

- Every run creates artifacts.
- Required artifacts per run:
  - `plan.json`
  - `data.json`
  - `run.json`
  - `screenshots/`
  - `trace.zip` (when Playwright runs)
  - `report.html`
  - `report.md`
  - `cleanup-report.md`
- Reports must be founder-readable, not just developer logs.

## Prohibitions

- No secrets in code, logs, or artifacts.
- No production writes.
- No real user data.
- No database in MVP (local filesystem only).
- No cleanup execution in MVP (dry-run only).
- No unrestricted AI browser agent.

## Architecture

- Single-package TypeScript CLI.
- `pnpm`, `tsx`, `vitest`.
- Local filesystem artifacts first.
- No Supabase, Redis, Fastify, Docker, or CI/CD in MVP.

## Validation Commands

- `pnpm lint` — TypeScript strict check.
- `pnpm test:run` — Unit tests.
- `pnpm dev -- --help` — CLI help.
- `pnpm dev -- run "register alumni complete profile upload avatar" --demo` — End-to-end smoke.
