# Local AI Chatbot

A privacy-first, offline AI chat application that runs entirely on your machine. No cloud, no tracking, no limits. Powered by [llama.cpp](https://github.com/ggerganov/llama.cpp) via `llama-cpp-python` with a React + FastAPI frontend/backend.

## Architecture

```
┌──────────────────────────────────────────────────┐
│          Browser (React + Vite SPA)              │
│  ┌────────────────────────────────────────────┐  │
│  │  Landing Page  │  Chat Interface           │  │
│  │  (Hero, Steps, │  (Streaming, Markdown,    │  │
│  │   FAQ, Contact)│   Code Highlighting)      │  │
│  └────────┬───────────────────────────────────┘  │
│           │ HTTP / SSE streams                    │
└───────────┼──────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────┐
│        FastAPI Backend  ────  Supabase            │
│  ┌──────────┬──────────┬──────────┐   Auth + DB  │
│  │ Auth     │ Chat     │ Account  │               │
│  │ (Email,  │ (LLM     │ (Profile,│               │
│  │  Google, │  Stream) │  2FA)    │               │
│  │  Telegram)│          │          │               │
│  └──────────┴──────────┴──────────┘               │
│              │                                    │
│     ┌────────▼────────┐                           │
│     │  llama-cpp-     │                           │
│     │  python (GGUF)  │                           │
│     │  Qwen2.5-0.5B  │                           │
│     └─────────────────┘                           │
└──────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Framer Motion, react-markdown, Prism syntax highlighting |
| Backend | Python 3, FastAPI, uvicorn |
| LLM | llama-cpp-python, GGUF models (default: Qwen2.5-0.5B-Instruct-Q4_K_M) |
| Auth | Supabase (email/password, Google OAuth, Telegram bot) |
| Database | Supabase (PostgreSQL — conversations, messages, profiles) |
| Email | SendGrid (primary) / Resend (fallback) |

## Prerequisites

- Python 3.10+
- Node.js 20+
- A Supabase project (free tier works)
- A GGUF model file (or use the default 0.5B model — see Setup)

## Quick Start

```bash
# 1. Clone and enter the project directory
cd local-ai-chatbot

# 2. Python virtual environment
python -m venv venv
.\venv\Scripts\activate    # Windows
source venv/bin/activate   # macOS/Linux

# 3. Install Python dependencies
pip install -r backend\requirements.txt

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials (see Configuration below)

# 6. Download a model
# Place a GGUF file in models/ (e.g., Qwen2.5-0.5B-Instruct-Q4_K_M.gguf)
# or set LOCAL_AI_MODEL_PATH in .env to point to your model

# 7. Build the frontend
npm run build:frontend

# 8. Start the server
npm start
# Opens at http://localhost:8000
```

## Configuration

All configuration is via `.env` in the project root. Required and optional variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service_role key (admin) |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key (client auth) |
| `SENDGRID_API_KEY` | * | SendGrid API key for email delivery |
| `SENDGRID_FROM` | * | SendGrid verified sender email |
| `RESEND_API_KEY` | * | Resend API key (fallback provider) |
| `RESEND_FROM` | * | Resend verified sender email |
| `TELEGRAM_BOT_TOKEN` | | Telegram bot token (for Telegram login) |
| `TELEGRAM_BOT_USERNAME` | | Bot username (e.g., `MyBot`) |
| `LOCAL_AI_MODEL_PATH` | | Path to a custom GGUF model file |
| `CONTACT_EMAIL` | | Admin email for contact form submissions |
| `RL_AUTH_LIMIT` | | Rate limit: auth requests (default: 15) |
| `RL_CHAT_LIMIT` | | Rate limit: chat requests (default: 30) |
| `RL_API_LIMIT` | | Rate limit: general API (default: 120) |

\* At least one email provider (SendGrid or Resend) must be configured for auth emails and contact form.

## Features

### Authentication
- Email/password registration with OTP verification
- Email/password login
- Google OAuth (Supabase SSO)
- Telegram bot login (polling-based)
- Forgot password flow (email reset)
- Session auto-refresh on expiry (401 → refresh)
- Two-factor authentication (email or Telegram OTP)
- Rate limiting on auth endpoints

### Chat Interface
- Streaming text generation (SSE via ReadableStream)
- RAF-batched character reveal with blinking caret
- "Thinking…" indicator while the first token is generated
- Stop generation (AbortController)
- Continue generating (resume a truncated reply)
- Friendly rate-limit message with retry countdown
- Markdown rendering with syntax-highlighted code blocks
- Copy code block button on hover
- Message editing (click pencil icon → edit → re-send)
- Message copy, share, regenerate, and TTS (speak) buttons
- Suggestion chips for quick prompts
- Welcome screen with orb icon
- Typing indicator while waiting

### Conversation Management
- Create, list, switch, search conversations
- Pin/unpin conversations (persisted in localStorage)
- Rename conversations (double-click title)
- Delete single or all conversations (with confirmation)
- Date grouping (Today / Yesterday / Older)
- Export conversation as Markdown / JSON / Plain-text (.md / .json / .txt download)
- Share conversation (copy to clipboard)

### Settings
- Temperature, Max Tokens, Top P, Context Window sliders
- "Recommended settings" button (auto-tunes Context Window to your available RAM)
- Saved personas (preset system prompts, stored in localStorage)
- System Prompt textarea (persisted in localStorage)
- Profile name editing
- Two-factor authentication toggle
- Theme toggle (dark/light, persisted)
- Change / set password
- Delete account
- Keyboard shortcuts modal (`?` button)

### Landing Page
- Animated hero with server health indicator
- Chat preview mockup (floating animation)
- Feature cards (3D tilt + spotlight on hover)
- "How it works" step cards
- FAQ accordion (5 questions)
- "Free forever" banner
- Contact form (sends to admin email)
- Dark/light theme toggle

### Email Delivery
- SendGrid (primary provider)
- Resend (automated fallback)
- Dark-themed HTML email templates with app branding
- Used for: OTP codes, login alerts, password resets, step-up verification, contact enquiries

## Project Structure

```
├── inference.py              # GGUF model loader + streaming chat generator
├── package.json              # Root scripts (build, start, dev)
├── .env                      # Environment configuration
├── .gitignore
│
├── backend/
│   ├── main.py               # FastAPI app, all API endpoints
│   ├── auth.py               # Supabase auth client setup
│   ├── db.py                 # Supabase database operations
│   ├── mailer.py             # SendGrid/Resend email delivery
│   ├── email_auth.py         # Email-based OTP, password reset, step-up
│   ├── telegram_auth.py      # Telegram bot login flow
│   ├── two_factor.py         # 2FA challenge store (TTL + attempt limiting)
│   ├── rate_limit.py         # Sliding window rate limiter
│   └── requirements.txt
│
├── frontend/
│   ├── index.html            # SPA entry point
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx          # React entry
│       ├── App.jsx           # Single-file app (all components, state, UI)
│       └── index.css         # All styles (theme vars, glass design, responsive)
│
└── models/
    └── *.gguf                # Model files (gitignored)
```

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register with email/phone |
| POST | `/api/auth/verify` | Verify OTP |
| POST | `/api/auth/login` | Login (returns session or 2FA challenge) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/resend` | Resend verification OTP |
| GET | `/api/auth/google/url` | Google OAuth redirect URL |
| POST | `/api/auth/oauth/complete` | Complete OAuth login |
| POST | `/api/auth/telegram/start` | Start Telegram login |
| GET | `/api/auth/telegram/status` | Poll Telegram status |
| POST | `/api/auth/forgot` | Request password reset |
| POST | `/api/auth/reset` | Reset password |
| POST | `/api/auth/2fa/verify` | Verify 2FA code |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Streaming chat completion (SSE) |

### Conversations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/{id}` | Get conversation with messages |
| PATCH | `/api/conversations/{id}` | Rename conversation |
| DELETE | `/api/conversations/{id}` | Delete conversation |

### Account
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Get profile |
| PATCH | `/api/profile` | Update name |
| POST | `/api/profile/2fa` | Toggle two-factor auth |
| GET | `/api/account` | Get account info |
| POST | `/api/account/verify/start` | Send step-up code |
| POST | `/api/account/password` | Change/set password |
| POST | `/api/account/delete` | Delete account |

### General
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api` | Health check + model info |
| GET | `/api/model` | Model label (used by the landing-page indicator) |
| POST | `/api/contact` | Contact form submission |
| POST | `/api/settings` | Save context window setting |

## Development

```bash
# Run frontend dev server (Vite HMR on :5173)
npm run dev

# Run backend independently
cd backend && ..\venv\Scripts\python main.py

# Lint frontend
cd frontend && npm run lint
```

The API proxy is configured so the backend serves the built frontend. In development, set `VITE_API_URL` to the backend URL if you need to run frontend dev server separately.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Send message |
| Shift + Enter | New line (in edit mode) |
| Escape | Cancel edit / rename |
| ↑ | Edit last message |

## License

MIT
