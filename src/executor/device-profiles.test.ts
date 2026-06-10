import { describe, it, expect } from 'vitest';
import { getDeviceProfile, listDeviceProfiles, validateDeviceProfile } from './device-profiles.js';

describe('getDeviceProfile', () => {
  it('returns desktop profile', () => {
    const p = getDeviceProfile('desktop');
    expect(p).toBeDefined();
    expect(p!.width).toBe(1280);
    expect(p!.height).toBe(720);
    expect(p!.isMobile).toBe(false);
    expect(p!.hasTouch).toBe(false);
    expect(p!.deviceScaleFactor).toBe(1);
  });

  it('returns mobile profile', () => {
    const p = getDeviceProfile('mobile');
    expect(p).toBeDefined();
    expect(p!.width).toBe(390);
    expect(p!.height).toBe(844);
    expect(p!.isMobile).toBe(true);
    expect(p!.hasTouch).toBe(true);
    expect(p!.deviceScaleFactor).toBe(2);
  });

  it('returns tablet profile', () => {
    const p = getDeviceProfile('tablet');
    expect(p).toBeDefined();
    expect(p!.width).toBe(768);
    expect(p!.height).toBe(1024);
    expect(p!.isMobile).toBe(true);
  });

  it('returns small-mobile profile', () => {
    const p = getDeviceProfile('small-mobile');
    expect(p).toBeDefined();
    expect(p!.width).toBe(360);
    expect(p!.height).toBe(740);
  });

  it('returns undefined for invalid profile', () => {
    expect(getDeviceProfile('invalid')).toBeUndefined();
  });
});

describe('listDeviceProfiles', () => {
  it('returns 4 profiles', () => {
    const names = listDeviceProfiles();
    expect(names).toContain('desktop');
    expect(names).toContain('mobile');
    expect(names).toContain('tablet');
    expect(names).toContain('small-mobile');
    expect(names.length).toBe(4);
  });
});

describe('validateDeviceProfile', () => {
  it('accepts known profiles', () => {
    expect(validateDeviceProfile('desktop')).toBe(true);
    expect(validateDeviceProfile('mobile')).toBe(true);
    expect(validateDeviceProfile('tablet')).toBe(true);
    expect(validateDeviceProfile('small-mobile')).toBe(true);
  });

  it('rejects unknown profiles', () => {
    expect(validateDeviceProfile('watch')).toBe(false);
    expect(validateDeviceProfile('')).toBe(false);
  });
});
