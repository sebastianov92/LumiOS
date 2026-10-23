#!/bin/sh
# LumiOS boot hook and root-shell helpers. Installed only when explicitly requested.
#   sh autostart.sh enable            open LumiOS after a full boot and every time the TV turns on
#                                     (LG's Home Auto Launch is switched off meanwhile)
#   sh autostart.sh enable preload    load LumiOS hidden after boot; the Home key shows it instantly
#   sh autostart.sh disable           remove the hook, stop the watcher, restore Home Auto Launch
#   sh autostart.sh status
#   sh autostart.sh preload on|off|status   LG preload manager registration (see preload.js)
APP_ID=com.dezik.lumios
APP_DIR=/media/developer/apps/usr/palm/applications/$APP_ID
HOOK=/var/lib/webosbrew/init.d/65-lumios
DATA=/media/developer/lumios
CONF=$DATA/autostart.conf
WATCH_LOCK=/tmp/lumios-resume.lock
WATCH_PID=/tmp/lumios-resume.pid
WATCH_LOG=/tmp/lumios-resume.log
SETTINGS=luna://com.webos.settingsservice

# webOS 10+ root-shell luna-send uses -t for the message count.
luna_flag() {
  case "$(cat /etc/starfish-release 2>/dev/null)" in
    *" 10."*|*" 11."*) printf -- '-t' ;;
    *) printf -- '-n' ;;
  esac
}

# keepAlive keeps the page resident when another app takes the screen; preload loads it hidden
# so the Home key only has to show it. Both are launch parameters, not appinfo keys.
launch_lumios() {
  /usr/bin/luna-send "$(luna_flag)" 1 -w 5000 luna://com.webos.service.applicationmanager/launch \
    "{\"id\":\"$APP_ID\",\"keepAlive\":true$1}" 2>/dev/null
}

conf_value() { [ -f "$CONF" ] && sed -n "s/^$1=//p" "$CONF" | head -n 1; }

# LG's "Home Auto Launch" (Settings → General → System → Home Settings) opens LG Home whenever
# the TV turns on and would cover LumiOS. The value found before enabling is kept in the conf.
home_auto_launch() {
  /usr/bin/luna-send "$(luna_flag)" 1 -w 5000 "$SETTINGS/getSystemSettings" \
    '{"category":"general","keys":["homeAutoLaunch"]}' 2>/dev/null |
    sed -n 's/.*"homeAutoLaunch": *"\([^"]*\)".*/\1/p' | head -n 1
}
set_home_auto_launch() {
  /usr/bin/luna-send "$(luna_flag)" 1 -w 5000 "$SETTINGS/setSystemSettings" \
    "{\"category\":\"general\",\"settings\":{\"homeAutoLaunch\":\"$1\"}}" >/dev/null 2>&1
}
restore_home_auto_launch() {
  SAVED="$(conf_value HOME_AUTO_LAUNCH)"
  case "$SAVED" in on|off) set_home_auto_launch "$SAVED" ;; esac
}

watch_running() { ( exec 9>"$WATCH_LOCK"; flock -n 9 ) 2>/dev/null && return 1; return 0; }
start_watch() {
  watch_running && return 0
  ( "$APP_DIR/autostart.sh" watch </dev/null >>"$WATCH_LOG" 2>&1 & )
}
stop_watch() {
  [ -f "$WATCH_PID" ] && kill "$(cat "$WATCH_PID")" 2>/dev/null
  pkill -f 'luna-send -i luna://com.webos.service.tvpower/power/getPowerState' 2>/dev/null
  rm -f "$WATCH_PID"
}

# Power-state messages look like {"state":"Active","processing":"Prepare Resume",...}. The TV
# counts as just turned on when the state becomes Active after another state, or when the
# processing step announces a resume or power-on. The first message after subscribing only
# records the current state. Uses and updates $PREV; returns 0 when LumiOS should be launched.
resume_decide() {
  STATE="$(printf '%s' "$1" | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p')"
  PROCESSING="$(printf '%s' "$1" | sed -n 's/.*"processing": *"\([^"]*\)".*/\1/p')"
  [ -n "$STATE" ] || return 1
  if [ -z "$PREV" ]; then PREV=$STATE; return 1; fi
  LAUNCH=1
  case "$PROCESSING" in "Prepare Resume"|"Prepare Power On") LAUNCH=0 ;; esac
  [ "$STATE" = Active ] && [ "$PREV" != Active ] && LAUNCH=0
  PREV=$STATE
  return $LAUNCH
}

launch_until_ok() {
  TRY=0
  while [ $TRY -lt 6 ]; do
    TRY=$((TRY + 1))
    sleep 2
    RESULT="$(launch_lumios)"
    case "$RESULT" in *'"returnValue":true'*|*'"returnValue": true'*)
      printf '%s launched after %s tries: %s\n' "$(date '+%F %T')" "$TRY" "$RESULT"; return 0 ;;
    esac
  done
  printf '%s launch failed: %s\n' "$(date '+%F %T')" "$RESULT"
  return 1
}

