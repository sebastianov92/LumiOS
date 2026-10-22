#!/bin/sh
# LumiOS boot hook and root-shell helpers. Installed only when explicitly requested.
#   sh autostart.sh enable            open LumiOS after a full boot and keep it in memory
#   sh autostart.sh enable preload    load LumiOS hidden after boot; the Home key shows it instantly
#   sh autostart.sh disable
#   sh autostart.sh preload on|off|status   LG preload manager registration (see preload.js)
APP_ID=com.dezik.lumios
APP_DIR=/media/developer/apps/usr/palm/applications/$APP_ID
HOOK=/var/lib/webosbrew/init.d/65-lumios
DATA=/media/developer/lumios
CONF=$DATA/autostart.conf
case "${1:-}" in
  enable)
    [ "$(id -u)" = 0 ] || { printf '%s\n' 'Run as root.' >&2; exit 1; }
    [ -f "$APP_DIR/appinfo.json" ] || { printf '%s\n' 'Install LumiOS first.' >&2; exit 1; }
    mkdir -p /var/lib/webosbrew/init.d "$DATA"
    if [ -e "$HOOK" ] || [ -L "$HOOK" ]; then
      [ "$(readlink "$HOOK")" = "$APP_DIR/autostart.sh" ] || { printf '%s\n' '65-lumios is already used by another file.' >&2; exit 1; }
    fi
    case "${2:-visible}" in
      preload)
        printf 'MODE=preload\n' > "$CONF"
        MESSAGE='LumiOS will load hidden after a full boot; the Home key shows it instantly.' ;;
      visible)
        printf 'MODE=visible\n' > "$CONF"
        MESSAGE='LumiOS will open after a full boot and stay in memory.' ;;
      *) printf '%s\n' 'Usage: autostart.sh enable [visible|preload]' >&2; exit 1 ;;
    esac
    chmod 755 "$APP_DIR/autostart.sh"
    ln -sf "$APP_DIR/autostart.sh" "$HOOK"
    printf '%s\n' "$MESSAGE"
    exit 0 ;;
  disable)
    [ "$(id -u)" = 0 ] || exit 1
    if [ "$(readlink "$HOOK")" = "$APP_DIR/autostart.sh" ]; then rm -f "$HOOK"; fi
    rm -f "$CONF"
    printf '%s\n' 'LumiOS boot launch disabled.'
    exit 0 ;;
  preload)
    [ "$(id -u)" = 0 ] || { printf '%s\n' 'Run as root.' >&2; exit 1; }
    case "${2:-status}" in
      on) ACTION=enable ;;
      off) ACTION=disable ;;
      status) ACTION=status ;;
      *) printf '%s\n' 'Usage: autostart.sh preload on|off|status' >&2; exit 1 ;;
    esac
    exec /usr/bin/node "$APP_DIR/preload.js" "$ACTION" ;;
esac
# Boot hook (no argument). A lock lives for this boot only; do not launch twice when the hook
# is invoked again.
(
    exec 9>/tmp/lumios-boot.lock
    flock -n 9 || exit 0
    [ -f /tmp/lumios-boot-done ] && exit 0
    [ -f "$APP_DIR/appinfo.json" ] || exit 0
    MODE=visible
    [ -f "$CONF" ] && MODE="$(sed -n 's/^MODE=//p' "$CONF" | head -n 1)"
    sleep 25
    # System preload on: re-register with LG's preload manager before launching.
    [ -f "$DATA/preload.json" ] && /usr/bin/node "$APP_DIR/preload.js" apply
    # webOS 10+ root-shell launch uses -t.
    case "$(cat /etc/starfish-release 2>/dev/null)" in
      *" 10."*|*" 11."*) FLAG=-t ;;
      *) FLAG=-n ;;
    esac
    # keepAlive keeps the page resident when another app takes the screen; preload loads it
    # hidden so the Home key only has to show it. Both are launch parameters, not appinfo keys.
    if [ "$MODE" = preload ]; then
      PAYLOAD='{"id":"'"$APP_ID"'","keepAlive":true,"preload":"full"}'
    else
      PAYLOAD='{"id":"'"$APP_ID"'","keepAlive":true}'
    fi
    RESULT="$(/usr/bin/luna-send "$FLAG" 1 -w 5000 luna://com.webos.service.applicationmanager/launch "$PAYLOAD" 2>/dev/null)"
    printf '%s\n' "$RESULT"
    case "$RESULT" in *'"returnValue":true'*|*'"returnValue": true'*) touch /tmp/lumios-boot-done ;; esac
) </dev/null >/tmp/lumios-boot.log 2>&1 &
