# ForgeQA Pattern Research Plan

## Objective
Expand ForgeQA's Failure Pattern Library from ~50 to 100+ patterns by systematically harvesting, summarizing, and classifying anti-patterns from public, trusted sources.

## Scope
- **In scope:** Public docs, public GitHub repos/issues, open research papers, QA best-practice guides.
- **Out of scope:** Private repos, proprietary code, paywalled content, user data, secrets.

## Methodology

### Phase 1 — Source Discovery (This session)
- Fetch and read official documentation pages.
- Search GitHub issues for common error messages.
- Identify research papers on flaky-test classification.
- Map each source to pattern categories.

### Phase 2 — Pattern Extraction
- For each source, extract: symptom, root cause, detection signal, safe fix.
- Summarize in our own words; never copy verbatim.
- Record source URL and source type for every pattern.

### Phase 3 — Deduplication & Classification
- Group by symptom + root cause.
- Assign to one of 11 categories.
- Score source confidence.

### Phase 4 — Schema & Registry Update
- Propose schema v2 with richer fields.
- Update `src/patterns/registry.ts`.
- Update `src/patterns/analyzer.ts` with new detectors.

### Phase 5 — Report Integration
- Surface new findings in `report.md` and `report.html`.
- Add severity-weighted readiness impact.

## Source Priority

| Priority | Source | Confidence |
|----------|--------|------------|
| 1 | Playwright official docs (playwright.dev) | high |
| 2 | Cypress official docs (docs.cypress.io) | high |
| 3 | Testing Library docs (testing-library.com) | high |
| 4 | Selenium official docs | high |
| 5 | Microsoft/playwright GitHub issues | medium/high |
| 6 | Public Playwright/Cypress/Selenium example repos | medium |
| 7 | Research papers (flaky JavaScript tests, oracles) | high |
| 8 | QA blogs / Stack Overflow | medium/low |

## Key Research Questions

1. What are the top 20 most common Playwright error messages in GitHub issues?
2. Which locator strategies are officially discouraged and why?
3. What are the canonical "flaky test" categories in peer-reviewed research?
4. How do Cypress, Playwright, and Testing Library align on query priority?
5. What CI-specific failure modes are unique to browser automation?

## Deliverables

1. `docs/FORGEQA_PATTERN_SOURCE_MAP.md` — annotated bibliography of sources
2. `docs/FORGEQA_FAILURE_PATTERN_TAXONOMY.md` — categorized pattern list
3. Schema v2 proposal for `AntiPattern` type
4. Proposed 50-pattern backlog for next implementation sprint
5. Go/No-Go recommendation

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GitHub rate limiting | Cache fetched pages; space requests 1s apart |
| Verbatim copying | Strict "summarize in own words" rule; review before commit |
| Scope creep (too many patterns) | Cap Phase 2 at 50 new patterns; backlog rest |
| False positives in detection | Conservative heuristics; warn-only in MVP |
| Source link rot | Store canonical URLs only; prefer docs over issues |

## Success Criteria
- At least 50 new patterns documented with source URLs.
- All patterns have: id, category, severity, symptom, root cause, safe fix.
- No copyrighted text copied verbatim.
- Schema proposal reviewed and approved before implementation.
