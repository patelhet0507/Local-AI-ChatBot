import time
import secrets
import threading

from auth import auth_client, data_client
from mailer import send_email, configured as mailer_configured

CODE_TTL = 600      # code valid for 10 minutes
MAX_ATTEMPTS = 5    # wrong-code attempts before a code is burned

_pending = {}       # email(lower) -> {code, name, password, created_at, attempts}
_reset_pending = {} # email(lower) -> {code, created_at, attempts}
_stepup = {}        # email(lower) -> {code, created_at, attempts}
_lock = threading.Lock()


def enabled():
    return bool(auth_client) and mailer_configured()


def _gen_code():
    return f"{secrets.randbelow(1000000):06d}"


BRAND = "Local AI Chatbot"

# ── Shared email design ──────────────────────────────────────────────────────
# Table-based, fully inline-styled dark theme that matches the app's cyan accent
# (#00f0ff on near-black). Built to render consistently across email clients.

def _email_shell(preheader, heading, intro, inner_html, footer_note):
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<title>{BRAND}</title>
</head>
<body style="margin:0;padding:0;background:#050507;background-image:linear-gradient(180deg,#050507 0%,#0a0a12 100%);">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#050507;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050507;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#101017;border:1px solid #23232e;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="width:38px;height:38px;background:#00f0ff;border-radius:11px;text-align:center;vertical-align:middle;font-family:'Segoe UI',Arial,sans-serif;font-weight:800;font-size:14px;color:#04121a;box-shadow:0 0 20px rgba(0,240,255,0.45);">AI</td>
                    <td style="padding-left:12px;font-family:'Segoe UI',Arial,sans-serif;font-weight:700;font-size:16px;color:#f4f4f5;letter-spacing:0.2px;">{BRAND}</td>
                  </tr></table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 32px;"><div style="height:1px;background:linear-gradient(90deg,rgba(0,240,255,0.35),rgba(35,35,46,0.2));margin:20px 0 4px 0;"></div></td></tr>
        <tr>
          <td style="padding:20px 32px 8px 32px;">
            <h1 style="margin:0 0 10px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:22px;line-height:1.25;font-weight:700;color:#fafafa;">{heading}</h1>
            <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#a1a1aa;">{intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px 32px;">
            {inner_html}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px 32px;">
            <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#71717a;">{footer_note}</p>
          </td>
        </tr>
        <tr><td style="padding:0 32px;"><div style="height:1px;background:#1c1c25;margin:4px 0;"></div></td></tr>
        <tr>
          <td style="padding:16px 32px 26px 32px;">
            <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.6;color:#52525b;">
              {BRAND} &middot; runs privately on your own machine.<br>
              This is an automated message, please don't reply.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def _code_block(code):
    return (
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">"
        "<tr><td align=\"center\" "
        "style=\"background:#08080d;border:1px solid rgba(0,240,255,0.35);border-radius:14px;"
        "padding:22px 12px;box-shadow:inset 0 0 30px rgba(0,240,255,0.06);\">"
        f"<div style=\"font-family:'Courier New',monospace;font-size:38px;font-weight:700;"
        f"letter-spacing:12px;color:#00f0ff;text-shadow:0 0 18px rgba(0,240,255,0.55);"
        f"padding-left:12px;\">{code}</div>"
        "</td></tr></table>"
    )


def _info_row(label, value):
    return (
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
        "style=\"background:#08080d;border:1px solid #23232e;border-radius:12px;padding:14px 16px;\">"
        f"<tr><td style=\"font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#71717a;\">{label}</td></tr>"
        f"<tr><td style=\"font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#f4f4f5;font-weight:600;padding-top:2px;\">{value}</td></tr>"
        "</table>"
    )


def _code_email(code):
    text = (
        f"Your {BRAND} verification code is {code}\n\n"
        "It expires in 10 minutes. If you didn't request this, ignore this email."
    )
    html = _email_shell(
        preheader=f"Your verification code is {code}",
        heading="Verify your email",
        intro="Welcome! Use the code below to confirm your email and finish creating your account.",
        inner_html=_code_block(code),
        footer_note="This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.",
    )
    return text, html


