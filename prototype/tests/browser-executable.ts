import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
export function browserExecutable() {
  const paths = [
    process.env.PETROS_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    chromium.executablePath(),
  ];
  const found = paths.find(
    (path): path is string => !!path && existsSync(path),
  );
  if (!found)
    throw new Error(
      'Set PETROS_BROWSER to an installed Chromium browser executable.',
    );
  return found;
}
