from collections import defaultdict, deque
from typing import Any

patient_history: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=200))
