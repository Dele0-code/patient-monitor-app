import asyncio
import json
import logging
import time
from typing import Any

import ollama
import paho.mqtt.client as mqtt

import db
import db
import ws_manager
from config import (
    ECG_SEQUENCE_LEN,
    LOCAL_MODEL_NAME,
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    OLLAMA_HOST,
    USE_LLM,
    telemetry_subscription_filter,
)
from main import ecg_model
from state import patient_history

logger = logging.getLogger("patient_monitor.mqtt")

LLM_THROTTLE_SEC = 12.0

ollama_client = ollama.Client(host=OLLAMA_HOST, timeout=15)

_last_rule_severity: dict[str, str] = {}
_last_llm_assessment: dict[str, dict[str, Any]] = {}
_last_llm_call_time: dict[str, float] = {}
_last_real_telemetry_at: float | None = None


def note_real_telemetry() -> None:
    global _last_real_telemetry_at
    _last_real_telemetry_at = time.monotonic()


def get_last_real_telemetry_at() -> float | None:
    return _last_real_telemetry_at


def _normalize_ecg_window(raw_ecg: list[float]) -> list[float] | None:
    n = len(raw_ecg)
    if n == 0:
        return None
    if n == ECG_SEQUENCE_LEN:
        return raw_ecg
    if abs(n - ECG_SEQUENCE_LEN) <= 5:
        if n > ECG_SEQUENCE_LEN:
            return raw_ecg[:ECG_SEQUENCE_LEN]
        return raw_ecg + [raw_ecg[-1]] * (ECG_SEQUENCE_LEN - n)
    return None


def _determine_vitals_flag(spo2: float, bpm: float, temp: float) -> str:
    if 0 < spo2 < 92:
        return "Warning: Hypoxia Detected"
    if bpm > 120:
        return "Warning: Tachycardia Detected"
    if bpm < 50:
        return "Warning: Bradycardia Detected"
    if temp >= 39.0:
        return "Warning: Fever Detected"
    return "Stable"


def _determine_severity(spo2: float, bpm: float, temp: float, rhythm_anomaly: bool) -> str:
    if rhythm_anomaly or spo2 < 90 or bpm > 130 or bpm < 45 or temp >= 39.0:
        return "critical"
    if spo2 < 94 or bpm > 120 or bpm < 55 or temp >= 38.0:
        return "watch"
    return "stable"


def _build_prompt(patient_id: str, spo2: float, bpm: float, temp: float, rhythm_status: str, vitals_flag: str) -> str:
    history = list(patient_history[patient_id])[-5:]
    history_text = ""
    if history:
        history_lines = [
            f"- {item['timestamp']}: HR {item['max_bpm']} bpm, SpO2 {item['spo2']}%, Temp {item['temperature_c']}C"
            for item in history
        ]
        history_text = "\nPrevious trending data:\n" + "\n".join(history_lines)

    return f"""You are an advanced clinical AI assistant embedded within an ICU patient monitoring dashboard.
Analyze these real-time telemetry findings:
- Patient ID: {patient_id}
- Heart Rate: {bpm} bpm
- Oxygen Saturation (SpO2): {spo2}%
- Body Temperature: {temp} degC
- Automated Neural Network ECG Interpretation: {rhythm_status}
- Automated Threshold Alerts: {vitals_flag}{history_text}

Task: Return valid JSON only. Do not include any surrounding prose.
The JSON must contain these keys:
- severity: one of stable, watch, critical
- confidence: a number between 0 and 1
- summary: exactly 2 sentences
- recommended_action: exactly 1 sentence
"""


def _sanitize_json_text(text: str) -> str:
    text = text.strip()
    if text.startswith("```json") and text.endswith("```"):
        text = text[len("```json") : -3].strip()
    elif text.startswith("```") and text.endswith("```"):
        text = text[3:-3].strip()
    return text


def _parse_llm_response(text: str) -> dict[str, Any]:
    raw_text = text or ""
    raw_text = _sanitize_json_text(raw_text)
    logger.info("Raw LLM output: %r", raw_text)

    try:
        parsed = json.loads(raw_text)
        if not isinstance(parsed, dict):
            raise ValueError("LLM response is not a JSON object")
        severity = parsed.get("severity")
        confidence = float(parsed.get("confidence", 0.0))
        summary = str(parsed.get("summary", "")).strip()
        recommended_action = str(parsed.get("recommended_action", "")).strip()

        if severity not in {"stable", "watch", "critical"}:
            raise ValueError("invalid severity")
        if not (0.0 <= confidence <= 1.0):
            raise ValueError("confidence out of range")
        if not summary or not recommended_action:
            raise ValueError("missing text fields")

        return {
            "severity": severity,
            "confidence": confidence,
            "summary": summary,
            "recommended_action": recommended_action,
            "assessment_source": "llm",
        }
    except Exception as exc:
        logger.warning("Malformed LLM output, falling back to safe defaults: %s", exc)
        return {
            "severity": "watch",
            "confidence": 0.0,
            "summary": "Automated assessment unavailable; review the patient telemetry directly.",
            "recommended_action": "Please verify the patient and follow your escalation protocol.",
            "assessment_source": "rules",
        }


