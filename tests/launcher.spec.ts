import { test, expect, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('home is remote navigable, opening a preview never pretends to launch a TV app', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const netflix = page.getByRole('button', { name: 'Open Netflix', exact: true });
  await expect(netflix).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Open YouTube', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Desktop preview');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveAttribute('data-focusable', /^input-/);
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await netflix.focus();
  await page.mouse.move(1, 1);
  await page.screenshot({ path: info.outputPath('lumios-home.png') });
  expect(errors).toEqual([]);
});

test('Left and Right on focused navigation tabs switch pages immediately', async ({ page }) => {
  await page.goto('/');
  const home = page.getByRole('button', { name: 'Home', exact: true });
  await home.focus();
  await page.keyboard.press('ArrowRight');
  const apps = page.getByRole('button', { name: 'Apps', exact: true });
  await expect(apps).toHaveAttribute('aria-current', 'page');
  await expect(apps).toBeFocused();
  await expect(page.locator('main')).toHaveClass(/page-apps/);
  await page.keyboard.press('ArrowRight');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main')).toHaveClass(/page-settings/);
  await expect(settings).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'TV settings', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(settings).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'General', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(settings).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(apps).toHaveAttribute('aria-current', 'page');
  await expect(apps).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(home).toHaveAttribute('aria-current', 'page');
  await expect(home).toBeFocused();
  await expect(page.locator('main')).toHaveClass(/page-home/);
});

for (const width of [1920, 1280, 390]) {
  for (const [tab, items] of [
    ['Home', '.favorites-grid .app-tile'],
    ['Apps', '.library-grid .app-tile'],
  ] as const) {
    test(`Down from ${tab} navigation enters the first item at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
      const navigation = page.getByRole('navigation', { name: 'Main navigation' });
      const button = navigation.getByRole('button', { name: tab, exact: true });
      await button.click();
      await page.keyboard.press('ArrowDown');
      const controls = page.locator(items);
      await expect(controls.first()).toBeFocused();
      await controls.nth(1).focus();
      await button.focus();
      await page.keyboard.press('ArrowDown');
      await expect(controls.first()).toBeFocused();
    });
  }

  test(`Up from the first app enters the first category at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.goto('/');
    const apps = page.getByRole('button', { name: 'Apps', exact: true });
    await apps.click();
    const first = page.locator('.library-grid .app-tile').first();
    await expect(first).toBeVisible();
    await first.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('button', { name: 'Streaming', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(apps).toBeFocused();
  });
}

async function moveUpToHeader(page: Page) {
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press('ArrowUp');
    if (await page.locator('.header :focus').count()) return;
  }
  throw new Error('Repeated Up did not reach the header.');
}

async function pressBack(page: Page, key: 'Escape' | 'TV Back') {
  if (key === 'Escape') await page.keyboard.press('Escape');
  else
    await page
      .locator(':focus')
      .dispatchEvent('keydown', { key: 'Unidentified', keyCode: 461, bubbles: true });
}

for (const width of [1920, 390]) {
  for (const tab of ['Home', 'Apps', 'Settings'] as const) {
    test(`Up from ${tab} content reaches its active navigation tab first at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
      const activeTab = page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: tab, exact: true });
      await activeTab.click();
      if (tab === 'Settings') {
        await page.getByRole('button', { name: 'Inputs', exact: true }).click();
        await expect(
          page.locator('[data-focusable="setting-input-com.webos.app.hdmi1"]'),
        ).toBeFocused();
        await page.locator('[data-focusable="setting-inputs-refresh"]').focus();
      } else {
        await page
          .locator(tab === 'Home' ? '.favorites-grid .app-tile' : '.library-grid .app-tile')
          .last()
          .focus();
      }
      await moveUpToHeader(page);
      await expect(activeTab).toBeFocused();
      await expect(activeTab).toHaveAttribute('aria-current', 'page');
    });
  }

  test(`Up leaves Apps search through the active navigation tab at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.goto('/');
    const apps = page.getByRole('button', { name: 'Apps', exact: true });
    await apps.click();
    const search = page.getByRole('searchbox', { name: 'Find an app' });
    await search.fill('youtube');
    await moveUpToHeader(page);
    await expect(apps).toBeFocused();
    await expect(search).toHaveValue('youtube');
  });

  test(`Left leaves Apps search at its category controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.goto('/');
    const apps = page.getByRole('button', { name: 'Apps', exact: true });
    await apps.click();
    const search = page.getByRole('searchbox', { name: 'Find an app' });
    await search.fill('youtube');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Utilities', exact: true })).toBeFocused();
    await expect(search).toHaveValue('youtube');
    await page.getByRole('button', { name: 'Music', exact: true }).click();
    await search.fill('spotify');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Utilities', exact: true })).toBeFocused();
    await expect(search).toHaveValue('spotify');
    await page.keyboard.press('ArrowUp');
    await expect(apps).toBeFocused();
  });

  test(`Left from app search enters Hidden when it is available at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'lumios.preferences.v1',
        JSON.stringify({ version: 1, hidden: ['netflix'] }),
      );
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Apps', exact: true }).click();
    const hidden = page.getByRole('button', { name: 'Hidden (1)', exact: true });
    await expect(hidden).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Find an app' });
    await search.fill('youtube');
    await page.keyboard.press('ArrowLeft');
    await expect(hidden).toBeFocused();
    await expect(hidden).toHaveAttribute('aria-pressed', 'false');
    await expect(search).toHaveValue('youtube');
    await hidden.click();
    await search.fill('netflix');
    await page.keyboard.press('ArrowLeft');
    await expect(hidden).toBeFocused();
    await expect(hidden).toHaveAttribute('aria-pressed', 'true');
  });

  for (const key of ['Escape', 'TV Back'] as const) {
    test(`${key} leaves Apps search at the Apps tab at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
      await page.goto('/');
      const apps = page.getByRole('button', { name: 'Apps', exact: true });
      await apps.click();
      const search = page.getByRole('searchbox', { name: 'Find an app' });
      await search.fill('youtube');
      await pressBack(page, key);
      await expect(apps).toBeFocused();
      await expect(apps).toHaveAttribute('aria-current', 'page');
      await expect(search).toHaveValue('');
      await search.focus();
      await pressBack(page, key);
      await expect(apps).toBeFocused();
      await expect(page.locator('main')).toHaveClass(/page-apps/);
      await search.fill('netflix');
      await page.locator('[data-focusable="search-clear"]').focus();
      await pressBack(page, key);
      await expect(apps).toBeFocused();
      await expect(search).toHaveValue('');
      await pressBack(page, key);
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }
}

for (const [section, control, selected, first, subpage, title] of [
  [
    'General',
    'setting-language',
    'language-option-en',
    'language-option-en',
    'language',
    'Language',
  ],
  [
    'General',
    'setting-clock-format',
    'clock-format-option-12',
    'clock-format-option-12',
    'clock-format',
    'Clock format',
  ],
  [
    'Weather',
    'setting-temperature',
    'temperature-option-celsius',
    'temperature-option-celsius',
    'temperature',
    'Temperature',
  ],
  [
    'Inputs',
    'setting-input-com.webos.app.hdmi1',
    'input-visibility-option-auto',
    'input-name',
    'input',
    'HDMI 1',
  ],
] as const) {
  test(`${subpage} options return with Left and exit upward to the Settings tab`, async ({
    page,
  }) => {
    await page.goto('/');
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
    await page.locator(`[data-focusable="${control}"]`).press('ArrowRight');
    await expect(page.locator(`[data-focusable="${selected}"]`)).toBeFocused();
    const category = page.locator('.settings-sidebar-item.selected');
    await expect(category).toHaveAccessibleName(`${section}: ${title}`);
    await expect(category.locator('.settings-sidebar-parent')).toHaveText(section);
    await expect(category.locator('.settings-sidebar-subpage')).toHaveText(title);
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
    await page.locator(`[data-focusable="${first}"]`).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(`[data-focusable="${control}"]`)).toBeFocused();
    await expect(page.locator('[data-settings-subpage]')).toHaveCount(0);
    await expect(category).toHaveAccessibleName(section);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(`[data-focusable="${selected}"]`)).toBeFocused();
    await page.locator(`[data-focusable="${first}"]`).focus();
    await page.keyboard.press('ArrowUp');
    await expect(settings).toBeFocused();
    await expect(settings).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'General', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-focusable="setting-home-app-names"]')).toBeFocused();
  });
}

for (const section of ['General', 'Background', 'Weather', 'Inputs']) {
  test(`Back from the ${section} category returns to the Settings tab before Home`, async ({
    page,
  }) => {
    await page.goto('/');
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    await expect(settings).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'General', exact: true })).toBeFocused();
    const category = page.getByRole('button', { name: section, exact: true });
    await category.focus();
    await pressBack(page, 'Escape');
    await expect(settings).toBeFocused();
    await expect(page.locator('main')).toHaveClass(/page-settings/);
    await category.focus();
    await pressBack(page, 'TV Back');
    await expect(settings).toBeFocused();
    await pressBack(page, 'Escape');
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
}

test('Left returns from the location search action to the Weather setting', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.locator('[data-focusable="setting-show-weather"]')).toBeFocused();
  const location = page.locator('[data-focusable="setting-weather-location"]');
  await location.press('ArrowRight');
  const search = page.getByRole('searchbox', { name: 'City or postcode' });
  await expect(search).toBeFocused();
  const category = page.locator('[data-focusable="settings-section-weather"]');
  await expect(category).toHaveAccessibleName('Weather: Location');
  await expect(category.locator('.settings-sidebar-subpage')).toHaveText('Location');
  await search.fill('Berlin');
  await page.getByRole('button', { name: 'Search locations', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(location).toBeFocused();
  await expect(page.locator('[data-settings-subpage]')).toHaveCount(0);
  await expect(category).toHaveAccessibleName('Weather');
});

for (const width of [1920, 390]) {
  for (const key of ['ArrowUp', 'ArrowLeft'] as const) {
    test(`${key} leaves the location input at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
      await page.goto('/');
      const settings = page.getByRole('button', { name: 'Settings', exact: true });
      await settings.click();
      await page.getByRole('button', { name: 'Weather', exact: true }).click();
      await expect(page.locator('[data-focusable="setting-show-weather"]')).toBeFocused();
      const location = page.locator('[data-focusable="setting-weather-location"]');
      await location.press('ArrowRight');
      const field = page.getByRole('searchbox', { name: 'City or postcode' });
      await expect(field).toBeFocused();
      await field.fill('Berlin');
      await page.keyboard.press(key);
      if (key === 'ArrowUp') {
        await expect(settings).toBeFocused();
        await expect(field).toHaveValue('Berlin');
        await field.focus();
        await page.keyboard.press('ArrowLeft');
      }
      await expect(location).toBeFocused();
      await expect(page.locator('[data-settings-subpage]')).toHaveCount(0);
    });
  }
}

