import { describe, it, expect } from 'vitest';
import { resolveForgeQAPaths } from './paths.js';

describe('Config Paths', () => {
  it('resolves project-local paths', () => {
    const paths = resolveForgeQAPaths();
    expect(paths.projectDir).toContain('.forgeqa');
    expect(paths.projectConfigFile).toContain('.forgeqa/config.json');
    expect(paths.artifactsDir).toContain('artifacts');
    expect(paths.runsDir).toContain('artifacts/runs');
    expect(paths.comparisonsDir).toContain('artifacts/comparisons');
  });

  it('resolves user-level paths with fallbacks', () => {
    const paths = resolveForgeQAPaths();
    expect(paths.userConfigFile).toContain('forgeqa/config.json');
    expect(paths.userStateDir).toContain('forgeqa');
    expect(paths.userCacheDir).toContain('forgeqa');
  });
});
