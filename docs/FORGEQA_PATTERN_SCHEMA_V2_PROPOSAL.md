# ForgeQA Pattern Schema v2 Proposal

## Current Schema (v1)

```typescript
interface AntiPattern {
  id: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  mitigation: string;
}
```

**Limitations:**
- No structured symptom/root-cause separation.
- No detection signals for automatic classification.
- No common error message regexes.
- No source provenance.
- No related-pattern linkage.
- No regression-test guidance.

## Proposed Schema (v2)

```typescript
interface AntiPatternV2 {
  id: string;
  title: string;
  category: string;
  severity: 'error' | 'warning' | 'info';

  symptom: string;
  detectionSignals: string[];
  commonErrorMessages: string[];

  rootCause: string;
  howToConfirm: string;
  safeFix: string;
  preventionRule: string;

  regressionTest: string;

  sourceType: 'official_docs' | 'research_paper' | 'major_project_github_issue' | 'popular_public_repo' | 'blog_post' | 'forum';
  sourceUrl: string;
  sourceConfidence: 'high' | 'medium' | 'low';

  appliesTo: {
    engines: ('playwright' | 'cypress' | 'selenium' | 'testing-library' | 'generic')[];
    ciEnvironments: ('local' | 'github-actions' | 'docker' | 'generic')[];
  };

  relatedPatterns: string[];
}
```

## Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| id | yes | Stable kebab-case identifier |
| title | yes | Human-readable name |
| category | yes | Taxonomy category (e.g., "Wait / Flakiness") |
| severity | yes | error / warning / info |
| symptom | yes | What the user sees (test failure, report anomaly) |
| detectionSignals | yes | Keywords, selectors, or conditions that trigger the detector |
| commonErrorMessages | yes | Regex-able error snippets from browser/CI logs |
| rootCause | yes | Why this happens (engineering explanation) |
| howToConfirm | yes | Steps to verify this is the actual root cause |
| safeFix | yes | Recommended fix that does not compromise safety |
| preventionRule | yes | How to prevent this during template authoring |
| regressionTest | yes | What test should be added to prevent regression |
| sourceType | yes | Provenance category |
| sourceUrl | yes | Canonical URL |
| sourceConfidence | yes | high / medium / low |
| appliesTo.engines | yes | Which test engines this pattern affects |
| appliesTo.ciEnvironments | yes | Where this typically manifests |
| relatedPatterns | no | IDs of patterns that often co-occur |

## Example v2 Pattern

```typescript
{
  id: 'hard_sleep_instead_of_semantic_wait',
  title: 'Hard Sleep Instead of Semantic Wait',
  category: 'Wait / Flakiness',
  severity: 'warning',

  symptom: 'Test passes locally but flakes in CI, or wastes time waiting longer than necessary.',
  detectionSignals: [
    'step.action === "wait"',
    'step.value is a numeric string > 0',
    'no preceding or following assertVisible/assertText',
  ],
  commonErrorMessages: [
    'TimeoutError: page.waitForTimeout',
    'Test timeout of 30000ms exceeded',
  ],

  rootCause: 'Fixed-duration sleeps are not adaptive. They waste time when the condition is already met, and they fail when the condition takes longer than the hardcoded threshold.',
  howToConfirm: 'Check if the step before the wait triggers an async operation (network request, animation, state update). Replace the wait with an assertion that waits for the resulting DOM change.',
  safeFix: 'Replace page.waitForTimeout(ms) with page.waitForSelector(), page.waitForResponse(), or an auto-retrying assertion (expect(...).toBeVisible()).',
  preventionRule: 'Review every "wait" step in workflow templates. If it waits for a UI state, replace it with an assertVisible or assertText step.',

  regressionTest: 'Add a detector in analyzePatterns that flags any wait step without a subsequent assertion.',

  sourceType: 'official_docs',
  sourceUrl: 'https://playwright.dev/docs/best-practices#use-web-first-assertions',
  sourceConfidence: 'high',

  appliesTo: {
    engines: ['playwright', 'cypress', 'selenium', 'generic'],
    ciEnvironments: ['local', 'github-actions', 'docker', 'generic'],
  },

  relatedPatterns: [
    'assertion_without_retry',
    'async_race_condition',
    'network_idle_misuse',
  ],
}
```

## Migration Plan

1. **Backward compatibility:** Keep `description` and `mitigation` as computed fields:
   - `description` = `symptom`
   - `mitigation` = `safeFix`
2. **Registry update:** Convert existing 50 patterns to v2; add 50 new patterns directly in v2.
3. **Analyzer update:** Use `detectionSignals` and `commonErrorMessages` to drive heuristic matching.
4. **Report update:** Render `rootCause`, `howToConfirm`, and `safeFix` in a collapsible section.

## Risks

| Risk | Impact | Mitigation |
|------|--------|----------|
| Schema churn breaks existing tests | Medium | Maintain computed v1 fields during migration |
| 100 patterns is too large for runtime registry | Low | Registry is a static const array; tree-shaking isn't needed for MVP |
| Detection heuristics produce false positives | Medium | Start with conservative heuristics; default severity=warning |
| Source URLs go stale | Low | Prefer docs URLs over issue URLs; check links during release |

## Go / No-Go Recommendation

**Status: GO**

**Rationale:**
- All sources are public and trusted.
- Schema v2 is backward-compatible via computed fields.
- The 50 new patterns are well-deduplicated and cover real gaps.
- No external dependencies or services required.
- Implementation can be split across 2-3 sessions.

**Conditions for full approval:**
1. User approves schema v2 fields.
2. User confirms 50-pattern backlog priority order.
3. User specifies whether to implement DOM-aware detection in this session or a follow-up.
