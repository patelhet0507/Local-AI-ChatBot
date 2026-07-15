from fastapi import FastAPI, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys, os, logging

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from inference import chat as chat_gen, reload_model, N_CTX, MODEL_PATH
from db import (
    create_conversation, list_conversations, get_conversation,
    add_message, update_last_assistant, update_title, delete_conversation,
    get_profile, upsert_profile, set_two_factor
)

logger = logging.getLogger("api")
from auth import auth_client, get_user, SUPABASE_URL
from urllib.parse import urlencode
from rate_limit import install_rate_limiting
import telegram_auth
import email_auth
import two_factor
from mailer import send_email as mail_send
from email_auth import _email_shell

app = FastAPI()

install_rate_limiting(app)
telegram_auth.start_poller()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    conversation_id: str
    messages: list[dict]
    temperature: float = 0.7
    max_tokens: int = 512
    top_p: float = 0.95

class TitleRequest(BaseModel):
    title: str

class SettingsRequest(BaseModel):
    context_window: int = 2048

class RegisterRequest(BaseModel):
    type: str  # 'email' or 'phone'
    identifier: str
    password: str
    name: str

class LoginRequest(BaseModel):
    type: str
    identifier: str
    password: str

class VerifyRequest(BaseModel):
    type: str
    identifier: str
    token: str

class ResendRequest(BaseModel):
    type: str
    identifier: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ProfileUpdateRequest(BaseModel):
    name: str

class TwoFactorToggleRequest(BaseModel):
    enabled: bool
    password: str = ""
    code: str = ""

class OAuthCompleteRequest(BaseModel):
    access_token: str = ""
    refresh_token: str = ""

class ForgotRequest(BaseModel):
    identifier: str

class ResetRequest(BaseModel):
    identifier: str
    token: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str
    code: str = ""

class DeleteAccountRequest(BaseModel):
    password: str = ""
    code: str = ""

class TwoFactorVerifyRequest(BaseModel):
    challenge: str
    token: str

def _safe_upsert_profile(user):
    if user is None:
        return None
    try:
        meta = getattr(user, "user_metadata", None) or {}
        return upsert_profile(
            user.id,
            name=meta.get("name") or meta.get("full_name"),
            email=user.email,
        )
    except Exception:
        return None

def _user_public(user):
    meta = getattr(user, "user_metadata", None) or {}
    return {"id": user.id, "email": user.email, "name": meta.get("name") or meta.get("full_name")}

def _user_providers(user):
    app_meta = getattr(user, "app_metadata", None) or {}
    providers = app_meta.get("providers")
    if providers:
        return list(providers)
    single = app_meta.get("provider")
    return [single] if single else []

def _is_telegram_user(user):
    return bool(user.email and user.email.endswith("@telegram.local"))

def _has_password(user):
    """True if the account has a user-known email/password credential."""
    meta = getattr(user, "user_metadata", None) or {}
    if meta.get("has_password"):
        return True
    return ("email" in _user_providers(user)) and not _is_telegram_user(user)

def require_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    return get_user(token)

@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/api")
def api_root():
    return {"status": "ok", "model": MODEL_PATH}

