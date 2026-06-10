import { chromium } from 'playwright';

const INSTALL_HINT = 'Chromium browser binary is missing. Install it with:\n  pnpm exec playwright install chromium\nOn Linux/CI, use:\n  pnpm exec playwright install --with-deps chromium';

export async function checkPlaywrightChromiumInstalled(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

export function getBrowserInstallHint(): string {
  return INSTALL_HINT;
}

export async function assertBrowserReadyForTests(): Promise<void> {
  const ready = await checkPlaywrightChromiumInstalled();
  if (!ready) {
    throw new Error(`BROWSER_NOT_INSTALLED: ${getBrowserInstallHint()}`);
  }
}
