# LumiOS agent context

## Checks

Use pnpm, Oxlint, and Oxfmt. Node.js 22+ and pnpm 10 are required; `package.json` pins the pnpm version.

```sh
pnpm check
pnpm format:check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm check` runs Oxlint and TypeScript. Run `pnpm lint:fix` to apply automatic lint fixes. Oxlint checks TypeScript, React, hooks, and accessibility rules; generated output is excluded. Formatting uses Oxfmt: `pnpm format` writes formatting changes and `pnpm format:check` verifies them.

Build before running browser tests so packaged `file://` tests exercise the current code. The browser suite is timing-sensitive: focus tests that race `requestAnimationFrame` can fail under machine load with 3 workers. A test that fails only in a full run and passes with `pnpm exec playwright test -g "<name>" --repeat-each=3` is a load flake, not a regression. Browser checks cover remote navigation, hold-OK options, favorites, settings, input visibility modes, search, persistence, focus restoration, weather configuration, temperature units, caching, and TV-service failure behavior with a mock bridge. Weather APIs are mocked; tests do not connect to a TV. On Linux, install Chromium's dependencies with `pnpm exec playwright install --with-deps chromium`.

## Structure

`src/` contains React/TypeScript UI, spatial navigation, local preferences, and the webOS bridge. `src/dev-packs.ts` loads the example packs listed in `packs/dev.json` into the desktop preview when the URL carries `?packs` (stylesheets are fetched with `?direct` so Vite serves CSS, not a module); it never runs on the TV. `public/` contains locally bundled assets. `tools/` builds a classic-script app and IPK. `tv/autostart.sh` is the optional boot hook. Built-in wallpapers may declare `base` and `spots` (`wallpapers.ts`): the app then renders one absolutely positioned `.flow-spot` per spot inside a `.wallpaper-live` container and drifts them with the `flow-drift` keyframes (transform only, so the TV compositor does the work); `.reduce-motion` and `prefers-reduced-motion` stop the animation. The SVG stays as the gallery thumbnail. Pack CSS cannot animate because the sanitizer drops at-rules.

Project filenames use lowercase kebab-case, including React components (for example, `app-tile.tsx`). Keep `package.json` and `appinfo.json` versions synchronized; change the version only when requested.

## App icons

Every installed app ships its own icon on the TV. `src/tv-icons.ts` reads those files at runtime through Homebrew Channel's `exec` service: one `wc -c` listing for sizes, then `cat` batches planned so each reply stays under 256 KiB (the service buffers at most about 1 MiB of stdout). Bytes come from the reply's base64 `stdoutBytes`; a tile background colour is derived from the icon's edge pixels (`dominantColor`); records are cached in IndexedDB (`lumios` / `tv-icons`) keyed by app id and invalidated when the icon path changes. `src/use-tv-icons.ts` turns records into object URLs for `AppTile`. Icon priority: icon pack (planned `.icnl`) → the TV icon → built-in brand artwork in `brand.tsx` → generic symbol. Icon loading is silent and never blocks the launcher.

Icon paths come from `listApps` (`largeIcon`, then `icon`, resolved against `folderPath`) and must pass `validIconPath` before they reach a shell command: absolute, no quotes, whitespace or `..`, image extension only. Desktop previews have no TV and keep the built-in artwork.

`tools/collect-tv-icons.js` still collects icons over SSH into `/tmp/lumios-artwork` for building icon packs on a desktop. The app bundles no collected icons.

## Icon packs (.icnl)

An `.icnl` file is a ZIP with `pack.json` plus `icons/<slug>/icon.<svg|png|jpg|webp>` and an optional `icons/<slug>/style.css` whose root selector is `.icon`. A pack may also carry wallpapers: `wallpapers/<slug>/image.jpg|png|webp` or `wallpapers/<slug>/style.css` whose root selector is `.wallpaper` (gradients), listed under `wallpapers` in pack.json; `use-packs.ts` scopes that CSS to `.wallpaper[data-wallpaper="pack/slug"]` and to the Settings → Background thumbnail, image wallpapers get object URLs, and `preferences.wallpaper` may hold a `pack/slug` reference (Monument Valley is used while that pack is missing). `packs/gradients/` is a CSS-only example. `src/icnl.ts` is the single definition of the format (manifest validation, CSS scoping and sanitizing, icon resolution) and is shared by the app, the CLI (`tools/icnl.mjs`, run with `pnpm icnl`) and the tests. `pack.json` entries map a slug to `title`, `kind` (`tile` or `glyph`), exact `apps` ids, a `match` regex, `inputs` ids and `launcher`. Resolution order per app: the user's override in `preferences.iconOverrides` (`"pack/slug"` or `"tv"`), then exact ids, then match patterns, packs in id order; the TV's own icon and the built-in brand artwork follow.