@app.post("/api/auth/register")
def auth_register(body: RegisterRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured (missing SUPABASE_ANON_KEY)"})
    if body.type == "email":
        if not email_auth.enabled():
            return JSONResponse(status_code=500, content={"error": "Email delivery not configured (missing SendGrid/Resend key)"})
        ok, err = email_auth.start_register(body.identifier, body.name, body.password)
        if not ok:
            return JSONResponse(status_code=502, content={"error": f"Could not send verification email: {err}"})
        return {"needs_confirmation": True, "user": {"id": None}}
    opts = {"data": {"name": body.name}}
    try:
        res = auth_client.auth.sign_up({"phone": body.identifier, "password": body.password, "options": opts})
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    _safe_upsert_profile(res.user)
    return {"needs_confirmation": res.session is None, "user": {"id": res.user.id if res.user else None}}

@app.post("/api/auth/verify")
def auth_verify(body: VerifyRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured (missing SUPABASE_ANON_KEY)"})
    if body.type == "email":
        res, err = email_auth.verify(body.identifier, body.token)
        if err:
            return JSONResponse(status_code=400, content={"error": err})
    else:
        try:
            res = auth_client.auth.verify_otp({"phone": body.identifier, "token": body.token, "type": "sms"})
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": str(e)})
    _safe_upsert_profile(res.user)
    return {
        "session": {"access_token": res.session.access_token, "refresh_token": res.session.refresh_token},
        "user": _user_public(res.user),
    }

@app.post("/api/auth/login")
def auth_login(body: LoginRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured (missing SUPABASE_ANON_KEY)"})
    try:
        if body.type == "email":
            res = auth_client.auth.sign_in_with_password({"email": body.identifier, "password": body.password})
        else:
            res = auth_client.auth.sign_in_with_password({"phone": body.identifier, "password": body.password})
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    user = res.user
    if (body.type == "email" and not user.email_confirmed_at) or (body.type == "phone" and not user.phone_confirmed_at):
        return JSONResponse(status_code=403, content={"error": "Please verify your account first."})
    _safe_upsert_profile(user)

    session = {"access_token": res.session.access_token, "refresh_token": res.session.refresh_token}
    profile = get_profile(user.id)
    if body.type == "email" and profile and profile.get("two_factor_enabled"):
        challenge, code = two_factor.create_challenge(session, _user_public(user), "email", notify=user.email)
        ok, err = email_auth.send_login_code(user.email, code)
        if not ok:
            return JSONResponse(status_code=502, content={"error": f"Could not send 2FA code: {err}"})
        return {"two_factor_required": True, "method": "email", "challenge": challenge}

    return {"session": session, "user": _user_public(user)}

@app.post("/api/auth/refresh")
def auth_refresh(body: RefreshRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured (missing SUPABASE_ANON_KEY)"})
    try:
        res = auth_client.auth.refresh_session(body.refresh_token)
    except Exception as e:
        return JSONResponse(status_code=401, content={"error": str(e)})
    if not res.session:
        return JSONResponse(status_code=401, content={"error": "Could not refresh session"})
    user = res.user
    return {
        "session": {"access_token": res.session.access_token, "refresh_token": res.session.refresh_token},
        "user": _user_public(user) if user else None,
    }

@app.post("/api/auth/resend")
def auth_resend(body: ResendRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured (missing SUPABASE_ANON_KEY)"})
    if body.type == "email":
        ok, err = email_auth.resend(body.identifier)
        if not ok:
            return JSONResponse(status_code=400, content={"error": err})
        return {"status": "ok"}
    try:
        auth_client.auth.resend({"type": "sms", "phone": body.identifier})
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"status": "ok"}

@app.get("/api/auth/google/url")
def google_auth_url(redirect: str = "http://localhost:8000/auth/callback"):
    if not SUPABASE_URL:
        return JSONResponse(status_code=400, content={"error": "OAuth is not configured."})
    query = urlencode({"provider": "google", "redirect_to": redirect})
    return {"url": f"{SUPABASE_URL}/auth/v1/authorize?{query}"}

@app.post("/api/auth/oauth/complete")
def auth_oauth_complete(body: OAuthCompleteRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    _safe_upsert_profile(user)
    profile = get_profile(user.id)
    if profile and profile.get("two_factor_enabled") and user.email:
        session = {"access_token": body.access_token, "refresh_token": body.refresh_token}
        challenge, code = two_factor.create_challenge(session, _user_public(user), "email", notify=user.email)
        ok, err = email_auth.send_login_code(user.email, code)
        if not ok:
            return JSONResponse(status_code=502, content={"error": f"Could not send 2FA code: {err}"})
        return {"two_factor_required": True, "method": "email", "challenge": challenge}
    return {"user": _user_public(user)}

@app.post("/api/auth/2fa/verify")
def auth_2fa_verify(body: TwoFactorVerifyRequest):
    result, err = two_factor.verify(body.challenge, body.token)
    if err:
        return JSONResponse(status_code=400, content={"error": err})
    try:
        if result["method"] == "email" and result.get("notify"):
            email_auth.send_login_alert(result["notify"])
        elif result["method"] == "telegram" and result.get("notify"):
            telegram_auth.send_message(
                result["notify"],
                "New sign-in to your Local AI Chatbot account was just completed. "
                "If this wasn't you, secure your account.",
            )
    except Exception:
        pass
    return {"session": result["session"], "user": result["user"]}

@app.post("/api/auth/telegram/start")
def auth_telegram_start():
    if not telegram_auth.enabled():
        return JSONResponse(status_code=503, content={"error": "Telegram login not configured"})
    return telegram_auth.start_login()

@app.get("/api/auth/telegram/status")
def auth_telegram_status(code: str):
    if not telegram_auth.enabled():
        return JSONResponse(status_code=503, content={"error": "Telegram login not configured"})
    result = telegram_auth.poll_status(code)
    if result.get("status") == "error":
        return JSONResponse(status_code=400, content={"error": result.get("error", "Telegram login failed")})
    return result

@app.get("/api/profile")
def read_profile(user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    profile = get_profile(user.id)
    if profile is None:
        profile = _safe_upsert_profile(user) or get_profile(user.id)
    return profile or _user_public(user)

@app.patch("/api/profile")
def edit_profile(body: ProfileUpdateRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    try:
        profile = upsert_profile(user.id, name=body.name, email=user.email)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    try:
        from auth import data_client
        meta = dict(getattr(user, "user_metadata", None) or {})
        meta["name"] = body.name
        meta["full_name"] = body.name
        data_client.auth.admin.update_user_by_id(user.id, {"user_metadata": meta})
    except Exception:
        pass
    return profile

@app.post("/api/profile/2fa")
def toggle_two_factor(body: TwoFactorToggleRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    if _has_password(user):
        if not body.password:
            return JSONResponse(status_code=400, content={"error": "Password required"})
        if not email_auth.verify_password(user.email, body.password):
            return JSONResponse(status_code=403, content={"error": "Incorrect password"})
    elif not _is_telegram_user(user) and user.email:
        if not (body.code and email_auth.check_stepup(user.email, body.code)):
            return JSONResponse(status_code=403, content={"error": "Invalid or missing verification code"})
    _safe_upsert_profile(user)
    try:
        profile = set_two_factor(user.id, body.enabled)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return profile or get_profile(user.id)

@app.get("/api/account")
def read_account(user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    try:
        profile = get_profile(user.id) or {}
    except Exception:
        profile = {}
    providers = _user_providers(user)
    if _is_telegram_user(user):
        method = "telegram"
    elif "google" in providers:
        method = "google"
    else:
        method = "email"
    return {
        "id": user.id,
        "email": None if _is_telegram_user(user) else user.email,
        "name": profile.get("name") or _user_public(user)["name"],
        "providers": providers,
        "method": method,
        "has_password": _has_password(user),
        "two_factor_enabled": bool(profile.get("two_factor_enabled")),
    }

@app.post("/api/auth/forgot")
def auth_forgot(body: ForgotRequest):
    if not email_auth.enabled():
        return JSONResponse(status_code=500, content={"error": "Email delivery not configured"})
    ok, err = email_auth.start_reset(body.identifier)
    if not ok:
        return JSONResponse(status_code=502, content={"error": f"Could not send reset email: {err}"})
    return {"status": "ok"}

@app.post("/api/auth/reset")
def auth_reset(body: ResetRequest):
    if not auth_client:
        return JSONResponse(status_code=500, content={"error": "Auth not configured"})
    res, err = email_auth.verify_reset(body.identifier, body.token, body.password)
    if err:
        return JSONResponse(status_code=400, content={"error": err})
    _safe_upsert_profile(res.user)
    return {
        "session": {"access_token": res.session.access_token, "refresh_token": res.session.refresh_token},
        "user": _user_public(res.user),
    }

@app.post("/api/account/verify/start")
def account_verify_start(user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    if _is_telegram_user(user) or not user.email:
        return JSONResponse(status_code=400, content={"error": "Email verification isn't available for this account"})
    if not email_auth.enabled():
        return JSONResponse(status_code=500, content={"error": "Email delivery not configured"})
    ok, err = email_auth.send_stepup(user.email)
    if not ok:
        return JSONResponse(status_code=502, content={"error": f"Could not send code: {err}"})
    return {"status": "ok", "email": user.email}

@app.post("/api/account/password")
def change_password(body: ChangePasswordRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    if _is_telegram_user(user):
        return JSONResponse(status_code=400, content={"error": "Telegram accounts don't use a password."})
    if not user.email:
        return JSONResponse(status_code=400, content={"error": "This account has no email for verification"})
    if len(body.new_password or "") < 6:
        return JSONResponse(status_code=400, content={"error": "New password must be at least 6 characters"})
    # Changing (or first-time setting) a password always requires an emailed OTP.
    if not (body.code and email_auth.check_stepup(user.email, body.code)):
        return JSONResponse(status_code=403, content={"error": "Invalid or missing verification code"})
    ok, err = email_auth.set_password(user.id, body.new_password, getattr(user, "user_metadata", None))
    if not ok:
        return JSONResponse(status_code=400, content={"error": err})
    return {"status": "ok"}

@app.post("/api/account/delete")
def delete_account(body: DeleteAccountRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    if _has_password(user):
        if not email_auth.verify_password(user.email, body.password):
            return JSONResponse(status_code=403, content={"error": "Incorrect password"})
    elif not _is_telegram_user(user) and user.email:
        # OAuth account without a password: verify by email code.
        if not (body.code and email_auth.check_stepup(user.email, body.code)):
            return JSONResponse(status_code=403, content={"error": "Invalid or missing verification code"})
    try:
        from auth import data_client
        data_client.auth.admin.delete_user(user.id)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"status": "ok"}

@app.get("/api/conversations")
def get_conversations(user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return list_conversations(user.id)

@app.post("/api/conversations")
def new_conversation(user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return create_conversation(user_id=user.id)

@app.get("/api/conversations/{conv_id}")
def get_conv(conv_id: str, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    conv = get_conversation(conv_id, user.id)
    if conv is None:
        return JSONResponse(status_code=404, content={"error": "not found"})
    return conv

@app.patch("/api/conversations/{conv_id}")
def rename_conv(conv_id: str, body: TitleRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    update_title(conv_id, body.title)
    return {"status": "ok"}

@app.delete("/api/conversations/{conv_id}")
def delete_conv(conv_id: str, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    delete_conversation(conv_id)
    return {"status": "ok"}

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    conv_id = req.conversation_id
    conv = get_conversation(conv_id, user.id)
    if conv is None:
        return JSONResponse(status_code=404, content={"error": "conversation not found"})

    is_first = len(conv["messages"]) == 0
    last = req.messages[-1] if req.messages else {}
    continuing = last.get("role") == "assistant"
    if not continuing:
        add_message(conv_id, "user", last.get("content", ""))
        if is_first:
            update_title(conv_id, last.get("content", "")[:50])

    def generate():
        full = ""
        for token in chat_gen(req.messages, req.temperature, req.max_tokens, req.top_p):
            full += token
            yield token
        # "continue" mode: merge the new tokens into the existing last assistant message
        if continuing:
            update_last_assistant(conv_id, last.get("content", "") + full)
        else:
            add_message(conv_id, "assistant", full)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

@app.post("/api/settings")
def settings_endpoint(data: SettingsRequest, user=Depends(require_user)):
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    try:
        reload_model(data.context_window)
        return {"ok": True, "n_ctx": N_CTX}
    except Exception as e:
        logger.exception("model reload failed")
        return JSONResponse(status_code=500, content={"error": f"Failed to reload model with n_ctx={data.context_window}: {e}"})

@app.post("/api/contact")
def contact_endpoint(data: dict):
    name = data.get("name", "")
    email = data.get("email", "")
    message = data.get("message", "")
    if not name or not email or not message:
        return JSONResponse(status_code=400, content={"error": "All fields required"})
    inner = f"<p style=\"margin:0 0 4px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#a1a1aa;\"><b style=\"color:#f4f4f5;\">From:</b> {name} &lt;{email}&gt;</p><p style=\"margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#a1a1aa;white-space:pre-wrap;\">{message}</p>"
    html = _email_shell("New contact enquiry", "Contact Enquiry", "Someone reached out via the contact form.", inner, "")
    text = f"Contact Enquiry\nFrom: {name} <{email}>\nMessage:\n{message}"
    targets = ["patelhet.0507@gmail.com"]
    main = os.environ.get("CONTACT_EMAIL", "").strip()
    if main:
        targets.append(main)
    errors = []
    for t in targets:
        ok, err = mail_send(t, f"Contact: {name}", text, html)
        if not ok:
            errors.append(f"{t}: {err}")
    if errors:
        return JSONResponse(status_code=500, content={"error": "; ".join(errors)})
    return {"status": "ok"}

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    @app.exception_handler(404)
    async def spa_fallback(request, exc):
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
else:
    print("WARNING: frontend/dist not found. Run 'cd frontend && npm run build' first.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
