export interface UrlPolicyResult {
  valid: boolean;
  allowed: boolean;
  warning?: string;
  blocked?: boolean;
  reason?: string;
}

export interface BaseUrlValidation {
  valid: boolean;
  url: string;
  hostname: string;
  protocol: string;
  isLocalhost: boolean;
  isPrivateNetwork: boolean;
  isLikelyProduction: boolean;
  warnings: string[];
}

export interface NavigationPolicy {
  baseUrl: string;
  allowedHosts: Set<string>;
  blockedProtocols: Set<string>;
  blockedHostPatterns: RegExp[];
  warnHostPatterns: RegExp[];
}

const BLOCKED_PROTOCOLS = new Set([
  'javascript:', 'data:', 'mailto:', 'tel:', 'ftp:', 'chrome:', 'about:',
]);

const BLOCKED_HOST_PATTERNS = [
  /paypal\./i,
  /stripe\./i,
  /braintree\./i,
  /adyen\./i,
  /checkout\./i,
  /auth0\./i,
  /okta\./i,
  /login\.microsoft/i,
  /google\.com\/signin/i,
  /facebook\.com\/login/i,
  /accounts\.google/i,
  /auth\./i,
  /mail\.google/i,
  /outlook\./i,
  /gmail\./i,
  /smtp\./i,
  /imap\./i,
];

const WARN_HOST_PATTERNS = [
  /^[a-z0-9-]+\.(com|net|org|io|ai|co|app)$/i,
];

export function parseAndValidateBaseUrl(url: string): BaseUrlValidation {
  const warnings: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, url, hostname: '', protocol: '', isLocalhost: false, isPrivateNetwork: false, isLikelyProduction: false, warnings: ['Invalid URL format'] };
  }

  const hostname = parsed.hostname;
  const protocol = parsed.protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    warnings.push(`Non-standard protocol: ${protocol}`);
  }

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPrivateNetwork = /\.(local|test|localhost|staging|dev|preview|internal|lan|localdomain)$/i.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);

  let isLikelyProduction = false;
  if (!isLocalhost && !isPrivateNetwork) {
    const hasStagingMarker = /staging|dev|preview|test|local/.test(hostname);
    if (!hasStagingMarker && WARN_HOST_PATTERNS.some((p) => p.test(hostname))) {
      isLikelyProduction = true;
      warnings.push(`Hostname "${hostname}" appears to be a production domain. Use staging or dev environments only.`);
    }
  }

  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(hostname))) {
    warnings.push(`Hostname "${hostname}" matches a blocked pattern (payment, auth, or email provider).`);
  }

  return {
    valid: true,
    url: parsed.toString(),
    hostname,
    protocol,
    isLocalhost,
    isPrivateNetwork,
    isLikelyProduction,
    warnings,
  };
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isPrivateNetworkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname;
    return /\.(local|test|localhost|staging|dev|preview|internal|lan|localdomain)$/i.test(h) ||
      /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h);
  } catch {
    return false;
  }
}

export function isLikelyProductionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname;
    if (isLocalhostUrl(url) || isPrivateNetworkUrl(url)) return false;
    const hasStagingMarker = /staging|dev|preview|test|local/.test(h);
    if (hasStagingMarker) return false;
    return WARN_HOST_PATTERNS.some((p) => p.test(h));
  } catch {
    return false;
  }
}

export function createNavigationPolicy(baseUrl: string, extraAllowedHosts: string[] = []): NavigationPolicy {
  const allowedHosts = new Set<string>();
  try {
    const parsed = new URL(baseUrl);
    allowedHosts.add(parsed.hostname);
  } catch { /* ignore */ }

  for (const host of extraAllowedHosts) {
    allowedHosts.add(host.toLowerCase().trim());
  }

  return {
    baseUrl,
    allowedHosts,
    blockedProtocols: BLOCKED_PROTOCOLS,
    blockedHostPatterns: BLOCKED_HOST_PATTERNS,
    warnHostPatterns: WARN_HOST_PATTERNS,
  };
}

export function isAllowedNavigation(targetUrl: string, policy: NavigationPolicy): UrlPolicyResult {
  // Allow relative URLs
  if (targetUrl.startsWith('/')) {
    return { valid: true, allowed: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { valid: false, allowed: false, blocked: true, reason: 'Invalid URL format' };
  }

  const protocol = parsed.protocol;
  if (policy.blockedProtocols.has(protocol)) {
    return { valid: true, allowed: false, blocked: true, reason: `Blocked protocol: ${protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (policy.allowedHosts.has(hostname)) {
    return { valid: true, allowed: true };
  }

  if (policy.blockedHostPatterns.some((p) => p.test(hostname))) {
    return { valid: true, allowed: false, blocked: true, reason: `Blocked host pattern: ${hostname}` };
  }

  const warnings: string[] = [];
  if (policy.warnHostPatterns.some((p) => p.test(hostname))) {
    warnings.push(`Hostname "${hostname}" appears production-like and requires --allow-host`);
  }

  return {
    valid: true,
    allowed: false,
    blocked: true,
    reason: `Host "${hostname}" is not in the allowed list. Add with --allow-host ${hostname} or choose a staging/preview URL.`,
    warning: warnings[0],
  };
}

export function resolveWorkflowUrl(pathOrUrl: string, baseUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl;
  return base + path;
}
