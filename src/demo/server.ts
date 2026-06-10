import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(process.cwd(), 'fixtures', 'demo-target');
const DEFAULT_PORT = 3456;
const MAX_PORT = 3465;

let activeServer: http.Server | null = null;
let activePort: number | null = null;

export interface DemoServerHandle {
  server: http.Server;
  port: number;
  baseUrl: string;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export const ROUTE_MAP: Record<string, string> = {
  '/': 'alumni-registration.html',
  '/register/alumni': 'alumni-registration.html',
  '/profile': 'profile.html',
  '/forgot-password': 'forgot-password.html',
  '/multi-step-form': 'multi-step-form.html',
  '/file-upload': 'file-upload.html',
  '/search-table': 'search-table.html',
  '/responsive': 'responsive.html',
  '/diagnostics/broken-selector': 'diagnostics/broken-selector.html',
  '/diagnostics/slow-loading': 'diagnostics/slow-loading.html',
  '/diagnostics/duplicate-testid': 'diagnostics/duplicate-testid.html',
  '/diagnostics/missing-label': 'diagnostics/missing-label.html',
  '/diagnostics/media-accessibility': 'diagnostics/media-accessibility.html',
  '/diagnostics/generic-title': 'diagnostics/generic-title.html',
  '/policy/external-risk-form': 'external-risk-form.html',
  '/policy/destructive-action-gate': 'policy/destructive-action-gate.html',
  '/policy/payment-flow-gate': 'policy/payment-flow-gate.html',
  '/policy/oauth-flow-gate': 'policy/oauth-flow-gate.html',
  '/external-safe/submit-form': 'external-safe/submit-form.html',
};

function resolveRoute(urlPath: string): string | null {
  const fileName = ROUTE_MAP[urlPath];
  if (!fileName) return null;
  return path.join(FIXTURES_DIR, fileName);
}

function createRequestHandler(): http.RequestListener {
  return (req, res) => {
    const urlPath = req.url?.split('?')[0] ?? '/';
    const filePath = resolveRoute(urlPath);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  };
}

function tryStartServer(port: number, host = '127.0.0.1'): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createRequestHandler());

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        server.close();
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = address && typeof address === 'object' ? address.port : port;
      resolve({ server, port: boundPort });
    });
  });
}

/** Start an isolated demo server with its own lifecycle. Uses ephemeral port by default. */
export async function startIsolatedDemoServer(options?: {
  port?: number;
  host?: string;
}): Promise<DemoServerHandle> {
  const host = options?.host ?? '127.0.0.1';
  const desiredPort = options?.port ?? 0;

  const { server, port } = await tryStartServer(desiredPort, host);
  const baseUrl = `http://${host}:${port}`;
  let running = true;

  const handle: DemoServerHandle = {
    server,
    port,
    baseUrl,
    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!running) {
          resolve();
          return;
        }
        server.close(() => {
          running = false;
          resolve();
        });
      });
    },
    isRunning(): boolean {
      return running;
    },
  };

  return handle;
}

/** Start the singleton demo server used by CLI. Backward-compatible. */
export async function startDemoServer(options?: {
  port?: number;
  preferredPort?: number;
  host?: string;
  isolated?: boolean;
}): Promise<number> {
  if (options?.isolated) {
    const handle = await startIsolatedDemoServer({
      port: options.port,
      host: options.host,
    });
    return handle.port;
  }

  if (activeServer && activePort) {
    return activePort;
  }

  const preferredPort = options?.preferredPort ?? options?.port;
  const start = preferredPort ?? DEFAULT_PORT;
  const end = preferredPort ?? MAX_PORT;

  for (let port = start; port <= end; port++) {
    try {
      const { server, port: boundPort } = await tryStartServer(port, options?.host ?? '127.0.0.1');
      activeServer = server;
      activePort = boundPort;
      return boundPort;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EADDRINUSE') {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Unable to start demo server: ports ${start}-${end} are all in use.`
  );
}

export function stopDemoServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!activeServer) {
      activePort = null;
      resolve();
      return;
    }
    activeServer.close(() => {
      activeServer = null;
      activePort = null;
      resolve();
    });
  });
}

export function getDemoBaseUrl(): string {
  if (!activePort) {
    throw new Error('Demo server is not running. Call startDemoServer() first.');
  }
  return `http://127.0.0.1:${activePort}`;
}
