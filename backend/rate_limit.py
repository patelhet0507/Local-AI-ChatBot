import os
import time
import threading
from collections import defaultdict, deque

from fastapi.responses import JSONResponse


class RateLimiter:
    """Simple thread-safe sliding-window limiter (in-memory, per-process)."""

    def __init__(self):
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key, limit, window):
        now = time.monotonic()
        with self._lock:
            dq = self._hits[key]
            cutoff = now - window
            while dq and dq[0] <= cutoff:
                dq.popleft()
            if len(dq) >= limit:
                retry_after = int(window - (now - dq[0])) + 1
                return False, max(1, retry_after)
            dq.append(now)
            return True, 0


limiter = RateLimiter()

# (path_prefix, name, limit, window_seconds) — first match wins.
# Auth endpoints are strict to slow brute-force / OTP abuse.
RULES = [
    ("/api/auth/", "auth", int(os.environ.get("RL_AUTH_LIMIT", 15)), int(os.environ.get("RL_AUTH_WINDOW", 60))),
    ("/api/chat", "chat", int(os.environ.get("RL_CHAT_LIMIT", 30)), int(os.environ.get("RL_CHAT_WINDOW", 60))),
    ("/api/", "api", int(os.environ.get("RL_API_LIMIT", 120)), int(os.environ.get("RL_API_WINDOW", 60))),
]


def _client_ip(request):
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _match_rule(path):
    for prefix, name, limit, window in RULES:
        if path.startswith(prefix):
            return name, limit, window
    return None


def install_rate_limiting(app):
    @app.middleware("http")
    async def rate_limit_middleware(request, call_next):
        rule = _match_rule(request.url.path)
        if rule is not None:
            name, limit, window = rule
            key = f"{name}:{_client_ip(request)}"
            ok, retry_after = limiter.check(key, limit, window)
            if not ok:
                return JSONResponse(
                    status_code=429,
                    content={"error": "Too many requests. Please slow down and try again."},
                    headers={"Retry-After": str(retry_after)},
                )
        return await call_next(request)
