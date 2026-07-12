import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

connections: dict[str, set[WebSocket]] = defaultdict(set)
connections_lock = asyncio.Lock()


async def register(patient_id: str, websocket: WebSocket) -> None:
    async with connections_lock:
        connections[patient_id].add(websocket)


async def unregister(patient_id: str, websocket: WebSocket) -> None:
    async with connections_lock:
        connections[patient_id].discard(websocket)


async def broadcast(patient_id: str, payload: Any) -> None:
    async with connections_lock:
        sockets = list(connections.get(patient_id, []))

    for socket in sockets:
        try:
            await socket.send_json(payload)
        except Exception:
            await unregister(patient_id, socket)


async def get_latest_for_all() -> dict[str, Any]:
    latest = {}
    async with connections_lock:
        for patient_id, sockets in connections.items():
            if sockets:
                latest[patient_id] = None
    return latest