test('Up keeps app options inside their modal focus scope', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Netflix', exact: true }).focus();
  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-focusable]').first().focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(dialog.locator(':focus')).toHaveCount(1);
});

test('Home entry follows the visible saved favorite order', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'lumios.preferences.v1',
      JSON.stringify({
        version: 1,
        favorites: ['netflix', 'youtube.leanback.v4', 'com.disney.disneyplus-prod'],
        hidden: ['netflix'],
      }),
    );
  });
  await page.goto('/');
  const first = page.getByRole('button', { name: 'Open YouTube', exact: true });
  await expect(first).toBeFocused();
  await page.getByRole('button', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(first).toBeFocused();
});

test('Apps entry follows the filtered app results and handles an empty result', async ({
  page,
}) => {
  await page.goto('/');
  const apps = page.getByRole('button', { name: 'Apps', exact: true });
  await apps.click();
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await apps.focus();
  await page.keyboard.press('ArrowDown');
  const spotify = page.getByRole('button', { name: 'Open Spotify', exact: true });
  await expect(spotify).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Find an app' });
  await search.fill('no matching apps');
  await apps.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Streaming', exact: true })).toBeFocused();
  await search.fill('spotify');
  await apps.focus();
  await page.keyboard.press('ArrowDown');
  await expect(spotify).toBeFocused();
});

test('navigation enters the primary action when favorites or inputs are empty', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('lumios.preferences.v1', JSON.stringify({ version: 1, favorites: [] }));
  });
  await installMockTV(page, false, undefined, []);
  await page.goto('/');
  const explore = page.getByRole('button', { name: 'Explore your apps', exact: true });
  await expect(explore).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(explore).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh inputs', exact: true })).toBeFocused();
  await expect(page.getByText('No inputs to show.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__devices = [
      { appId: 'com.webos.app.hdmi1', id: 'HDMI_1', port: 1, label: 'New input', connected: true },
    ];
  });
  await page.getByRole('button', { name: 'Refresh inputs', exact: true }).click();
  const input = page.locator('[data-focusable="setting-input-com.webos.app.hdmi1"]');
  await expect(input).toBeVisible();
  await page.getByRole('button', { name: 'Inputs', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(input).toBeFocused();
});

test('Inputs are configured in Settings with persistent On, Off, and Auto Home visibility', async ({
  page,
}) => {
  await installMockTV(page, false, undefined, [
    { appId: 'com.webos.app.hdmi1', id: 'HDMI_1', port: 1, label: 'Console', connected: true },
    { appId: 'com.webos.app.hdmi2', id: 'HDMI_2', port: 2, label: 'Streamer', connected: false },
    { appId: 'com.webos.app.hdmi3', id: 'HDMI_3', port: 3, label: 'Unknown input' },
    { appId: 'com.webos.app.hdmi4', id: 'HDMI_4', port: 4, label: 'Computer', connected: true },
  ]);
  await page.goto('/');
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button'),
  ).toHaveText(['Home', 'Apps', 'Settings']);
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(2);
  const homeConsole = page.locator('[data-focusable="input-com.webos.app.hdmi1"]');
  await expect(homeConsole.locator('.input-title')).toHaveText('HDMI 1');
  await expect(homeConsole.locator('.input-state')).toHaveText('Console · Connected');
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi3"]')).toHaveCount(0);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const inputs = page.getByRole('button', { name: 'Inputs', exact: true });
  const consoleInput = page.locator('[data-focusable="setting-input-com.webos.app.hdmi1"]');
  const streamer = page.locator('[data-focusable="setting-input-com.webos.app.hdmi2"]');
  await settings.click();
  await inputs.click();
  await expect(page.locator('[data-focusable^="setting-input-com."]')).toHaveCount(4);
  await expect(consoleInput).toBeFocused();
  await expect(consoleInput.locator('strong')).toHaveText('HDMI 1');
  await expect(consoleInput.locator('small')).toHaveText('Console · Connected');
  await expect(streamer.locator('strong')).toHaveText('HDMI 2');
  await expect(streamer.locator('small')).toHaveText('No device connected');
  await expect(
    page.locator('[data-focusable="setting-input-com.webos.app.hdmi3"] small'),
  ).toHaveText('External input');
  await consoleInput.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(consoleInput).toBeFocused();
  await expect(consoleInput.locator('.setting-value')).toHaveText('Auto');
  await consoleInput.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focusable="input-visibility-option-off"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(consoleInput).toBeFocused();
  await expect(consoleInput.locator('.setting-value')).toHaveText('Off');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi1"]')).toHaveCount(0);
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi4"]')).toBeVisible();
  await settings.click();
  await inputs.click();
  await streamer.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="input-visibility-option-on"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(streamer).toBeFocused();
  await expect(streamer.locator('.setting-value')).toHaveText('On');
  await page.keyboard.press('Escape');
  const homeStreamer = page.locator('[data-focusable="input-com.webos.app.hdmi2"]');
  await expect(homeStreamer.locator('.input-title')).toHaveText('HDMI 2');
  await expect(homeStreamer.locator('.input-state')).toHaveText('No device connected');
  await page.reload();
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(2);
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi1"]')).toHaveCount(0);
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi2"]')).toBeVisible();
  await settings.click();
  await inputs.click();
  await streamer.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-on"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(streamer).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focusable="input-com.webos.app.hdmi2"]')).toHaveCount(0);
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(1);
});

