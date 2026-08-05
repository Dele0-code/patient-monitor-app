# Patient Monitor — Raspberry Pi 5 bedside appliance

Turn a Raspberry Pi 5 (2 GB) into a self-contained bedside monitor: it boots
straight into a fullscreen dashboard, ingests telemetry from one ESP32 over MQTT,
and falls back to a built-in simulator until the device connects.

**One process serves everything.** `uvicorn` on port `8000` serves the REST API,
the WebSocket feed, *and* the built React UI (from `dist/`). No Node runtime runs
at boot — Node is only used once, at setup, to build the frontend. Chromium opens
`http://localhost:8000`.

```
ESP32 ──MQTT/1883──▶ mosquitto ──▶ FastAPI backend ──▶ WebSocket ──▶ Chromium kiosk
(patient-monitor/PT-000001/telemetry)   (+ serves dist/ UI on :8000)
```

## Hardware / OS

- Raspberry Pi 5, 2 GB RAM, on a monitor (HDMI).
- Raspberry Pi OS **Bookworm (64-bit, Desktop)**.
- ESP32 publishing JSON to `patient-monitor/PT-000001/telemetry` on the Pi's broker.

## Install

1. Copy this project to the Pi, e.g. `~/patient-monitor-app`.
2. Enable desktop autologin (needed so the kiosk starts without a login prompt):
   ```
   sudo raspi-config
   #  System Options -> Boot / Auto Login -> Desktop Autologin
   ```
3. Run the installer as your normal desktop user (not root):
   ```
   cd ~/patient-monitor-app/deploy
   ./setup-pi.sh
   ```
   It installs mosquitto, creates a Python venv (+ PyTorch CPU wheel for the ECG
   CNN), copies `.env.pi` → `patient_monitor_backend/.env`, builds the frontend,
   installs+enables the `patient-monitor` systemd service, and adds the Chromium
   kiosk autostart.
4. Reboot:
   ```
   sudo reboot
   ```
   The Pi boots into the fullscreen monitor. With no ESP32 yet, the built-in
   **simulator** drives the screen after ~8 s so you can see it working.

## ESP32 → live data

Point the ESP32 at the Pi's broker (`<pi-ip>:1883`, anonymous) and publish to
`patient-monitor/PT-000001/telemetry`. The backend ingests it automatically and
the idle watchdog **stops the simulator** once real telemetry arrives. Unplug the
ESP32 and, after a short grace, the **signal-loss alarm** sounds (a distinct low
two-tone, different from the clinical alarms) and a "SIGNAL LOST" banner shows.

Expected payload keys (per reading): `patient_id`, `max_bpm`, `spo2`,
`temperature_c`, `nibp_sys`, `nibp_dia`, `raw_ecg` (100 samples), `timestamp`.
Set `telemetry_source` to anything other than `"simulator"` for real hardware.

## 2 GB RAM notes (important)

- **The LLM is OFF by default** (`USE_LLM=false` in `.env.pi`). On 2 GB, Torch +
  Chromium + Ollama together can OOM. NEWS2 + the rule-based engine already fill
  the AI panel completely, so the appliance is fully functional without it.
- To enable the local LLM anyway:
  1. Add zram (recommended) — `sudo apt install zram-tools`, set
     `PERCENT=150` in `/etc/default/zramswap`, then reboot. Or add a swapfile.
  2. `curl -fsSL https://ollama.com/install.sh | sh` then
     `ollama pull qwen2.5:0.5b`.
  3. Set `USE_LLM=true` in `patient_monitor_backend/.env` and
     `sudo systemctl restart patient-monitor`.
- Disable unused desktop bits (bluetooth, printing) to free RAM if needed.

## Operate / troubleshoot

```
systemctl status patient-monitor      # backend + served UI
systemctl status mosquitto            # broker
curl http://localhost:8000/health     # {"status":"ok", ...}
journalctl -u patient-monitor -f      # live backend logs
mosquitto_sub -t 'patient-monitor/#'  # watch raw telemetry
```

- **Blank/again "No Signal":** check the ESP32 is publishing to the right topic;
  `mosquitto_sub` should show messages.
- **No alarm sound:** the kiosk launches Chromium with
  `--autoplay-policy=no-user-gesture-required` (in `start-kiosk.sh`) — without it
  WebAudio stays suspended. Also confirm HDMI/analog audio output is selected.
- **UI not served (404 "Frontend build not found"):** re-run `npm run build` in
  the app dir; the backend serves `../dist` relative to `patient_monitor_backend`.
- **Restart the kiosk browser:** log out / back in, or reboot.

## Multiple patients

The header shows a compact **bed strip**. Only `PT-000001` is wired to the ESP32
(and the simulator); the demo beds show an idle dot and "Awaiting telemetry" when
opened. To add a real second device, add the patient in `src/patients.js`
(`monitored: true`), have its ESP32 publish to its own
`patient-monitor/<id>/telemetry` topic, and rebuild.
