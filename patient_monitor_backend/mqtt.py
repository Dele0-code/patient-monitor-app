"""
Standalone CLI for publishing simulated ESP32 telemetry over MQTT.

The backend can also start this automatically when SIMULATE_ESP32=true.
Use this script only if you want the simulator running separately.

Usage:
    python mqtt.py --broker 127.0.0.1 --patient-id PT-000001
"""

import argparse
import json
import random
import time

import paho.mqtt.client as mqtt

from config import MQTT_TOPIC_PREFIX
from mqtt_simulator import build_payload


def main():
    parser = argparse.ArgumentParser(description="Patient Monitor ESP32 MQTT simulator")
    parser.add_argument("--broker", default="127.0.0.1", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--patient-id", default="PT-000001")
    parser.add_argument("--rate", type=float, default=1.0, help="Seconds between messages")
    parser.add_argument("--anomaly-rate", type=float, default=0.08, help="Fraction of abnormal messages")
    parser.add_argument("--topic-prefix", default=MQTT_TOPIC_PREFIX, help="Topic prefix")
    args = parser.parse_args()

    client = mqtt.Client()
    client.connect(args.broker, args.port, keepalive=60)
    client.loop_start()

    topic = f"{args.topic_prefix}/{args.patient_id}/telemetry"
    print(f"Patient Monitor simulator publishing to '{topic}' every {args.rate}s")
    print("Press Ctrl+C to stop.")

    try:
        while True:
            anomalous = random.random() < args.anomaly_rate
            payload = build_payload(args.patient_id, anomalous)
            client.publish(topic, json.dumps(payload), qos=1)
            tag = "ANOMALOUS" if anomalous else "normal"
            print(
                f"published ({tag}) spo2={payload['spo2']} bpm={payload['max_bpm']} temp={payload['temperature_c']}"
            )
            time.sleep(args.rate)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