Packs live in `/media/developer/lumios/packs/` on the TV. `src/packs.ts` lists them through `exec` (`md5sum` + `wc -c`), reads changed files with `dd` in 256 KiB chunks, unzips them in the app with fflate and caches parsed packs in IndexedDB (`packs` store) by content hash. USB import copies `/tmp/usb/*/*/*.icnl` into that folder under shell-safe names. `src/use-packs.ts` keeps packs in state, creates an object URL per icon and injects one `<style id="icnl-styles">` with every icon's CSS scoped to `.app-face[data-icnl="pack/slug"]` and `.icon-preview[...]`. Pack CSS never reaches the page unscoped: at-rules, imports, non-`data:` URLs and expressions are dropped.

Settings → Icons (`src/components/icon-settings.tsx`) lists packs, imports from USB, rereads the folder, and lets the user pick an icon per app. `packs/luma-brands/` is the example pack; `pnpm icnl pack packs/luma-brands` builds it, `pnpm icnl push dist/luma-brands.icnl --device tv` installs it, `pnpm icnl from-tv --device tv` turns the TV's own icons into a pack.

## Inputs, names and launchers

`src/inputs.ts` owns the per-input preferences. `inputNames` replaces the TV label with the user's own name and re-guesses the device kind from it (`inputKind` in `catalog.ts`), so a renamed "Switch 2" gets the console symbol; cards and rows show the name big and the port small (`inputHeading`, `InputStatus`). `inputIcons` maps an input to a `"pack/slug"` reference or a built-in symbol `"builtin:<name>"` (`builtinIconNames` in `inputs.ts`, drawn by `BuiltinSymbol` in `connection-icon.tsx`); without one, a pack icon whose `inputs` list names the input is used (`resolveInputIcon` in `icnl.ts`), then the symbol guessed from the label and kind. Glyph icons (`kind: "glyph"`) are rendered as CSS masks (`.input-glyph`) so monochrome SVGs take the card colour; tile icons fill the art box.

Launchers (`preferences.launchers`: `{ id, title, icon, target, placement }`) open any app on the TV. `placement: "inputs"` shows a card in the Inputs row; `placement: "apps"` turns the launcher into a library tile (`launcherApps` → a `TVApp` with `brand: "launcher"` and `target`), which the merged `apps` list in `app.tsx` feeds to favorites, the library, hidden apps and Settings → Icons alike. `launcherInputs` turns them into `TVInput` records with `kind: "launcher"` and `target`, `visibleInputs` hides them only when their visibility is `off`, and `onLaunch` in `app.tsx` launches `target` instead of the card id. Targets come from `Inventory.targets` (`normalizeTargets`: every id from `listApps`, hidden system apps included, LumiOS excluded); `launcherSuggestions` lists AirPlay, Screen Share, Bluetooth audio, Home Dashboard and Live TV first. Default launcher symbols live in `connection-icon.tsx`.

Settings → Inputs (`src/components/input-settings.tsx`) lists inputs and launchers. The input subpage holds the name field (an `<input>`; webOS shows its keyboard on focus, Enter commits and moves on), the icon row and the On/Off/Auto options, keeping the `input-visibility-option-*` focusables. The launcher subpage adds the target row and delete. Icon and target pickers open as child subpages: `openSubpage(..., parent)` records the parent and `closeSubpage` returns to it instead of the section list.

## Preload and keep-alive

Two levels, both outside `appinfo.json` because webOS reads `keepAlive` and `preload` from the launch payload only. `tv/autostart.sh enable` installs the Homebrew boot hook and launches `{"id":"com.dezik.lumios","keepAlive":true}` after boot: when another app takes the screen WAM hides the page instead of closing it, so the next launch (the Home key mapping should also pass `"keepAlive":true`) only shows it again. `enable preload` launches `{"keepAlive":true,"preload":"full"}` instead: the page loads hidden and the first Home press reveals it. The mode is stored in `/media/developer/lumios/autostart.conf`. While hidden WAM suspends JS; the clock, weather and inventory already resume on `visibilitychange`/`webOSRelaunch`.

