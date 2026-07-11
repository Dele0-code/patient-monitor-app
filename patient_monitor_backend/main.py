import os
import logging
from contextlib import asynccontextmanager

import torch
import torch.nn as nn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import ollama
from dotenv import load_dotenv

load_dotenv()

# --- 0. LOGGING ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("medlink")

# --- 1. CONFIGURATION (from environment, never hardcoded) ---
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # service role, kept server-side only
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]            # shared secret for the Supabase DB webhook
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "qwen2.5:1.5b")
ECG_MODEL_PATH = os.environ.get("ECG_MODEL_PATH", "ecg_model_100hz.pt")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
ECG_SEQUENCE_LEN = 100

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
    yield


app = FastAPI(title="MedLink AI Telemetry Pipeline Backend", lifespan=lifespan)

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
    return {"status": "ok", "model_loaded": ecg_model is not None}