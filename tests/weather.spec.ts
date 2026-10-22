import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const location = {
  name: 'Vienna',
  region: 'State of Vienna',
  country: 'Austria',
  latitude: 48.20849,
  longitude: 16.37208,
};

async function openWeather(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show widget', exact: true })).toBeFocused();
}

async function openWeatherLocation(page: Page) {
  await openWeather(page);
  await page.locator('[data-focusable="setting-weather-location"]').press('ArrowRight');
  const field = page.getByRole('searchbox', { name: 'City or postcode' });
  await expect(field).toBeFocused();
  return field;
}

test('choose a city, reuse cached weather, and remove the location', async ({ page }) => {
  let forecasts = 0;
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('name')).toBe('Vienna');
    await route.fulfill({ json: { results: [{ ...location, admin1: location.region }] } });
  });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecasts++;
    expect(new URL(route.request().url()).searchParams.get('latitude')).toBe(
      String(location.latitude),
    );
    await route.fulfill({
      json: { current: { temperature_2m: 14.2, weather_code: 2, is_day: 1 } },
    });
  });
  await page.goto('/');
  expect(forecasts).toBe(0);
  const field = await openWeatherLocation(page);
  await field.fill('Vienna');
  await page.getByRole('button', { name: 'Search locations', exact: true }).click();
  await page.locator('.location-results button').click();
  await expect(page.locator('.saved-location')).toContainText('Vienna');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focusable="setting-weather-location"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.weather-summary')).toContainText('Vienna');
  await expect(page.locator('.weather-summary')).toContainText('14°C');
  await expect(page.locator('.weather-summary')).toContainText('Partly cloudy');
  await expect(page.locator('[data-focusable="weather-configure"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.weather-summary')).toContainText('14°C');
  await expect(page.locator('[data-focusable="weather-configure"]')).toHaveCount(0);
  expect(forecasts).toBe(1);
  await openWeatherLocation(page);
  const clearLocation = page.getByRole('button', { name: 'Remove weather location' });
  await clearLocation.focus();
  const focusStyle = await clearLocation.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      shadow: style.boxShadow,
      outline: style.outlineStyle,
      radius: style.borderRadius,
    };
  });
  expect(focusStyle.width).toBe(focusStyle.height);
  expect(focusStyle.shadow).not.toBe('none');
  expect(focusStyle.outline).toBe('none');
  expect(focusStyle.radius).toBe('50%');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Search locations', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focusable="setting-weather-location"]')).toBeFocused();
  await expect(
    page.locator('[data-focusable="setting-weather-location"] .setting-value'),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Set weather location', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  expect(forecasts).toBe(1);
});

test('temperature units persist, work with the remote, and convert cached readings on Home', async ({
  page,
}) => {
  let requests = 0;
  await page.addInitScript((location) => {
    if (!localStorage.getItem('lumios.preferences.v1'))
      localStorage.setItem(
        'lumios.preferences.v1',
        JSON.stringify({ version: 1, weatherLocation: location }),
      );
  }, location);
  await page.route('https://api.open-meteo.com/**', (route) => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get('temperature_unit')).toBe('celsius');
    return route.fulfill({
      json: { current: { temperature_2m: 14.2, weather_code: 2, is_day: 1 } },
    });
  });
  await page.goto('/');
  await expect(page.locator('.weather-temperature')).toHaveText('14°C');
  await openWeather(page);
  await page.locator('[data-focusable="setting-temperature"]').press('ArrowRight');
  const celsius = page.locator('[data-focusable="temperature-option-celsius"]');
  const fahrenheit = page.locator('[data-focusable="temperature-option-fahrenheit"]');
  await expect(celsius).toHaveAttribute('aria-selected', 'true');
  await celsius.focus();
  await page.keyboard.press('ArrowDown');
  await expect(fahrenheit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focusable="setting-temperature"]')).toBeFocused();
  await expect(page.locator('[data-focusable="setting-temperature"] .setting-value')).toHaveText(
    '°F',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.weather-temperature')).toHaveText('58°F');
  await page.reload();
  await expect(page.locator('.weather-temperature')).toHaveText('58°F');
  await openWeather(page);
  await page.locator('[data-focusable="setting-temperature"]').press('ArrowRight');
  await expect(fahrenheit).toHaveAttribute('aria-selected', 'true');
  await expect(fahrenheit).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(celsius).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focusable="setting-temperature"]')).toBeFocused();
  await expect(page.locator('[data-focusable="setting-temperature"] .setting-value')).toHaveText(
    '°C',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.weather-temperature')).toHaveText('14°C');
  await page.reload();
  await expect(page.locator('.weather-temperature')).toHaveText('14°C');
  expect(requests).toBe(1);
});

