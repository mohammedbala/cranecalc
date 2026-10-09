import { existsSync } from 'node:fs';

// Use the installed macOS Chrome when available, avoiding a second large
// browser download on local workstations. Playwright uses an isolated profile.
export const chromiumChannel = process.env.CRANECALC_CHROMIUM_CHANNEL
  || (process.platform==='darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? 'chrome' : undefined);
