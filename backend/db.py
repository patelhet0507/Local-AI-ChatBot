import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timezone

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SERVICE_KEY)

def _now():
    return datetime.now(timezone.utc).isoformat()

def create_conversation(title="New Chat", user_id=None):
    result = supabase.table("conversations").insert({"title": title, "user_id": user_id}).execute()
    return result.data[0]

def list_conversations(user_id=None):
    q = supabase.table("conversations").select("*")
    if user_id:
        q = q.eq("user_id", user_id)
    result = q.order("updated_at", desc=True).execute()
    return result.data

def get_conversation(conv_id, user_id=None):
    q = supabase.table("conversations").select("*").eq("id", conv_id)
    if user_id:
        q = q.eq("user_id", user_id)
    result = q.execute()
    if not result.data:
        return None
    conv = result.data[0]
    msgs = supabase.table("messages").select("*").eq("conversation_id", conv_id).order("created_at").execute()
    conv["messages"] = msgs.data
    return conv

def add_message(conv_id, role, content):
    supabase.table("messages").insert({
        "conversation_id": conv_id, "role": role, "content": content
    }).execute()
    supabase.table("conversations").update({"updated_at": _now()}).eq("id", conv_id).execute()

def update_title(conv_id, title):
    supabase.table("conversations").update({"title": title, "updated_at": _now()}).eq("id", conv_id).execute()

def update_last_assistant(conv_id, content):
    # Used by "continue" — merge new tokens into the existing last assistant message.
    msgs = supabase.table("messages").select("*").eq("conversation_id", conv_id).eq("role", "assistant").order("created_at").execute()
    if not msgs.data:
        add_message(conv_id, "assistant", content)
        return
    last_id = msgs.data[-1]["id"]
    supabase.table("messages").update({"content": content, "updated_at": _now()}).eq("id", last_id).execute()
    supabase.table("conversations").update({"updated_at": _now()}).eq("id", conv_id).execute()

def delete_conversation(conv_id):
    supabase.table("conversations").delete().eq("id", conv_id).execute()

def get_profile(user_id):
    result = supabase.table("profiles").select("*").eq("id", user_id).execute()
    return result.data[0] if result.data else None

def upsert_profile(user_id, name=None, email=None):
    row = {"id": user_id, "updated_at": _now()}
    if name is not None:
        row["name"] = name
    if email is not None:
        row["email"] = email
    result = supabase.table("profiles").upsert(row).execute()
    return result.data[0] if result.data else None

def set_two_factor(user_id, enabled):
    result = supabase.table("profiles").update(
        {"two_factor_enabled": bool(enabled), "updated_at": _now()}
    ).eq("id", user_id).execute()
    return result.data[0] if result.data else None
