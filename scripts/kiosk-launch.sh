#!/bin/bash
# Wait for backend + frontend, then open fullscreen Chromium on the HDMI display.

set -euo pipefail

URL="http://127.0.0.1:5173"
MAX_WAIT=120

for i in $(seq 1 $MAX_WAIT); do
  if curl -sf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for i in $(seq 1 30); do
  if curl -sf "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Hide cursor after 3s idle (optional)
unclutter -idle 3 -root &>/dev/null &

exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --check-for-update-interval=31536000 \
  --app="$URL"