test('Auto reacts to refreshes and input choices survive renamed devices and read failures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'lumios.preferences.v1',
      JSON.stringify({ version: 1, inputVisibility: { 'com.webos.app.hdmi2': 'on' } }),
    );
  });
  await installMockTV(page, false, undefined, [
    { appId: 'com.webos.app.hdmi1', id: 'HDMI_1', port: 1, label: 'Console', connected: true },
    { appId: 'com.webos.app.hdmi2', id: 'HDMI_2', port: 2, label: 'Streamer', connected: false },
  ]);
  await page.goto('/');
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await page.evaluate(() => {
    (window as any).__devices = [
      { appId: 'com.webos.app.hdmi1', id: 'HDMI_1', port: 1, label: 'Console', connected: false },
      {
        appId: 'com.webos.app.hdmi2',
        id: 'HDMI_2',
        port: 2,
        label: 'Renamed streamer',
        connected: false,
      },
    ];
  });
  const refresh = page.getByRole('button', { name: 'Refresh inputs', exact: true });
  await refresh.click();
  const streamer = page.locator('[data-focusable="setting-input-com.webos.app.hdmi2"]');
  await expect(streamer.locator('strong')).toHaveText('HDMI 2');
  await expect(streamer.locator('small')).toHaveText('No device connected');
  await expect(streamer.locator('.setting-value')).toHaveText('On');
  await page.keyboard.press('Escape');
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(1);
  await expect(
    page.locator('[data-focusable="input-com.webos.app.hdmi2"] .input-state'),
  ).toHaveText('No device connected');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await page.evaluate(() => {
    (window as any).__devices[0].connected = true;
    (window as any).__devices[1].connected = true;
  });
  await refresh.click();
  await expect(page.locator('[data-focusable="setting-input-com.webos.app.hdmi1"]')).toContainText(
    'Connected',
  );
  await expect(streamer.locator('small')).toHaveText('Renamed streamer · Connected');
  await page.evaluate(() => {
    (window as any).__inputFailure = true;
  });
  await refresh.click();
  await expect(
    page.getByText('Inputs couldn’t be loaded. Refresh to try again.', { exact: true }),
  ).toBeVisible();
  await expect(streamer.locator('.setting-value')).toHaveText('On');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(2);
  await expect(
    page.locator('[data-focusable="input-com.webos.app.hdmi2"] .input-state'),
  ).toHaveText('Renamed streamer · Connected');
});

test('hold OK opens options, favorites persist and hidden apps can be restored', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await page.getByRole('button', { name: 'Open Netflix', exact: true }).focus();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(700);
  await page.keyboard.up('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Remove from favorites' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const netflix = page.getByRole('button', { name: 'Open Netflix', exact: true });
  await netflix.focus();
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Hide app', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(netflix).toHaveCount(0);
  await page.getByRole('button', { name: 'Hidden (1)', exact: true }).click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(1);
  await expect(netflix).toBeVisible();
  await netflix.focus();
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Show app', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toHaveCount(0);
  await expect(netflix).toBeVisible();
});

test('Settings sidebar and content support remote navigation and persistent preferences', async ({
  page,
}, info) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  await expect(page.getByRole('region', { name: 'LumiOS settings', exact: true })).toBeVisible();
  await expect(settings).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'General', exact: true })).toBeFocused();
  await expect(page.locator('.settings-sidebar')).toContainText('General');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="settings-section-background"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focusable="settings-section-interface"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focusable="setting-home-app-names"]')).toBeFocused();
  await page.locator('[data-focusable="settings-section-background"]').click();
  await expect(page.locator('[data-focusable="wallpaper-dunes"]')).toBeVisible();
  await page.locator('[data-focusable="settings-section-weather"]').click();
  await expect(page.locator('[data-focusable="setting-show-weather"]')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Show widget/ })).toBeVisible();
  await page.locator('[data-focusable="settings-section-interface"]').click();
  await expect(page.locator('[data-focusable="setting-home-app-names"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="setting-clock-format"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focusable="clock-format-option-12"]')).toBeFocused();
  await page.locator('[data-focusable="clock-format-option-24"]').click();
  await expect(page.locator('[data-focusable="setting-clock-format"]')).toContainText('24-hour');
  await expect(page.locator('[data-focusable="setting-clock-format"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focusable="settings-section-interface"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('switch', { name: 'Show app names', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Monument Valley', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Summit', exact: true }).click();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.locator('[data-focusable="setting-home-app-names"]')).toBeFocused();
  await expect(page.locator('[data-focusable="setting-clock-format"]')).toContainText('24-hour');
  await page.getByRole('switch', { name: 'Reduced motion', exact: false }).click();
  await page.screenshot({ path: info.outputPath('lumios-settings.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.locator('.wallpaper')).toHaveClass(/wallpaper-summit/);
  await expect(page.locator('.lumios')).toHaveClass(/reduce-motion/);
});

test('nested language menu supports remote navigation and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  const trigger = page.getByRole('button', { name: /Language/ });
  await expect(trigger).toBeVisible();
  await trigger.press('ArrowRight');
  await expect(page.locator('[data-focusable="language-option-en"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="language-option-de"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de-DE');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'LumiOS-Einstellungen', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.settings-sidebar')).toContainText('Allgemein');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Allgemein', exact: true }).click();
  await page.getByRole('button', { name: /Anzeigesprache/ }).press('ArrowRight');
  await expect(page.locator('[data-focusable="language-option-de"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('button', { name: '主页', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'LumiOS 设置', exact: true })).toBeVisible();
});

test('General D-pad moves down to the language selector and up from refresh', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.locator('[data-focusable="setting-home-app-names"]')).toBeFocused();
  await page.locator('[data-focusable="settings-section-interface"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-focusable="setting-motion"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="setting-language"]')).toBeFocused();
  await page.locator('[data-focusable="setting-refresh"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focusable="setting-language"]')).toBeFocused();
});

test('Settings panels fit within the content width at desktop and compact sizes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const width of [1920, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const panels = [
        ...document.querySelectorAll<HTMLElement>('.settings-sidebar, .settings-pane'),
      ];
      const mainBox = main.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
        panelOutside: panels.some((panel) => {
          const box = panel.getBoundingClientRect();
          return box.left < mainBox.left || box.right > mainBox.right + 1;
        }),
      };
    });
    expect(overflow.documentOverflow).toBe(false);
    expect(overflow.panelOutside).toBe(false);
  }
});

