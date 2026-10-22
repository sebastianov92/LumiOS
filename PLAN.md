# LumiOS — plan de trabajo

Fork de lg-luma. Objetivos: todas las apps con icono, formato propio de iconos `.icnl`, entradas renombrables con icono y lanzadores personalizados, y precarga del launcher para abrir al instante.

## Principios

- **Sin servidor en la TV.** Nada escucha en un puerto. Los archivos llegan por SSH (ares/Dev Manager) o por USB.
- **Root solo vía `exec` de Homebrew Channel**, como ya hace Luma. Nada se inyecta en servicios LG; todo lo que se toca es reversible y tiene botón de deshacer.
- **Caché local.** Lo que se lee de la TV (iconos, packs) se guarda en IndexedDB y solo se relee cuando cambia (tamaño + fecha).
- Convenciones del repo: ver `agents.md` (kebab-case, `data-focusable`, versiones sincronizadas).

## Cómo funciona hoy (Luma)

- **Iconos de apps** (`src/components/brand.tsx`): 1) 9 marcas con SVG en `public/logos/` + fondo CSS en `styles.css`; 2) PNG recolectados de la TV del autor (`src/app-icons.json` + `icon-colours.css`, generados con `tools/collect-tv-icons.js`); 3) resto: icono genérico Lucide + nombre. Por eso en tu TV casi nada tiene icono: el mapa es de la TV de otra persona.
- **Entradas** (`src/catalog.ts` → `normalizeInputs`): solo `com.webos.app.hdmiN` de `eim/getAllInputStatus`; título = label de la TV; icono por regex (`connection-icon.tsx`). No se pueden renombrar ni añadir.
- **Lanzar**: `applicationManager/launch {"id"}` (`src/bridge.ts`). Al volver, `visibilitychange`/`webOSRelaunch` refrescan el inventario.
- **Bridge `exec`**: devuelve `stdoutString` y `stdoutBytes` (base64). Tope de salida ~1 MiB por llamada (maxBuffer de Node). Para archivos grandes: leer por trozos con `dd`.

---

## F1 — Todas las apps con icono (sin packs) + idioma español — HECHA 2026-10-22 (pendiente de prueba en TV)

Implementado: `src/tv-icons.ts` (lectura por lotes, caché IndexedDB, color), `src/use-tv-icons.ts`, `iconPath` en `catalog.ts`, `execBytes` en `bridge.ts`, idioma `es` con detección automática. Eliminados `app-icons.json`, `public/app-icons`, `icon-colours.css`. Verificado solo en escritorio (27 unit + Playwright); el lector de iconos solo corre en la TV.

**Idea:** cada app instalada ya tiene su icono en la TV (`largeIcon` en su carpeta). LumiOS lo lee en tiempo de ejecución y lo cachea. Resultado inmediato: 100 % de apps con icono real, sin buscar logos.

- `listApps` ya devuelve `folderPath` + `largeIcon`/`icon`; `normalizeApps` los conserva.
- Nuevo `src/tv-icons.ts`: para apps sin icono en caché, `exec` lee el PNG (`cat` → `stdoutBytes`), en lotes de ~15 apps por llamada (< 1 MiB). Guarda `{appId, bytes, hash, color}` en IndexedDB.
- Color de fondo del tile calculado en JS con `<canvas>` (misma lógica que `tools/icon-colours.mjs`, pero en la TV).
- Orden de prioridad del icono: **pack `.icnl` (F2) → icono de la TV → marca integrada de Luma → genérico**.
- Se eliminan `src/app-icons.json`, `public/app-icons/` e `icon-colours.css` (datos de la TV del autor). Las 9 marcas SVG integradas se mantienen como fallback.
- `i18n.ts`: añadir `es` (idioma por defecto si la TV está en español).

Prueba en TV: inventario con 40+ apps carga iconos en < 2 s en frío y 0 s en caliente.

## F2 — Formato `.icnl` + módulo de iconos — HECHA 2026-10-22 (pendiente de prueba en TV)

Implementado: `src/icnl.ts` (formato, CSS scoped, resolución), `src/packs.ts` (listado md5, lectura por trozos `dd`, unzip fflate, caché, USB), `src/use-packs.ts`, Ajustes → Iconos (`icon-settings.tsx`), `tools/icnl.mjs` (`pack`, `inspect`, `push`, `from-tv`), pack de ejemplo `packs/luma-brands`. Verificado en escritorio con un pack simulado en el mock de TV de Playwright. Ampliado: fondos de imagen en packs (`wallpapers/<slug>/image.*`), elegibles en Ajustes → Fondo. Los fondos CSS se probaron y se quitaron (2026-10-22) para no complicar; el Flow pedido quedó como SVG de serie.

