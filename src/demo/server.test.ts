import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startDemoServer, stopDemoServer, getDemoBaseUrl, startIsolatedDemoServer } from './server.js';

async function fetchPath(baseUrl: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, body }); });
    }).on('error', reject);
  });
}

describe('Demo Server', () => {
  let handle: Awaited<ReturnType<typeof startIsolatedDemoServer>>;

  beforeAll(async () => {
    handle = await startIsolatedDemoServer();
  });

  afterAll(async () => {
    await handle.stop();
  });

  it('serves alumni registration fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/register/alumni');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="email-input"');
  });

  it('serves profile fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/profile');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="profile-page"');
  });

  it('serves forgot-password fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/forgot-password');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="reset-email-input"');
  });

  it('serves multi-step-form fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/multi-step-form');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="first-name-input"');
  });

  it('serves file-upload fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/file-upload');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="file-input"');
  });

  it('serves search-table fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/search-table');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="search-input"');
  });

  it('serves responsive fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/responsive');
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-testid="mobile-nav"');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetchPath(handle.baseUrl, '/unknown-route-12345');
    expect(res.status).toBe(404);
  });

  it('serves broken-selector diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/broken-selector');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Broken Selector');
  });

  it('serves slow-loading diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/slow-loading');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Slow Loading');
  });

  it('serves duplicate-testid diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/duplicate-testid');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Duplicate Test ID');
  });

  it('serves missing-label diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/missing-label');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Missing Label');
  });

  it('serves media-accessibility diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/media-accessibility');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Media Accessibility');
  });

  it('serves generic-title diagnostic fixture', async () => {
    const res = await fetchPath(handle.baseUrl, '/diagnostics/generic-title');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Generic Title');
  });

  it('diagnostic fixtures have no external script/link/img references', async () => {
    const paths = [
      '/diagnostics/broken-selector',
      '/diagnostics/slow-loading',
      '/diagnostics/duplicate-testid',
      '/diagnostics/missing-label',
      '/diagnostics/media-accessibility',
      '/diagnostics/generic-title',
    ];
    for (const p of paths) {
      const res = await fetchPath(handle.baseUrl, p);
      const externalAttrs = Array.from(res.body.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi));
      expect(externalAttrs.length, `External refs found in ${p}`).toBe(0);
    }
  });

  it('fixtures have no external script/link/img references', async () => {
    const res = await fetchPath(handle.baseUrl, '/forgot-password');
    const body = res.body;
    // No external href/src references
    const externalAttrs = Array.from(body.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi));
    expect(externalAttrs.length).toBe(0);
  });
});

describe('Demo Server Isolation', () => {
  it('two isolated servers can run at the same time without port conflict', async () => {
    const h1 = await startIsolatedDemoServer();
    const h2 = await startIsolatedDemoServer();

    expect(h1.port).toBeGreaterThan(0);
    expect(h2.port).toBeGreaterThan(0);
    expect(h1.port).not.toBe(h2.port);

    const r1 = await fetchPath(h1.baseUrl, '/register/alumni');
    const r2 = await fetchPath(h2.baseUrl, '/register/alumni');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    await h1.stop();
    await h2.stop();
  });

  it('isolated server uses different actual ports', async () => {
    const handles = await Promise.all([
      startIsolatedDemoServer(),
      startIsolatedDemoServer(),
      startIsolatedDemoServer(),
    ]);

    const ports = handles.map((h) => h.port);
    const uniquePorts = new Set(ports);
    expect(uniquePorts.size).toBe(ports.length);

    await Promise.all(handles.map((h) => h.stop()));
  });

  it('server stop is idempotent', async () => {
    const h = await startIsolatedDemoServer();
    await h.stop();
    await h.stop();
    await h.stop();
    expect(h.isRunning()).toBe(false);
  });

  it('singleton demo server still works for CLI mode', async () => {
    const port = await startDemoServer();
    expect(port).toBeGreaterThan(0);

    const baseUrl = getDemoBaseUrl();
    const res = await fetchPath(baseUrl, '/profile');
    expect(res.status).toBe(200);

    await stopDemoServer();
    expect(() => getDemoBaseUrl()).toThrow('Demo server is not running');
  });
});