test('Settings sidebar uses plain labels and an Apple TV-style focus highlight', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.keyboard.press('ArrowDown');
  const interfaceSection = page.getByRole('button', { name: 'General', exact: true });
  await expect(page.locator('.settings-sidebar-index')).toHaveCount(0);
  await expect(interfaceSection).toBeFocused();
  const focusStyle = await interfaceSection.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      outline: style.outlineStyle,
    };
  });
  expect(focusStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(focusStyle.radius).not.toBe('0px');
  expect(focusStyle.outline).toBe('none');
});

for (const width of [1920, 390]) {
  test(`Left and Right browse the background gallery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Background', exact: true }).click();
    const selected = page.getByRole('button', { name: 'Monument Valley', exact: true });
    await expect(selected).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'San Francisco', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    if (width <= 600) {
      await expect(page.getByRole('button', { name: 'Background', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowRight');
    }
    await expect(selected).toBeFocused();
    if (width <= 600) {
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('button', { name: 'Prism', exact: true })).toBeFocused();
    }
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Background', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(selected).toBeFocused();
    await page.getByRole('button', { name: 'Forest', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Background', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(selected).toBeFocused();
    for (const name of [
      'San Francisco',
      'Summit',
      'Forest',
      'Yosemite',
      'Northern lights',
      'Flow',
    ]) {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Flow', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.wallpaper')).toHaveClass(/wallpaper-flow/);
    await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /flow\.svg/);
  });

  test(`Up follows background columns and Back returns to its category at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width > 600 ? 1080 : 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const background = page.getByRole('button', { name: 'Background', exact: true });
    await background.click();
    const monumentValley = page.getByRole('button', { name: 'Monument Valley', exact: true });
    await expect(monumentValley).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(
      page.getByRole('button', { name: width > 600 ? 'Slate' : 'Midnight', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(monumentValley).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'San Francisco', exact: true })).toBeFocused();
    await pressBack(page, 'Escape');
    await expect(background).toBeFocused();
    await expect(background).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main')).toHaveClass(/page-settings/);
    await page.keyboard.press('ArrowRight');
    await expect(monumentValley).toBeFocused();
    await pressBack(page, 'TV Back');
    await expect(background).toBeFocused();
    await expect(page.locator('.wallpaper')).toHaveClass(/wallpaper-dunes/);
    await pressBack(page, 'Escape');
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    await expect(page.locator('main')).toHaveClass(/page-settings/);
    await pressBack(page, 'Escape');
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
}

test('search, category filtering, empty results and Back work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Find an app' });
  await search.fill('jelly');
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Jellyfin', exact: true })).toBeVisible();
  await search.fill('nothing matches');
  await expect(page.getByRole('heading', { name: 'Nothing here. Yet.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open Spotify', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Favorites', exact: true })).toBeVisible();
});

test('the packaged file app loads offline with CSP, local fonts, no module fetches and no remote requests', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const remote: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remote.push(request.url());
  });
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.goto(pathToFileURL(path.resolve('dist/app/index.html')).href);
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeVisible();
  await expect(page.locator('.header-time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "LumiOS Sans"'))).toBe(true);
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await expect(page.locator('.library-grid .brand-logo')).toHaveCount(9);
  await expect
    .poll(() =>
      page
        .locator('.library-grid .brand-logo')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: /PlayStation 5/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await page.screenshot({ path: info.outputPath('lumios-inputs.png') });
  const thumbnails = await page.locator('.wallpaper-thumbnail > img').evaluateAll((nodes) =>
    Promise.all(
      nodes.map(async (node) => {
        const image = node as HTMLImageElement;
        await image.decode();
        return { src: image.src, width: image.naturalWidth, height: image.naturalHeight };
      }),
    ),
  );
  expect(thumbnails).toHaveLength(0);
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  const backgroundThumbnails = await page
    .locator('.wallpaper-thumbnail > img')
    .evaluateAll((nodes) =>
      Promise.all(
        nodes.map(async (node) => {
          const image = node as HTMLImageElement;
          await image.decode();
          return { src: image.src, width: image.naturalWidth, height: image.naturalHeight };
        }),
      ),
    );
  expect(backgroundThumbnails).toHaveLength(10);
  const photos = backgroundThumbnails.filter((image) => image.src.endsWith('.jpg'));
  expect(photos).toHaveLength(6);
  for (const photo of photos) {
    expect(photo.src).toContain('/wallpaper-thumbnails/');
    expect([photo.width, photo.height]).toEqual([480, 270]);
  }
  expect(remote).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

interface MockPack {
  path: string;
  hash: string;
  size: number;
  base64: string;
}

// A one-icon .icnl pack, zipped in Node and served to the mock TV in dd-sized chunks.
function mockPack(): MockPack {
  const files = {
    'pack.json': Buffer.from(
      JSON.stringify({
        format: 'icnl/1',
        name: 'Mock pack',
        version: '2.0.0',
        author: 'Tests',
        icons: {
          netflix: { title: 'Netflix tile', apps: ['netflix'] },
          switch: { title: 'Switch glyph', kind: 'glyph', inputs: ['com.webos.app.hdmi2'] },
        },
        wallpapers: { dot: { title: 'Dot' } },
      }),
    ),
    'icons/netflix/icon.svg': Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#e50914"/></svg>',
    ),
    'icons/netflix/style.css': Buffer.from('.icon { background: rgb(20, 20, 20); }'),
    'icons/switch/icon.svg': Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    ),
    'wallpapers/dot/image.png': Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    ),
  };
  const bytes = zipSync(files);
  return {
    path: '/media/developer/lumios/packs/mock.icnl',
    hash: 'a'.repeat(32),
    size: bytes.length,
    base64: Buffer.from(bytes).toString('base64'),
  };
}

async function installMockTV(
  page: Page,
  denied: boolean,
  apps = [{ id: 'com.example.real', title: 'A real TV app', visible: true }],
  devices: Record<string, unknown>[] = [
    { appId: 'com.webos.app.hdmi2', id: 'HDMI_2', port: 2, label: 'Real HDMI', connected: true },
  ],
  packs: MockPack[] = [],
) {
  const manifest = JSON.parse(readFileSync(path.resolve('appinfo.json'), 'utf8'));
  await page.addInitScript(
    ({ denied, requiredACG, apps, devices, packs }) => {
      const w = window as typeof window & {
        __calls: { uri: string; payload: any }[];
        __devices: typeof devices;
        __inputFailure: boolean;
        __packs: typeof packs;
        __preload: boolean;
      };
      w.__calls = [];
      w.__devices = devices;
      w.__inputFailure = false;
      w.__packs = packs;
      w.__preload = false;
      w.PalmSystem = { identifier: 'com.dezik.lumios' };
      w.PalmServiceBridge = class {
        onservicecallback = (_raw: string) => {};
        cancel() {}
        call(uri: string, raw: string) {
          const payload = JSON.parse(raw);
          w.__calls.push({ uri, payload });
          let response: any;
          if (uri.includes('/exec')) {
            if (denied)
              response = { returnValue: false, errorText: 'Mock: service is not elevated.' };
            else if (w.__inputFailure && payload.command.includes('getAllInputStatus'))
              response = { returnValue: false, errorText: 'Mock: input service is unavailable.' };
            // Model Homebrew 0.8.0-rc1's webOS 26 access group. The real-inventory
            // test must fail when the packaged caller forgets this permission.
            else if (!requiredACG.includes('lunabus.query'))
              response = {
                returnValue: false,
                errorCode: -1,
                errorText: 'Denied method call "exec" for category "/"',
              };
            else if (payload.command.includes('preload.js')) {
              const action = /preload\.js"? (\w+)/.exec(payload.command)?.[1];
              if (action === 'enable') w.__preload = true;
              if (action === 'disable') w.__preload = false;
              response = {
                returnValue: true,
                stdoutString: `${JSON.stringify({ enabled: w.__preload, entries: 3, backup: w.__preload })}\n`,
              };
            } else if (payload.command.includes('md5sum'))
              response = {
                returnValue: true,
                stdoutString: w.__packs.map((p) => `${p.hash} ${p.size} ${p.path}\n`).join(''),
              };
            else if (payload.command.includes('dd if=')) {
              const skip = Number(/skip=(\d+)/.exec(payload.command)?.[1] ?? 0);
              const pack = w.__packs.find((p) => payload.command.includes(`'${p.path}'`));
              const binary = pack ? atob(pack.base64) : '';
              response = {
                returnValue: true,
                stdoutString: '',
                stdoutBytes: btoa(binary.slice(skip * 262144, (skip + 1) * 262144)),
              };
            } else if (payload.command.startsWith('rm -f ')) {
              w.__packs = w.__packs.filter((p) => !payload.command.includes(`'${p.path}'`));
              response = { returnValue: true, stdoutString: '' };
            } else if (payload.command.includes('/tmp/usb/'))
              response = { returnValue: true, stdoutString: '' };
            else
              response = {
                returnValue: true,
                stdoutString: JSON.stringify(
                  payload.command.includes('listApps')
                    ? {
                        returnValue: true,
                        apps,
                      }
                    : {
                        returnValue: true,
                        devices: w.__devices,
                      },
                ),
              };
          } else if (uri.includes('getAppLoadStatus'))
            response = { returnValue: true, exist: true };
          else response = { returnValue: true };
          setTimeout(() => this.onservicecallback(JSON.stringify(response)), 10);
        }
      };
    },
    { denied, requiredACG: manifest.requiredACG as string[], apps, devices, packs },
  );
}