def _send_code(email, code):
    text, html = _code_email(code)
    return send_email(email, f"Your {BRAND} verification code", text, html)


def send_login_code(email, code):
    text = (
        f"Your {BRAND} login code is {code}\n\n"
        "It expires in 5 minutes. If this wasn't you, change your password."
    )
    html = _email_shell(
        preheader=f"Your login code is {code}",
        heading="Two-factor login",
        intro="Enter this one-time code to finish signing in to your account.",
        inner_html=_code_block(code),
        footer_note="This code expires in 5 minutes. If this wasn't you, change your password right away.",
    )
    return send_email(email, f"Your {BRAND} login code", text, html)


def send_login_alert(email):
    when = time.strftime("%d %b %Y, %H:%M UTC", time.gmtime())
    text = (
        f"A new sign-in to your {BRAND} account was just completed.\n"
        f"Time: {when}\n\n"
        "If this was you, no action is needed. If not, change your password immediately."
    )
    html = _email_shell(
        preheader="A new sign-in to your account was just completed.",
        heading="New sign-in detected",
        intro="A new sign-in to your account was just completed. Here are the details:",
        inner_html=_info_row("Time", when),
        footer_note="If this was you, no action is needed. If you don't recognise this, change your password immediately.",
    )
    return send_email(email, f"New sign-in to your {BRAND} account", text, html)


def _reset_email(email, code):
    text = (
        f"Your {BRAND} password reset code is {code}\n\n"
        "It expires in 10 minutes. If you didn't request this, ignore this email."
    )
    html = _email_shell(
        preheader=f"Your password reset code is {code}",
        heading="Reset your password",
        intro="We received a request to reset your password. Enter the code below to choose a new one.",
        inner_html=_code_block(code),
        footer_note="This code expires in 10 minutes. If you didn't request a reset, ignore this email — your password stays the same.",
    )
    return send_email(email, f"Your {BRAND} password reset code", text, html)


def start_reset(email):
    """Send a reset code only if an account exists for this email.

    Returns (ok, err). To avoid account enumeration the caller should return a
    generic success message regardless of whether the account exists.
    """
    user = _find_user_by_email(email)
    if user is None:
        return True, None  # pretend success; nothing sent
    code = _gen_code()
    with _lock:
        _reset_pending[email.lower()] = {
            "code": code, "created_at": time.monotonic(), "attempts": 0,
        }
    return _reset_email(email, code)


def verify_reset(email, code, new_password):
    key = email.lower()
    with _lock:
        entry = _reset_pending.get(key)
        if not entry:
            return None, "No pending reset. Please request a new code."
        if time.monotonic() - entry["created_at"] > CODE_TTL:
            _reset_pending.pop(key, None)
            return None, "Code expired. Please request a new code."
        entry["attempts"] += 1
        if entry["attempts"] > MAX_ATTEMPTS:
            _reset_pending.pop(key, None)
            return None, "Too many attempts. Please request a new code."
        if code.strip() != entry["code"]:
            return None, "Invalid code. Please try again."
        _reset_pending.pop(key, None)

    user = _find_user_by_email(email)
    if user is None:
        return None, "Account no longer exists."
    meta = dict(getattr(user, "user_metadata", None) or {})
    meta["has_password"] = True
    try:
        data_client.auth.admin.update_user_by_id(user.id, {
            "password": new_password,
            "email_confirm": True,
            "user_metadata": meta,
        })
    except Exception as e:
        return None, str(e)

    try:
        res = auth_client.auth.sign_in_with_password({"email": email, "password": new_password})
    except Exception as e:
        return None, str(e)
    if not res or not res.session:
        return None, "Could not sign in after reset"
    return res, None


def set_password(user_id, new_password, user_metadata=None):
    """Admin-set a user's password (used by the authenticated change-password flow).

    Also stamps a has_password flag into user_metadata so we can tell later that
    this account has an email/password credential — Supabase does not add an
    'email' identity when a password is set on an OAuth-only user.
    """
    meta = dict(user_metadata or {})
    meta["has_password"] = True
    try:
        data_client.auth.admin.update_user_by_id(user_id, {
            "password": new_password,
            "email_confirm": True,
            "user_metadata": meta,
        })
        return True, None
    except Exception as e:
        return False, str(e)


