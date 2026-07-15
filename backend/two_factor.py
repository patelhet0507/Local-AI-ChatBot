import time
import secrets
import threading

CHALLENGE_TTL = 300   # seconds a 2FA challenge stays valid
MAX_ATTEMPTS = 5

_pending = {}         # challenge_id -> {code, session, user, method, created_at, attempts}
_lock = threading.Lock()


def _gen_code():
    return f"{secrets.randbelow(1000000):06d}"


def create_challenge(session, user, method, notify=None):
    """Hold a validated session until the OTP is confirmed. Returns (challenge_id, code).

    ``notify`` is the destination used for the post-login alert: an email
    address for the email method, or a Telegram chat id for the telegram method.
    """
    cid = secrets.token_urlsafe(16)
    code = _gen_code()
    with _lock:
        _pending[cid] = {
            "code": code, "session": session, "user": user,
            "method": method, "notify": notify,
            "created_at": time.monotonic(), "attempts": 0,
        }
    return cid, code


def verify(challenge_id, code):
    with _lock:
        entry = _pending.get(challenge_id)
        if not entry:
            return None, "Login challenge expired. Please log in again."
        if time.monotonic() - entry["created_at"] > CHALLENGE_TTL:
            _pending.pop(challenge_id, None)
            return None, "Code expired. Please log in again."
        entry["attempts"] += 1
        if entry["attempts"] > MAX_ATTEMPTS:
            _pending.pop(challenge_id, None)
            return None, "Too many attempts. Please log in again."
        if code.strip() != entry["code"]:
            return None, "Invalid code. Please try again."
        _pending.pop(challenge_id, None)
        return {
            "session": entry["session"], "user": entry["user"],
            "method": entry["method"], "notify": entry.get("notify"),
        }, None
