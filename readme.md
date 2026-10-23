<p align="center"><img src="public/app-icon.svg" width="128" alt="LumiOS"></p>

# LumiOS

Launcher moderno, pensado para el control remoto, para TVs LG con webOS rooteado. Fork de [lg-luma](https://github.com/ecklf/lg-luma) (MIT) con marca y rumbo propios de Dezik.

> [!NOTE]
> Upstream probado en **LG OLED55C57** con **webOS 26**. LumiOS apunta a webOS 24–26 (Chromium 108+).

## Qué cambia respecto a Luma

- Marca LumiOS, id de app `com.dezik.lumios`, vendor Dezik.
- Hoja de ruta propia (ver [PLAN.md](PLAN.md)): paquetes de iconos `.icnl` para apps y entradas, renombrar entradas, lanzadores personalizados (AirPlay, etc.) y precarga del launcher para que abra al instante.

## Instalación

Requiere TV rooteada con [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) (**Settings → Root status: ok**).

### Desde Homebrew Channel (recomendado)

1. Homebrew Channel → **Settings → Add repository** y pega esta URL:

   ```text
   https://github.com/sebastianov92/LumiOS/releases/latest/download/repo.json
   ```

2. Vuelve a la lista de apps, elige **LumiOS** e **Install**.
3. Abre **LumiOS** desde las apps de la TV. Tras cada actualización ciérrala del todo y vuelve a abrirla.

### Manual por SSH

Genera el paquete y cópialo a la TV (reemplaza `TV_IP`):

```sh
pnpm run package
scp -O dist/com.dezik.lumios_1.2.1_all.ipk root@TV_IP:/tmp/lumios.ipk
ssh root@TV_IP
```

En la shell root de la TV:

```sh
luna-send -i luna://com.webos.appInstallService/dev/install \
  '{"id":"com.dezik.lumios","ipkUrl":"/tmp/lumios.ipk","subscribe":true}'
```

Espera la respuesta de éxito y cierra con Ctrl+C si la suscripción sigue abierta. Cierra y vuelve a abrir LumiOS tras cada actualización.

### Con webOS Dev Manager / ares

Registra la TV con `pnpm exec ares-setup-device` (SSH root, puerto 22) y luego:

```sh
pnpm run deploy --device tv
```

## Entradas y lanzadores en Home

**Ajustes → Entradas** permite, por cada HDMI, ponerle nombre propio (p. ej. «Switch 2», se muestra grande y el puerto pequeño), elegir un icono de un pack y decidir cuándo aparece en Home: **On** (siempre), **Off** (nunca) o **Auto** (solo cuando la TV la reporta conectada, por defecto). **Actualizar entradas** vuelve a detectar dispositivos y su estado.

**Añadir lanzador** crea un acceso que abre cualquier app de la TV, incluidas las ocultas: AirPlay, Screen Share, audio Bluetooth, Home Dashboard… Cada lanzador tiene nombre, icono, app destino, visibilidad On/Off y **Mostrar como**: tarjeta en la fila de Entradas o tile en la biblioteca de Apps (y desde ahí se fija en Inicio manteniendo OK).

Los iconos de entradas y lanzadores se eligen entre los **símbolos integrados** (HDMI, consola, reproductor, computadora, USB, PlayStation, Apple TV, AirPlay, compartir pantalla, Bluetooth, panel, TV, cohete) o cualquier icono de un pack.

## Packs de iconos (.icnl)

Un `.icnl` es un ZIP con `pack.json` más `icons/<slug>/icon.svg` (o png/jpg/webp) y un `style.css` opcional cuyo selector raíz es `.icon`. Ejemplo completo en [packs/luma-brands](packs/luma-brands).

```sh
pnpm icnl pack packs/luma-brands
```

Los packs viven en `/media/developer/lumios/packs/` de la TV. Tres formas de llevarlos:

- `pnpm icnl push dist/luma-brands.icnl --device tv` (misma TV registrada con `ares-setup-device`).
- Arrastrar el `.icnl` a esa carpeta desde webOS Dev Manager.
- Copiarlo a una memoria USB y usar **Ajustes → Iconos → Importar desde USB**.

`pnpm icnl from-tv --device tv` genera un pack con los iconos propios de la TV. En **Ajustes → Iconos** se ven los packs instalados, se releen y se elige el icono de cada app (automático, icono de la TV o cualquier icono de un pack).

Los packs también pueden traer **fondos** para Ajustes → Fondo: una imagen por fondo en `wallpapers/<slug>/image.jpg` (o png/webp, hasta 8 MB), declarada en `pack.json` bajo `wallpapers`.

## Opcional: abrir al arrancar y mantener en memoria

Tras probar la app instalada, en la shell root de la TV:

```sh
sh /media/developer/apps/usr/palm/applications/com.dezik.lumios/autostart.sh enable
```

Instala un hook en `/var/lib/webosbrew/init.d/65-lumios` que lanza LumiOS tras un arranque completo con `keepAlive`: al abrir otra app LumiOS queda oculto en memoria en vez de cerrarse, y volver es instantáneo. Si prefieres arrancar en el Home de LG y tener LumiOS listo para la tecla Home:

```sh
sh /media/developer/apps/usr/palm/applications/com.dezik.lumios/autostart.sh enable preload
```

Así se carga oculto al encender (`preload: full`) y la primera pulsación solo lo muestra. Para quitarlo antes de desinstalar:

```sh
sh /media/developer/apps/usr/palm/applications/com.dezik.lumios/autostart.sh disable
```

## Opcional: botón Home del control

Con [LG Input Hook](https://repo.webosbrew.org/apps/org.webosbrew.inputhook/) se puede mapear la tecla Home a este comando (una sola línea):

```sh
/usr/bin/luna-send -t 1 -w 5000 luna://com.webos.service.applicationmanager/launch '{"id":"com.dezik.lumios","keepAlive":true}'
```

Prueba primero en un botón libre y desactiva cualquier otro listener de Home antes de activar este.

`keepAlive` mantiene LumiOS en memoria cuando sales a otra app; la TV puede cerrarlo igualmente si le falta memoria, y entonces la siguiente pulsación arranca en frío.

## Opcional: precarga del sistema (experimental)

LG mantiene Netflix y YouTube precargados con su gestor de precarga. **Ajustes → General → Precarga del sistema** registra LumiOS en esa lista ocupando el lugar del Home de LG (igual que hace AltHome): guarda la lista original en `/media/developer/lumios/preload-backup.json`, escribe la nueva con `configd`, la vuelve a aplicar en cada arranque y reinicia `preload-manager.service`. Desactivarlo restaura la lista original. Desde SSH:

```sh
sh /media/developer/apps/usr/palm/applications/com.dezik.lumios/autostart.sh preload status
```

Verificado contra el código de SAM/WAM y AltHome; pendiente de prueba en esta TV.

LumiOS no inyecta código en servicios de LG, no reemplaza el launcher de fábrica ni monta directorios del sistema.

## Solución de problemas

### webOS 26: denied exec method

Homebrew Channel 0.8.0-rc1 o superior aporta el permiso `lunabus.query` para servicios elevados. LumiOS lo declara junto con sus permisos de lanzamiento. Si una instalación antigua reporta `Denied method call "exec" for category "/"`, actualiza Homebrew Channel y reinstala LumiOS. Si persiste, reinicia la TV por completo y revisa desde SSH:

```sh
cat /var/luna-service2*/client-permissions.d/com.dezik.lumios*.json
cat /var/luna-service2*/api-permissions.d/org.webosbrew.hbchannel.service.api.lunabus.query.json
```

El caller necesita `lunabus.query` y el mapeo de Homebrew debe contener `{"lunabus.query":["org.webosbrew.hbchannel.service/*"]}`. Homebrew Channel debe estar elevado; LumiOS no necesita elevarse.

## Compatibilidad y privacidad

- webOS 24–26 / Chromium 108+. Gráficos empaquetados a 1920 × 1080; escalan en la vista previa de escritorio.
- El inventario de apps y entradas se lee mediante el servicio `exec` elevado de Homebrew Channel. Los lanzamientos usan la API pública de applicationManager con los ACG `application.launcher` y `application.query`.
- Preferencias, recientes, ubicación del clima y lecturas en caché viven en el almacenamiento local de la app. El CSP limita la red a las APIs de Open-Meteo.
- El comportamiento de permisos y servicios nativos se valida en la TV física; los tests de navegador no prueban hardware.

## Desarrollo

Node.js 22+ y pnpm 10 (el proyecto fija pnpm 10.34.5):

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre **http://127.0.0.1:5188**. La vista previa usa apps y entradas de ejemplo; las acciones de TV muestran un mensaje. En la TV, LumiOS carga el inventario real. Con **http://127.0.0.1:5188/?packs** la vista previa carga además los packs de ejemplo del repo (`packs/dev.json`): iconos de `luma-brands` y fondos de `gradients`, para probar packs propios antes de subirlos a la TV.

Checks, estructura del código y convenciones: [agents.md](agents.md).

### Generar el paquete

```sh
pnpm run package
```

Salida: `dist/com.dezik.lumios_<versión>_all.ipk`, `dist/sha256sums` y el feed de Homebrew `dist/repo.json`. La app standalone queda en `dist/app/` y funciona desde `index.html` sin servidor.

Para publicar, actualiza la versión en `package.json` y `appinfo.json` a la vez.

## Licencia

MIT. El código original es de los contribuidores de Luma; las modificaciones de LumiOS son de Dezik. Ver [license](license) y [assets.md](assets.md) para arte, fuentes e iconos de terceros.
