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
    """100 samples at 100 Hz, centered around 2048 like the real ESP32 ADC output."""
    samples: list[float] = []
    for i in range(SEQUENCE_LEN):
        t = i / 100.0
        voltage = _synthetic_ecg_sample(t, bpm)
        noise = random.uniform(-8, 8)
        samples.append(round(ECG_BASELINE + voltage * 180 + noise, 2))
    return samples


def generate_vitals(anomalous: bool = False) -> dict[str, float | int]:
    if anomalous:
        scenario = random.choice(["hypoxia", "tachycardia", "bradycardia", "fever"])
        spo2 = random.randint(80, 91) if scenario == "hypoxia" else random.randint(95, 100)
        bpm = (
            random.randint(125, 150) if scenario == "tachycardia"
            else random.randint(35, 48) if scenario == "bradycardia"
            else random.randint(60, 100)
        )
        temp = round(random.uniform(38.5, 39.8), 1) if scenario == "fever" else round(random.uniform(36.0, 37.4), 1)
    else:
        spo2 = random.randint(95, 100)
        bpm = random.randint(68, 88)
        temp = round(random.uniform(36.2, 37.2), 1)
    return {"spo2": spo2, "max_bpm": bpm, "temperature_c": temp}


def build_payload(patient_id: str, anomalous: bool = False) -> dict[str, Any]:
    vitals = generate_vitals(anomalous)
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
        "raw_ecg": generate_esp32_ecg(bpm),
    }


async def start_simulator(stop_event) -> None:
    """
    Async simulator that publishes ESP32-compatible telemetry over MQTT.

    This implementation runs in the asyncio event loop, publishes at
    `SIMULATOR_RATE_SEC` intervals, and logs tracebacks for any
    unexpected exceptions so the loop doesn't die silently.
    """
    patient_id = SIMULATED_PATIENT_ID
    topic = telemetry_topic(patient_id)
    client = mqtt.Client()
    anomaly_rate = 0.08

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
        # Run until the provided asyncio Event is set.
        while not stop_event.is_set():
            try:
                anomalous = random.random() < anomaly_rate
                payload = build_payload(patient_id, anomalous)
                client.publish(topic, json.dumps(payload), qos=1)
                tag = "anomalous" if anomalous else "normal"
                logger.debug(
                    "Simulated telemetry (%s): spo2=%s bpm=%s temp=%s",
                    tag,
                    payload["spo2"],
                    payload["max_bpm"],
                    payload["temperature_c"],
                )
            except Exception as exc:
                logger.exception("Exception while publishing simulated telemetry: %s", exc)
                traceback.print_exc()

            # Non-blocking sleep so other asyncio tasks can run.
            try:
                await asyncio.sleep(SIMULATOR_RATE_SEC)
            except Exception as exc:
                # Sleep shouldn't fail, but log and continue if it does.
                logger.exception("Simulator sleep interrupted: %s", exc)
                traceback.print_exc()
                # small delay to avoid busy loop if sleep repeatedly fails
                await asyncio.sleep(0.1)
    finally:
        client.loop_stop()
        client.disconnect()
        logger.info("ESP32 simulator stopped.")