test('a TV uses its real inventory and launches TV settings separately from LumiOS settings', async ({
  page,
}) => {
  await installMockTV(page, false);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open A real TV app', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toHaveCount(0);
  await expect(page.getByText('Desktop preview', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__calls.filter((call: any) => call.uri.endsWith('/launch')).length,
      ),
    )
    .toBe(1);
  const launches = await page.evaluate(() =>
    (window as any).__calls.filter((call: any) => call.uri.endsWith('/launch')),
  );
  expect(launches[0].payload).toEqual({ id: 'com.example.real' });
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'TV settings', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__calls
          .filter((call: any) => call.uri.endsWith('/launch'))
          .map((call: any) => call.payload.id),
      ),
    )
    .toEqual(['com.example.real', 'com.palm.app.settings']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsPage = page.getByRole('region', { name: 'LumiOS settings', exact: true });
  await expect(settingsPage).toBeVisible();
  await expect(settingsPage.getByRole('button', { name: 'TV settings', exact: true })).toHaveCount(
    0,
  );
});

test('TV inventory failure is actionable and never becomes a pretend desktop inventory', async ({
  page,
}) => {
  await installMockTV(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little help from your TV.' })).toBeVisible();
  await expect(page.getByText(/Mock: service is not elevated/)).toBeVisible();
  await expect(page.locator('[data-app-id]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: false })).toBeVisible();
});

test('mobile preview remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Find an app' })).toBeVisible();
  const navigation = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  const tvSettings = await page
    .getByRole('button', { name: 'TV settings', exact: true })
    .boundingBox();
  expect(navigation!.y).toBeGreaterThan(tvSettings!.y + tvSettings!.height);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'LumiOS settings', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('one persistent navigation pill slides with native CSS and follows remote input and resizing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const pill = page.locator('.nav-indicator');
  await pill.evaluate((element) => {
    (window as any).__navigationPill = element;
    (window as any).__navigationTransitions = [];
    element.addEventListener('transitionrun', (event) => {
      (window as any).__navigationTransitions.push((event as TransitionEvent).propertyName);
    });
  });
  const expectAligned = async () => {
    await expect
      .poll(() =>
        pill.evaluate((element) => {
          const actual = element.getBoundingClientRect();
          const selected = document.querySelector('.nav-item.active')!.getBoundingClientRect();
          return Math.max(
            Math.abs(actual.x - selected.x),
            Math.abs(actual.y - selected.y),
            Math.abs(actual.width - selected.width),
            Math.abs(actual.height - selected.height),
          );
        }),
      )
      .toBeLessThan(1.5);
  };
  await expectAligned();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectAligned();
  expect(await pill.evaluate((element) => element === (window as any).__navigationPill)).toBe(true);
  const transitions = await page.evaluate(
    () => (window as any).__navigationTransitions as string[],
  );
  expect(transitions).toContain('transform');
  expect(transitions).toContain('width');
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  const apps = page.getByRole('button', { name: 'Apps', exact: true });
  await expect(apps).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(apps).toHaveAttribute('aria-current', 'page');
  await expectAligned();
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expectAligned();
  await expect(pill).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAligned();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectAligned();
});

test('navigation pill respects saved and system reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const home = page.getByRole('button', { name: 'Home', exact: true });
  const motion = page.getByRole('switch', { name: 'Reduced motion', exact: true });
  const pill = page.locator('.nav-indicator');
  await settings.click();
  await motion.click();
  await home.click();
  expect(await pill.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect(await pill.evaluate((element) => element.getAnimations().length)).toBe(0);
  await settings.click();
  await motion.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await home.click();
  expect(await pill.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect(await pill.evaluate((element) => element.getAnimations().length)).toBe(0);
});

test('card focus stays the same size and navigation tabs switch with the remote', async ({
  page,
}) => {
  await page.goto('/');
  const netflix = page.getByRole('button', { name: 'Open Netflix', exact: true });
  await expect(netflix).toBeFocused();
  const initial = await netflix.locator('.app-face').boundingBox();
  await page.keyboard.press('ArrowRight');
  const next = await netflix.locator('.app-face').boundingBox();
  expect(next!.width).toBe(initial!.width);
  expect(next!.height).toBe(initial!.height);
  expect(
    await netflix.locator('.app-face').evaluate((element) => getComputedStyle(element).transform),
  ).toBe('none');
  await page.getByRole('button', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const apps = page.getByRole('button', { name: 'Apps', exact: true });
  await expect(apps).toBeFocused();
  await expect(apps).toHaveAttribute('aria-current', 'page');
});

test('compact library filters can reset, long names wrap, and inputs stay compact', async ({
  page,
}) => {
  await installMockTV(page, false, [
    { id: 'com.webos.app.lgchannels', title: 'LG Channels', visible: true },
    {
      id: 'com.example.long',
      title: 'An application with a much longer name that should remain completely readable',
      visible: true,
    },
  ]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const label = page
    .locator('.library-grid .app-label')
    .filter({ hasText: 'An application with a much longer name' });
  const dimensions = await label.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
  expect(dimensions.whiteSpace).toBe('normal');
  await expect(page.getByRole('button', { name: 'Open LG Channels', exact: true })).toBeVisible();
  const toolbar = await page.locator('.library-toolbar').boundingBox();
  const search = await page.getByRole('searchbox', { name: 'Find an app' }).boundingBox();
  expect(search!.y).toBeLessThan(toolbar!.y + toolbar!.height);
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  const input = await page.locator('.home-input-grid .input-card').first().boundingBox();
  expect(input!.height).toBeLessThan(140);
});

test('connection artwork follows the reported device labels without changing the input target', async ({
  page,
}) => {
  await installMockTV(page, false, undefined, [
    {
      appId: 'com.webos.app.hdmi1',
      id: 'HDMI_1',
      port: 1,
      label: 'PlayStation 5',
      connected: true,
    },
    { appId: 'com.webos.app.hdmi2', id: 'HDMI_2', port: 2, label: 'USB media', connected: true },
    { appId: 'com.webos.app.hdmi3', id: 'HDMI_3', port: 3, label: 'HDMI 3', connected: true },
    { appId: 'com.webos.app.hdmi4', id: 'HDMI_4', port: 4, label: 'Apple TV', connected: true },
  ]);
  await page.goto('/');
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(4);
  const playstation = page.locator('[data-focusable="input-com.webos.app.hdmi1"]');
  await expect(playstation.locator('.input-title')).toHaveText('HDMI 1');
  await expect(playstation.locator('.input-state')).toHaveText('PlayStation 5 · Connected');
  await expect(playstation.locator('[data-connection-icon="playstation"]')).toBeVisible();
  await expect(
    page.locator('[data-focusable="input-com.webos.app.hdmi2"] [data-connection-icon="usb"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-focusable="input-com.webos.app.hdmi3"] [data-connection-icon="hdmi"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-focusable="input-com.webos.app.hdmi3"] .input-state'),
  ).toHaveText('Connected');
  const appleTV = page.locator('[data-focusable="input-com.webos.app.hdmi4"]');
  await expect(appleTV.locator('[data-connection-icon="apple-tv"]')).toBeVisible();
  await playstation.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__calls
          .filter((call: any) => call.uri.endsWith('/launch'))
          .map((call: any) => call.payload.id),
      ),
    )
    .toEqual(['com.webos.app.hdmi1']);
  await expect(page.getByRole('status')).toHaveCount(0);
  await appleTV.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__calls
          .filter((call: any) => call.uri.endsWith('/launch'))
          .map((call: any) => call.payload.id),
      ),
    )
    .toEqual(['com.webos.app.hdmi1', 'com.webos.app.hdmi4']);
});