### Formato

Un `.icnl` es un **pack** (ZIP renombrado) con uno o muchos iconos:

```
pack.json
icons/netflix/icon.svg        # o icon.png
icons/netflix/style.css       # opcional: fondo y ajustes
icons/switch/icon.svg
icons/switch/style.css
```

`pack.json`:

```json
{
  "format": "icnl/1",
  "name": "Dezik Base",
  "version": "1.0.0",
  "author": "Dezik",
  "icons": {
    "netflix": { "title": "Netflix", "apps": ["netflix"], "match": "netflix" },
    "switch": { "title": "Nintendo Switch", "kind": "glyph", "inputs": ["com.webos.app.hdmi1"] },
    "airplay": { "title": "AirPlay", "kind": "glyph", "launcher": true }
  }
}
```

- `apps`: ids exactos. `match`: regex opcional (como las `identities` de Luma). `inputs`: ids HDMI. `launcher: true`: disponible para lanzadores (F3).
- `kind`: `tile` (por defecto; SVG/PNG centrado sobre fondo CSS) o `glyph` (SVG monocromo con `currentColor`, para entradas y lanzadores).
- `style.css` usa el selector raíz `.icon`; el cargador lo reescribe a `.app-face[data-icnl="pack/slug"]` y descarta `@import`, `url()` externas y `expression(`. Ejemplo:

```css
.icon {
  background: linear-gradient(145deg, #252525, #080808);
}
.icon img {
  width: 70%;
}
```

### Cómo llegan a la TV (recomendación)

Carpeta fija en la TV: **`/media/developer/lumios/packs/*.icnl`** (persiste entre reinstalaciones de la app). Tres vías, ninguna requiere servidor:

1. **Mac → TV por SSH**: `pnpm icnl push <pack.icnl> --device tv` (usa `ares-push`, misma config de dispositivo que `pnpm run deploy`).
2. **webOS Dev Manager**: arrastrar el `.icnl` a esa carpeta desde su explorador de archivos. Cero código.
3. **USB desde la TV**: Ajustes → Iconos → _Importar desde USB_. LumiOS lista `/tmp/usb/*/*/*.icnl` vía `exec` y copia a la carpeta.

Descartado: servidor HTTP en la TV. Implicaría un servicio Node en el ipk, puerto abierto, mantenerlo vivo y seguridad; demasiado para subir archivos de vez en cuando.

### Carga en la TV

- `exec ls -l` de la carpeta → si cambió tamaño/fecha, leer bytes (`cat`/`dd` → `stdoutBytes`), descomprimir en JS con **fflate** (~8 KB), validar `pack.json`, guardar iconos (texto SVG / bytes PNG) + CSS en IndexedDB.
- `<style>` inyectado por pack (el CSP ya permite `'unsafe-inline'`; `img-src data: blob:` ya permitido).

### Herramientas en la Mac (`tools/icnl.mjs`)

- `pnpm icnl pack <carpeta>` → valida y crea el `.icnl`.
- `pnpm icnl from-tv --device tv` → genera un pack con los iconos reales de la TV (reusa `collect-tv-icons.js`); útil como base para retocar.
- `pnpm icnl push <pack> --device tv`.

### Módulo en la app: Ajustes → Iconos

- Lista de packs instalados (nombre, versión, nº de iconos, quitar).
- _Asignar icono a app_: lista de apps con su icono actual y origen (pack / TV / integrado); al elegir una, lista de iconos de todos los packs; guardado en preferencias `iconOverrides: Record<appId, "pack/slug">`.
- _Importar desde USB_, _Releer packs_.

## F3 — Entradas: renombrar, iconos y lanzadores personalizados — HECHA 2026-10-22 (pendiente de prueba en TV)

Implementado: `inputNames`, `inputIcons`, `launchers` en preferencias; `src/inputs.ts` (nombres, lanzadores → tarjetas, visibilidad); `Inventory.targets` con todas las apps lanzables; glyphs de pack como máscara CSS; Ajustes → Entradas con subpáginas nombre/icono/visibilidad, lanzadores con destino y borrado, subpáginas hijas que vuelven a su padre. Verificado en escritorio (unit + Playwright). Ampliado el mismo día: símbolos integrados elegibles sin pack (`builtin:<nombre>`) para entradas y lanzadores, y lanzadores con `placement` entrada/app (tile en la biblioteca, fijable en Inicio).

