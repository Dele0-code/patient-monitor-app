"""Local SQLite persistence for offline Raspberry Pi operation (no cloud / no WiFi)."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from config import SQLITE_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
    patient_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    ward TEXT,
    room TEXT,
    bed_number TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clinical_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    rhythm_status TEXT,
    system_flags TEXT,
    assessment_text TEXT,
    recommended_action TEXT,
    severity TEXT,
    confidence REAL,
    assessment_source TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_patient_created
    ON clinical_insights(patient_id, created_at DESC);
"""


def _ensure_parent(path: str) -> None:
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    _ensure_parent(SQLITE_PATH)
    conn = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(_SCHEMA)
        row = conn.execute(
            "SELECT 1 FROM patients WHERE patient_id = ?",
            ("PT-000001",),
        ).fetchone()
        if not row:
            conn.execute(
                """
                INSERT INTO patients
                    (patient_id, full_name, age, gender, ward, room, bed_number, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """,
                ("PT-000001", "Bedside Monitor", None, None, "ICU", None, None),
            )


def list_patients(query: str = "") -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT patient_id, full_name, age, gender, ward, room, bed_number, active
            FROM patients
            WHERE active = 1
            ORDER BY patient_id
            """
        ).fetchall()
    patients = [dict(r) for r in rows]
    if query:
        q = query.lower()
        patients = [
            p
            for p in patients
            if q in str(p.get("full_name", "")).lower() or q in str(p.get("patient_id", "")).lower()
        ]
    return patients


def insert_clinical_insight(
    *,
    patient_id: str,
    rhythm_status: str | None,
    system_flags: str | None,
    assessment_text: str | None,
    recommended_action: str | None = None,
    severity: str | None = None,
    confidence: float | None = None,
    assessment_source: str | None = None,
) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO clinical_insights (
                patient_id, rhythm_status, system_flags, assessment_text,
                recommended_action, severity, confidence, assessment_source, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                rhythm_status,
                system_flags,
                assessment_text,
                recommended_action,
                severity,
                confidence,
                assessment_source,
                created_at,
            ),
        )


def latest_insight(patient_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM clinical_insights
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()
    return dict(row) if row else None