test('Home favorites move inline with hold OK and left/right, and Back keeps the order', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(700);
  await page.keyboard.up('Enter');
  const moving = page.getByRole('button', { name: 'Move Netflix', exact: true });
  await expect(moving).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      page
        .locator('.favorites-grid [data-app-id]')
        .evaluateAll((nodes) =>
          nodes.slice(0, 2).map((node) => (node as HTMLElement).dataset.appId),
        ),
    )
    .toEqual(['youtube.leanback.v4', 'netflix']);
  await expect(moving).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await expect(page.locator('.favorites-grid.is-reordering')).toHaveCount(0);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator('.favorites-grid [data-app-id]')
        .evaluateAll((nodes) =>
          nodes.slice(0, 2).map((node) => (node as HTMLElement).dataset.appId),
        ),
    )
    .toEqual(['youtube.leanback.v4', 'netflix']);
  await page.getByRole('button', { name: 'Open Netflix', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Desktop preview');
});

test('moving up to the Apps categories restores the complete top of the scroller', async ({
  page,
}) => {
  const apps = Array.from({ length: 36 }, (_, index) => ({
    id: `com.example.scroll${index + 1}`,
    title: `App ${String(index + 1).padStart(2, '0')}`,
    visible: true,
  }));
  await installMockTV(page, false, apps);
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await page.getByRole('button', { name: 'Open App 08', exact: true }).focus();
  await page.locator('main').evaluate((main) => main.scrollTo({ top: 200, behavior: 'instant' }));
  await expect.poll(() => page.locator('main').evaluate((main) => main.scrollTop)).toBe(200);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Open App 02', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Utilities', exact: true })).toBeFocused();
  await expect.poll(() => page.locator('main').evaluate((main) => main.scrollTop)).toBe(0);
});

test('Home card captions are opt-in, persist, and do not affect library captions', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await expect(page.locator('.favorites-grid .app-label').first()).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const names = page.getByRole('switch', { name: 'Show app names', exact: true });
  await expect(names).toHaveAttribute('aria-checked', 'false');
  await names.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.favorites-grid .app-label').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.favorites-grid .app-label').first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(names).toHaveAttribute('aria-checked', 'true');
  await names.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.favorites-grid .app-label').first()).toBeHidden();
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await expect(page.locator('.library-grid .app-label').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.favorites-grid .app-label').first()).toBeHidden();
});

test('repeated remote moves reuse geometry instead of measuring the whole library', async ({
  page,
}) => {
  await installMockTV(
    page,
    false,
    Array.from({ length: 120 }, (_, index) => ({
      id: `com.example.fast${index}`,
      title: `App ${String(index + 1).padStart(3, '0')}`,
      visible: true,
    })),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(120);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.library-grid [data-app-id]').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => {
    const original = Element.prototype.getBoundingClientRect;
    (window as any).__layoutReads = 0;
    Element.prototype.getBoundingClientRect = function () {
      (window as any).__layoutReads++;
      return original.call(this);
    };
  });
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
  }
  await expect(page.locator('.library-grid [data-app-id]').first()).toBeFocused();
  expect(await page.evaluate(() => (window as any).__layoutReads)).toBeLessThan(400);
});

test('cached remote geometry follows disabled controls and resized grids', async ({ page }) => {
  await installMockTV(
    page,
    false,
    Array.from({ length: 36 }, (_, index) => ({
      id: `com.example.resize${index}`,
      title: `App ${String(index + 1).padStart(3, '0')}`,
      visible: true,
    })),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const cards = page.locator('.library-grid [data-app-id]');
  await expect(cards).toHaveCount(36);
  await cards.first().focus();
  await page.keyboard.press('ArrowRight');
  await cards.first().focus();
  await cards.nth(1).evaluate((node) => ((node as HTMLButtonElement).disabled = true));
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(2)).toBeFocused();
  await cards.nth(1).evaluate((node) => ((node as HTMLButtonElement).disabled = false));
  await cards.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await cards.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(cards.nth(3)).toBeFocused();
});

test('clock advances at the minute boundary without re-sorting the app library', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-20T11:59:50') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning.', exact: true })).toBeVisible();
  await page.clock.fastForward(20000);
  await expect(page.getByRole('heading', { name: 'Good afternoon.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await page.evaluate(() => {
    const original = String.prototype.localeCompare;
    (window as any).__sorts = 0;
    String.prototype.localeCompare = function (this: string, ...args: Parameters<typeof original>) {
      (window as any).__sorts++;
      return original.apply(this, args);
    };
  });
  await page.clock.fastForward(60000);
  await expect(page.locator('.header-time')).toContainText('12:01');
  expect(await page.evaluate(() => (window as any).__sorts)).toBe(0);
});

test('app-action highlight follows pointer and remote input, and hiding keeps focus nearby', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const browser = page.getByRole('button', { name: 'Open Web Browser', exact: true });
  const neighbor = await browser.evaluate((node) => {
    const cards = [...document.querySelectorAll<HTMLElement>('.library-grid [data-app-id]')];
    const index = cards.indexOf(node as HTMLElement);
    return (cards[index + 1] ?? cards[index - 1]).dataset.focusable!;
  });
  await browser.hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const favorite = page.getByRole('button', { name: 'Add to favorites', exact: true });
  const hide = page.getByRole('button', { name: 'Hide app', exact: true });
  await expect(favorite).toBeFocused();
  const ring = await favorite.evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    shadow: getComputedStyle(node).boxShadow,
  }));
  expect(ring.outline).toBe('none');
  expect(ring.shadow).toContain('inset');
  await hide.hover();
  await expect(hide).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(favorite).toBeFocused();
  expect(
    await page
      .locator('.app-actions .setting-row')
      .evaluateAll(
        (nodes) => nodes.filter((node) => getComputedStyle(node).boxShadow !== 'none').length,
      ),
  ).toBe(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(browser).toHaveCount(0);
  const next = page.locator(`[data-focusable="${neighbor}"]`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(next).toBeFocused();
  await page.keyboard.press('m');
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await close.hover();
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(next).toBeFocused();
});

