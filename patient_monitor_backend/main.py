import asyncio
import os
import logging
from contextlib import asynccontextmanager
from typing import Any

import torch
import torch.nn as nn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, Depends, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import ollama
from dotenv import load_dotenv

import auth
import ws_manager
from config import ECG_SEQUENCE_LEN, MQTT_BROKER_HOST, MQTT_BROKER_PORT, SIMULATE_ESP32
from state import patient_history

load_dotenv()

# --- 0. LOGGING ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("patient_monitor")

# --- 1. CONFIGURATION (from environment, never hardcoded) ---
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # service role, kept server-side only
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]            # shared secret for the Supabase DB webhook
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "qwen2.5:1.5b")
ECG_MODEL_PATH = os.environ.get("ECG_MODEL_PATH", "ecg_model_100hz.pt")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ollama_client = ollama.Client(host=OLLAMA_HOST, timeout=15)  # don't hang forever on a stuck LLM

# --- 2. 1D-CNN ARCHITECTURE ---
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
    # Fail fast and loud if the model can't load -- silently running with
    # randomly-initialized weights is worse than not starting at all.
    global ecg_model
    model = ECGNet()
    try:
        state_dict = torch.load(ECG_MODEL_PATH, map_location=device)
        model.load_state_dict(state_dict)
        model.eval()
        ecg_model = model
        logger.info("1D-CNN model loaded from %s", ECG_MODEL_PATH)
    except Exception as e:
        logger.critical("Failed to load ECG model from %s: %s", ECG_MODEL_PATH, e)
        raise RuntimeError(
            f"Refusing to start: ECG model could not be loaded ({e})"
        ) from e

    stop_event = asyncio.Event()
    app.state.mqtt_stop_event = stop_event
    try:
        import mqtt_subscriber
        app.state.mqtt_task = asyncio.create_task(mqtt_subscriber.start_subscriber(stop_event))
        if SIMULATE_ESP32:
            import mqtt_simulator
            app.state.simulator_task = asyncio.create_task(mqtt_simulator.start_simulator(stop_event))
            logger.info("ESP32 simulator running for PT-000001 — set SIMULATE_ESP32=false when hardware is connected")
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
    allow_origins=ALLOWED_ORIGINS,   # set to your actual dashboard origin(s), not "*"
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# --- 3. REQUEST / RESPONSE SCHEMAS ---
class ProcessRequest(BaseModel):
    record_id: str


class ProcessAck(BaseModel):
    status: str
    record_id: str


# --- 4. WEBHOOK AUTH DEPENDENCY ---
async def verify_webhook_secret(x_webhook_secret: str = Header(default="")):
    """
    Supabase Database Webhooks let you attach a custom HTTP header.
    Configure the webhook to send `x-webhook-secret: <same value as WEBHOOK_SECRET>`
    so this endpoint can't be triggered by an outsider who finds the URL.
    """
    if x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret")


def _normalize_ecg_window(raw_ecg: list[float]) -> list[float] | None:
    """Pad/truncate minor jitter in sample count instead of silently dropping the reading."""
    n = len(raw_ecg)
    if n == 0:
        return None
    if n == ECG_SEQUENCE_LEN:
        return raw_ecg
    if abs(n - ECG_SEQUENCE_LEN) <= 5:  # tolerate small sensor jitter
        if n > ECG_SEQUENCE_LEN:
            return raw_ecg[:ECG_SEQUENCE_LEN]
        return raw_ecg + [raw_ecg[-1]] * (ECG_SEQUENCE_LEN - n)
    return None  # too far off to trust -- treat as incomplete signal


