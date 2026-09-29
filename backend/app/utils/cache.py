import time
from typing import Any, Optional, Dict, Tuple
from threading import Lock

class TTLCache:
    """
    A lightweight, thread-safe in-memory cache with Time-To-Live (TTL) expiration.
    """
    def __init__(self, default_ttl: int = 15):
        self.default_ttl = default_ttl
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            val, expiry = self._cache[key]
            if time.time() > expiry:
                del self._cache[key]
                return None
            return val

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl = ttl if ttl is not None else self.default_ttl
        expiry = time.time() + ttl
        with self._lock:
            self._cache[key] = (value, expiry)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

# Shared singleton instances
notification_cache = TTLCache(default_ttl=15)
unread_count_cache = TTLCache(default_ttl=15)
calendar_reminders_cache = TTLCache(default_ttl=3600)
dashboard_stats_cache = TTLCache(default_ttl=30)
user_cache = TTLCache(default_ttl=60)
