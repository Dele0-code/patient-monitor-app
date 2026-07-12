import os

from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "patient-monitor")

SIMULATE_ESP32 = os.environ.get("SIMULATE_ESP32", "false").lower() in ("1", "true", "yes")
SIMULATED_PATIENT_ID = os.environ.get("SIMULATED_PATIENT_ID", "PT-000001")
SIMULATOR_RATE_SEC = float(os.environ.get("SIMULATOR_RATE_SEC", "1.0"))

USE_LLM = os.environ.get("USE_LLM", "false" if SIMULATE_ESP32 else "true").lower() in ("1", "true", "yes")

ECG_SEQUENCE_LEN = 100
LIVE_PATIENT_ID = "PT-000001"


def telemetry_topic(patient_id: str) -> str:
    return f"{MQTT_TOPIC_PREFIX}/{patient_id}/telemetry"


def telemetry_subscription_filter() -> str:
    return f"{MQTT_TOPIC_PREFIX}/+/telemetry"
