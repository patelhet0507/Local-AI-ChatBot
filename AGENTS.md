# AGENTS.md

## Project
Local AI Chatbot — privacy-first, offline AI chat running on-device via llama.cpp.

## Stack
- **Frontend**: React 19, Vite 8, Framer Motion, react-markdown, react-syntax-highlighter
- **Backend**: Python 3, FastAPI, uvicorn, llama-cpp-python
- **Auth/DB**: Supabase (PostgreSQL)
- **Email**: SendGrid (primary), Resend (fallback)

## Commands
```bash
npm run build:frontend   # Build frontend (cd frontend && npm run build)
npm start                # Start backend (cd backend && ..\venv\Scripts\python main.py)
npm run dev              # Frontend dev server with HMR
cd frontend && npm run lint    # Lint frontend with oxlint
```

## Key Files
- `inference.py` — GGUF model loader + streaming chat generator
- `backend/main.py` — FastAPI app, all API endpoints
- `frontend/src/App.jsx` — Single-file React app (all components + state + UI)
- `frontend/src/index.css` — All styles (theme vars, glass design, responsive)
- `backend/db.py` — Supabase DB operations
- `backend/mailer.py` — SendGrid/Resend email delivery
- `backend/email_auth.py` — Email OTP, password reset, step-up verification
- `backend/auth.py` — Supabase auth client
- `backend/rate_limit.py` — Sliding window rate limiter

## Architecture
Frontend SPA (React/Vite) → FastAPI backend → llama-cpp-python (GGUF model).
Auth managed via Supabase. Frontend built to `frontend/dist/`, served by backend at `localhost:8000`.

## Conventions
- Single-file frontend app in `App.jsx` — all components defined in one file
- No TypeScript — plain JavaScript + JSDX
- CSS custom properties in `index.css` for theming
- No CSS modules — all global CSS
- Server status polling: `/api/model` every 30s
- Dark/light theme via `data-theme` attribute on `<html>`, persisted in localStorage
- Conversations, pinned convs, theme, system prompt all persisted in localStorage
- `.env` in project root for all configuration
- `models/*.gguf` gitignored (large files)

## Current State (what's built)
- Full auth: email/password, Google OAuth, Telegram bot login, 2FA, forgot password
- Streaming chat with markdown rendering + syntax highlighting
- Conversation CRUD, search, pin, rename, date grouping, export
- Message actions: copy, share, speak (TTS), edit, regenerate
- Settings: temperature, max_tokens, top_p, context window, system prompt, theme, 2FA
- Landing page: hero, features, steps, FAQ, contact form, server status indicator
- Code block copy button, auto-resizing textarea, clear input button
- Keyboard shortcuts modal, message search, auto-linkify URLs
- Desktop notifications + notification chime (when tab hidden)
- Rate limiting: auth 15/60s, chat 30/60s, api 120/60s
