# ForgeQA Failure Pattern Taxonomy

## Overview
This document proposes a 100-pattern failure library for ForgeQA MVP and beyond.

**Current:** 50 patterns (Session 3)
**Proposed new:** 50 patterns (this session)
**Target total:** 100 patterns

## Taxonomy Structure

### 1. Selector / Locator (Target: 12 patterns)
Current (6): `brittle_css_selector`, `duplicate_responsive_selector`, `hidden_testid_on_non_interactive_element`, `broad_text_locator_false_match`, `locator_strict_mode_multiple_matches`, `inaccessible_element_targeted`

Proposed new:
- `xpath_locator_used` — XPath is fragile and hard to maintain. Prefer role/testid.
- `nth_child_selector` — Using :nth-child() is brittle when list order changes.
- `class_name_selector` — CSS class names may be minified or changed by frameworks.
- `id_selector_only` — Using only #id ignores ARIA and user-facing semantics.
- `shadow_dom_not_pierced` — Element inside shadow DOM cannot be found without piercing.
- `iframe_selector_missing` — Element is inside an iframe but selector targets top-level page.

### 2. Wait / Flakiness (Target: 12 patterns)
Current (6): `hard_sleep_instead_of_semantic_wait`, `async_race_condition`, `network_idle_misuse`, `assertion_without_retry`, `flaky_due_to_external_dependency`, `dynamic_content_loaded_after_assertion`

Proposed new:
- `hydration_not_complete` — React/Vue/Angular app not fully hydrated before assertion.
- `css_animation_blocking_action` — Element animating when click is attempted.
- `overlay_blocking_element` — Modal or toast covers the target element.
- `infinite_scroll_not_triggered` — Content below fold not loaded because scroll was not simulated.
- `poll_loop_prevents_idle` — Background polling keeps network busy, preventing networkIdle.
- `page_load_event_before_resources` — Asserting before images/fonts finish loading.

### 3. Browser / CI (Target: 12 patterns)
Current (6): `chromium_not_installed`, `browser_launch_failed_in_ci`, `missing_linux_browser_dependencies`, `trace_missing_after_launch_failure`, `screenshot_path_broken_in_report`, `visual_snapshot_diff_due_to_environment`

Proposed new:
- `headless_vs_headed_behavior_diff` — Test passes headed but fails headless (or vice versa).
- `viewport_size_not_fixed` — Flakiness due to variable screen size across CI runners.
- `browser_cache_pollution` — Cached assets from previous run affect current test.
- `gpu_disabled_in_ci` — GPU-accelerated features break when GPU is disabled.
- `file_download_dialog_blocking` — Download dialog blocks further actions in headless.
- `dialog_alert_not_handled` — Unexpected alert() blocks execution.

### 4. Auth / Role (Target: 8 patterns)
Current (5): `auth_user_exists_without_identity`, `stale_real_user_credentials_in_tests`, `role_redirect_not_verified`, `admin_only_field_updated_by_normal_user`, `protected_route_passes_because_session_leaked`

Proposed new:
- `csrf_token_missing_in_form_submit` — Form submit fails because CSRF token was not fetched.
- `oauth_callback_not_mocked` — OAuth flow tries to hit real identity provider.
- `jwt_expired_during_test_run` — Token expires mid-test causing 401s.
- `multi_tab_session_isolation_broken` — Session shared across browser contexts unexpectedly.

### 5. Test Data / Cleanup (Target: 10 patterns)
Current (6): `seed_data_missing_required_relation`, `seed_data_violates_constraint`, `generated_data_hides_empty_state`, `cleanup_target_missing_safe_tags`, `duplicate_seed_data_on_rerun`, `real_email_domain_used_in_test_data`

Proposed new:
- `hardcoded_test_data_in_fixture` — Static JSON fixtures don't include runId, causing collisions.
- `cleanup_deletes_real_user` — Dry-run was skipped and production data was deleted.
- `file_leak_between_runs` — Uploaded files from previous run still exist in storage.
- `test_data_too_small` — Single-item dataset masks pagination or bulk-action bugs.

