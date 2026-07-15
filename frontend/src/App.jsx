import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useInView } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<$1>')
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button className="code-copy-btn" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const str = String(children).replace(/\n$/, '')
    if (match) return (
      <div className="code-block-wrap">
        <CopyBtn text={str} />
        <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">{str}</SyntaxHighlighter>
      </div>
    )
    return <code className={className} {...props}>{children}</code>
  },
}

const MessageMarkdown = memo(function MessageMarkdown({ content }) {
  return <ReactMarkdown components={markdownComponents}>{linkify(content)}</ReactMarkdown>
})

function StreamingText({ content }) {
  const [shown, setShown] = useState('')
  const targetRef = useRef(content)
  const idxRef = useRef(0)
  targetRef.current = content

  useEffect(() => {
    let raf
    const tick = () => {
      const target = targetRef.current
      const cur = idxRef.current
      if (cur < target.length) {
        const remaining = target.length - cur
        const step = Math.max(1, Math.round(remaining / 5))
        idxRef.current = Math.min(target.length, cur + step)
        setShown(target.slice(0, idxRef.current))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="streaming-text">
      {shown}
      <span className="stream-caret" />
    </div>
  )
}

const API = import.meta.env.VITE_API_URL || '/api'

const spring = { type: 'spring', stiffness: 500, damping: 30 }
const springHeavy = { type: 'spring', stiffness: 500, damping: 32 }

const heroWords = ["Local", "AI,", "Zero", "Cloud."]

const suggestions = [
  { icon: "✦", text: "Explain quantum computing like I'm five" },
  { icon: "✎", text: "Write a short poem about the night sky" },
  { icon: "⚡", text: "Give me 5 ideas to boost my productivity" },
  { icon: "❡", text: "Summarise the benefits of a local AI assistant" },
]

const features = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: "100% Private",
    desc: "Every prompt stays on your machine. No data ever leaves your laptop — no servers, no logs, no trace."
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    title: "Blazing Fast",
    desc: "Optimized 3B model runs locally with CPU inference. No latency, no queue, always available."
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a4 4 0 014 4c0 2-2 4-4 4s-4-2-4-4 2-4 4-4z"/><path d="M20 20v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>,
    title: "Your Model",
    desc: "Swap any GGUF model — 1B to 70B. Full control over context size, temperature, and GPU layers."
  }
]

/* ── Magnetic Button ── */
function MagneticButton({ children, onClick, style }) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 250, damping: 18 })
  const springY = useSpring(y, { stiffness: 250, damping: 18 })

  const handleMouse = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const maxDist = 200
    const strength = Math.max(0, 1 - dist / maxDist)
    x.set(dx * 0.2 * strength)
    y.set(dy * 0.2 * strength)
  }, [x, y])

  const handleLeave = useCallback(() => {
    x.set(0)
    y.set(0)
  }, [x, y])

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ x: springX, y: springY, ...style }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="cta-button"
    >
      {children}
    </motion.button>
  )
}

/* ── Feature Card ── */
function FeatureCard({ icon, title, desc, i }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const handleMouse = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  return (
    <motion.div
      ref={ref}
      className="feature-card"
      onMouseMove={handleMouse}
      initial={{ rotateX: 45, y: 40, opacity: 0 }}
      animate={inView ? { rotateX: 0, y: 0, opacity: 1 } : {}}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
      style={{ perspective: 800 }}
    >
      <div className="spotlight" style={{ '--mx': `${mouse.x}px`, '--my': `${mouse.y}px` }} />
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </motion.div>
  )
}

/* ── Avatar ── */
function Avatar({ role }) {
  if (role === 'user') {
    return (
      <div className="msg-avatar user">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
    )
  }
  return (
    <div className="msg-avatar ai">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 2v2M15 2v2"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
    </div>
  )
}

/* ── Typing Indicator (Pulse cursor) ── */
function TypingDots() {
  return (
    <div className="typing-indicator">
      <span className="typing-cursor" />
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="thinking">
      <span>Thinking</span>
      <span className="thinking-dots"><i /><i /><i /></span>
    </div>
  )
}

