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
# Samples per second in the raw_ecg stream. MUST match the frontend
# EcgWaveform.jsx SAMPLE_RATE_HZ so the sweep plays at real time with no stall.
SAMPLE_RATE_HZ = 100

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

# Continuous ECG state carried across batches so R-R spacing stays constant and
# beats don't reset to phase 0 at every 100-sample seam.
_beat_phase = 0.0   # seconds elapsed into the current beat
_beat_counter = 0   # running count of completed beats (used to schedule PVCs)


def _half_sine(x: float, start: float, width: float, amp: float) -> float:
    """Smooth symmetric hump: amp*sin(pi*(x-start)/width) over [start, start+width]."""
    if start <= x < start + width:
        return amp * math.sin(math.pi * (x - start) / width)
    return 0.0


def _triangle(x: float, start: float, peak: float, end: float, amp: float) -> float:
    """Sharp piecewise-linear deflection: 0 -> amp at `peak` -> 0 at `end`."""
    if start <= x < peak:
        return amp * (x - start) / (peak - start)
    if peak <= x < end:
        return amp * (1.0 - (x - peak) / (end - peak))
    return 0.0


def _asym_bump(x: float, start: float, peak: float, end: float, amp: float) -> float:
    """Asymmetric rounded wave (slow upstroke, faster downstroke) for the T wave."""
    if start <= x < peak:
        return amp * math.sin((math.pi / 2) * (x - start) / (peak - start))
    if peak <= x < end:
        return amp * math.cos((math.pi / 2) * (x - peak) / (end - peak))
    return 0.0


def _normal_beat(tb: float) -> float:
    """One physiological Lead-II beat. `tb` = seconds into the beat. Returns mV.

    Landmarks are anchored in absolute seconds (real QRS width is ~constant
    regardless of heart rate; only the diastolic baseline stretches).
    """
    v = 0.0
    v += _half_sine(tb, 0.00, 0.09, 0.15)          # P wave (small upright)
    # PR segment 0.09-0.13 s: isoelectric
    v += _triangle(tb, 0.13, 0.140, 0.15, -0.10)   # Q (small dip)
    v += _triangle(tb, 0.15, 0.170, 0.19, 1.20)    # R (sharp tall spike)
    v += _triangle(tb, 0.19, 0.205, 0.22, -0.25)   # S (dip below baseline)
    # ST segment 0.22-0.32 s: isoelectric
    v += _asym_bump(tb, 0.32, 0.410, 0.48, 0.30)   # T wave (asymmetric)
    # diastole: flat until the next beat (longer at low HR — physiological)
    return v


def _pvc_beat(tb: float) -> float:
    """A premature ventricular contraction: wide bizarre QRS, no P wave,
    tall, with a discordant (inverted) T wave. A recognizable anomaly."""
    v = 0.0
    v += _triangle(tb, 0.12, 0.190, 0.26, 1.60)    # wide tall R
    v += _triangle(tb, 0.26, 0.300, 0.34, -0.45)   # deep wide S
    v += _asym_bump(tb, 0.38, 0.460, 0.56, -0.35)  # inverted T
    return v


def generate_esp32_ecg(bpm: float = 76.0, abnormal: bool = False) -> list[float]:
    """Build one SEQUENCE_LEN batch of ADC counts, advancing the continuous
    beat phase so successive batches join seamlessly (constant R-R)."""
    global _beat_phase, _beat_counter
    beat_duration = 60.0 / max(bpm, 40.0)
    dt = 1.0 / SAMPLE_RATE_HZ
    samples: list[float] = []
    for _ in range(SEQUENCE_LEN):
        is_pvc = abnormal and (_beat_counter % 4 == 3)
        voltage = _pvc_beat(_beat_phase) if is_pvc else _normal_beat(_beat_phase)
        noise = random.uniform(-6, 6) if abnormal else random.uniform(-3, 3)
        samples.append(round(ECG_BASELINE + voltage * 180 + noise, 2))
        _beat_phase += dt
        if _beat_phase >= beat_duration:
            _beat_phase -= beat_duration
            _beat_counter += 1
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
