#!/usr/bin/env bash
# Idempotent installer for the Patient Monitor appliance on Raspberry Pi 5 (2 GB),
# Raspberry Pi OS Bookworm (64-bit). Safe to re-run. Run as the normal 'pi'-style
# desktop user (NOT root): it uses sudo only where needed.
#
#   cd ~/patient-monitor-app/deploy && ./setup-pi.sh
#
# Prereqs handled manually first (see README-pi.md): raspi-config -> Desktop autologin.
set -euo pipefail

# --- Resolve paths -----------------------------------------------------------
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
BACKEND_DIR="$APP_DIR/patient_monitor_backend"
VENV_DIR="$APP_DIR/.venv"
RUN_USER="$(id -un)"

echo "==> App dir:     $APP_DIR"
echo "==> Backend dir: $BACKEND_DIR"
echo "==> Run user:    $RUN_USER"

# --- 1. System packages ------------------------------------------------------
echo "==> Installing system packages (mosquitto, python venv, node, chromium)..."
sudo apt-get update
sudo apt-get install -y \
  mosquitto mosquitto-clients \
  python3 python3-venv python3-pip python3-dev \
  chromium-browser \
  curl x11-xserver-utils

# Node is needed only to BUILD the frontend once. Use NodeSource if too old/missing.
if ! command -v npm >/dev/null 2>&1; then
  echo "==> Installing Node.js (build-time only) via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# --- 2. Mosquitto broker -----------------------------------------------------
echo "==> Configuring mosquitto..."
sudo cp "$DEPLOY_DIR/mosquitto.conf" /etc/mosquitto/conf.d/patient-monitor.conf
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto

# --- 3. Python venv + backend deps ------------------------------------------
echo "==> Creating Python venv + installing backend deps..."
python3 -m venv "$VENV_DIR"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$BACKEND_DIR/requirements.txt"
# PyTorch CPU wheel for ARM64 (the ECG CNN). If this fails, see README-pi.md.
pip install torch --index-url https://download.pytorch.org/whl/cpu
deactivate

# --- 4. Backend env ----------------------------------------------------------
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "==> Installing Pi .env (USE_LLM=false, auto-simulator on)..."
  cp "$DEPLOY_DIR/.env.pi" "$BACKEND_DIR/.env"
else
  echo "==> $BACKEND_DIR/.env already exists — leaving it untouched."
fi

# --- 5. Build the frontend once (Node needed only here) ----------------------
echo "==> Building the frontend (npm ci && npm run build)..."
cd "$APP_DIR"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build
echo "==> Built -> $APP_DIR/dist (served by the backend at :8000)"

# --- 6. systemd service for the backend -------------------------------------
echo "==> Installing systemd service 'patient-monitor'..."
TMP_UNIT="$(mktemp)"
sed -e "s#__USER__#$RUN_USER#g" -e "s#__APP__#$APP_DIR#g" \
  "$DEPLOY_DIR/patient-monitor.service" > "$TMP_UNIT"
sudo cp "$TMP_UNIT" /etc/systemd/system/patient-monitor.service
rm -f "$TMP_UNIT"
sudo systemctl daemon-reload
sudo systemctl enable patient-monitor
sudo systemctl restart patient-monitor

# --- 7. Kiosk autostart (XDG) ------------------------------------------------
echo "==> Installing Chromium kiosk autostart..."
chmod +x "$DEPLOY_DIR/start-kiosk.sh"
mkdir -p "$HOME/.config/autostart"
sed -e "s#__APP__#$APP_DIR#g" \
  "$DEPLOY_DIR/kiosk.desktop" > "$HOME/.config/autostart/patient-monitor-kiosk.desktop"

echo ""
echo "============================================================"
echo " Setup complete."
echo "   Backend:  systemctl status patient-monitor"
echo "   Broker:   systemctl status mosquitto"
echo "   Health:   curl http://localhost:8000/health"
echo ""
echo " Next (once, manually):"
echo "   1. sudo raspi-config -> System Options -> Boot/Auto Login"
echo "      -> 'Desktop Autologin'"
echo "   2. sudo reboot"
echo " The Pi will boot straight into the fullscreen monitor."
echo "============================================================"