# --- 5. PIPELINE WORKER ---
def execute_pipeline(record_id: str):
    try:
        response = supabase.table("health_metrics").select("*").eq("id", record_id).execute()
        if not response.data:
            logger.warning("Record %s not found.", record_id)
            return

        patient_data = response.data[0]

        spo2 = patient_data.get("spo2", 100)
        bpm = patient_data.get("max_bpm", 75)
        temp = patient_data.get("temperature_c", 36.5)

        vitals_flag = "Stable"
        if 0 < spo2 < 92:
            vitals_flag = "Warning: Hypoxia Detected"
        elif bpm > 120:
            vitals_flag = "Warning: Tachycardia Detected"
        elif bpm < 50:
            vitals_flag = "Warning: Bradycardia Detected"

        raw_ecg_array = _normalize_ecg_window(patient_data.get("raw_ecg", []))

        if raw_ecg_array is not None and ecg_model is not None:
            ecg_tensor = torch.tensor(raw_ecg_array, dtype=torch.float32).view(1, 1, ECG_SEQUENCE_LEN)
            with torch.no_grad():
                prediction = ecg_model(ecg_tensor)
                predicted_class = torch.argmax(prediction, dim=1).item()
            rhythm_status = "Arrhythmia/Anomaly Detected" if predicted_class == 1 else "Normal Sinus Rhythm"
        else:
            rhythm_status = "Signal Incomplete (Check Leads)"

        prompt = f"""You are an advanced clinical AI assistant embedded within an ICU patient monitoring dashboard.
Analyze these real-time telemetry findings:
- Heart Rate: {bpm} bpm
- Oxygen Saturation (SpO2): {spo2}%
- Body Temperature: {temp} degC
- Automated Neural Network ECG Interpretation: {rhythm_status}
- Automated Threshold Alerts: {vitals_flag}

Task: Write a professional, ultra-concise 2-sentence clinical assessment for the nursing staff on duty.
Output only the assessment text, with no introductory phrases."""

        try:
            llm_response = ollama_client.generate(
                model=LOCAL_MODEL_NAME,
                prompt=prompt,
                options={"temperature": 0.2},
            )
            assessment_text = llm_response["response"].strip()
        except Exception as e:
            logger.error("LLM generation failed for record %s: %s", record_id, e)
            assessment_text = "Automated summary unavailable -- please review raw vitals directly."

        insights_payload = {
            "metric_id": record_id,
            "rhythm_status": rhythm_status,
            "system_flags": vitals_flag,
            "assessment_text": assessment_text,
        }
        supabase.table("clinical_insights").insert(insights_payload).execute()
        logger.info("Analysis completed for record %s", record_id)

    except Exception as e:
        logger.exception("Pipeline execution failed for record %s: %s", record_id, e)


# --- 6. ENDPOINTS ---
@app.post("/api/process-telemetry", response_model=ProcessAck, dependencies=[Depends(verify_webhook_secret)])
async def process_telemetry(payload: ProcessRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(execute_pipeline, payload.record_id)
    return ProcessAck(status="Processing worker triggered", record_id=payload.record_id)


@app.get("/health")
async def health():
    from config import SIMULATE_ESP32, MQTT_TOPIC_PREFIX, SIMULATED_PATIENT_ID
    return {
        "status": "ok",
        "model_loaded": ecg_model is not None,
        "mqtt_topic_prefix": MQTT_TOPIC_PREFIX,
        "esp32_simulation": SIMULATE_ESP32,
        "simulated_patient_id": SIMULATED_PATIENT_ID if SIMULATE_ESP32 else None,
    }


@app.get("/api/patients/search")
async def search_patients(q: str = ""):
    response = supabase.table("patients").select("patient_id,full_name,age,gender,ward,room,bed_number,active").eq("active", True).execute()
    patients = response.data or []
    if q:
        q_lower = q.lower()
        patients = [
            p for p in patients
            if q_lower in str(p.get("full_name", "")).lower() or q_lower in str(p.get("patient_id", "")).lower()
        ]
    return patients


@app.get("/api/patients/{patient_id}/latest")
async def get_latest_reading(patient_id: str):
    history = patient_history.get(patient_id)
    if not history:
        raise HTTPException(status_code=404, detail="No telemetry history for this patient")
    return history[-1]


@app.get("/api/ward/triage")
async def ward_triage():
    severity_rank = {"critical": 0, "watch": 1, "stable": 2}
    latest_entries = []
    for patient_id, history in patient_history.items():
        if not history:
            continue
        latest = history[-1]
        latest_entries.append({
            "patient_id": patient_id,
            "severity": latest.get("severity", "watch"),
            "spo2": latest.get("spo2"),
            "max_bpm": latest.get("max_bpm"),
            "temperature_c": latest.get("temperature_c"),
            "summary": latest.get("summary", ""),
            "room": latest.get("room"),
            "bed_number": latest.get("bed_number"),
        })
    return sorted(latest_entries, key=lambda item: severity_rank.get(item["severity"], 1))


@app.websocket("/ws/{patient_id}")
async def websocket_endpoint(websocket: WebSocket, patient_id: str):
    await websocket.accept()
    await ws_manager.register(patient_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except asyncio.CancelledError:
        # Normal cancellation during shutdown or connection teardown.
        pass
    except Exception:
        pass
    finally:
        await ws_manager.unregister(patient_id, websocket)
