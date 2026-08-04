"""
Publishes ESP32-compatible telemetry over MQTT for development and demos.

Alternates between stable and abnormal phases so the dashboard clearly shows
good readings vs clinically concerning ones.
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

STABLE_PHASE_SEC = 40
ABNORMAL_PHASE_SEC = 25

_phase = {
    "mode": "stable",
    "tick": 0,
    "problem": "tachycardia",
    "problems": ["tachycardia", "hypoxemia", "bradycardia", "fever"],
    "problem_index": 0,
}

_vital_state: dict[str, float] = {
    "spo2": 98.0,
    "bpm": 74.0,
    "temp": 36.6,
}


def _synthetic_ecg_sample(t: float, bpm: float, abnormal: bool = False) -> float:
    beat_duration = 60.0 / max(bpm, 40)
    beat_time = t % beat_duration
    ratio = beat_time / beat_duration

    if abnormal and 0.35 <= ratio < 0.42:
        return 1.8 * math.sin(math.pi * (ratio - 0.35) / 0.07)

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


def generate_esp32_ecg(bpm: float = 76.0, abnormal: bool = False) -> list[float]:
    samples: list[float] = []
    for i in range(SEQUENCE_LEN):
        t = i / 100.0
        voltage = _synthetic_ecg_sample(t, bpm, abnormal=abnormal)
        noise = random.uniform(-6, 6) if abnormal else random.uniform(-3, 3)
        if abnormal and random.random() < 0.08:
            voltage += random.uniform(0.6, 1.2)
        samples.append(round(ECG_BASELINE + voltage * 180 + noise, 2))
    return samples


def _nudge(current: float, target: float, max_step: float = 0.5) -> float:
    diff = target - current
    if abs(diff) <= max_step:
        return target
    return current + max_step * (1 if diff > 0 else -1)


def _advance_phase() -> str:
    global _phase
    _phase["tick"] += 1
    elapsed = _phase["tick"] * SIMULATOR_RATE_SEC

    if _phase["mode"] == "stable" and elapsed >= STABLE_PHASE_SEC:
        _phase["mode"] = "abnormal"
        _phase["tick"] = 0
        _phase["problem"] = _phase["problems"][_phase["problem_index"] % len(_phase["problems"])]
        _phase["problem_index"] += 1
        logger.info("Simulator entering ABNORMAL phase: %s", _phase["problem"])
    elif _phase["mode"] == "abnormal" and elapsed >= ABNORMAL_PHASE_SEC:
        _phase["mode"] = "stable"
        _phase["tick"] = 0
        logger.info("Simulator returning to STABLE phase")

    return _phase["mode"]


def generate_vitals(mode: str) -> dict[str, float | int]:
    global _vital_state

    if mode == "stable":
        target_bpm = 72.0 + random.uniform(-2, 2)
        target_spo2 = 98.0 + random.uniform(-0.5, 0.5)
        target_temp = 36.6 + random.uniform(-0.08, 0.08)
    else:
        problem = _phase["problem"]
        if problem == "tachycardia":
            target_bpm, target_spo2, target_temp = 118.0, 96.0, 36.8
        elif problem == "bradycardia":
            target_bpm, target_spo2, target_temp = 48.0, 97.0, 36.4
        elif problem == "hypoxemia":
            target_bpm, target_spo2, target_temp = 88.0, 87.0, 36.7
        else:
            target_bpm, target_spo2, target_temp = 82.0, 97.0, 38.6

    _vital_state["bpm"] = _nudge(_vital_state["bpm"], target_bpm, 0.8)
    _vital_state["spo2"] = _nudge(_vital_state["spo2"], target_spo2, 0.4)
    _vital_state["temp"] = round(_nudge(_vital_state["temp"], target_temp, 0.06), 1)

    return {
        "spo2": int(round(_vital_state["spo2"])),
        "max_bpm": int(round(_vital_state["bpm"])),
        "temperature_c": float(_vital_state["temp"]),
    }


def build_payload(patient_id: str) -> dict[str, Any]:
    mode = _advance_phase()
    abnormal = mode == "abnormal"
    vitals = generate_vitals(mode)
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
        "raw_ecg": generate_esp32_ecg(bpm, abnormal=abnormal),
        "telemetry_source": "simulator",
        "simulator_phase": mode,
        "simulator_problem": _phase["problem"] if abnormal else None,
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
        "ESP32 simulator publishing to '%s' every %.1fs — alternating stable/abnormal phases",
        topic,
        SIMULATOR_RATE_SEC,
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