test('app actions close immediately, keep favorites first, and filter hidden apps in the pills', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const browser = page.getByRole('button', { name: 'Open Web Browser', exact: true });
  await browser.focus();
  await page.keyboard.press('m');
  const favorite = page.getByRole('button', { name: 'Add to favorites', exact: true });
  await expect(favorite).toBeFocused();
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(browser).toBeFocused();
  const readFavoriteOrder = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('lumios.preferences.v1')!).favorites as string[],
    );
  const readLibraryOrder = () =>
    page
      .locator('.library-grid [data-app-id]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.appId));
  let favorites = await readFavoriteOrder();
  expect((await readLibraryOrder()).slice(0, favorites.length)).toEqual(favorites);
  await expect(browser.locator('.favorite-badge')).toBeVisible();
  await page.keyboard.press('m');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Hide app', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(browser).toHaveCount(0);
  await page
    .locator('.filter-tabs')
    .getByRole('button', { name: 'Hidden (1)', exact: true })
    .click();
  await expect(page.locator('.library-grid [data-app-id]')).toHaveCount(1);
  await browser.focus();
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Show app', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hidden (1)', exact: true })).toHaveCount(0);
  await expect(browser).toBeVisible();
  favorites = await readFavoriteOrder();
  expect((await readLibraryOrder()).slice(0, favorites.length)).toEqual(favorites);
  await browser.focus();
  await page.keyboard.press('m');
  await expect(
    page.getByRole('button', { name: 'Remove from favorites', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(browser.locator('.favorite-badge')).toHaveCount(0);
  favorites = await readFavoriteOrder();
  expect((await readLibraryOrder()).slice(0, favorites.length)).toEqual(favorites);
});

test('Spanish is selectable from the language menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await page.getByRole('button', { name: /Language/ }).press('ArrowRight');
  await expect(page.locator('[data-focusable="language-option-en"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="language-option-es"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ajustes de LumiOS', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toBeVisible();
});

test('a TV set to Spanish starts in Spanish on first run', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-EC',
    baseURL: 'http://127.0.0.1:5188',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajustes', exact: true })).toBeVisible();
  await context.close();
});

test('icon packs on the TV style tiles, list in Settings, and can be overridden or removed', async ({
  page,
}) => {
  await installMockTV(
    page,
    false,
    [
      { id: 'netflix', title: 'Netflix', visible: true },
      { id: 'com.example.real', title: 'A real TV app', visible: true },
    ],
    undefined,
    [mockPack()],
  );
  await page.goto('/');
  const face = page.locator('.app-tile[data-app-id="netflix"] .app-face').first();
  await expect(face).toHaveAttribute('data-icnl', 'mock/netflix');
  await expect(face.locator('img.brand-pack-icon')).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => page.evaluate(() => document.getElementById('icnl-styles')?.textContent))
    .toContain('.app-face[data-icnl="mock/netflix"] { background: rgb(20, 20, 20); }');
  await expect(face).toHaveCSS('background-color', 'rgb(20, 20, 20)');
  const inputGlyph = page.locator(
    '[data-focusable="input-com.webos.app.hdmi2"] .input-glyph[data-icnl="mock/switch"]',
  );
  await expect(inputGlyph).toBeVisible();
  await expect(inputGlyph).toHaveCSS('mask-image', /blob:/);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Icons', exact: true }).click();
  const packRow = page.locator('[data-focusable="setting-pack-mock"]');
  await expect(packRow).toContainText('Mock pack');
  await expect(packRow).toContainText('v2.0.0 · Tests · 2 icons');
  const netflixRow = page.locator('[data-focusable="setting-app-icon-netflix"]');
  await expect(netflixRow).toContainText('Mock pack');
  await expect(netflixRow.locator('.icon-preview')).toHaveAttribute('data-icnl', 'mock/netflix');
  await expect(page.locator('[data-focusable="setting-app-icon-com.example.real"]')).toContainText(
    'Generic',
  );

  await netflixRow.click();
  await expect(page.locator('[data-focusable="app-icon-option-auto"]')).toBeFocused();
  await expect(page.getByRole('option', { name: /Netflix tile/ })).toContainText('Mock pack');
  await page.getByRole('option', { name: 'TV icon', exact: true }).click();
  await expect(netflixRow).toBeFocused();
  await expect(netflixRow).toContainText('Built-in');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lumios.preferences.v1')!).iconOverrides,
    ),
  ).toEqual({ netflix: 'tv' });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(face).not.toHaveAttribute('data-icnl');
  await expect(face.locator('img.brand-logo')).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Icons', exact: true }).click();
  await netflixRow.click();
  await page.getByRole('option', { name: /^Automatic/ }).click();
  await packRow.click();
  await expect(page.locator('[data-focusable="pack-remove"]')).toBeFocused();
  await expect(page.locator('.settings-path')).toHaveText(
    '/media/developer/lumios/packs/mock.icnl',
  );
  await page.locator('[data-focusable="pack-remove"]').click();
  await expect(page.getByRole('status').filter({ hasText: 'Mock pack removed.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No icon packs yet.' })).toBeVisible();
  await expect(page.locator('[data-focusable="settings-section-icons"]')).toBeFocused();
  await expect(netflixRow).toContainText('Built-in');
});

test('without a TV the Icons section explains where packs go and offers no pack icons', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Icons', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('/media/developer/lumios/packs');
  await expect(page.locator('[data-focusable="setting-icons-usb"]')).toBeVisible();
  const row = page.locator('[data-focusable="setting-app-icon-netflix"]');
  await expect(row).toContainText('Built-in');
  await row.press('ArrowRight');
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});

test('inputs can be renamed from Settings and the name drives the Home card and its icon', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.locator('[data-focusable="input-com.webos.app.hdmi1"]');
  await expect(card.locator('.input-title')).toHaveText('HDMI 1');
  await expect(card.locator('.input-state')).toHaveText('PlayStation 5 · Connected');
  await expect(card.locator('[data-connection-icon="playstation"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  const row = page.locator('[data-focusable="setting-input-com.webos.app.hdmi1"]');
  await row.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focusable="input-icon"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  const name = page.locator('[data-focusable="input-name"]');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('placeholder', 'HDMI 1');
  await name.fill('Switch 2 ');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focusable="input-icon"]')).toBeFocused();
  await expect(name).toHaveValue('Switch 2');
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await expect(row.locator('strong')).toHaveText('Switch 2');
  await expect(row.locator('small')).toHaveText('HDMI 1 · Connected');
  await expect(row.locator('[data-connection-icon="console"]')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(card.locator('.input-title')).toHaveText('Switch 2');
  await expect(card.locator('.input-state')).toHaveText('HDMI 1 · Connected');
  await expect(card.locator('[data-connection-icon="console"]')).toBeVisible();
  await page.reload();
  await expect(card.locator('.input-title')).toHaveText('Switch 2');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lumios.preferences.v1')!).inputNames,
    ),
  ).toEqual({ 'com.webos.app.hdmi1': 'Switch 2' });
});

