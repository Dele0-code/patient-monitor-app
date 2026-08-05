#!/usr/bin/env bash
# Launched by the desktop session (see kiosk.desktop). Waits for the backend to
# be healthy, disables screen blanking, then opens Chromium fullscreen kiosk.
set -u

URL="http://localhost:8000"
HEALTH="$URL/health"

# 1) Wait for the backend to answer /health (service may still be booting).
for _ in $(seq 1 60); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# 2) Disable screen blanking / power management (X11 and Wayland variants).
if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi
if command -v wlr-randr >/dev/null 2>&1; then
  # Wayland (labwc/wayfire on Pi OS Bookworm) — best-effort, ignore if unsupported.
  wlr-randr --output "$(wlr-randr | awk 'NR==1{print $1}')" --on 2>/dev/null || true
fi

# 3) Pick whichever Chromium binary this image ships.
CHROME_BIN="$(command -v chromium-browser || command -v chromium || echo chromium-browser)"

# UI scale for a large bedside TV viewed from a distance. Sourced from the
# backend .env (KIOSK_SCALE) so it lives with the rest of the appliance config;
# defaults to 1.5 (50% bigger) if unset. --force-device-scale-factor scales the
# WHOLE UI crisply, so the small px fonts stay proportional and sharp.
KIOSK_SCALE="${KIOSK_SCALE:-1.5}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/patient_monitor_backend/.env"
if [ -f "$ENV_FILE" ]; then
  ENV_SCALE="$(grep -E '^KIOSK_SCALE=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
  [ -n "$ENV_SCALE" ] && KIOSK_SCALE="$ENV_SCALE"
fi

# --autoplay-policy=no-user-gesture-required is ESSENTIAL: without it WebAudio
# stays suspended and NO alarm sounds until someone clicks the screen.
exec "$CHROME_BIN" \
  --kiosk \
  --force-device-scale-factor="$KIOSK_SCALE" \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  "$URL"
