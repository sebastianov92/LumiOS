import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.addInitScript(() => {
    window.PalmSystem = { identifier: 'com.dezik.lumios' };
    window.PalmServiceBridge = class {
      onservicecallback = () => {};
      cancel() {}
      call(uri, raw) {
        const { command } = JSON.parse(raw);
        const response = uri.includes('/exec')
          ? {
              returnValue: true,
              stdoutString: JSON.stringify(
                command.includes('listApps')
                  ? {
                      returnValue: true,
                      apps: Array.from({ length: 120 }, (_, index) => ({
                        id: `com.example.app${index}`,
                        title: `App ${String(index + 1).padStart(3, '0')}`,
                        visible: true,
                      })),
                    }
                  : { returnValue: true, devices: [] },
              ),
            }
          : { returnValue: true };
        setTimeout(() => this.onservicecallback(JSON.stringify(response)), 0);
      }
    };
    const measures = (window.__lumiosMeasures = { bounds: 0, visibility: 0, scrolls: 0 });
    for (const [method, key] of [
      ['getBoundingClientRect', 'bounds'],
      ['getClientRects', 'visibility'],
      ['scrollIntoView', 'scrolls'],
    ]) {
      const original = Element.prototype[method];
      Element.prototype[method] = function (...args) {
        measures[key]++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto(pathToFileURL(path.join(root, 'dist/app/index.html')).href);
  await page.getByRole('button', { name: 'Open App 001', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await page.locator('.library-grid [data-app-id]').last().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.library-grid [data-app-id]').first().focus();
  const result = await page.evaluate(async () => {
    const press = (index) =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: index % 2 ? 'ArrowLeft' : 'ArrowRight',
          bubbles: true,
        }),
      );
    for (let index = 0; index < 6; index++) {
      press(index);
      await new Promise(requestAnimationFrame);
    }
    Object.assign(window.__lumiosMeasures, { bounds: 0, visibility: 0, scrolls: 0 });
    const durations = [];
    for (let index = 0; index < 60; index++) {
      const start = performance.now();
      press(index);
      durations.push(performance.now() - start);
      await new Promise(requestAnimationFrame);
    }
    durations.sort((a, b) => a - b);
    return {
      apps: document.querySelectorAll('.library-grid [data-app-id]').length,
      keypresses: durations.length,
      meanHandlerMs: Number(
        (durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2),
      ),
      p95HandlerMs: Number(durations[Math.floor(durations.length * 0.95)].toFixed(2)),
      ...window.__lumiosMeasures,
    };
  });
  const bundle = await fs.stat(path.join(root, 'dist/app/app.js'));
  console.log(
    JSON.stringify(
      { cpuThrottle: '6x (desktop simulation)', bundleBytes: bundle.size, ...result },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