System preload (`tv/preload.js`, run as root through `exec`; `src/preload.ts` wraps it and `Settings → General → System preload` toggles it) registers LumiOS with LG's preload manager the way AltHome does: it reads the configd key `com.webos.service.preloadmanager.supportAppList`, backs it up to `/media/developer/lumios/preload-backup.json` the first time, replaces the `com.webos.app.home` entry with LumiOS (`preloadMode: "partial"`, priority and memory copied from LG Home), writes the result with `setConfigs`, keeps a copy in `preload.json` that the boot hook re-applies, and restarts `preload-manager.service`. Disabling restores the backup. The script prints one JSON line and always exits 0 so the app can read errors from stdout. Mark it experimental in user-facing text: it is verified against SAM/WAM/AltHome sources, not yet on this project's own TV.

## Performance

Keep focus feedback immediate. Spatial navigation caches control geometry and invalidates it on DOM/layout changes, scrolling, resizing, and font loads; fully visible targets do not call `scrollIntoView`. New focusable controls must use `data-focusable` and explicit routes where appropriate.

`data-focus-scroll-top="true"` normalizes the Apps toolbar's scroll position only during remote navigation. Do not scroll the toolbar from a generic focus handler: pointer-down focuses a button before pointer-up, so moving it at that point can swallow the click.

Clock components update at minute boundaries and pause while hidden, independently of the launcher and app sorting. Library filtering/sorting is memoized and only runs on the Apps page. Concurrent inventory refreshes are deduplicated. Use small CSS opacity animations instead of a JavaScript animation runtime, and avoid live backdrop blur or full-screen filter textures in foreground controls. Reduced-motion preferences apply through CSS.

The top navigation uses one persistent selection pill. CSS transitions animate its transform and width; JavaScript measures the selected tab only on selection changes and resize/font-size changes. Initial positioning and resizing are immediate. Both the saved and system reduced-motion preferences disable the pill transition.

Settings uses bundled 480×270 photo thumbnails rather than decoding the full wallpapers for every gallery card. `pnpm assets` regenerates thumbnails. Run `pnpm benchmark` after installing Playwright Chromium to measure a 120-app library with 6× desktop CPU throttling; compare bundle size, keyboard-handler timings, geometry reads, and scroll calls. These measurements are a desktop proxy, not TV frame-rate claims.

Gallery previews use clipped image elements with an inset border, avoiding repeated background-image strips at fractional-sized edges. Neutral interface text, surfaces, icons, and focus rings use gray rather than cream/gold tints. App-action rows have contained focus rings and synchronize pointer hover with keyboard focus; closing the menu restores the selected app, or its nearest surviving neighbor after hiding, after the React commit.

## CI and releases

`.github/workflows/ci.yml` checks pull requests and pushes to `main` on Ubuntu with Node.js 24. It checks formatting, runs unit tests, builds and verifies the IPK, and runs Chromium browser tests. Successful builds upload the release files as a workflow artifact. Successful `main` builds publish new versions using `GITHUB_TOKEN`, automatically creating the version tag at the tested commit. Published versions are skipped; a draft can be resumed when its tag matches that commit. An existing tag pointing elsewhere stops publication. `workflow_dispatch` on `main` provides a manual retry without a tag input. Main runs are serialized so new pushes do not interrupt publication; outdated PR runs can be cancelled.

`tools/repository.mjs` runs after packaging. It creates `dist/repo.json` in Homebrew Channel's paginated package format and copies the native large icon into `dist/`. The feed uses version-specific release URLs and the SHA-256 and size of the normalized IPK. It rejects mismatched package/app versions and release tags, and exposes its validated version tag through `GITHUB_OUTPUT` for the release job. The install URL is `https://github.com/sebastianov92/LumiOS/releases/latest/download/repo.json`; it requires public repository/release access and an initial published release. Publishing the feed as a release asset avoids bot commits to the default branch.

## Remote and pointer controls

| Input                  | Action                                                     |
| ---------------------- | ---------------------------------------------------------- |
| Arrow keys             | Spatial navigation between tiles and controls              |
| OK / Enter             | Open the focused app, input, or control                    |
| Hold OK                | Home favorite: move mode; library app: options             |
| Menu / right-click / M | Options for the focused app                                |
| Back / Escape          | Close the current panel; return from Apps/Settings to Home |
| Back on Home           | webOS's normal platform Back behavior                      |
| Magic Remote pointer   | Point, click, or hold a tile for options                   |

