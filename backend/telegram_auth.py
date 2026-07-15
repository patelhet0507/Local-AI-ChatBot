import os
import time
import hmac
import hashlib
import secrets
import threading

import requests

from auth import auth_client, data_client
from db import get_profile
import two_factor

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
API = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else None
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "telegram-secret")

CODE_TTL = 600  # seconds a login code stays valid
_pending = {}   # code -> {status, created_at, user}
_lock = threading.Lock()
_bot_username = os.environ.get("TELEGRAM_BOT_USERNAME")
_poller_started = False


def enabled():
    return bool(BOT_TOKEN and auth_client)


def bot_username():
    global _bot_username
    if _bot_username:
        return _bot_username
    try:
        r = requests.get(f"{API}/getMe", timeout=15).json()
        _bot_username = r["result"]["username"]
    except Exception:
        _bot_username = None
    return _bot_username


def _prune():
    now = time.monotonic()
    for code in [c for c, e in _pending.items() if now - e["created_at"] > CODE_TTL]:
        _pending.pop(code, None)


def start_login():
    code = secrets.token_urlsafe(8)  # only [A-Za-z0-9_-], valid for /start payload
    with _lock:
        _prune()
        _pending[code] = {"status": "pending", "created_at": time.monotonic(), "user": None}
    return {"code": code, "url": f"https://t.me/{bot_username()}?start={code}", "bot": bot_username()}


def _confirm(code, tg_user):
    with _lock:
        entry = _pending.get(code)
        if entry and entry["status"] == "pending":
            entry["status"] = "confirmed"
            entry["user"] = tg_user


def _tg_email(telegram_id):
    return f"tg_{telegram_id}@telegram.local"


def _tg_password(telegram_id):
    return hmac.new(SERVICE_KEY.encode(), str(telegram_id).encode(), hashlib.sha256).hexdigest()


def _provision_and_signin(tg_user):
    telegram_id = tg_user["id"]
    name = tg_user.get("first_name") or tg_user.get("username") or f"tg{telegram_id}"
    email = _tg_email(telegram_id)
    password = _tg_password(telegram_id)

    def _signin():
        return auth_client.auth.sign_in_with_password({"email": email, "password": password})

    res = None
    try:
        res = _signin()
    except Exception:
        res = None

    if not res or not res.session:
        try:
            data_client.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name, "telegram_id": telegram_id, "provider": "telegram"},
            })
        except Exception:
            pass  # likely already exists
        res = _signin()
    return res


def poll_status(code):
    with _lock:
        entry = _pending.get(code)
    if not entry:
        return {"status": "expired"}
    if entry["status"] != "confirmed":
        return {"status": "pending"}

    tg_user = entry["user"]
    res = _provision_and_signin(tg_user)
    with _lock:
        _pending.pop(code, None)
    if not res or not res.session:
        return {"status": "error", "error": "Could not sign in Telegram user"}
    user = res.user
    meta = getattr(user, "user_metadata", None) or {}
    session = {"access_token": res.session.access_token, "refresh_token": res.session.refresh_token}
    user_public = {"id": user.id, "email": user.email, "name": meta.get("name")}

    try:
        profile = get_profile(user.id)
    except Exception:
        profile = None
    if profile and profile.get("two_factor_enabled"):
        chat_id = tg_user.get("id")
        challenge, otp = two_factor.create_challenge(session, user_public, "telegram", notify=chat_id)
        _send_message(chat_id, f"Your Local AI Chatbot login code is {otp}\nIt expires in 5 minutes.")
        return {"status": "two_factor", "method": "telegram", "challenge": challenge}

    return {"status": "confirmed", "session": session, "user": user_public}


def _send_message(chat_id, text):
    try:
        requests.post(f"{API}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=15)
    except Exception:
        pass


def send_message(chat_id, text):
    """Public wrapper so other modules can push messages to a Telegram chat."""
    if not chat_id:
        return
    _send_message(chat_id, text)


def _poll_loop():
    offset = None
    while True:
        try:
            params = {"timeout": 50}
            if offset is not None:
                params["offset"] = offset
            r = requests.get(f"{API}/getUpdates", params=params, timeout=60)
            for upd in r.json().get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or {}
                text = msg.get("text", "") or ""
                chat_id = (msg.get("chat") or {}).get("id")
                if text.startswith("/start"):
                    parts = text.split(maxsplit=1)
                    code = parts[1].strip() if len(parts) > 1 else ""
                    if code:
                        _confirm(code, msg.get("from", {}))
                        _send_message(chat_id, "Login confirmed. Return to Local AI Chatbot.")
                    else:
                        _send_message(chat_id, "Open Local AI Chatbot and press 'Continue with Telegram' to log in.")
        except Exception:
            time.sleep(3)


def start_poller():
    global _poller_started
    if _poller_started or not enabled():
        return
    _poller_started = True
    threading.Thread(target=_poll_loop, daemon=True).start()
