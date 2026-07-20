import asyncio
import logging
import os
from contextlib import asynccontextmanager

import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import auth
import db
import ws_manager
from config import (
    ECG_MODEL_PATH,
    ECG_SEQUENCE_LEN,
    MQTT_TOPIC_PREFIX,
    SIMULATE_ESP32,
    SIMULATED_PATIENT_ID,
)
from state import patient_history

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("patient_monitor")

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.89:5173",
    ).split(",")
    if o.strip()
]


class ECGNet(nn.Module):
    def __init__(self):
        super(ECGNet, self).__init__()
        self.conv1 = nn.Conv1d(1, 16, kernel_size=5, stride=1, padding=2)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool1d(kernel_size=2)

        self.conv2 = nn.Conv1d(16, 32, kernel_size=5, stride=1, padding=2)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool1d(kernel_size=2)

        self.fc1 = nn.Linear(32 * 25, 64)
        self.relu3 = nn.ReLU()
        self.fc2 = nn.Linear(64, 2)  # [Normal, Anomaly]

    def forward(self, x):
        x = self.pool1(self.relu1(self.conv1(x)))
        x = self.pool2(self.relu2(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = self.relu3(self.fc1(x))
        return self.fc2(x)


device = torch.device("cpu")
ecg_model: ECGNet | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ecg_model

    db.init_db()
    logger.info("SQLite ready (offline local store)")

    model = ECGNet()
    try:
        state_dict = torch.load(ECG_MODEL_PATH, map_location=device)
        model.load_state_dict(state_dict)
        model.eval()
        ecg_model = model
        logger.info("1D-CNN model loaded from %s", ECG_MODEL_PATH)
    except Exception as e:
        logger.critical("Failed to load ECG model from %s: %s", ECG_MODEL_PATH, e)
        raise RuntimeError(f"Refusing to start: ECG model could not be loaded ({e})") from e

    stop_event = asyncio.Event()
    app.state.mqtt_stop_event = stop_event
    try:
        import mqtt_subscriber

        app.state.mqtt_task = asyncio.create_task(mqtt_subscriber.start_subscriber(stop_event))
        if SIMULATE_ESP32:
            import mqtt_simulator

            app.state.simulator_task = asyncio.create_task(mqtt_simulator.start_simulator(stop_event))
            logger.info(
                "ESP32 simulator running for %s — set SIMULATE_ESP32=false when hardware is connected",
                SIMULATED_PATIENT_ID,
            )
    except Exception as exc:
        logger.exception("Failed to start MQTT services: %s", exc)
        raise

    yield

    stop_event.set()
    if hasattr(app.state, "mqtt_task"):
        await app.state.mqtt_task
    if hasattr(app.state, "simulator_task"):
        await app.state.simulator_task


app = FastAPI(title="Patient Monitor Backend", lifespan=lifespan)
app.include_router(auth.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    from config import SQLITE_PATH, USE_LLM

    return {
        "status": "ok",
        "storage": "sqlite",
        "sqlite_path": SQLITE_PATH,
        "model_loaded": ecg_model is not None,
        "use_llm": USE_LLM,
        "mqtt_topic_prefix": MQTT_TOPIC_PREFIX,
        "esp32_simulation": SIMULATE_ESP32,
        "simulated_patient_id": SIMULATED_PATIENT_ID if SIMULATE_ESP32 else None,
        "ecg_sequence_len": ECG_SEQUENCE_LEN,
    }


@app.get("/api/patients/search")
async def search_patients(q: str = ""):
    return db.list_patients(q)


@app.get("/api/patients/{patient_id}/latest")
async def get_latest_reading(patient_id: str):
    history = patient_history.get(patient_id)
    if history:
        return history[-1]
    insight = db.latest_insight(patient_id)
    if not insight:
        raise HTTPException(status_code=404, detail="No telemetry history for this patient")
    return insight


@app.get("/api/ward/triage")
async def ward_triage():
    severity_rank = {"critical": 0, "watch": 1, "stable": 2}
    latest_entries = []
    for patient_id, history in patient_history.items():
        if not history:
            continue
        latest = history[-1]
        latest_entries.append(
            {
                "patient_id": patient_id,
                "severity": latest.get("severity", "watch"),
                "spo2": latest.get("spo2"),
                "max_bpm": latest.get("max_bpm"),
                "temperature_c": latest.get("temperature_c"),
                "summary": latest.get("summary", ""),
                "recommended_action": latest.get("recommended_action", ""),
                "assessment_source": latest.get("assessment_source"),
                "room": latest.get("room"),
                "bed_number": latest.get("bed_number"),
            }
        )
    return sorted(latest_entries, key=lambda item: severity_rank.get(item["severity"], 1))


@app.websocket("/ws/{patient_id}")
async def websocket_endpoint(websocket: WebSocket, patient_id: str):
    await websocket.accept()
    await ws_manager.register(patient_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except asyncio.CancelledError:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.unregister(patient_id, websocket)
