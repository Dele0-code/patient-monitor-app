#!/bin/bash
# Raspberry Pi kiosk setup — auto-start backend + fullscreen monitor on boot.
# Run once on the Pi: bash scripts/setup-pi-kiosk.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/patient-monitor-app}"
USER_NAME="${USER_NAME:-$USER}"
VENV_DIR="$APP_DIR/patient_monitor_backend/venv"

echo "==> Patient Monitor Pi kiosk setup"
echo "    App directory: $APP_DIR"

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: $APP_DIR not found. Clone the repo first."
  exit 1
fi

# --- Backend venv + deps ---
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating Python venv..."
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$APP_DIR/patient_monitor_backend/requirements.txt"
pip install torch --extra-index-url https://www.piwheels.org/simple || pip install torch

# --- Frontend build ---
cd "$APP_DIR"
if [ ! -d node_modules ]; then
  npm install
fi
npm run build

# --- Mosquitto (MQTT broker) ---
if ! command -v mosquitto &>/dev/null; then
  echo "==> Installing Mosquitto MQTT broker..."
  sudo apt-get update
  sudo apt-get install -y mosquitto mosquitto-clients
fi
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# --- Backend systemd service ---
sudo tee /etc/systemd/system/patient-monitor-backend.service > /dev/null <<EOF
[Unit]
Description=Patient Monitor FastAPI Backend
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_DIR/patient_monitor_backend
Environment=PATH=$VENV_DIR/bin:/usr/bin
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable patient-monitor-backend
sudo systemctl restart patient-monitor-backend

# --- Frontend preview service (serves built app on :5173) ---
sudo tee /etc/systemd/system/patient-monitor-frontend.service > /dev/null <<EOF
[Unit]
Description=Patient Monitor Frontend (Vite Preview)
After=network.target patient-monitor-backend.service
Wants=patient-monitor-backend.service

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_DIR
Environment=PATH=/usr/bin:/usr/local/bin
Environment=VITE_BACKEND_PROXY=http://127.0.0.1:8000
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 5173
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable patient-monitor-frontend
sudo systemctl restart patient-monitor-frontend

# --- Chromium kiosk autostart (HDMI display) ---
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/patient-monitor-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Patient Monitor Kiosk
Exec=/bin/bash $APP_DIR/scripts/kiosk-launch.sh
X-GNOME-Autostart-enabled=true
EOF

chmod +x "$APP_DIR/scripts/kiosk-launch.sh"

echo ""
echo "==> Setup complete!"
echo "    Backend:  http://127.0.0.1:8000/health"
echo "    Frontend: http://127.0.0.1:5173"
echo "    Reboot to start kiosk: sudo reboot"
echo ""
echo "    Ensure patient_monitor_backend/.env is configured."
echo "    Ensure Ollama is running: ollama serve && ollama pull qwen2.5:0.5b"