test('a configured city with failed weather remains usable and shows an honest fallback', async ({
  page,
}) => {
  await page.addInitScript(
    (location) =>
      localStorage.setItem(
        'lumios.preferences.v1',
        JSON.stringify({ version: 1, weatherLocation: location }),
      ),
    location,
  );
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await expect(page.locator('.weather-summary')).toContainText('Vienna');
  await expect(page.locator('.weather-summary')).toContainText('Weather unavailable');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Open YouTube', exact: true })).toBeFocused();
});

test('packaged file weather works with the restricted CSP and no geolocation lookup', async ({
  page,
}) => {
  const remote: string[] = [];
  await page.addInitScript(
    (location) =>
      localStorage.setItem(
        'lumios.preferences.v1',
        JSON.stringify({ version: 1, weatherLocation: location }),
      ),
    location,
  );
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) remote.push(request.url());
  });
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { current: { temperature_2m: 9.4, weather_code: 0, is_day: 0 } },
    }),
  );
  await page.goto(pathToFileURL(path.resolve('dist/app/index.html')).href);
  await expect(page.locator('.weather-summary')).toContainText('9°C');
  await expect(page.locator('.weather-summary')).toContainText('Clear night');
  expect(remote).toHaveLength(1);
  expect(new URL(remote[0]).hostname).toBe('api.open-meteo.com');
});

test('location search handles no matches and can be retried', async ({ page }) => {
  let requests = 0;
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
    requests++;
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/');
  const field = await openWeatherLocation(page);
  await field.fill('xx');
  await page.getByRole('button', { name: 'Search locations', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No locations found');
  await page.getByRole('button', { name: 'Search locations', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
});

test('weather visibility preserves the city and prevents requests when the widget is off', async ({
  page,
}) => {
  let requests = 0;
  await page.addInitScript(
    (location) =>
      localStorage.setItem(
        'lumios.preferences.v1',
        JSON.stringify({ version: 1, weatherLocation: location, showWeather: false }),
      ),
    location,
  );
  await page.route('https://api.open-meteo.com/**', (route) => {
    requests++;
    return route.fulfill({ json: { current: { temperature_2m: 12, weather_code: 3, is_day: 1 } } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await expect(page.locator('.weather-summary')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.settings-sidebar')).toContainText('General');
  await expect(page.getByRole('switch', { name: 'Show widget', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show widget', exact: true })).toBeFocused();
  await expect(page.getByRole('switch', { name: /Show widget/ })).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Show widget', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-focusable="setting-weather-location"]')).toContainText('Vienna');
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.weather-summary')).toContainText('12°C');
  expect(requests).toBe(1);
  await openWeather(page);
  await toggle.click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Netflix', exact: true })).toBeFocused();
  await expect(page.locator('.weather-summary')).toHaveCount(0);
  expect(requests).toBe(1);
});

test('Back exits city editing before leaving Settings, including the TV Back key', async ({
  page,
}) => {
  await page.goto('/');
  const field = await openWeatherLocation(page);
  const search = page.getByRole('button', { name: 'Search locations', exact: true });
  await field.fill('Berlin');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'LumiOS settings', exact: true })).toBeVisible();
  await expect(field).toHaveValue('Berlin');
  await expect(search).toBeFocused();
  await field.focus();
  await field.dispatchEvent('keydown', { key: 'Unidentified', keyCode: 461, bubbles: true });
  await expect(page.getByRole('region', { name: 'LumiOS settings', exact: true })).toBeVisible();
  await expect(field).toHaveValue('Berlin');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focusable="setting-weather-location"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Favorites', exact: true })).toBeVisible();
});
