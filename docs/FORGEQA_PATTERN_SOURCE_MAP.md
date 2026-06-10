# ForgeQA Pattern Source Map

Annotated bibliography of public sources mined for failure patterns.

## Official Documentation (High Confidence)

### Playwright
- **URL:** https://playwright.dev/docs/best-practices
- **Type:** official_docs
- **Patterns mined:**
  - Prefer user-facing attributes over CSS/XPath selectors.
  - Use web-first assertions (auto-retry) instead of manual polling.
  - Avoid testing third-party dependencies; mock network instead.
  - Keep tests isolated; use beforeEach hooks.
  - Generate locators with codegen when uncertain.
- **Relevance:** Core selector and assertion philosophy directly applicable.

- **URL:** https://playwright.dev/docs/locators
- **Type:** official_docs
- **Patterns mined:**
  - Role locators are the most resilient (closest to user perception).
  - getByTestId is resilient but not user-facing; use as fallback.
  - Chain and filter locators to narrow scope.
  - Avoid broad text locators on interactive elements.
- **Relevance:** Selector priority order maps directly to anti-patterns.

- **URL:** https://playwright.dev/docs/actionability
- **Type:** official_docs
- **Patterns mined:**
  - Actions auto-wait for visible, stable, enabled, receiving events.
  - TimeoutError means one or more actionability checks failed.
  - fill requires editable; check requires enabled.
- **Relevance:** Explains root cause of "element not clickable/visible" failures.

- **URL:** https://playwright.dev/docs/test-assertions
- **Type:** official_docs
- **Patterns mined:**
  - Auto-retrying assertions (toBeVisible, toHaveText) should be preferred.
  - Manual isVisible() + expect is flaky because it does not wait.
  - Default assertion timeout is 5s.
- **Relevance:** Justifies `assertion_without_retry` and `hard_sleep_instead_of_semantic_wait`.

- **URL:** https://playwright.dev/docs/ci
- **Type:** official_docs
- **Patterns mined:**
  - Use workers=1 in CI for stability.
  - Install browsers + system deps before running.
  - Use Docker container for consistent environment.
  - Upload artifacts (report, trace) on failure.
- **Relevance:** CI-specific browser-launch and visual-diff patterns.

- **URL:** https://playwright.dev/docs/trace-viewer-intro
- **Type:** official_docs
- **Patterns mined:**
  - Traces should run `on-first-retry` to avoid overhead.
  - Trace viewer shows DOM snapshot, network, console per action.
  - Missing trace makes root-cause analysis harder.
- **Relevance:** Validates `failure_without_trace_or_screenshot` and `trace_missing_after_launch_failure`.

- **URL:** https://playwright.dev/docs/pom
- **Type:** official_docs
- **Patterns mined:**
  - Page Object Models simplify maintenance by centralizing selectors.
  - Reusable POM methods reduce duplication.
- **Relevance:** Provides safe-fix guidance for brittle-selector issues.

### Cypress
- **URL:** https://docs.cypress.io/app/core-concepts/best-practices
- **Type:** official_docs
- **Patterns mined:**
  - Never hardcode secrets in test files.
  - Use `cy.env()` for sensitive values.
  - Test specs in isolation; do not share state.
  - Programmatic login rather than UI login for speed.
  - Assign `data-*` attributes for selectors.
  - Avoid unnecessary waiting.
- **Relevance:** Auth, secrets, isolation, and selector patterns overlap with ForgeQA pillars.

- **URL:** https://docs.cypress.io/app/references/error-messages
- **Type:** official_docs
- **Patterns mined:**
  - "Timed out retrying: Expected to find element" → selector / timing issue.
  - "cy...() failed because the page updated" → DOM mutation during action.
  - "cy...() failed because the element is currently animating" → stability failure.
  - "The browser process running your tests just exited unexpectedly" → browser/CI crash.
  - Cross-origin error on page load → CORS / navigation issue.
- **Relevance:** Common error messages map to classifier detection signals.

### Testing Library
- **URL:** https://testing-library.com/docs/queries/about/#priority
- **Type:** official_docs
- **Patterns mined:**
  - Query priority: role > label > placeholder > text > display value > alt > title > testid.
  - `getBy` throws on 0 or >1 matches; `findBy` is async and retries.
  - `queryBy` returns null for absent elements.
  - Tests should resemble how users interact with the page.
- **Relevance:** Accessibility-first querying; validates `hidden_testid_on_non_interactive_element`.

## GitHub Issues (Medium/High Confidence)

### Microsoft / Playwright
- **URL:** https://github.com/microsoft/playwright/issues?q=is%3Aissue+%22strict+mode+violation%22
- **Type:** major_project_github_issue
- **Patterns mined:**
  - Strict mode violation: locator matches multiple elements.
  - Setting default timeout causes Firefox to fail differently than Chromium.
  - Automatic waiting to resolve strict mode violations (feature request, not yet implemented).
  - getByText default exact match debate.
  - generateLocator depends on timing → non-deterministic locators.
- **Relevance:** Real-world error messages and user-reported symptoms.

## Research Papers (High Confidence)

- **Topic:** "flaky JavaScript tests" / "systemic flakiness in GUI tests"
- **Type:** research_paper
- **Patterns expected:**
  - Async timing (most common flakiness root cause).
  - DOM race conditions.
  - Resource loading order.
  - Test order dependencies.
- **Note:** Specific papers not fetched in this session; should be mined from ACM/IEEE open-access or arXiv.

## Gaps / Next Sources to Mine

1. Selenium official docs on waits and page objects.
2. Specific Playwright error-classifier mapping (e.g., TimeoutError subtypes).
3. arXiv papers on flaky-test classification (e.g., "A Study of Flaky Tests in JavaScript").
4. Public Playwright boilerplate repos for folder-structure and POM patterns.
5. GitHub issues for "browser launch failed" and "chromium executable does not exist".