def _rule_based_assessment(
    spo2: float,
    bpm: float,
    temp: float,
    rhythm_status: str,
    vitals_flag: str,
    rhythm_anomaly: bool,
) -> dict[str, Any]:
    severity = _determine_severity(spo2, bpm, temp, rhythm_anomaly)
    summary = (
        f"Heart rate {int(bpm)} bpm, SpO2 {int(spo2)}%, temperature {temp:.1f}°C. "
        f"Rhythm assessment: {rhythm_status}."
    )
    if severity == "critical":
        action = "Review the patient immediately and follow your escalation protocol."
    elif severity == "watch":
        action = "Increase observation frequency and reassess within 15 minutes."
    else:
        action = "Continue routine bedside monitoring."
    if vitals_flag != "Stable":
        summary = f"{vitals_flag}. {summary}"
    return {
        "severity": severity,
        "confidence": 0.82,
        "summary": summary,
        "recommended_action": action,
        "assessment_source": "rules",
    }


async def _handle_telemetry_message(payload: dict[str, Any]) -> None:
    patient_id = payload.get("patient_id")
    if not patient_id:
        logger.warning("MQTT payload missing patient_id: %s", payload)
        return

    try:
        spo2 = float(payload.get("spo2", 0))
        bpm = float(payload.get("max_bpm", 0))
        temp = float(payload.get("temperature_c", 0))
        raw_ecg = payload.get("raw_ecg", []) or []
        timestamp = payload.get("timestamp")
        telemetry_source = payload.get("telemetry_source", "hardware")
    except Exception as exc:
        logger.warning("Failed to parse telemetry payload for %s: %s", patient_id, exc)
        return

    if telemetry_source != "simulator":
        note_real_telemetry()

    vitals_flag = _determine_vitals_flag(spo2, bpm, temp)
    raw_ecg_array = _normalize_ecg_window(raw_ecg)
    rhythm_status = "Signal Incomplete (Check Leads)"
    rhythm_anomaly = False

    if raw_ecg_array is not None and ecg_model is not None:
        try:
            import torch

            ecg_tensor = torch.tensor(raw_ecg_array, dtype=torch.float32).view(1, 1, ECG_SEQUENCE_LEN)
            with torch.no_grad():
                prediction = ecg_model(ecg_tensor)
                predicted_class = int(prediction.argmax(dim=1).item())
            rhythm_anomaly = predicted_class == 1
            rhythm_status = "Arrhythmia/Anomaly Detected" if rhythm_anomaly else "Normal Sinus Rhythm"
        except Exception as exc:
            logger.warning("ECG inference failed for %s: %s", patient_id, exc)
            rhythm_status = "ECG analysis unavailable"

    patient_history[patient_id].append(
        {
            "timestamp": timestamp,
            "spo2": spo2,
            "max_bpm": bpm,
            "temperature_c": temp,
            "nibp_sys": payload.get("nibp_sys"),
            "nibp_dia": payload.get("nibp_dia"),
            "rhythm_status": rhythm_status,
            "vitals_flag": vitals_flag,
            "severity": None,
            "confidence": None,
            "summary": None,
            "recommended_action": None,
            "assessment_source": None,
            "telemetry_source": telemetry_source,
            "room": payload.get("room"),
            "bed_number": payload.get("bed_number"),
        }
    )

    prompt = _build_prompt(patient_id, spo2, bpm, temp, rhythm_status, vitals_flag)
    rule_severity = _determine_severity(spo2, bpm, temp, rhythm_anomaly)
    previous_rule_severity = _last_rule_severity.get(patient_id)
    severity_changed = previous_rule_severity is not None and rule_severity != previous_rule_severity
    now = time.monotonic()
    last_llm_at = _last_llm_call_time.get(patient_id, 0.0)
    throttle_elapsed = now - last_llm_at >= LLM_THROTTLE_SEC
    should_call_llm = USE_LLM and (previous_rule_severity is None or severity_changed or throttle_elapsed)

    assessment_source = "rules"
    if should_call_llm:
        try:
            llm_response = ollama_client.generate(
                model=LOCAL_MODEL_NAME,
                prompt=prompt,
                format="json",
                options={"temperature": 0.2},
            )
            assessment = _parse_llm_response(llm_response.get("response", ""))
            _last_llm_assessment[patient_id] = assessment
            _last_llm_call_time[patient_id] = now
            assessment_source = assessment.get("assessment_source", "llm")
            if severity_changed:
                logger.info(
                    "Severity changed for %s (%s -> %s); refreshed LLM assessment immediately",
                    patient_id,
                    previous_rule_severity,
                    rule_severity,
                )
        except Exception as exc:
            logger.warning("LLM generation failed for %s: %s", patient_id, exc)
            cached = _last_llm_assessment.get(patient_id)
            if cached:
                assessment = {**cached, "assessment_source": "llm_cached"}
                assessment_source = "llm_cached"
            else:
                assessment = _rule_based_assessment(
                    spo2, bpm, temp, rhythm_status, vitals_flag, rhythm_anomaly
                )
                assessment_source = "rules"
    else:
        cached = _last_llm_assessment.get(patient_id)
        if cached:
            assessment = {**cached, "assessment_source": "llm_cached"}
            assessment_source = "llm_cached"
        else:
            assessment = _rule_based_assessment(
                spo2, bpm, temp, rhythm_status, vitals_flag, rhythm_anomaly
            )
            assessment_source = "rules"

    assessment["assessment_source"] = assessment_source
    _last_rule_severity[patient_id] = rule_severity

    latest_entry = patient_history[patient_id][-1]
    latest_entry.update(
        {
            "full_name": full_name,
            "severity": assessment["severity"],
            "confidence": assessment["confidence"],
            "summary": assessment["summary"],
            "recommended_action": assessment["recommended_action"],
            "assessment_source": assessment_source,
        }
    )

    patient_meta = db.get_patient(patient_id) or {}
    full_name = patient_meta.get("full_name") or patient_id

    result = {
        "patient_id": patient_id,
        "full_name": full_name,
        "timestamp": timestamp,
        "spo2": spo2,
        "max_bpm": bpm,
        "temperature_c": temp,
        "nibp_sys": payload.get("nibp_sys"),
        "nibp_dia": payload.get("nibp_dia"),
        "raw_ecg": raw_ecg_array,
        "rhythm_status": rhythm_status,
        "system_flags": vitals_flag,
        "severity": assessment["severity"],
        "confidence": assessment["confidence"],
        "summary": assessment["summary"],
        "recommended_action": assessment["recommended_action"],
        "assessment_source": assessment_source,
        "telemetry_source": telemetry_source,
    }

    try:
        db.insert_clinical_insight(
            patient_id=patient_id,
            rhythm_status=rhythm_status,
            system_flags=vitals_flag,
            assessment_text=assessment["summary"],
            recommended_action=assessment["recommended_action"],
            severity=assessment["severity"],
            confidence=assessment["confidence"],
            assessment_source=assessment_source,
        )
    except Exception as exc:
        logger.exception("Failed to insert clinical_insights for %s: %s", patient_id, exc)

    try:
        await ws_manager.broadcast(patient_id, result)
    except Exception as exc:
        logger.exception("WebSocket broadcast failed for %s: %s", patient_id, exc)


