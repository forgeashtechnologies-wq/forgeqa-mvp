import { describe, it, expect } from 'vitest';
import {
  parseAndValidateBaseUrl,
  isLocalhostUrl,
  isPrivateNetworkUrl,
  isLikelyProductionUrl,
  createNavigationPolicy,
  isAllowedNavigation,
  resolveWorkflowUrl,
} from './url-policy.js';

describe('parseAndValidateBaseUrl', () => {
  it('allows localhost', () => {
    const result = parseAndValidateBaseUrl('http://localhost:3000');
    expect(result.valid).toBe(true);
    expect(result.isLocalhost).toBe(true);
    expect(result.isLikelyProduction).toBe(false);
  });

  it('allows 127.0.0.1', () => {
    const result = parseAndValidateBaseUrl('http://127.0.0.1:3000');
    expect(result.valid).toBe(true);
    expect(result.isLocalhost).toBe(true);
  });

  it('allows staging.example.com', () => {
    const result = parseAndValidateBaseUrl('https://staging.example.com');
    expect(result.valid).toBe(true);
    expect(result.isLikelyProduction).toBe(false);
  });

  it('warns on naked production domain', () => {
    const result = parseAndValidateBaseUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.isLikelyProduction).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on blocked payment domain', () => {
    const result = parseAndValidateBaseUrl('https://paypal.com');
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('blocked'))).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = parseAndValidateBaseUrl('not-a-url');
    expect(result.valid).toBe(false);
  });
});

describe('isLocalhostUrl', () => {
  it('returns true for localhost', () => {
    expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
  });
  it('returns false for external domain', () => {
    expect(isLocalhostUrl('https://example.com')).toBe(false);
  });
});

describe('isPrivateNetworkUrl', () => {
  it('returns true for .test domain', () => {
    expect(isPrivateNetworkUrl('https://app.test')).toBe(true);
  });
  it('returns true for 192.168.x.x', () => {
    expect(isPrivateNetworkUrl('http://192.168.1.1')).toBe(true);
  });
  it('returns false for public domain', () => {
    expect(isPrivateNetworkUrl('https://example.com')).toBe(false);
  });
});

describe('isLikelyProductionUrl', () => {
  it('returns true for example.com', () => {
    expect(isLikelyProductionUrl('https://example.com')).toBe(true);
  });
  it('returns false for localhost', () => {
    expect(isLikelyProductionUrl('http://localhost:3000')).toBe(false);
  });
});

describe('createNavigationPolicy', () => {
  it('includes baseUrl host', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    expect(policy.allowedHosts.has('staging.example.com')).toBe(true);
  });
  it('includes extra allowed hosts', () => {
    const policy = createNavigationPolicy('https://staging.example.com', ['api.example.com']);
    expect(policy.allowedHosts.has('api.example.com')).toBe(true);
  });
});

describe('isAllowedNavigation', () => {
  it('allows relative URLs', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('/dashboard', policy);
    expect(result.allowed).toBe(true);
  });

  it('allows same-origin URL', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('https://staging.example.com/dashboard', policy);
    expect(result.allowed).toBe(true);
  });

  it('blocks external host', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('https://evil.com', policy);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('blocks payment domain', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('https://stripe.com/pay', policy);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('blocks OAuth domain', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('https://auth0.com', policy);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('blocks javascript protocol', () => {
    const policy = createNavigationPolicy('https://staging.example.com');
    const result = isAllowedNavigation('javascript:alert(1)', policy);
    expect(result.allowed).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('allows extra host via --allow-host', () => {
    const policy = createNavigationPolicy('https://staging.example.com', ['cdn.example.com']);
    const result = isAllowedNavigation('https://cdn.example.com/asset.js', policy);
    expect(result.allowed).toBe(true);
  });
});

describe('resolveWorkflowUrl', () => {
  it('resolves relative path against baseUrl', () => {
    expect(resolveWorkflowUrl('/dashboard', 'https://staging.example.com')).toBe('https://staging.example.com/dashboard');
  });
  it('preserves absolute URL', () => {
    expect(resolveWorkflowUrl('https://other.com/page', 'https://staging.example.com')).toBe('https://other.com/page');
  });
});
