"""
Publishes ESP32-compatible telemetry over MQTT for development and demos.

When SIMULATE_ESP32=true the backend starts this automatically on boot.
Disable it when the real ESP32 is online — no other changes needed.
"""

import json
import logging
import math
import random
import time
import traceback
import asyncio
from typing import Any

import paho.mqtt.client as mqtt

from config import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    SIMULATED_PATIENT_ID,
    SIMULATOR_RATE_SEC,
    telemetry_topic,
)

logger = logging.getLogger("patient_monitor.mqtt_simulator")

SEQUENCE_LEN = 100
ECG_BASELINE = 2048.0

# Slowly drifting baseline vitals — clinically stable unless a rare sustained event fires.
_vital_state: dict[str, float | int | None] = {
    "spo2": 98.0,
    "bpm": 74.0,
    "temp": 36.6,
    "event": None,
    "event_ticks": 0,
}


def _synthetic_ecg_sample(t: float, bpm: float) -> float:
    beat_duration = 60.0 / max(bpm, 40)
    beat_time = t % beat_duration
    ratio = beat_time / beat_duration

    if 0.02 <= ratio < 0.10:
        return 0.12 * math.sin(math.pi * (ratio - 0.02) / 0.08)
    if 0.12 <= ratio < 0.14:
        return -0.15 * math.sin(math.pi * (ratio - 0.12) / 0.02)
    if 0.14 <= ratio < 0.17:
        return 1.25 * math.sin(math.pi * (ratio - 0.14) / 0.03)
    if 0.17 <= ratio < 0.21:
        return -0.35 * math.sin(math.pi * (ratio - 0.17) / 0.04)
    if 0.24 <= ratio < 0.40:
        return 0.25 * math.sin(math.pi * (ratio - 0.24) / 0.16)
    return 0.0


def generate_esp32_ecg(bpm: float = 76.0) -> list[float]:
    samples: list[float] = []
    for i in range(SEQUENCE_LEN):
        t = i / 100.0
        voltage = _synthetic_ecg_sample(t, bpm)
        noise = random.uniform(-4, 4)
        samples.append(round(ECG_BASELINE + voltage * 180 + noise, 2))
    return samples


def _nudge(current: float, target: float, max_step: float = 0.4) -> float:
    diff = target - current
    if abs(diff) <= max_step:
        return target
    return current + max_step * (1 if diff > 0 else -1)


def generate_vitals() -> dict[str, float | int]:
    """Gradual vitals drift with rare, sustained clinical events (not random spikes)."""
    global _vital_state

    # Rare new event (~0.3% per tick ≈ once every ~5 min at 1 Hz)
    if _vital_state["event"] is None and random.random() < 0.003:
        _vital_state["event"] = random.choice(["bradycardia", "tachycardia", "hypoxemia"])
        _vital_state["event_ticks"] = 0

    event = _vital_state["event"]
    if event:
        _vital_state["event_ticks"] = int(_vital_state["event_ticks"]) + 1
        if event == "bradycardia":
            target_bpm, target_spo2, target_temp = 52.0, 97.0, 36.5
        elif event == "tachycardia":
            target_bpm, target_spo2, target_temp = 118.0, 96.0, 36.8
        else:
            target_bpm, target_spo2, target_temp = 78.0, 89.0, 36.7
        # Hold event for at least 45 seconds, max 90 seconds
        if int(_vital_state["event_ticks"]) > 90 or (
            int(_vital_state["event_ticks"]) > 45 and random.random() < 0.05
        ):
            _vital_state["event"] = None
            _vital_state["event_ticks"] = 0
            target_bpm, target_spo2, target_temp = 74.0, 98.0, 36.6
    else:
        target_bpm = 72.0 + random.uniform(-2, 2)
        target_spo2 = 98.0 + random.uniform(-0.5, 0.5)
        target_temp = 36.6 + random.uniform(-0.1, 0.1)

    _vital_state["bpm"] = _nudge(float(_vital_state["bpm"]), target_bpm, 0.6)
    _vital_state["spo2"] = _nudge(float(_vital_state["spo2"]), target_spo2, 0.3)
    _vital_state["temp"] = round(_nudge(float(_vital_state["temp"]), target_temp, 0.05), 1)

    return {
        "spo2": int(round(float(_vital_state["spo2"]))),
        "max_bpm": int(round(float(_vital_state["bpm"]))),
        "temperature_c": float(_vital_state["temp"]),
    }


def build_payload(patient_id: str) -> dict[str, Any]:
    vitals = generate_vitals()
    bpm = float(vitals["max_bpm"])
    return {
        "patient_id": patient_id,
        "timestamp": int(time.time() * 1000),
        "spo2": vitals["spo2"],
        "max_bpm": vitals["max_bpm"],
        "temperature_c": vitals["temperature_c"],
        "nibp_sys": None,
        "nibp_dia": None,
        "room": "ICU",
        "bed_number": "B",
        "full_name": "Adedayo Segun",
        "raw_ecg": generate_esp32_ecg(bpm),
        "telemetry_source": "hardware",
    }


async def start_simulator(stop_event, local_stop: asyncio.Event | None = None) -> None:
    patient_id = SIMULATED_PATIENT_ID
    topic = telemetry_topic(patient_id)
    client = mqtt.Client()

    try:
        client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
    except Exception as exc:
        logger.error("Simulator could not connect to MQTT broker %s:%s: %s", MQTT_BROKER_HOST, MQTT_BROKER_PORT, exc)
        return

    client.loop_start()
    logger.info(
        "ESP32 simulator publishing to '%s' every %.1fs (patient %s)",
        topic,
        SIMULATOR_RATE_SEC,
        patient_id,
    )

    try:
        while not stop_event.is_set() and not (local_stop and local_stop.is_set()):
            try:
                payload = build_payload(patient_id)
                client.publish(topic, json.dumps(payload), qos=1)
            except Exception as exc:
                logger.exception("Exception while publishing simulated telemetry: %s", exc)
                traceback.print_exc()

            try:
                await asyncio.sleep(SIMULATOR_RATE_SEC)
            except Exception as exc:
                logger.exception("Simulator sleep interrupted: %s", exc)
                await asyncio.sleep(0.1)
    finally:
        client.loop_stop()
        client.disconnect()
        logger.info("ESP32 simulator stopped.")