def _on_connect(client: mqtt.Client, userdata: Any, flags: dict[str, int], rc: int) -> None:
    if rc == 0:
        logger.info("Connected to MQTT broker at %s:%d", MQTT_BROKER_HOST, MQTT_BROKER_PORT)
        client.subscribe(telemetry_subscription_filter(), qos=1)
    else:
        logger.error("MQTT connection failed with rc=%s", rc)


def _on_message(client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        loop = userdata.get("loop")
        if loop is not None:
            asyncio.run_coroutine_threadsafe(_handle_telemetry_message(payload), loop)
    except Exception as exc:
        logger.warning("Failed to process MQTT message: %s", exc)


async def start_subscriber(stop_event: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    client = mqtt.Client()
    client.user_data_set({"loop": loop})
    client.on_connect = _on_connect
    client.on_message = _on_message

    try:
        client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
    except Exception as exc:
        logger.exception("Could not connect to MQTT broker %s:%s: %s", MQTT_BROKER_HOST, MQTT_BROKER_PORT, exc)
        return

    client.loop_start()
    logger.info("MQTT subscriber started and awaiting telemetry messages.")

    try:
        await stop_event.wait()
    finally:
        client.loop_stop()
        client.disconnect()
        logger.info("MQTT subscriber stopped.")