### 6. Routing / Navigation (Target: 6 patterns)
Current (4): `relative_url_without_base_url`, `port_conflict_on_local_server`, `demo_server_not_closed_after_failure`, `fixture_works_with_set_content_but_fails_on_real_navigation`

Proposed new:
- `spa_client_side_navigation_not_detected` — URL changes via pushState but Playwright doesn't wait.
- `redirect_chain_not_followed` — 302 redirect lands on unexpected page, causing assertion failure.

### 7. File Upload / Media (Target: 4 patterns)
Current (0)

Proposed new:
- `file_upload_size_exceeds_limit` — Uploaded dummy file is too large or too small.
- `mime_type_mismatch` — File extension doesn't match declared mime type.
- `upload_input_not_visible` — Hidden input cannot receive setInputFiles.
- `media_not_preloaded` — Video/audio element not ready before play/assertion.

### 8. Reports / Evidence (Target: 8 patterns)
Current (5): `report_claims_pass_without_screenshot`, `failure_without_trace_or_screenshot`, `cleanup_report_missing_dry_run_statement`, `readiness_score_not_linked_to_failed_steps`, `warning_treated_as_pass`

Proposed new:
- `screenshot_captured_too_early` — Screenshot shows loading spinner instead of final state.
- `trace_missing_network_tab` — Trace enabled but network snapshots were excluded.
- `report_html_broken_on_other_machine` — Absolute paths in HTML report break when moved.

### 9. Accessibility / Querying (Target: 6 patterns)
Current (0)

Proposed new:
- `aria_label_missing` — Interactive element has no accessible name.
- `focus_trap_not_tested` — Modal opens but focus management is not verified.
- `color_contrast_not_asserted` — Visual regression misses accessibility contrast.
- `keyboard_navigation_not_tested` — Flow only tested with mouse, missing keyboard path.
- `screen_reader_text_hidden` — sr-only text used for assertions but not visible.
- `redundant_alt_text` — Images have alt but it's decorative and should be empty.

### 10. Backend / API Dependency (Target: 8 patterns)
Current (5): `optional_backend_failure_breaks_core_ui`, `cors_error_blocks_dashboard`, `missing_rpc_function`, `schema_cache_stale`, `notification_side_effect_blocks_primary_action`

Proposed new:
- `api_rate_limit_hit` — Backend returns 429 during test execution.
- `graphql_fragment_missing` — Query returns partial data because fragment wasn't registered.
- `websocket_not_ready` — Realtime connection not established before dependent action.

### 11. Dangerous Fix (Target: 5 patterns)
Current (5): `drop_trigger_to_make_test_pass`, `disable_rls_to_make_test_pass`, `broad_delete_cleanup`, `production_key_used_in_test`, `real_payment_submit_attempted`

No new patterns proposed in this category. The 5 existing patterns are sufficient for MVP warning coverage.

## Deduplication Rules Applied

1. `xpath_locator_used` + `nth_child_selector` + `class_name_selector` are separate from `brittle_css_selector` because root causes differ (XPath engine, DOM order, CSS class minification).
2. `hydration_not_complete` is separate from `dynamic_content_loaded_after_assertion` because hydration is a framework-specific lifecycle, not generic dynamic content.
3. `spa_client_side_navigation_not_detected` is separate from `async_race_condition` because it targets router-specific waiting, not generic async timing.

## Severity Distribution (Proposed 100)

| Severity | Count | Notes |
|----------|-------|-------|
| error | 35 | Breaks test correctness or safety |
| warning | 50 | Flakiness, maintainability, or evidence risk |
| info | 15 | Best-practice recommendations |

## Source Confidence Distribution (Proposed 100)

| Confidence | Count | Examples |
|------------|-------|----------|
| high (official_docs / research_paper) | 60 | Playwright, Cypress, Testing Library docs |
| medium/high (major_project_github_issue) | 25 | microsoft/playwright issues |
| medium (popular_public_repo) | 10 | Example repos, boilerplates |
| medium/low (blog_post) | 5 | QA practitioner blogs |
