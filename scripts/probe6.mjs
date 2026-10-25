import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('terrain-o:onboarding-v1', 'seen'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.setInputFiles('[data-testid="file-input"]', [
  path.join(process.cwd(), '.ref/fixtures/alpine.png'),
  path.join(process.cwd(), '.ref/fixtures/alpine.jgw'),
]);
await page.waitForTimeout(2000);
const tab = page.locator('#dock-tab-right-classification');
const dt = await page.evaluateHandle(() => new DataTransfer());
await tab.dispatchEvent('dragstart', { dataTransfer: dt });
await page.waitForTimeout(200);
console.log('body dragging class:', await page.locator('body').evaluate(b=>b.classList.contains('dragging-panel')));
console.log('bottom height during drag:', await page.locator('.dock-bottom').evaluate(el=>el.getBoundingClientRect().height));
await page.locator('.dock-bottom').dispatchEvent('dragover', { dataTransfer: dt });
await page.locator('.dock-bottom').dispatchEvent('drop', { dataTransfer: dt });
await tab.dispatchEvent('dragend', { dataTransfer: dt }).catch(()=>{});
await page.waitForTimeout(600);
console.log('bottom height after drop:', await page.locator('.dock-bottom').evaluate(el=>el.getBoundingClientRect().height));
console.log('bottom tabs:', await page.locator('.dock-bottom .dock-tab').allInnerTexts());
console.log('right tabs:', await page.locator('.dock-right .dock-tab').allInnerTexts());
console.log('layout:', await page.evaluate(()=>localStorage.getItem('terrain-o/ui-layout/v1')));
await page.screenshot({ path: 'screenshots/60-bottom-dock.png' });
console.log('errors', errors);
await browser.close();
