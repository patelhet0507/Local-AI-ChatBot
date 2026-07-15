import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

auth_client = create_client(SUPABASE_URL, ANON_KEY) if ANON_KEY else None
data_client = create_client(SUPABASE_URL, SERVICE_KEY)


def get_user(access_token: str):
    if not access_token:
        return None
    try:
        resp = data_client.auth.get_user(access_token)
        return resp.user
    except Exception:
        return None
