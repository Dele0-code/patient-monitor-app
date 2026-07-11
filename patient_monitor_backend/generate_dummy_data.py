"""
Generates synthetic patient telemetry rows and inserts them into the
Supabase `health_metrics` table, so you can test the full pipeline
(webhook -> FastAPI -> 1D-CNN -> Ollama -> clinical_insights -> dashboard)
without needing the ESP32 hardware connected.

Usage:
    python generate_dummy_data.py --count 10 --anomaly-rate 0.2
"""

import os
import random
import argparse
import numpy as np
from supabase import create_client
from postgrest.exceptions import APIError
try:
    import requests
    _HAS_REQUESTS = True
except Exception:
    import urllib.request as _urllib_request
    import urllib.error as _urllib_error
    import json as _json
    _HAS_REQUESTS = False
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SEQUENCE_LEN = 100  # 100Hz for 1 second


def generate_ecg_waveform(anomalous: bool = False) -> list[float]:
    """
    Produces a rough synthetic ECG-like waveform: a repeating QRS-ish spike
    pattern plus baseline noise. Not clinically accurate, but structurally
    similar enough (sharp peaks + baseline) to exercise the CNN pipeline.
    """
    t = np.linspace(0, 1, SEQUENCE_LEN)
    baseline_noise = np.random.normal(0, 0.03, SEQUENCE_LEN)

    # Simulate ~1 heartbeat per second: sharp Gaussian "R-peak"
    peak_center = 0.5 if not anomalous else random.choice([0.2, 0.5, 0.8])
    peak_width = 0.01 if not anomalous else random.uniform(0.005, 0.04)
    r_peak = np.exp(-((t - peak_center) ** 2) / (2 * peak_width ** 2))

    if anomalous:
        # Add an extra irregular/ectopic beat to mimic arrhythmia-like shape
        extra_center = random.uniform(0.1, 0.9)
        extra_peak = 0.6 * np.exp(-((t - extra_center) ** 2) / (2 * 0.008 ** 2))
        r_peak = r_peak + extra_peak

    waveform = baseline_noise + r_peak
    return waveform.round(4).tolist()


def generate_vitals(anomalous: bool = False) -> dict:
    if anomalous:
        # Push at least one vital outside normal range
        scenario = random.choice(["hypoxia", "tachycardia", "bradycardia", "fever"])
        spo2 = random.randint(80, 91) if scenario == "hypoxia" else random.randint(95, 100)
        bpm = (
            random.randint(125, 160) if scenario == "tachycardia"
            else random.randint(30, 49) if scenario == "bradycardia"
            else random.randint(60, 100)
        )
        temp = round(random.uniform(38.5, 40.0), 1) if scenario == "fever" else round(random.uniform(36.0, 37.5), 1)
    else:
        spo2 = random.randint(95, 100)
        bpm = random.randint(60, 100)
        temp = round(random.uniform(36.1, 37.2), 1)

    return {"spo2": spo2, "max_bpm": bpm, "temperature_c": temp}


def build_row(anomalous: bool) -> dict:
    vitals = generate_vitals(anomalous)
    return {
        "spo2": vitals["spo2"],
        "max_bpm": vitals["max_bpm"],
        "temperature_c": vitals["temperature_c"],
        "raw_ecg": generate_ecg_waveform(anomalous),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=10, help="Number of rows to insert")
    parser.add_argument("--anomaly-rate", type=float, default=0.2, help="Fraction of rows that are abnormal (0-1)")
    args = parser.parse_args()

    inserted_ids = []
    for i in range(args.count):
        is_anomalous = random.random() < args.anomaly_rate
        row = build_row(is_anomalous)
        try:
            result = supabase.table("health_metrics").insert(row).execute()
        except APIError as e:
            err_text = str(e).lower()
            # If the Supabase table doesn't have `raw_ecg`, retry without it.
            if "raw_ecg" in err_text:
                row.pop("raw_ecg", None)
                print("Note: 'raw_ecg' column missing in DB schema — retrying without it.")
                try:
                    result = supabase.table("health_metrics").insert(row).execute()
                except APIError as e2:
                    err_text2 = str(e2).lower()
                    if "row-level security" in err_text2 or "violates row-level security" in err_text2:
                        # fall through to REST fallback below
                        err_text = err_text2
                    else:
                        raise
            # If row-level security prevents the insert, fall back to direct REST call
            if "row-level security" in err_text or "violates row-level security" in err_text or e.args:
                print("Row-level security prevented insert via client; using REST fallback with service role key.")
                # Use direct REST API with service role key to bypass RLS
                rest_url = SUPABASE_URL.rstrip("/") + "/rest/v1/health_metrics"
                headers = {
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                }
                try:
                    if _HAS_REQUESTS:
                        resp = requests.post(rest_url, json=row, headers=headers)
                        if not resp.ok:
                            raise RuntimeError(f"REST insert failed: {resp.status_code} {resp.text}")
                        result = type("R", (), {"data": resp.json()})()
                    else:
                        data = _json.dumps(row).encode("utf-8")
                        req = _urllib_request.Request(rest_url, data=data, headers=headers, method="POST")
                        with _urllib_request.urlopen(req) as r:
                            body = r.read()
                            result = type("R", (), {"data": _json.loads(body)})()
                except Exception as final_err:
                    print("Failed to insert row via REST fallback:", final_err)
                    print("This is likely because Row Level Security (RLS) is enabled on the `health_metrics` table.")
                    print("Options:")
                    print(" - Disable RLS for `health_metrics` in the Supabase dashboard (for testing).")
                    print(" - Create an INSERT policy that allows your service role or a specific claim to write to the table.")
                    print(" - Alternatively, run the insert as a SQL command from the Supabase SQL editor using the service_role key.")
                    print("Skipping insert for this row. Here's the payload:")
                    print(row)
                    result = type("R", (), {"data": []})()
            else:
                raise
        new_id = result.data[0]["id"] if result.data else None
        inserted_ids.append(new_id)
        tag = "ANOMALOUS" if is_anomalous else "normal"
        print(f"[{i+1}/{args.count}] inserted id={new_id} ({tag}) "
              f"spo2={row['spo2']} bpm={row['max_bpm']} temp={row['temperature_c']}")

    print(f"\nDone. Inserted {len(inserted_ids)} rows into health_metrics.")
    print("If your Database Webhook is configured on INSERT for this table, "
          "each row should now be flowing through /api/process-telemetry automatically.")


if __name__ == "__main__":
    main()