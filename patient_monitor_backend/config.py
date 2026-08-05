import os

from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "patient-monitor")
# Extra prefixes to also ingest, so a device flashed with an older/other topic
# (e.g. "medlink/<id>/telemetry") still works without reconfiguring the backend.
MQTT_EXTRA_TOPIC_PREFIXES = [
    p.strip()
    for p in os.environ.get("MQTT_EXTRA_TOPIC_PREFIXES", "medlink").split(",")
    if p.strip()
]

SIMULATE_ESP32 = os.environ.get("SIMULATE_ESP32", "false").lower() in ("1", "true", "yes")
SIMULATED_PATIENT_ID = os.environ.get("SIMULATED_PATIENT_ID", "PT-000001")
SIMULATOR_RATE_SEC = float(os.environ.get("SIMULATOR_RATE_SEC", "1.0"))

# When no real ESP32 data arrives, auto-publish changing dummy vitals for UI testing.
AUTO_SIMULATE_WHEN_IDLE = os.environ.get("AUTO_SIMULATE_WHEN_IDLE", "true").lower() in ("1", "true", "yes")
IDLE_SIMULATOR_SEC = float(os.environ.get("IDLE_SIMULATOR_SEC", "8"))

USE_LLM = os.environ.get("USE_LLM", "true").lower() in ("1", "true", "yes")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "qwen2.5:0.5b")
ECG_MODEL_PATH = os.environ.get("ECG_MODEL_PATH", "ecg_model_100hz.pt")

SQLITE_PATH = os.environ.get("SQLITE_PATH", "patient_monitor.db")

ECG_SEQUENCE_LEN = 100
LIVE_PATIENT_ID = "PT-000001"


def telemetry_topic(patient_id: str) -> str:
    return f"{MQTT_TOPIC_PREFIX}/{patient_id}/telemetry"


def telemetry_subscription_filter() -> str:
    return f"{MQTT_TOPIC_PREFIX}/+/telemetry"


def telemetry_subscription_filters() -> list[str]:
    """All topic filters to subscribe to: the primary prefix plus any extras."""
    prefixes = [MQTT_TOPIC_PREFIX, *MQTT_EXTRA_TOPIC_PREFIXES]
    seen: list[str] = []
    for p in prefixes:
        if p and p not in seen:
            seen.append(p)
    return [f"{p}/+/telemetry" for p in seen]