def send_stepup(email):
    """Send a one-time verification code for a sensitive account action."""
    code = _gen_code()
    with _lock:
        _stepup[email.lower()] = {"code": code, "created_at": time.monotonic(), "attempts": 0}
    text = (
        f"Your {BRAND} verification code is {code}\n\n"
        "Use it to confirm a change to your account. It expires in 10 minutes."
    )
    html = _email_shell(
        preheader=f"Your verification code is {code}",
        heading="Confirm it's you",
        intro="Enter this code to confirm the change you requested to your account.",
        inner_html=_code_block(code),
        footer_note="This code expires in 10 minutes. If you didn't start this, ignore this email and consider changing your password.",
    )
    return send_email(email, f"Your {BRAND} verification code", text, html)


def check_stepup(email, code):
    key = email.lower()
    with _lock:
        entry = _stepup.get(key)
        if not entry:
            return False
        if time.monotonic() - entry["created_at"] > CODE_TTL:
            _stepup.pop(key, None)
            return False
        entry["attempts"] += 1
        if entry["attempts"] > MAX_ATTEMPTS:
            _stepup.pop(key, None)
            return False
        if (code or "").strip() != entry["code"]:
            return False
        _stepup.pop(key, None)
        return True


def verify_password(email, password):
    """Return True if the email/password combination is valid."""
    try:
        res = auth_client.auth.sign_in_with_password({"email": email, "password": password or ""})
        return bool(res and res.session)
    except Exception:
        return False


def start_register(email, name, password):
    code = _gen_code()
    with _lock:
        _pending[email.lower()] = {
            "code": code, "name": name, "password": password,
            "created_at": time.monotonic(), "attempts": 0,
        }
    return _send_code(email, code)


def resend(email):
    key = email.lower()
    with _lock:
        entry = _pending.get(key)
        if not entry:
            return False, "No pending verification for this email. Please register again."
        entry["code"] = _gen_code()
        entry["created_at"] = time.monotonic()
        entry["attempts"] = 0
        code = entry["code"]
    return _send_code(email, code)


def _find_user_by_email(email):
    """Return the existing auth user with this email (any provider), or None."""
    target = email.lower()
    try:
        page = 1
        while True:
            users = data_client.auth.admin.list_users(page=page, per_page=200)
            if not users:
                return None
            for u in users:
                if (getattr(u, "email", None) or "").lower() == target:
                    return u
            if len(users) < 200:
                return None
            page += 1
    except Exception:
        return None


def verify(email, code):
    key = email.lower()
    with _lock:
        entry = _pending.get(key)
        if not entry:
            return None, "No pending verification. Please register again."
        if time.monotonic() - entry["created_at"] > CODE_TTL:
            _pending.pop(key, None)
            return None, "Code expired. Please register again."
        entry["attempts"] += 1
        if entry["attempts"] > MAX_ATTEMPTS:
            _pending.pop(key, None)
            return None, "Too many attempts. Please register again."
        if code.strip() != entry["code"]:
            return None, "Invalid code. Please try again."
        name, password = entry["name"], entry["password"]
        _pending.pop(key, None)

    # The OTP proves the user controls this inbox. If an account already exists
    # for this email (e.g. created via Google), attach the email/password to
    # THAT account instead of creating a duplicate.
    existing = _find_user_by_email(email)
    try:
        if existing is not None:
            meta = dict(getattr(existing, "user_metadata", None) or {})
            if name and not meta.get("name"):
                meta["name"] = name
            meta["has_password"] = True
            data_client.auth.admin.update_user_by_id(existing.id, {
                "password": password,
                "email_confirm": True,
                "user_metadata": meta,
            })
        else:
            data_client.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name, "has_password": True},
            })
    except Exception as e:
        return None, str(e)

    try:
        res = auth_client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as e:
        return None, str(e)
    if not res or not res.session:
        return None, "Could not sign in after verification"
    return res, None
