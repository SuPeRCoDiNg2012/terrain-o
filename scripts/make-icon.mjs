// Renders public/icon.svg at 512×512 so electron-builder can derive the
// Windows .ico. Run with `node scripts/make-icon.mjs` after changing the mark.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = await fs.readFile(path.resolve('public/icon.svg'), 'utf8');
const scaled = source.replace('<svg ', '<svg width="512" height="512" ');

await fs.mkdir(path.resolve('build'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.setContent(
  `<!doctype html><html><body style="margin:0;width:512px;height:512px;overflow:hidden">${scaled}</body></html>`,
);
await page.screenshot({ path: path.resolve('build/icon.png'), omitBackground: false });
await browser.close();

console.log('build/icon.png (512×512)');