resume_loop() {
  PREV=
  LAST=0
  while IFS= read -r LINE; do
    printf '%s %s\n' "$(date '+%F %T')" "$LINE"
    resume_decide "$LINE" || continue
    NOW=$(date +%s)
    [ $((NOW - LAST)) -ge 30 ] || continue
    LAST=$NOW
    launch_until_ok &
  done
}

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
        stop_watch
        restore_home_auto_launch
        printf 'MODE=preload\n' > "$CONF"
        MESSAGE='LumiOS will load hidden after a full boot; the Home key shows it instantly.' ;;
      visible)
        SAVED="$(conf_value HOME_AUTO_LAUNCH)"
        case "$SAVED" in on|off) ;; *) SAVED="$(home_auto_launch)" ;; esac
        case "$SAVED" in on|off) ;; *) SAVED=unknown ;; esac
        printf 'MODE=visible\nHOME_AUTO_LAUNCH=%s\n' "$SAVED" > "$CONF"
        set_home_auto_launch off
        chmod 755 "$APP_DIR/autostart.sh"
        start_watch
        MESSAGE='LumiOS will open after a full boot and every time the TV turns on; LG Home Auto Launch is off.' ;;
      *) printf '%s\n' 'Usage: autostart.sh enable [visible|preload]' >&2; exit 1 ;;
    esac
    chmod 755 "$APP_DIR/autostart.sh"
    ln -sf "$APP_DIR/autostart.sh" "$HOOK"
    printf '%s\n' "$MESSAGE"
    exit 0 ;;
  disable)
    [ "$(id -u)" = 0 ] || exit 1
    if [ "$(readlink "$HOOK")" = "$APP_DIR/autostart.sh" ]; then rm -f "$HOOK"; fi
    stop_watch
    restore_home_auto_launch
    rm -f "$CONF"
    printf '%s\n' 'LumiOS boot launch disabled.'
    exit 0 ;;
  status)
    if [ "$(readlink "$HOOK" 2>/dev/null)" = "$APP_DIR/autostart.sh" ]; then
      printf 'hook: installed (mode %s)\n' "$(conf_value MODE)"
    else
      printf 'hook: not installed\n'
    fi
    if watch_running; then printf 'power watcher: running\n'; else printf 'power watcher: stopped\n'; fi
    printf 'LG Home Auto Launch: %s (before enable: %s)\n' "$(home_auto_launch)" "$(conf_value HOME_AUTO_LAUNCH)"
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
  watch)
    # Follows the TV's power state for this boot and brings LumiOS up when the TV turns on
    # again from standby (Quick Start+ resumes without running the boot hooks).
    exec 9>"$WATCH_LOCK"
    flock -n 9 || exit 0
    printf '%s\n' "$$" > "$WATCH_PID"
    while :; do
      [ "$(wc -c < "$WATCH_LOG" 2>/dev/null || echo 0)" -gt 200000 ] && : > "$WATCH_LOG"
      /usr/bin/luna-send -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' 2>/dev/null | resume_loop
      sleep 10
    done ;;
  watch-test)
    # Reads power-state messages from stdin and prints "launch" or "-" per message. Used by the
    # unit tests; never launches anything.
    PREV=
    while IFS= read -r LINE; do
      if resume_decide "$LINE"; then printf 'launch\n'; elif [ -n "$STATE" ]; then printf -- '-\n'; fi
    done
    exit 0 ;;
esac
# Boot hook (no argument). A lock lives for this boot only; do not launch twice when the hook
# is invoked again.
MODE=visible
[ -f "$CONF" ] && MODE="$(conf_value MODE)"
[ "$MODE" = preload ] || start_watch
(
    exec 9>/tmp/lumios-boot.lock
    flock -n 9 || exit 0
    [ -f /tmp/lumios-boot-done ] && exit 0
    [ -f "$APP_DIR/appinfo.json" ] || exit 0
    sleep 25
    # System preload on: re-register with LG's preload manager before launching.
    [ -f "$DATA/preload.json" ] && /usr/bin/node "$APP_DIR/preload.js" apply
    if [ "$MODE" = preload ]; then
      RESULT="$(launch_lumios ',"preload":"full"')"
    else
      RESULT="$(launch_lumios)"
    fi
    printf '%s\n' "$RESULT"
    case "$RESULT" in *'"returnValue":true'*|*'"returnValue": true'*) touch /tmp/lumios-boot-done ;; esac
) </dev/null >/tmp/lumios-boot.log 2>&1 &