/* ── Chat Preview (landing mock) ── */
function ChatPreview() {
  const demo = [
    { role: 'user', text: 'Write a haiku about running AI locally' },
    { role: 'assistant', text: 'Silent on your disk,\nthoughts spun from pure code —\nno cloud ever knows.' },
  ]
  return (
    <div className="preview-card">
      <div className="preview-bar">
        <span className="preview-dot" /><span className="preview-dot" /><span className="preview-dot" />
        <span className="preview-bar-title">Local AI Chatbot</span>
      </div>
      <div className="preview-body">
        {demo.map((m, i) => (
          <motion.div
            key={i}
            className={`preview-msg ${m.role}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="preview-bubble">{m.text}</div>
          </motion.div>
        ))}
        <motion.div
          className="preview-msg assistant"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="preview-bubble typing"><TypingDots /></div>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Hero Word ── */
function HeroWord({ word, delay }) {
  return (
    <span className="word">
      <motion.span
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      >
        {word}
      </motion.span>
    </span>
  )
}

/* ── FAQ Item ── */
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={"faq-item" + (open ? ' open' : '')}>
      <button className="faq-q" onClick={() => setOpen(o => !o)}>
        <span>{question}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="faq-chevron"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="faq-a-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="faq-a">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Auth Screen (gates the whole app) ── */
function AuthScreen({ onAuth, initialTwoFactor, onResetTwoFactor }) {
  const [mode, setMode] = useState('login')
  const [type, setType] = useState('email')
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [awaitOtp, setAwaitOtp] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tgWaiting, setTgWaiting] = useState(false)
  const [twoFactor, setTwoFactor] = useState(initialTwoFactor || null)
  const [resetMode, setResetMode] = useState(null) // 'request' | 'code'
  const [newPassword, setNewPassword] = useState('')
  const tgPoll = useRef(null)

  useEffect(() => () => { if (tgPoll.current) clearInterval(tgPoll.current) }, [])

  useEffect(() => { if (initialTwoFactor) { setTwoFactor(initialTwoFactor); setOtp('') } }, [initialTwoFactor])

  async function handleTelegram() {
    setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/telegram/start`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Telegram login unavailable'); return }
      window.open(data.url, '_blank')
      setTgWaiting(true)
      if (tgPoll.current) clearInterval(tgPoll.current)
      tgPoll.current = setInterval(async () => {
        try {
          const s = await fetch(`${API}/auth/telegram/status?code=${encodeURIComponent(data.code)}`)
          const sd = await s.json()
          if (sd.status === 'confirmed') {
            clearInterval(tgPoll.current); tgPoll.current = null
            setTgWaiting(false)
            onAuth(sd.session, sd.user)
          } else if (sd.status === 'two_factor') {
            clearInterval(tgPoll.current); tgPoll.current = null
            setTgWaiting(false)
            setOtp('')
            setTwoFactor({ challenge: sd.challenge, method: sd.method || 'telegram' })
          } else if (sd.status === 'expired' || sd.status === 'error') {
            clearInterval(tgPoll.current); tgPoll.current = null
            setTgWaiting(false)
            setError(sd.error || 'Telegram login expired. Try again.')
          }
        } catch {}
      }, 2000)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  function cancelTelegram() {
    if (tgPoll.current) { clearInterval(tgPoll.current); tgPoll.current = null }
    setTgWaiting(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier, password, name }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Registration failed'); return }
      setAwaitOtp(true)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  async function handleVerify(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier, token: otp }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Verification failed'); return }
      onAuth(data.session, data.user)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  async function handleLogin(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier, password }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Login failed'); return }
      if (data.two_factor_required) {
        setOtp('')
        setTwoFactor({ challenge: data.challenge, method: data.method || 'email' })
        return
      }
      onAuth(data.session, data.user)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  async function handleTwoFactor(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/2fa/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: twoFactor.challenge, token: otp }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || '2FA verification failed'); return }
      setTwoFactor(null)
      onAuth(data.session, data.user)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  function cancelTwoFactor() {
    setTwoFactor(null); setOtp(''); setError('')
    if (onResetTwoFactor) onResetTwoFactor()
  }

  async function handleForgot(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/forgot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not send reset code'); return }
      setOtp(''); setNewPassword(''); setResetMode('code')
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  async function handleReset(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const r = await fetch(`${API}/auth/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, token: otp, password: newPassword }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Reset failed'); return }
      setResetMode(null)
      onAuth(data.session, data.user)
    } catch { setError('Network error') }
    finally { setBusy(false) }
  }

  function cancelReset() {
    setResetMode(null); setOtp(''); setNewPassword(''); setError('')
  }

  async function handleGoogle() {
    setError('')
    try {
      const r = await fetch(`${API}/auth/google/url?redirect=${encodeURIComponent(window.location.origin + '/auth/callback')}`)
      const d = await r.json()
      if (!r.ok || !d.url) { setError(d.error || 'Google login unavailable'); return }
      window.location.href = d.url
    } catch { setError('Network error') }
  }

  async function handleResend() {
    setError('')
    try {
      await fetch(`${API}/auth/resend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier }),
      })
    } catch {}
  }

  return (
    <motion.div className="auth-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <div className="auth-split">
        <motion.aside
          className="auth-hero"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="auth-hero-brand">
            <div className="auth-hero-logo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 2v2M15 2v2"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
            </div>
            <span>Local AI Chatbot</span>
          </div>
          <h2 className="auth-hero-title">Your AI,<br />your hardware.</h2>
          <p className="auth-hero-text">Chat with a powerful language model that runs entirely on your machine. No accounts to leak, no data to ship.</p>
          <ul className="auth-hero-points">
            <li><span className="point-dot" /> Fully offline &amp; private</li>
            <li><span className="point-dot" /> Zero usage limits</li>
            <li><span className="point-dot" /> Swap any GGUF model</li>
          </ul>
        </motion.aside>

        <motion.div
          className="auth-card"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <h1 className="auth-logo">{resetMode ? 'Reset password' : (twoFactor ? 'Two-factor login' : (awaitOtp ? "Verify it's you" : (mode === 'login' ? 'Welcome back' : 'Create account')))}</h1>
          <p className="auth-sub">{resetMode ? (resetMode === 'request' ? 'Enter your email to receive a reset code' : 'Enter the code and choose a new password') : (twoFactor ? `Enter the 6-digit code sent to your ${twoFactor.method === 'telegram' ? 'Telegram chat' : 'email'}` : (awaitOtp ? `Enter the 6-digit code sent to your ${type}` : (mode === 'login' ? 'Log in to continue to your assistant' : 'Sign up to start chatting locally')))}</p>

          {resetMode ? (
            resetMode === 'request' ? (
              <form onSubmit={handleForgot}>
                <div className="auth-field">
                  <label>Email</label>
                  <input className="auth-input" type="email" placeholder="you@example.com" value={identifier} onChange={e => setIdentifier(e.target.value)} required autoFocus />
                </div>
                {error && <div className="auth-error">{error}</div>}
                <motion.button className="auth-submit" type="submit" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                  {busy ? 'Sending…' : 'Send reset code'}
                </motion.button>
                <button type="button" className="auth-link" onClick={cancelReset}>Back to login</button>
              </form>
            ) : (
              <form onSubmit={handleReset}>
                <div className="auth-field">
                  <label>Reset code</label>
                  <input className="auth-input auth-code" type="text" inputMode="numeric" placeholder="123456" value={otp} onChange={e => setOtp(e.target.value)} required autoFocus />
                </div>
                <div className="auth-field">
                  <label>New password</label>
                  <input className="auth-input" type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                </div>
                {error && <div className="auth-error">{error}</div>}
                <motion.button className="auth-submit" type="submit" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                  {busy ? 'Resetting…' : 'Reset & sign in'}
                </motion.button>
                <button type="button" className="auth-link" onClick={() => { setResetMode('request'); setError('') }}>Use a different email</button>
              </form>
            )
          ) : twoFactor ? (
            <form onSubmit={handleTwoFactor}>
              <div className="auth-field">
                <label>Authentication code</label>
                <input className="auth-input auth-code" type="text" inputMode="numeric" placeholder="123456" value={otp} onChange={e => setOtp(e.target.value)} required autoFocus />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <motion.button className="auth-submit" type="submit" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </motion.button>
              <button type="button" className="auth-link" onClick={cancelTwoFactor}>Back to login</button>
            </form>
          ) : !awaitOtp ? (
            <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
              {mode === 'register' && type === 'email' && (
                <div className="auth-field">
                  <label>Full name</label>
                  <input className="auth-input" type="text" placeholder="Jane Doe" value={name} onChange={e => setName(e.target.value)} required />
                </div>
              )}
              <div className="auth-field">
                <label>Continue with</label>
                <div className="auth-type-toggle">
                  <button type="button" className={type === 'email' ? 'active' : ''} onClick={() => setType('email')}>Email</button>
                  <button type="button" className={type === 'telegram' ? 'active' : ''} onClick={() => setType('telegram')}>Telegram</button>
                </div>
              </div>
              {type === 'email' ? (
                <>
                  <div className="auth-field">
                    <label>Email</label>
                    <input
                      className="auth-input"
                      type="email"
                      placeholder="you@example.com"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                  <div className="auth-field">
                    <label>Password</label>
                    <input className="auth-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>
                  {error && <div className="auth-error">{error}</div>}
                  <motion.button className="auth-submit" type="submit" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                    {busy ? 'Please wait…' : (mode === 'login' ? 'Log In' : 'Create Account')}
                  </motion.button>
                  {mode === 'login' && (
                    <button type="button" className="auth-link" onClick={() => { setResetMode('request'); setError('') }}>Forgot password?</button>
                  )}
                </>
              ) : (
                <div className="auth-field">
                  {error && <div className="auth-error">{error}</div>}
                  {tgWaiting ? (
                    <div className="tg-waiting">
                      <div className="tg-spinner" />
                      <p>Waiting for Telegram… press <strong>Start</strong> in the chat that opened.</p>
                      <button type="button" className="auth-link" onClick={cancelTelegram}>Cancel</button>
                    </div>
                  ) : (
                    <motion.button className="auth-submit auth-telegram" type="button" onClick={handleTelegram} disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                      {busy ? 'Opening Telegram…' : 'Continue with Telegram'}
                    </motion.button>
                  )}
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerify}>
              <div className="auth-field">
                <label>Verification code</label>
                <input className="auth-input auth-code" type="text" placeholder="123456" value={otp} onChange={e => setOtp(e.target.value)} required autoFocus />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <motion.button className="auth-submit" type="submit" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ boxShadow: '0 0 28px var(--accent-glow)' }}>
                {busy ? 'Verifying…' : 'Verify'}
              </motion.button>
              <button type="button" className="auth-link" onClick={handleResend}>Resend code</button>
            </form>
          )}

          {!awaitOtp && !twoFactor && !resetMode && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <motion.button type="button" className="auth-google" onClick={handleGoogle} whileTap={{ scale: 0.97 }} whileHover={{ y: -1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </motion.button>
            </>
          )}

          {!awaitOtp && !twoFactor && !resetMode && (
            <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
            </button>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ── App ── */
function App() {
  const [phase, setPhase] = useState('landing')
  const [transitioning, setTransitioning] = useState(false)

  const [convs, setConvs] = useState([])
  const [convId, setConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const endRef = useRef(null)
  const messagesRef = useRef(null)
  const [atBottom, setAtBottom] = useState(true)

  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(256)
  const [topP, setTopP] = useState(0.95)
  const [contextWindow, setContextWindow] = useState(2048)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('model')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const [twoFA, setTwoFA] = useState(false)
  const [twoFABusy, setTwoFABusy] = useState(false)
  const [account, setAccount] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [modal, setModal] = useState(null) // { type: 'twofa'|'password'|'delete', next? }
  const [mCurrent, setMCurrent] = useState('')
  const [mNew, setMNew] = useState('')
  const [mCode, setMCode] = useState('')
  const [mCodeSent, setMCodeSent] = useState(false)
  const [mSending, setMSending] = useState(false)
  const [mError, setMError] = useState('')
  const [mBusy, setMBusy] = useState(false)

  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('system_prompt') || '')
  const [personas, setPersonas] = useState(() => { try { return JSON.parse(localStorage.getItem('personas') || '[]') } catch { return [] } })
  const [personaName, setPersonaName] = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => { localStorage.setItem('system_prompt', systemPrompt) }, [systemPrompt])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    let dead = false, timer
    const ping = () => fetch(`${API}/model`, { headers: authHdr() }).then(r => {
      if (dead) return; setServerOk(true)
      if (r.ok) r.json().then(d => setModelInfo(d.model?.split('\\').pop()?.split('/').pop() || '')).catch(() => {})
    }).catch(() => { if (!dead) setServerOk(false) })
    ping(); timer = setInterval(ping, 30000)
    return () => { dead = true; clearInterval(timer) }
  }, [])

  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const [pinnedConvs, setPinnedConvs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinned_convs') || '[]') } catch { return [] }
  })
  const [convSearchOpen, setConvSearchOpen] = useState(false)
  const [convSearchText, setConvSearchText] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [convSearch, setConvSearch] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', message: '' })
  const [contactBusy, setContactBusy] = useState(false)
  const [contactDone, setContactDone] = useState(false)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)
  function pushToast(text) {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 1900)
  }

  const [token, setToken] = useState(() => localStorage.getItem('sb_access_token') || '')
  const [authUser, setAuthUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sb_user') || 'null') } catch { return null }
  })
  const [modelInfo, setModelInfo] = useState(null)
  const [availableModels, setAvailableModels] = useState([])
  const [currentModel, setCurrentModel] = useState('')
  const [serverOk, setServerOk] = useState(null) // null = checking, true = alive, false = dead
  const [oauthChallenge, setOauthChallenge] = useState(null)

  function authHdr() {
    const t = localStorage.getItem('sb_access_token') || ''
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  useEffect(() => {
    const hash = window.location.hash || ''
    const isCallback = window.location.pathname.startsWith('/auth/callback')
    if (!hash.includes('access_token') && !isCallback) return
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const at = params.get('access_token')
    const rt = params.get('refresh_token')
    window.history.replaceState(null, '', '/')
    if (!at) return
    fetch(`${API}/auth/oauth/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
      body: JSON.stringify({ access_token: at, refresh_token: rt || '' }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.two_factor_required) {
          // Gate entry on the 2FA step; don't store the session until verified.
          setOauthChallenge({ challenge: d.challenge, method: d.method || 'email' })
          return
        }
        localStorage.setItem('sb_access_token', at)
        if (rt) localStorage.setItem('sb_refresh_token', rt)
        setToken(at)
        const u = d.user || d
        setAuthUser(u)
        localStorage.setItem('sb_user', JSON.stringify(u))
      })
      .catch(() => {})
  }, [])

  function handleAuth(session, u) {
    const access = typeof session === 'string' ? session : session.access_token
    const refresh = typeof session === 'string' ? null : session.refresh_token
    localStorage.setItem('sb_access_token', access)
    if (refresh) localStorage.setItem('sb_refresh_token', refresh)
    localStorage.setItem('sb_user', JSON.stringify(u))
    setToken(access)
    setAuthUser(u)
  }

  function handleLogout() {
    localStorage.removeItem('sb_access_token')
    localStorage.removeItem('sb_refresh_token')
    localStorage.removeItem('sb_user')
    setToken('')
    setAuthUser(null)
    setConvs([])
    setConvId(null)
    setMessages([])
    setPhase('landing')
  }

  async function refreshSession() {
    const refresh = localStorage.getItem('sb_refresh_token')
    if (!refresh) return false
    try {
      const r = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!r.ok) return false
      const data = await r.json()
      localStorage.setItem('sb_access_token', data.session.access_token)
      localStorage.setItem('sb_refresh_token', data.session.refresh_token)
      setToken(data.session.access_token)
      return true
    } catch {
      return false
    }
  }

  async function authFetch(url, opts = {}) {
    const build = () => ({
      ...opts,
      headers: { ...(opts.headers || {}), ...authHdr() },
    })
    let res = await fetch(url, build())
    if (res.status === 401) {
      const ok = await refreshSession()
      if (ok) {
        res = await fetch(url, build())
      } else {
        handleLogout()
      }
    }
    return res
  }

  function savePinState(pins) {
    setPinnedConvs(pins)
    localStorage.setItem('pinned_convs', JSON.stringify(pins))
  }

  function togglePin(id) {
    const pins = pinnedConvs.includes(id)
      ? pinnedConvs.filter(p => p !== id)
      : [...pinnedConvs, id]
    savePinState(pins)
  }

  function shareConv(conv) {
    const title = conv.title || 'Conversation'
    const lines = [`${title}\n${'='.repeat(title.length)}\n`]
    if (conv.messages) {
      for (const m of conv.messages) {
        const role = m.role === 'user' ? 'You' : 'AI'
        lines.push(`\n[${role}]\n${m.content}`)
      }
    }
    navigator.clipboard.writeText(lines.join(''))
    pushToast('Conversation copied')
  }

  async function deleteConv(id) {
    try {
      await authFetch(`${API}/conversations/${id}`, { method: 'DELETE' })
    } catch {}
    setConvs(prev => prev.filter(c => c.id !== id))
    if (convId === id) {
      const remaining = convs.filter(c => c.id !== id)
      if (remaining.length > 0) loadConv(remaining[0].id)
      else { setConvId(null); setMessages([]) }
    }
    setDeleteConfirm(null)
  }

  function copyText(text) {
    navigator.clipboard.writeText(text)
    pushToast('Copied to clipboard')
  }

  function exportConv(format = 'md') {
    if (!convId || messages.length === 0) return
    const title = convs.find(c => c.id === convId)?.title || 'conversation'
    const safe = title.replace(/[^a-z0-9]+/gi, '_')
    let blob, ext, label
    if (format === 'json') {
      blob = new Blob([JSON.stringify({ title, messages }, null, 2)], { type: 'application/json' })
      ext = 'json'; label = 'Exported as JSON'
    } else if (format === 'txt') {
      const txt = messages.map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n\n')
      blob = new Blob([`${title}\n\n${txt}`], { type: 'text/plain' })
      ext = 'txt'; label = 'Exported as Plain text'
    } else {
      const md = messages.map(m => (m.role === 'user' ? '## You\n' : '## Assistant\n') + m.content + '\n').join('\n---\n\n')
      blob = new Blob([`# ${title}\n\n${md}`], { type: 'text/markdown' })
      ext = 'md'; label = 'Exported as Markdown'
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${safe}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
    pushToast(label)
  }

  async function deleteAllConvs() {
    try {
      const all = convs.map(c => c.id)
      await Promise.all(all.map(id => authFetch(`${API}/conversations/${id}`, { method: 'DELETE' })))
      setConvs([])
      setConvId(null)
      setMessages([])
      setDeleteAllConfirm(false)
      pushToast('All conversations deleted')
    } catch { pushToast('Failed to delete all') }
  }

  async function renameConv(id, title) {
    if (!title.trim()) return
    try {
      await authFetch(`${API}/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) })
      setConvs(prev => prev.map(c => c.id === id ? { ...c, title: title.trim() } : c))
    } catch {}
  }

  function speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      window.speechSynthesis.speak(u)
    }
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
  }

  function handleScroll() {
    const el = messagesRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance < 80)
  }

  function scrollToBottom() {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAtBottom(true)
  }

  function sendSuggestion(text) {
    if (!convId) return
    sendMessage(null, text)
  }

  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() }, [])
  useEffect(() => { inputRef.current?.focus() }, [convId])

  useEffect(() => {
    if (phase !== 'chat') return
    authFetch(`${API}/conversations`)
      .then(r => r.json())
      .then(data => {
        setConvs(data)
        if (data.length > 0) loadConv(data[0].id)
        else newConv()
      })
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadAccount() {
    authFetch(`${API}/account`)
      .then(r => r.json())
      .then(a => {
        if (a && !a.error) {
          setAccount(a)
          setTwoFA(!!a.two_factor_enabled)
          setNameDraft(a.name || authUser?.name || '')
        }
      })
      .catch(() => {})
  }

  async function saveName() {
    const nm = nameDraft.trim()
    if (!nm || nameBusy) return
    setNameBusy(true)
    try {
      const r = await authFetch(`${API}/profile`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nm }),
      })
      const d = await r.json()
      if (!r.ok) { pushToast(d.error || 'Could not update name'); return }
      setAccount(a => a ? { ...a, name: nm } : a)
      const nu = { ...(authUser || {}), name: nm }
      setAuthUser(nu)
      localStorage.setItem('sb_user', JSON.stringify(nu))
      pushToast('Name updated')
    } catch { pushToast('Network error') }
    finally { setNameBusy(false) }
  }

  useEffect(() => {
    if (phase !== 'chat') return
    authFetch(`${API}/profile`)
      .then(r => r.json())
      .then(p => { if (p) setTwoFA(!!p.two_factor_enabled) })
      .catch(() => {})
    loadAccount()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyTwoFA(next, password, code) {
    setTwoFABusy(true)
    try {
      const r = await authFetch(`${API}/profile/2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, password: password || '', code: code || '' }),
      })
      const data = await r.json()
      if (!r.ok) return { ok: false, error: data.error || '2FA update failed' }
      setTwoFA(!!data.two_factor_enabled)
      setAccount(a => a ? { ...a, two_factor_enabled: !!data.two_factor_enabled } : a)
      pushToast(next ? 'Two-factor enabled' : 'Two-factor disabled')
      return { ok: true }
    } catch { return { ok: false, error: 'Network error' } }
    finally { setTwoFABusy(false) }
  }

  function onToggleTwoFA() {
    const next = !twoFA
    if (account && !account.has_password && account.method === 'telegram') applyTwoFA(next, '', '')
    else openModal({ type: 'twofa', next })
  }

  function modalNeedsCode(type) {
    if (!account || account.method === 'telegram' || !account.email) return false
    if (type === 'password') return true
    return !account.has_password
  }

  function modalNeedsPassword(type) {
    if (type === 'password') return false
    return !!account?.has_password
  }

  function openModal(m) {
    setMCurrent(''); setMNew(''); setMCode(''); setMCodeSent(false); setMError(''); setModal(m)
    if (modalNeedsCode(m.type)) sendStepupCode()
  }
  function closeModal() { setModal(null) }

  async function sendStepupCode() {
    setMError(''); setMSending(true)
    try {
      const r = await authFetch(`${API}/account/verify/start`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setMError(d.error || 'Could not send code'); return }
      setMCodeSent(true); pushToast('Verification code sent to your email')
    } catch { setMError('Network error') }
    finally { setMSending(false) }
  }

  async function submitModal(e) {
    e.preventDefault(); setMError(''); setMBusy(true)
    try {
      if (modal.type === 'twofa') {
        const res = await applyTwoFA(modal.next, mCurrent, mCode)
        if (!res.ok) { setMError(res.error); return }
        closeModal()
      } else if (modal.type === 'password') {
        const r = await authFetch(`${API}/account/password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: mCurrent, new_password: mNew, code: mCode }),
        })
        const d = await r.json()
        if (!r.ok) { setMError(d.error || 'Could not update password'); return }
        pushToast('Password updated'); loadAccount(); closeModal()
      } else if (modal.type === 'delete') {
        const r = await authFetch(`${API}/account/delete`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: mCurrent, code: mCode }),
        })
        const d = await r.json()
        if (!r.ok) { setMError(d.error || 'Could not delete account'); return }
        closeModal(); handleLogout()
      }
    } catch { setMError('Network error') }
    finally { setMBusy(false) }
  }

  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, atBottom])

  async function loadConv(id) {
    setConvId(id)
    setMessages([])
    setLoading(false)
    try {
      const r = await authFetch(`${API}/conversations/${id}`)
      const data = await r.json()
      if (data.messages) setMessages(data.messages)
    } catch {}
  }

  async function newConv() {
    try {
      const r = await authFetch(`${API}/conversations`, { method: 'POST' })
      const data = await r.json()
      setConvs(prev => [data, ...prev])
      setConvId(data.id)
      setMessages([])
    } catch {}
  }

  async function saveSettings() {
    setSettingsBusy(true)
    try {
      const r = await authFetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_window: contextWindow }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) pushToast(data.error || 'Failed to apply settings')
      else pushToast(data.note || 'Settings saved')
    } catch {
      pushToast('Failed to apply settings')
    } finally {
      setSettingsBusy(false)
      setSettingsOpen(false)
    }
  }

  function savePersona() {
    const name = personaName.trim() || `Persona ${personas.length + 1}`
    const next = [...personas, { id: Date.now().toString(), name, prompt: systemPrompt }]
    setPersonas(next)
    localStorage.setItem('personas', JSON.stringify(next))
    setPersonaName('')
    pushToast(`Saved persona: ${name}`)
  }
  function loadPersona(id) {
    const p = personas.find(x => x.id === id)
    if (p) { setSystemPrompt(p.prompt); pushToast(`Loaded: ${p.name}`) }
  }
  function deletePersona(id) {
    const next = personas.filter(x => x.id !== id)
    setPersonas(next)
    localStorage.setItem('personas', JSON.stringify(next))
  }

  function applyRecommended() {
    const ram = navigator.deviceMemory || 8           // approx GB, may be undefined
    const cores = navigator.hardwareConcurrency || 4
    setTemperature(0.7)
    setTopP(0.95)
    setMaxTokens(ram >= 8 ? 1024 : 512)
    // ponytail: context window is now real (reloads model) — scale to available RAM
    setContextWindow(ram <= 4 ? 2048 : ram <= 8 ? 4096 : 8192)
    void cores
  }

  useEffect(() => {
    if (!settingsOpen) return
    fetch(`${API}/model`).then(r => r.json()).then(d => {
      if (Array.isArray(d.models)) setAvailableModels(d.models)
      if (d.current) setCurrentModel(d.current)
    }).catch(() => {})
  }, [settingsOpen])

  async function switchModel(name) {
    if (!name || name === currentModel) return
    try {
      const r = await authFetch(`${API}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return pushToast(data.error || 'Failed to switch model')
      setCurrentModel(name)
      setModelInfo(data.current || name)
      pushToast(`Switched to ${name}`)
    } catch {
      pushToast('Failed to switch model')
    }
  }

  async function sendMessage(e, msgText) {
    if (e) e.preventDefault()
    const text = msgText || input
    if (!text.trim() || loading || !convId) return

    const ts = new Date().toISOString()
    const userMsg = { role: 'user', content: text, created_at: ts }
    setMessages(prev => [...prev, userMsg])
    if (!msgText) setInput('')
    setLoading(true)

    const history = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages, userMsg] : [...messages, userMsg]
    const aiMsg = { role: 'assistant', content: '', created_at: ts }
    setMessages(prev => [...prev, aiMsg])

    setEditingIdx(null)
    setEditDraft('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await authFetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId, messages: history,
          temperature, max_tokens: maxTokens, top_p: topP,
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        let msg = 'Request failed.'
        try { const j = await res.json(); if (j && j.error) msg = j.error } catch {}
        if (res.status === 429) msg = `Rate limited — try again in ${res.headers.get('Retry-After') || 'a few'}s.`
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: `⚠️ ${msg}` }
          return next
        })
        pushToast(msg)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let frame = null
      const flush = () => {
        frame = null
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], content: buffer }
          return next
        })
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (frame === null) frame = requestAnimationFrame(flush)
      }
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
      if (document.hidden) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Local AI Chatbot', { body: 'Your response is ready.', icon: '/favicon.ico' })
        }
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.connect(g); g.connect(ctx.destination)
          osc.frequency.value = 660; g.gain.value = 0.08
          osc.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
          osc.stop(ctx.currentTime + 0.15)
        } catch {}
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: 'Error: could not reach the server.' }
        return next
      })
    } finally {
      setLoading(false)
      abortRef.current = null
      const r = await authFetch(`${API}/conversations`)
      setConvs(await r.json())
    }
  }

  async function continueGeneration() {
    if (loading || !convId) return
    const idx = messages.length - 1
    if (messages[idx]?.role !== 'assistant') return
    setLoading(true)
    const history = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : [...messages]
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await authFetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId, messages: history,
          temperature, max_tokens: maxTokens, top_p: topP,
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        let msg = 'Continue failed.'
        try { const j = await res.json(); if (j && j.error) msg = j.error } catch {}
        pushToast(msg)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = messages[idx].content
      let frame = null
      const flush = () => {
        frame = null
        setMessages(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], content: buffer }
          return next
        })
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (frame === null) frame = requestAnimationFrame(flush)
      }
      if (frame !== null) cancelAnimationFrame(frame)
      flush()
    } catch (err) {
      if (err.name === 'AbortError') return
      pushToast('Failed to continue')
    } finally {
      setLoading(false)
      abortRef.current = null
      const r = await authFetch(`${API}/conversations`)
      setConvs(await r.json())
    }
  }

  function launchChat() {
    setTransitioning(true)
    setTimeout(() => {
      setPhase('chat')
      setTransitioning(false)
    }, 600)
  }

  async function handleContactSubmit(e) {
    e.preventDefault()
    setContactBusy(true)
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contactForm, email: authUser?.email || '' }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to send')
      setContactDone(true)
    } catch (err) {
      pushToast(err.message)
    } finally {
      setContactBusy(false)
    }
  }

  /* ══════════ CHAT UI ══════════ */
  if (phase === 'chat') {
    return (
      <div className="chat-layout">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              className="chat-sidebar"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={spring}
            >
              <div className="sidebar-header">
                 <motion.button className="new-chat-btn" onClick={newConv} whileTap={{ scale: 0.97 }}>+ New Chat</motion.button>
              </div>
              <div className="sidebar-search">
                <input className="sidebar-search-input" placeholder="Search conversations…" value={convSearch} onChange={e => setConvSearch(e.target.value)} />
              </div>
              <div className="conv-list">
                {(() => {
                  const filtered = [...convs].filter(c => !convSearch || c.title?.toLowerCase().includes(convSearch.toLowerCase())).sort((a, b) => {
                    const ap = pinnedConvs.includes(a.id) ? 0 : 1
                    const bp = pinnedConvs.includes(b.id) ? 0 : 1
                    return ap - bp || new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
                  })
                  const groups = {}
                  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const yesterday = new Date(today.getTime() - 86400000)
                  for (const c of filtered) {
                    const d = new Date(c.updated_at || c.created_at)
                    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                    let key = 'Older'
                    if (date.getTime() === today.getTime()) key = 'Today'
                    else if (date.getTime() === yesterday.getTime()) key = 'Yesterday'
                    ;(groups[key] || (groups[key] = [])).push(c)
                  }
                  const order = ['Today', 'Yesterday', 'Older']
                  const els = []
                  for (const key of order) {
                    const items = groups[key]
                    if (!items) continue
                    els.push(<div key={key} className="conv-date">{key}</div>)
                    for (const c of items) {
                      const isRenaming = renamingId === c.id
                      els.push(
                        <motion.div key={c.id} layout
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          className={`conv-item ${convId === c.id ? 'active' : ''}`}
                        >
                          <div className="conv-item-main" onClick={() => { if (!isRenaming) loadConv(c.id) }}>
                            {isRenaming ? (
                              <input className="conv-rename-input" autoFocus value={renameDraft}
                                onChange={e => setRenameDraft(e.target.value)}
                                onBlur={e => { renameConv(c.id, e.target.value); setRenamingId(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') { renameConv(c.id, e.target.value); setRenamingId(null) } if (e.key === 'Escape') setRenamingId(null) }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span className="conv-title" onDoubleClick={() => { setRenamingId(c.id); setRenameDraft(c.title || '') }}>{c.title}{convId === c.id && messages.length > 0 && <span className="conv-msgs">{messages.length} msgs</span>}</span>
                            )}
                          </div>
                          <div className="conv-item-actions">
                            <button className="conv-action-btn" title={pinnedConvs.includes(c.id) ? 'Unpin' : 'Pin'} onClick={() => togglePin(c.id)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill={pinnedConvs.includes(c.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
                            </button>
                            <button className="conv-action-btn" title="Share" onClick={() => shareConv(c)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                            </button>
                            <button className="conv-action-btn danger" title="Delete" onClick={() => setDeleteConfirm(c.id)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            </button>
                          </div>
                        </motion.div>
                      )
                    }
                  }
                  return els
                })()}
              </div>
              <div className="sidebar-footer">
                <div className="account-avatar">
                  {(authUser?.name || authUser?.email || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div className="account-info">
                  <span className="account-name">{authUser?.name || 'Account'}</span>
                  <span className="account-sub" title={authUser?.email}>{authUser?.email || 'Signed in'}</span>
                </div>
                <motion.button className="theme-toggle-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} whileTap={{ scale: 0.93 }} title="Toggle theme">
                  {theme === 'dark' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                  )}
                </motion.button>
                <motion.button className="account-logout" onClick={handleLogout} whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.08 }} title="Log out">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                </motion.button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className={`chat-container ${settingsOpen ? 'settings-open' : ''}`}>
          <div className="chat-header">
            <motion.button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} whileTap={{ scale: 0.97 }} whileHover={{ x: -2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </motion.button>
            <div className="chat-header-info">
              <span className="chat-header-title">Local AI Chatbot</span>
              <span className="chat-header-status"><span className="status-dot" /> Local model · online</span>
            </div>
            {messages.length > 0 && (
              <div style={{ position: 'relative' }}>
                <motion.button className="icon-btn" onClick={() => setExportMenu(o => !o)} whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.08 }} title="Export conversation">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </motion.button>
                {exportMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setExportMenu(false)} />
                    <div className="export-menu">
                      <button onClick={() => { exportConv('md'); setExportMenu(false) }}>Markdown</button>
                      <button onClick={() => { exportConv('json'); setExportMenu(false) }}>JSON</button>
                      <button onClick={() => { exportConv('txt'); setExportMenu(false) }}>Plain text</button>
                    </div>
                  </>
                )}
              </div>
            )}
            <motion.button className="icon-btn" onClick={() => setConvSearchOpen(o => !o)} whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.08 }} title="Search messages">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </motion.button>
            <motion.button className="icon-btn" onClick={() => setShortcutsOpen(true)} whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.08 }} title="Keyboard shortcuts">
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9rem' }}>?</span>
            </motion.button>
            <motion.button className="icon-btn" onClick={() => setSettingsOpen(true)} whileTap={{ scale: 0.97 }} whileHover={{ rotate: 45 }} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </motion.button>
          </div>

          {convSearchOpen && (
            <div className="conv-search-bar">
              <input className="conv-search-input" autoFocus placeholder="Search messages…" value={convSearchText} onChange={e => setConvSearchText(e.target.value)} />
              <button className="conv-search-close" onClick={() => { setConvSearchOpen(false); setConvSearchText('') }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
          )}

          <div className="chat-messages" ref={messagesRef} onScroll={handleScroll}>
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <motion.div
                  key="welcome"
                  className="welcome"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="welcome-orb">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 2v2M15 2v2"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
                  </div>
                  <h2 className="welcome-title">How can I help you today?</h2>
                  <p className="welcome-sub">Your private AI assistant is ready. Everything stays on your machine.</p>
                  <div className="suggestions">
                    {suggestions.map((s, i) => (
                      <motion.button
                        key={s.text}
                        className="suggestion-chip"
                        onClick={() => sendSuggestion(s.text)}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        whileHover={{ y: -3, borderColor: 'var(--border-luminous)' }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span className="suggestion-icon">{s.icon}</span>
                        <span className="suggestion-text">{s.text}</span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  className="message-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {messages.map((msg, i) => {
                    const match = convSearchText && msg.content?.toLowerCase().includes(convSearchText.toLowerCase())
                    if (convSearchText && !match) return null
                    return (
                    <motion.div
                      key={`${msg.role}-${i}`}
                      className={`message-row ${msg.role}`}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                       transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      <Avatar role={msg.role} />
                      <div className="message-group">
                        <div className={`message-bubble ${msg.role}`}>
                          {msg.role === 'assistant' && msg.content ? (
                            loading && i === messages.length - 1 ? (
                              <StreamingText content={msg.content} />
                            ) : (
                              <MessageMarkdown content={msg.content} />
                            )
                          ) : msg.role === 'user' && editingIdx === i ? (
                            <textarea className="msg-edit-input" autoFocus value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(null, editDraft) }; if (e.key === 'Escape') setEditingIdx(null) }}
                              onBlur={() => setEditingIdx(null)}
                            />
                          ) : msg.content ? msg.content : (
                            msg.role === 'assistant' && loading && i === messages.length - 1 ? <ThinkingIndicator /> : ''
                          )}
                        </div>
                        {msg.role === 'user' && msg.content && editingIdx !== i && (
                          <div className="msg-actions">
                            <motion.button className="msg-action-btn" title="Edit" onClick={() => { setEditingIdx(i); setEditDraft(msg.content) }} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </motion.button>
                            <motion.button className="msg-action-btn" title="Copy" onClick={() => copyText(msg.content)} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </motion.button>
                            <motion.button className="msg-action-btn" title="Share" onClick={() => shareConv({ title: convs.find(c => c.id === convId)?.title, messages })} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                            </motion.button>
                          </div>
                        )}
                        {msg.role === 'assistant' && msg.content && (
                          <div className="msg-actions">
                            {i === messages.length - 1 && (
                              <motion.button className="msg-action-btn" title="Continue generating" onClick={() => continueGeneration()} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                              </motion.button>
                            )}
                            <motion.button className="msg-action-btn" title="Speak" onClick={() => speakText(msg.content)} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
                            </motion.button>
                            <motion.button className="msg-action-btn" title="Copy" onClick={() => copyText(msg.content)} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </motion.button>
                            <motion.button className="msg-action-btn" title="Share" onClick={() => shareConv({ title: convs.find(c => c.id === convId)?.title, messages })} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                            </motion.button>
                            <motion.button className="msg-action-btn" title="Ask Again" onClick={() => { sendMessage(null, messages[i - 1]?.content); pushToast('Regenerating…') }} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.12, color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg>
                            </motion.button>
                          </div>
                        )}
                        {msg.created_at && (
                          <div className="msg-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        )}
                      </div>
                    </motion.div>
                  )})}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!atBottom && messages.length > 0 && (
                <motion.button
                  className="scroll-bottom-btn"
                  onClick={scrollToBottom}
                  initial={{ opacity: 0, y: 14, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.8 }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.9 }}
                  title="Scroll to bottom"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </motion.button>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>

          <form onSubmit={sendMessage} className="chat-input-area">
            <div className="chat-input-wrap">
              <textarea ref={inputRef} className="chat-input" placeholder="Message your local AI…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} rows={1} disabled={loading} />
              {input && !loading && (
                <button type="button" className="clear-input-btn" onClick={() => { setInput(''); inputRef.current?.focus() }} tabIndex={-1}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
              {loading ? (
                <motion.button
                  type="button" className="stop-btn"
                  onClick={handleStop}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.93 }}
                  whileHover={{ rotate: 90 }}
                  title="Stop generating"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </motion.button>
              ) : (
                <motion.button
                  type="submit" disabled={!convId}
                  className={`send-btn ${input.trim() ? 'active' : ''}`}
                  whileHover={input.trim() ? { scale: 1.06 } : {}}
                  whileTap={input.trim() ? { scale: 0.97 } : {}}
                  animate={input.trim() ? { boxShadow: ['0 0 0px var(--accent-glow)', '0 0 22px var(--accent-glow)', '0 0 0px var(--accent-glow)'] } : {}}
                  transition={input.trim() ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                  </svg>
                </motion.button>
              )}
            </div>
          </form>
        </div>

        <AnimatePresence>
          {deleteConfirm && (
            <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <motion.div className="settings-backdrop" onClick={() => setDeleteConfirm(null)} />
              <motion.div
                className="settings-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}
              >
                <h2 style={{ marginBottom: '0.5rem' }}>Delete conversation?</h2>
                <p className="settings-sub" style={{ marginBottom: '2rem' }}>This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <motion.button className="new-chat-btn" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setDeleteConfirm(null)} whileTap={{ scale: 0.96 }}>Cancel</motion.button>
                  <motion.button className="new-chat-btn" style={{ background: '#ef4444' }} onClick={() => deleteConv(deleteConfirm)} whileTap={{ scale: 0.96 }}>Delete</motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
          {deleteAllConfirm && (
            <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <motion.div className="settings-backdrop" onClick={() => setDeleteAllConfirm(false)} />
              <motion.div
                className="settings-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}
              >
                <h2 style={{ marginBottom: '0.5rem' }}>Delete all conversations?</h2>
                <p className="settings-sub" style={{ marginBottom: '2rem' }}>This permanently deletes every conversation. This cannot be undone.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <motion.button className="new-chat-btn" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setDeleteAllConfirm(false)} whileTap={{ scale: 0.96 }}>Cancel</motion.button>
                  <motion.button className="new-chat-btn" style={{ background: '#ef4444' }} onClick={deleteAllConvs} whileTap={{ scale: 0.96 }}>Delete all</motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
          {settingsOpen && (
            <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <motion.div className="settings-backdrop" onClick={() => setSettingsOpen(false)} />
              <motion.div
                className="settings-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              >
                <button className="settings-close" onClick={() => setSettingsOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
                <h2>Settings</h2>
                <div className="settings-tabs">
                  <button type="button" className={settingsTab === 'model' ? 'active' : ''} onClick={() => setSettingsTab('model')}>Model</button>
                  <button type="button" className={settingsTab === 'account' ? 'active' : ''} onClick={() => setSettingsTab('account')}>Account</button>
                </div>

                {settingsTab === 'model' ? (
                  <>
                    <p className="settings-sub">Adjust model parameters</p>
                    <div className="settings-group">
                      <label>Model</label>
                      <select className="auth-input" value={currentModel} onChange={e => switchModel(e.target.value)}>
                        {availableModels.length === 0 && <option value="">Loading models…</option>}
                        {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {availableModels.length === 0 && <span className="muted">No models found in models/</span>}
                    </div>
                    <div className="settings-group">
                      <label>Temperature <span className="val">{temperature}</span></label>
                      <input type="range" min="0" max="2" step="0.05" value={temperature} onChange={e => setTemperature(Number(e.target.value))} />
                    </div>
                    <div className="settings-group">
                      <label>Max Tokens <span className="val">{maxTokens}</span></label>
                      <input type="range" min="64" max="4096" step="64" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} />
                    </div>
                    <div className="settings-group">
                      <label>Top P <span className="val">{topP}</span></label>
                      <input type="range" min="0" max="1" step="0.05" value={topP} onChange={e => setTopP(Number(e.target.value))} />
                    </div>
                    <div className="settings-group">
                      <label>Context Window <span className="val">{contextWindow}</span></label>
                      <input type="range" min="512" max="8192" step="512" value={contextWindow} onChange={e => setContextWindow(Number(e.target.value))} />
                    </div>
                    <motion.button className="new-chat-btn" style={{ alignSelf: 'flex-start' }} onClick={applyRecommended} whileTap={{ scale: 0.96 }}>Recommended settings</motion.button>
                    <div className="settings-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <label>System Prompt</label>
                      <textarea className="auth-input" rows={4} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant." style={{ resize: 'vertical', fontFamily: 'var(--font)' }} />
                    </div>
                    <div className="settings-group">
                      <label>Personas</label>
                      <div className="persona-list">
                        {personas.length === 0 && <span className="muted">No saved personas yet.</span>}
                        {personas.map(p => (
                          <div key={p.id} className="persona-chip">
                            <button type="button" className="persona-load" onClick={() => loadPersona(p.id)}>{p.name}</button>
                            <button type="button" className="persona-del" onClick={() => deletePersona(p.id)} title="Delete persona">×</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input className="auth-input" placeholder="Name this persona" value={personaName} onChange={e => setPersonaName(e.target.value)} />
                        <button type="button" className="name-save" onClick={savePersona}>Save current</button>
                      </div>
                    </div>
                    <motion.button className="new-chat-btn" style={{ marginTop: 'auto' }} onClick={saveSettings} whileTap={{ scale: 0.96 }} disabled={settingsBusy}>
                      {settingsBusy ? 'Reloading model…' : 'Save'}
                    </motion.button>
                  </>
                ) : (
                  <>
                    <p className="settings-sub">Account &amp; security</p>
                    <div className="settings-group">
                      <label>Name</label>
                      <div className="name-edit">
                        <input className="auth-input" type="text" placeholder="Your name" value={nameDraft} onChange={e => setNameDraft(e.target.value)} />
                        <button type="button" className="name-save" onClick={saveName} disabled={nameBusy || !nameDraft.trim() || nameDraft.trim() === (account?.name || authUser?.name || '')}>
                          {nameBusy ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                    <div className="account-rows">
                      <div className="account-row"><span className="account-k">Signed in with</span><span className="account-v">{(() => {
                        const m = account?.method || (String(authUser?.email || '').endsWith('@telegram.local') ? 'telegram' : (authUser?.email ? 'email' : null))
                        if (m === 'telegram') return 'Telegram'
                        if (m === 'google') return account?.providers?.includes('email') ? 'Google + Email' : 'Google'
                        if (m === 'email') return 'Email & password'
                        return '—'
                      })()}</span></div>
                      {(account?.email || (authUser?.email && !String(authUser.email).endsWith('@telegram.local'))) && (
                        <div className="account-row"><span className="account-k">Email</span><span className="account-v">{account?.email || authUser?.email}</span></div>
                      )}
                    </div>

                    <div className="settings-2fa">
                      <div className="settings-2fa-text">
                        <span className="settings-2fa-title">Two-factor authentication</span>
                        <span className="settings-2fa-desc">Require a one-time code on every login (including Google), sent to your {account?.method === 'telegram' ? 'Telegram chat' : 'email'}.</span>
                      </div>
                      <button
                        type="button"
                        className={`toggle-switch ${twoFA ? 'on' : ''}`}
                        onClick={onToggleTwoFA}
                        disabled={twoFABusy}
                        aria-pressed={twoFA}
                        title={twoFA ? 'Disable 2FA' : 'Enable 2FA'}
                      >
                        <span className="toggle-knob" />
                      </button>
                    </div>

                    <div className="settings-theme">
                      <div className="settings-theme-text">
                        <span className="settings-theme-title">Theme</span>
                        <span className="settings-theme-desc">{theme === 'dark' ? 'Dark mode — easy on the eyes' : 'Light mode — bright and airy'}</span>
                      </div>
                      <button
                        type="button"
                        className={`toggle-switch ${theme === 'light' ? 'on' : ''}`}
                        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                        aria-pressed={theme === 'light'}
                        title="Toggle theme"
                      >
                        <span className="toggle-knob" />
                      </button>
                    </div>

                    <div className="settings-divider" />
                    {account && account.method !== 'telegram' && (
                      <button type="button" className="account-action" onClick={() => openModal({ type: 'password' })}>
                        {account.has_password ? 'Change password' : 'Set a password'}
                      </button>
                    )}
                    <button type="button" className="account-action danger" onClick={() => openModal({ type: 'delete' })}>
                      Delete account
                    </button>
                    <button type="button" className="account-action" style={{ borderColor: 'rgba(239,68,68,0.2)', color: '#f87171' }} onClick={() => setDeleteAllConfirm(true)}>
                      Delete all conversations
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
          {modal && (
            <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ zIndex: 120, justifyContent: 'center', alignItems: 'center' }}>
              <motion.div className="settings-backdrop" onClick={closeModal} />
              <motion.div
                className="confirm-modal"
                initial={{ scale: 0.92, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <h3>{modal.type === 'twofa' ? (modal.next ? 'Enable two-factor' : 'Disable two-factor') : modal.type === 'password' ? (account?.has_password ? 'Change password' : 'Set a password') : 'Delete account'}</h3>
                <p className="confirm-desc">
                  {modal.type === 'delete'
                    ? 'This permanently deletes your account and all conversations. This cannot be undone.'
                    : modal.type === 'password'
                      ? 'We\u2019ll email you a verification code. Enter it with your new password.'
                      : 'Confirm your identity to continue.'}
                </p>
                {(() => {
                  const usePassword = modalNeedsPassword(modal.type)
                  const useCode = modalNeedsCode(modal.type)
                  return (
                    <form onSubmit={submitModal}>
                      {usePassword && (
                        <div className="auth-field">
                          <label>Password</label>
                          <input className="auth-input" type="password" placeholder="••••••••" value={mCurrent} onChange={e => setMCurrent(e.target.value)} autoFocus required />
                        </div>
                      )}
                      {modal.type === 'password' && (
                        <div className="auth-field">
                          <label>New password</label>
                          <input className="auth-input" type="password" placeholder="At least 6 characters" value={mNew} onChange={e => setMNew(e.target.value)} required minLength={6} />
                        </div>
                      )}
                      {useCode && (
                        <div className="auth-field">
                          <label>Email verification</label>
                          {mCodeSent ? (
                            <>
                              <input className="auth-input auth-code" type="text" inputMode="numeric" placeholder="123456" value={mCode} onChange={e => setMCode(e.target.value)} autoFocus required />
                              <button type="button" className="auth-link" onClick={sendStepupCode} disabled={mSending} style={{ marginTop: 6 }}>
                                {mSending ? 'Sending…' : 'Resend code'}
                              </button>
                            </>
                          ) : (
                            <div className="confirm-desc" style={{ marginBottom: 0 }}>
                              {mSending ? `Sending a code to ${account?.email}…` : (
                                <button type="button" className="account-action" onClick={sendStepupCode}>Send code to {account?.email}</button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {mError && <div className="auth-error">{mError}</div>}
                      <div className="confirm-actions">
                        <button type="button" className="confirm-btn cancel" onClick={closeModal}>Cancel</button>
                        <button type="submit" className={`confirm-btn ${modal.type === 'delete' ? 'danger' : 'primary'}`} disabled={mBusy || (useCode && (!mCodeSent || !mCode.trim()))}>
                          {mBusy ? 'Please wait…' : modal.type === 'delete' ? 'Delete account' : modal.type === 'password' ? 'Save password' : 'Confirm'}
                        </button>
                      </div>
                    </form>
                  )
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="toast-wrap">
          <AnimatePresence>
            {toasts.map(t => (
              <motion.div
                key={t.id}
                className="toast"
                initial={{ y: 24, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 12, opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {shortcutsOpen && (
            <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ zIndex: 120, justifyContent: 'center', alignItems: 'center' }}>
              <motion.div className="settings-backdrop" onClick={() => setShortcutsOpen(false)} />
              <motion.div className="confirm-modal" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} style={{ width: 370 }}>
                <h3>Keyboard Shortcuts</h3>
                <div className="shortcuts-list">
                  {[
                    ['Enter', 'Send message'],
                    ['Shift + Enter', 'New line'],
                    ['Escape', 'Cancel edit / rename'],
                    ['↑', 'Edit last message'],
                  ].map(([key, desc]) => (
                    <div key={key} className="shortcut-row"><span className="shortcut-key">{key}</span><span className="shortcut-desc">{desc}</span></div>
                  ))}
                </div>
                <div className="confirm-actions"><button className="confirm-btn primary" onClick={() => setShortcutsOpen(false)}>Got it</button></div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  /* ══════════ LANDING ══════════ */
  if (!token) return <AuthScreen onAuth={handleAuth} initialTwoFactor={oauthChallenge} onResetTwoFactor={() => setOauthChallenge(null)} />

  return (
    <div className="landing">
      <AnimatePresence>
        {transitioning && (
          <motion.div
            className="transition-overlay"
            initial={{ scaleY: 0, transformOrigin: 'bottom' }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0, transformOrigin: 'top' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>

      <section className="hero">
        <div className="hero-accent" />

        <div className="hero-inner">
          <div className="hero-copy">
            <motion.div
              className="hero-badge"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={"hero-badge-dot" + (serverOk !== null ? (serverOk ? ' alive' : ' dead') : '')} />
              {serverOk === null ? 'Connecting…' : serverOk ? 'All systems online' : 'Server offline'}
            </motion.div>

            <h1>
              {heroWords.map((w, i) => (
                <HeroWord key={w} word={w} delay={0.15 + i * 0.1} />
              ))}{' '}
              <span className="word">
                <motion.span
                  className="accent-text"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}
                >
                  Talk.
                </motion.span>
              </span>
            </h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.65 }}
            >
              Privacy-first, offline AI chat powered by your own laptop.
              No cloud, no tracking, no limits.
            </motion.p>

            <motion.div
              className="hero-actions"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.8 }}
            >
              <MagneticButton onClick={launchChat}>
                Launch Chat
              </MagneticButton>
              <motion.a
                className="cta-secondary"
                href="#features"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                Learn more
              </motion.a>
              <motion.button
                className="cta-secondary"
                onClick={() => setContactOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                Contact Us
              </motion.button>
              <motion.button
                className="cta-secondary"
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                title="Toggle theme"
                style={{ padding: '0.75rem 0.85rem', lineHeight: 0 }}
              >
                {theme === 'dark' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                )}
              </motion.button>
            </motion.div>

            <motion.div
              className="hero-stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <div className="hero-stat"><strong>100%</strong><span>Offline</span></div>
              <div className="hero-stat"><strong>0</strong><span>Data sent</span></div>
              <div className="hero-stat"><strong style={{ fontSize: '0.82rem', fontFamily: 'var(--font)' }}>{modelInfo || '—'}</strong><span>Model</span></div>
            </motion.div>
          </div>

          <motion.div
            className="hero-visual"
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          >
            <ChatPreview />
          </motion.div>
        </div>
      </section>

      <section className="features" id="features">
        <motion.div
          className="features-header"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2>Built for privacy, designed for speed</h2>
          <p>Everything runs on-device. No compromises.</p>
        </motion.div>
        <div className="features-grid">
          {features.map((f, i) => <FeatureCard key={f.title} {...f} i={i} />)}
        </div>
      </section>

      <section className="banner">
        <motion.div
          className="banner-card"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <strong>Free forever.</strong> No subscriptions, no hidden tiers, no data selling.
        </motion.div>
      </section>

      <section className="steps">
        <motion.div
          className="steps-header"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2>Get started in seconds</h2>
          <p>Download once, chat forever — no subscriptions, no setup.</p>
        </motion.div>
        <div className="steps-grid">
          {[
            { n: '01', title: 'Download the model', desc: 'One-click download of a compact 3B model. Just a few GB and you\'re set.' },
            { n: '02', title: 'Chat privately', desc: 'Every message stays on your machine. No cloud, no logs, no prying eyes.' },
            { n: '03', title: 'Tune it your way', desc: 'Swap models, tweak temperature, adjust context — full control at your fingertips.' },
          ].map((s, i) => (
            <motion.div
              key={s.n}
              className="step-card"
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
            >
              <span className="step-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="faq">
        <motion.div
          className="faq-header"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2>Questions? We've got answers.</h2>
        </motion.div>
        <div className="faq-list">
          {[
            { q: 'Does this really run offline?', a: 'Yes. Every prompt runs through a local model on your machine. No data ever leaves your laptop.' },
            { q: 'What hardware do I need?', a: 'Any modern laptop with 8 GB RAM works. A GPU helps but is not required — CPU inference is supported.' },
            { q: 'Can I use my own model?', a: 'Absolutely. Drop any GGUF file into the models folder and it appears in the model selector.' },
            { q: 'Is there a free tier?', a: 'The entire app is free. No paid tiers, no limits, no account upgrades.' },
            { q: 'How do I get help?', a: 'Use the Contact Us form above or open an issue on GitHub.' },
          ].map((item, i) => (
            <FaqItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        Local AI Chatbot &mdash; 100% offline, 100% yours.
      </footer>

      <AnimatePresence>
        {contactOpen && (
          <motion.div
            className="settings-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ zIndex: 120, justifyContent: 'center', alignItems: 'center' }}
          >
            <motion.div className="settings-backdrop" onClick={() => { setContactOpen(false); setContactDone(false) }} />
            <motion.div
              className="confirm-modal"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: 440, maxWidth: '90vw' }}
            >
              {contactDone ? (
                <>
                  <h3>Thank you</h3>
                  <p className="confirm-desc">We'll get back to you shortly.</p>
                  <div className="confirm-actions">
                    <button className="confirm-btn primary" onClick={() => { setContactOpen(false); setContactDone(false) }}>Done</button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleContactSubmit}>
                  <h3>Contact Us</h3>
                  <p className="confirm-desc" style={{ marginBottom: '1rem' }}>Have a question or want to learn more? Send us a message.</p>
                  <div className="auth-field" style={{ marginBottom: '0.75rem' }}>
                    <label>Email (from your account)</label>
                    <input className="auth-input" type="email" value={authUser?.email || ''} disabled style={{ opacity: 0.7 }} />
                  </div>
                  <div className="auth-field" style={{ marginBottom: '0.75rem' }}>
                    <label>Name</label>
                    <input className="auth-input" required value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
                  </div>
                  <div className="auth-field" style={{ marginBottom: '1rem' }}>
                    <label>Message</label>
                    <textarea className="auth-input" required rows={4} value={contactForm.message} onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))} placeholder="How can we help?" style={{ resize: 'vertical', fontFamily: 'var(--font)' }} />
                  </div>
                  <div className="confirm-actions">
                    <button type="button" className="confirm-btn cancel" onClick={() => { setContactOpen(false); setContactDone(false) }} disabled={contactBusy}>Cancel</button>
                    <button type="submit" className="confirm-btn primary" disabled={contactBusy}>{contactBusy ? 'Sending...' : 'Send'}</button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