test('launchers are added from any TV app, shown on Home, hidden with Off and deleted', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.home-input-grid .input-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
  const add = page.locator('[data-focusable="setting-add-launcher"]');
  await add.press('ArrowRight');
  await expect(page.locator('[data-focusable="target-option-airplay"]')).toBeFocused();
  await expect(page.getByRole('option').first()).toContainText('AirPlay');
  await expect(
    page.locator('[data-focusable="target-option-com.webos.app.miracast"]'),
  ).toContainText('Screen Share');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'AirPlay added to Home.' }),
  ).toBeVisible();
  const name = page.locator('[data-focusable="launcher-name"]');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('AirPlay');
  await name.fill('Mirror iPhone');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focusable="launcher-icon"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focusable="launcher-target"]')).toContainText('AirPlay');
  await page.keyboard.press('Escape');
  const row = page.locator('[data-focusable^="setting-launcher-"]');
  await expect(row).toBeFocused();
  await expect(row.locator('strong')).toHaveText('Mirror iPhone');
  await expect(row.locator('small')).toHaveText('Opens AirPlay');
  await expect(row.locator('.setting-value')).toHaveText('On');

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  const card = page.locator('.home-input-grid .input-launcher');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.input-title')).toHaveText('Mirror iPhone');
  await expect(card.locator('.input-state')).toHaveText('AirPlay');
  await expect(card.locator('[data-connection-icon="airplay"]')).toBeVisible();
  await card.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Mirror iPhone will open on your TV.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.home-input-grid .input-launcher .input-title')).toHaveText(
    'Mirror iPhone',
  );

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
  await row.press('ArrowRight');
  await page.locator('[data-focusable="launcher-visibility-option-off"]').click();
  await expect(row.locator('.setting-value')).toHaveText('Off');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-input-grid .input-launcher')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
  await row.press('ArrowRight');
  await page.locator('[data-focusable="launcher-delete"]').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Mirror iPhone deleted.' }),
  ).toBeVisible();
  await expect(add).toBeFocused();
  await expect(row).toHaveCount(0);
});

test('system preload is a TV switch that registers LumiOS with the preload manager', async ({
  page,
}) => {
  await installMockTV(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const row = page.locator('[data-focusable="setting-system-preload"]');
  await expect(row).toHaveAttribute('aria-checked', 'false');
  await expect(row.locator('small')).toContainText('preload manager');
  await expect(row).not.toHaveAttribute('aria-disabled', 'true');
  await row.click();
  await expect(page.getByRole('status').filter({ hasText: 'System preload on.' })).toBeVisible();
  await expect(row).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() =>
      (window as any).__calls
        .filter((call: any) => call.payload?.command?.includes('preload.js'))
        .map((call: any) => /preload\.js"? (\w+)/.exec(call.payload.command)?.[1]),
    ),
  ).toEqual(['status', 'enable']);
  await row.click();
  await expect(page.getByRole('status').filter({ hasText: 'System preload off.' })).toBeVisible();
  await expect(row).toHaveAttribute('aria-checked', 'false');
});

test('without a TV the system preload switch says it only works on the TV', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const row = page.locator('[data-focusable="setting-system-preload"]');
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row.locator('small')).toHaveText('Available on the TV.');
  // aria-disabled keeps Playwright's click waiting; the remote's OK still reaches the row.
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Available on the TV.' })).toBeVisible();
});

test('input icons can be chosen from built-in symbols without any pack', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-focusable="input-com.webos.app.hdmi2"]');
  await expect(card.locator('[data-connection-icon="apple-tv"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
  const row = page.locator('[data-focusable="setting-input-com.webos.app.hdmi2"]');
  await row.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-visibility-option-auto"]')).toBeFocused();
  const iconRow = page.locator('[data-focusable="input-icon"]');
  await expect(iconRow.locator('.setting-value')).toHaveText('Automatic');
  await iconRow.press('ArrowRight');
  await expect(page.locator('[data-focusable="input-icon-option-auto"]')).toBeFocused();
  await expect(page.getByRole('option', { name: /^Console/ })).toContainText('Built-in symbols');
  await page.locator('[data-focusable="input-icon-option-builtin:console"]').click();
  await expect(iconRow).toBeFocused();
  await expect(iconRow.locator('.setting-value')).toHaveText('Console');
  await expect(iconRow.locator('[data-connection-icon="console"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await expect(row.locator('[data-connection-icon="console"]')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(card.locator('[data-connection-icon="console"]')).toBeVisible();
  await page.reload();
  await expect(card.locator('[data-connection-icon="console"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lumios.preferences.v1')!).inputIcons,
    ),
  ).toEqual({ 'com.webos.app.hdmi2': 'builtin:console' });
});

test('a launcher can be shown as an app tile instead of an input card', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed once; a reload must keep what the test changed.
    if (localStorage.getItem('lumios.preferences.v1')) return;
    localStorage.setItem(
      'lumios.preferences.v1',
      JSON.stringify({
        version: 1,
        launchers: [
          {
            id: 'launcher-tile01',
            title: 'AirPlay',
            icon: '',
            target: 'airplay',
            placement: 'inputs',
          },
        ],
      }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.home-input-grid .input-launcher')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(page.locator('.settings-pane [data-focusable]').first()).toBeFocused();
  const row = page.locator('[data-focusable="setting-launcher-launcher-tile01"]');
  await row.press('ArrowRight');
  await expect(page.locator('[data-focusable="launcher-name"]')).toBeFocused();
  await page.locator('[data-focusable="launcher-placement-option-apps"]').click();
  await expect(page.locator('[data-focusable="launcher-placement-option-apps"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-input-grid .input-launcher')).toHaveCount(0);
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  const tile = page.locator('[data-focusable="library-launcher-tile01"]');
  await expect(tile).toBeVisible();
  await expect(tile.locator('.app-face')).toHaveClass(/brand-launcher/);
  await expect(tile.locator('[data-connection-icon="airplay"]')).toBeVisible();
  await expect(tile.locator('.app-label')).toHaveText('AirPlay');
  await tile.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'AirPlay will open on your TV.' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Apps', exact: true }).click();
  await expect(tile).toBeVisible();
});

test('pack wallpapers join Settings → Background as images and persist', async ({ page }) => {
  await installMockTV(page, false, undefined, undefined, [mockPack()]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Background', exact: true }).click();
  const dot = page.locator('[data-focusable="wallpaper-mock/dot"]');
  await expect(dot).toContainText('Dot');
  await expect(dot.locator('img')).toHaveAttribute('src', /^blob:/);
  await dot.click();
  const wall = page.locator('.wallpaper');
  await expect(wall).toHaveAttribute('data-wallpaper', 'mock/dot');
  await expect(wall).toHaveCSS('background-image', /blob:/);
  await page.reload();
  await expect(page.locator('.wallpaper')).toHaveAttribute('data-wallpaper', 'mock/dot');
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /blob:/);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('lumios.preferences.v1')!).wallpaper),
  ).toBe('mock/dot');
});

test('the desktop preview loads the example packs when the URL carries ?packs', async ({
  page,
}) => {
  await page.goto('/?packs');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Icons', exact: true }).click();
  await expect(page.locator('[data-focusable="setting-pack-luma-brands"]')).toContainText(
    '9 icons',
  );
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.app-tile[data-app-id="netflix"] .app-face').first()).toHaveAttribute(
    'data-icnl',
    'luma-brands/netflix',
  );
});

test('the remote colour keys jump between Home, Apps and Settings', async ({ page }) => {
  await page.goto('/');
  const press = (keyCode: number) =>
    page.locator('body').dispatchEvent('keydown', { key: 'Unidentified', keyCode, bubbles: true });
  await press(404);
  await expect(page.locator('main')).toHaveClass(/page-apps/);
  await expect(page.locator('.library-grid [data-app-id]').first()).toBeFocused();
  await press(405);
  await expect(page.locator('main')).toHaveClass(/page-settings/);
  await expect(page.locator('[data-focusable="settings-section-interface"]')).toBeFocused();
  await press(403);
  await expect(page.locator('main')).toHaveClass(/page-home/);
  await expect(page.locator('.favorites-grid [data-app-id]').first()).toBeFocused();
});