From the top navigation, Down enters Home at the first visible favorite, Apps at the first matching app, and Settings at General. Empty Home enters its primary action; Apps with no matching results enters the first category. In Background settings, Left/Right step through backgrounds in gallery order; Left from the first column returns to the section list, and OK applies the focused background. Up/Down follow the gallery columns, and Back returns focus to the Background category.

Repeated Up returns to the active top navigation tab before other header controls. Settings subpages use Left or Back to return to the parent setting and restore its focus, without a visible Back button. Up from the first option goes to the Settings tab. The app search and city/postcode fields let Up/Left move focus out of the field; Left from app search enters Hidden when available, otherwise Utilities, and Left from the location query returns to its parent setting. Up from the first app enters the first category.

Back from a Settings sidebar category focuses the Settings navigation tab while keeping Settings open. Back again from that tab returns Home.

Back from the Apps search field or its clear button clears the query and focuses the Apps tab while keeping the library open. Back again from that tab returns Home.

On Home, hold OK on a favorite to enter move mode, press Left/Right to change its position, then press Back to finish. The new order is saved immediately and the selected app stays focused. Apps → select an app → hold OK to add/remove favorites or hide apps. The action menu shows the app name and category, and closes after either action. Favorites have a filled-heart badge and sort first in the saved Home order; other apps sort alphabetically. Hidden apps remain installed and can be restored from the **Hidden (count)** category pill, which shows only hidden apps. Choose a category beside search to filter the library; select it again or use the × button to clear the filter. Long app names wrap instead of being truncated.

Home shows Favorites and Inputs without a recent-app section or permanent control hints. App names beneath Home cards are hidden by default; enable **Settings → General → Show app names** to display them. The Apps library always shows names. The header clock is at the top left.

The top navigation contains **Home**, **Apps**, and a full-page **Settings** view. Settings has sidebar sections for **General**, **Background**, **Weather**, and **Inputs**. The sliders icon at the top right opens **TV settings** directly. General controls Home app names, 12/24-hour time, reduced motion, and refresh. Back returns to Home, and the version number appears at the bottom right of Settings.

Inputs are launched from Home and configured in **Settings → Inputs**. Every detected physical input has a submenu with **On** (always show), **Off** (never show), and **Auto** (show only when the TV reports it connected). Auto is the default; an unknown connection state is not treated as connected. All detected inputs remain in Settings, including hidden and disconnected ones. Choices are saved by the input's stable app ID, so renaming a device keeps its mode. Home shows every eligible input without a three-card limit. **Refresh inputs** updates the inventory and connection states; partial read failures retain the last valid inputs and saved choices.

The nine bundled backgrounds are Slate, Midnight, Prism (saturated red, yellow, and purple), Monument Valley, San Francisco, Summit, Forest, Yosemite, and Northern lights. From the Settings tab, Down enters General; use the sidebar to reach Background, Weather, or Inputs, then Right to enter that section.

Apple TV, Prime Video, Disney+, Jellyfin, Netflix, YouTube, ARTE, ZDF, and Das Erste use bundled SVG logos. Input cards choose connection artwork from the reported device name: PlayStation and Apple TV use their supplied marks, USB uses the USB symbol, unnamed HDMI ports use an HDMI connector, and other devices use a suitable generic icon. Icon selection does not change the input's launch target.

## Weather

Open **Settings → Weather**, enter a city or postcode, press Search, and select the matching place. **Show widget** controls visibility on Home; turning it off keeps your saved city. Choose **°C** or **°F** under **Temperature** to save your preferred unit. Switching units converts the cached reading immediately without another weather request. When enabled, the widget shows the chosen city, temperature, and current conditions. Nothing uses browser geolocation or automatic IP-based location lookup.

Back while editing the city/postcode field leaves the field and keeps Settings open. Press Back again from a button to return Home.

Weather refreshes every 15 minutes while Home is visible. Recent readings are cached locally and reused after reopening the app. If the connection fails, an available cached reading is labeled as saved; otherwise the widget says weather is unavailable. Remove the weather location in Settings to turn it off. API and cached temperatures stay in Celsius; `formatTemperature` converts the unrounded value for display.

Location search calls `geocoding-api.open-meteo.com`, and weather calls `api.open-meteo.com`. Those are the only network origins allowed by the packaged app's Content Security Policy. No API key or account is required. Data attribution: [Open-Meteo](https://open-meteo.com/) / [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