- Preferencias nuevas: `inputNames: Record<id, string>`, `inputIcons: Record<id, "pack/slug">`, `launchers: Launcher[]`.
- **Renombrar**: Ajustes → Entradas → HDMI 1 → _Nombre_ (teclado en pantalla de webOS, como ya usa la búsqueda de ciudad). La tarjeta muestra el nombre grande ("Switch 2") y el puerto pequeño ("HDMI 1").
- **Icono**: elegir entre glyphs de los packs; si no hay override, regex actual por nombre (`connection-icon.tsx`).
- **Lanzadores**: `{ id, title, icon, target: appId }`. Ajustes → Entradas → _Añadir lanzador_: nombre, icono, app destino elegida de la lista completa de `listApps` (incluidas las no visibles). Se muestran en la fila de entradas de Home con visibilidad On/Off igual que las HDMI. Ids útiles verificados: AirPlay `airplay`, Screen Share `com.webos.app.miracast`, Bluetooth audio `com.webos.app.btspeakerapp`, Home Dashboard `com.webos.app.homeconnect`, Live TV `com.webos.app.livetv`.
- Lanzar un lanzador = `launch {"id": target}`; v2 podrá añadir `params`.

## F4 — Precarga: LumiOS siempre listo — HECHA 2026-10-22 (pendiente de prueba en TV)

Implementado: `tv/autostart.sh` con modos `enable` (visible + keepAlive) y `enable preload` (oculto + preload full), tecla Home con keepAlive en README; `tv/preload.js` (Node de la TV) con `status|enable|disable|apply` sobre configd + backup + reaplicación al arrancar; `src/preload.ts` + Ajustes → General → Precarga del sistema. Verificado en escritorio con mock; la TV decide.

Verificado en el código de SAM/WAM (webOS OSE) y en AltHome:

- `launch` acepta **`keepAlive: true`** y **`preload: "full"`**. Con `preload` la página se carga completa pero oculta; un `launch` normal posterior solo la muestra (`visibilitychange` + evento `webOSRelaunch`). Con `keepAlive`, al salir a otra app la ventana se oculta y la página sigue en memoria en vez de cerrarse. `keepAlive` **no** se lee de `appinfo.json`: va en el payload de cada lanzamiento.
- Mientras está oculta, WAM suspende JS/timers; al volver, Luma ya refresca inventario en `visibilitychange`. `handlesRelaunch: false` se mantiene (WAM trae la ventana al frente solo).
- LG precarga Netflix/YouTube/Alexa con `com.webos.service.preloadmanager` (lista `supportAppList` en configd). AltHome se registra ahí sustituyendo `com.webos.app.home`.

Dos niveles, el segundo opcional:

1. **Nivel app (seguro).** `autostart.sh` y el comando del botón Home pasan `{"id":"com.dezik.lumios","keepAlive":true,"preload":"full"}` en el arranque y `{"id":"com.dezik.lumios","keepAlive":true}` en cada pulsación. Resultado: LumiOS se carga en segundo plano al encender y abrir Netflix no lo mata; Home vuelve al instante. El sistema puede cerrarlo si falta memoria; en ese caso el siguiente Home arranca en frío (como hoy).
2. **Nivel sistema (opt-in, "modo Netflix").** Ajustes → General → _Precarga del sistema_: añade LumiOS a `supportAppList` del preloadmanager con `preloadMode: "partial"` y reinicia `preload-manager.service` (igual que AltHome); el propio sistema lo relanza precargado si se cerró. Botón _Desactivar_ restaura la lista original guardada. Requiere prueba en tu TV (webOS 26); se documenta como experimental.

Métrica: tiempo desde Home hasta ver favoritos. Hoy frío ~2-3 s; objetivo < 300 ms en caliente.

## F5 — Identidad

- Logo propio de LumiOS (`public/app-icon.svg`, `mark.svg`); hoy sigue la "L" de Luma.
- Capturas en `docs/`.
- Versión: reiniciar a 0.1.0 al primer release propio.

---

## Orden y alcance

| Fase | Entrega                                           | Riesgo / prueba en TV                                              |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------ |
| F1   | Iconos reales de todas las apps + español         | Tamaño de lote < 1 MiB por `exec`; rendimiento del primer refresco |
| F2   | `.icnl`, cargador, Ajustes → Iconos, CLI          | USB: ruta `/tmp/usb/*/*`; CSS de packs                             |
| F3   | Entradas renombrables + lanzadores                | Teclado en pantalla; ids de AirPlay/Screen Share en tu modelo      |
| F4   | keepAlive/preload nivel app; nivel sistema opt-in | Comportamiento real de `keepAlive` en webOS 26; memoria            |
| F5   | Logo, capturas, versión                           | —                                                                  |

Decisiones ya tomadas (cambiables): id `com.dezik.lumios`, vendor Dezik, puerto dev 5188, carpeta de packs `/media/developer/lumios/packs/`.
