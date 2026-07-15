import os
import logging

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

logger = logging.getLogger("mailer")

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SENDGRID_FROM = os.environ.get("SENDGRID_FROM")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM = os.environ.get("RESEND_FROM")

# Resend's shared sandbox sender can ONLY deliver to the Resend account owner.
# Using it as a fallback would silently redirect other users' codes to the
# owner's inbox, so we refuse to use it for arbitrary recipients.
_RESEND_SANDBOX_FROM = "onboarding@resend.dev"


def _resend_usable():
    return bool(RESEND_API_KEY and RESEND_FROM and RESEND_FROM.lower() != _RESEND_SANDBOX_FROM)


def configured():
    return bool((SENDGRID_API_KEY and SENDGRID_FROM) or _resend_usable())


def _send_sendgrid(to, subject, text, html):
    r = requests.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={"Authorization": f"Bearer {SENDGRID_API_KEY}", "Content-Type": "application/json"},
        json={
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": SENDGRID_FROM, "name": "Local AI Chatbot"},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text},
                {"type": "text/html", "value": html},
            ],
        },
        timeout=20,
    )
    if r.status_code in (200, 202):
        return True, None
    return False, f"SendGrid {r.status_code}: {r.text}"


def _send_resend(to, subject, text, html):
    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={"from": RESEND_FROM, "to": [to], "subject": subject, "text": text, "html": html},
        timeout=20,
    )
    if r.status_code in (200, 202):
        return True, None
    return False, f"Resend {r.status_code}: {r.text}"


def send_email(to, subject, text, html=None):
    """Send to exactly one recipient. Never silently redirects to another address."""
    html = html or f"<pre>{text}</pre>"

    if SENDGRID_API_KEY and SENDGRID_FROM:
        ok, err = _send_sendgrid(to, subject, text, html)
        if ok:
            logger.info("Email sent to %s via SendGrid", to)
            return True, None
        logger.warning("SendGrid failed for %s: %s", to, err)
        # Only fall back when the fallback can actually reach THIS recipient.
        if _resend_usable():
            ok2, err2 = _send_resend(to, subject, text, html)
            if ok2:
                logger.info("Email sent to %s via Resend (fallback)", to)
                return True, None
            logger.warning("Resend fallback failed for %s: %s", to, err2)
            return False, f"{err}; {err2}"
        return False, err

    if _resend_usable():
        ok, err = _send_resend(to, subject, text, html)
        if ok:
            logger.info("Email sent to %s via Resend", to)
            return True, None
        logger.warning("Resend failed for %s: %s", to, err)
        return False, err

    return False, "No usable email provider configured (Resend sandbox sender cannot email other users)"
