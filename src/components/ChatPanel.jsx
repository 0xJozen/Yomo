import { useState, useRef, useEffect, useCallback } from 'react'
import { generateYomoSpeech } from '../utils/claudeService'

// ── Journal (Notes tab) persistence ──────────────────────────────────────────
const JOURNAL_KEY = 'yomo_journal'

function loadNotes() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistNotes(notes) {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(notes)) } catch {}
}

function formatTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── ChatPanel ────────────────────────────────────────────────────────────────
/**
 * @param {object}  props
 * @param {string}  props.theme              - 'day' | 'night'
 * @param {boolean} props.isOwner            - show Notes tab when true
 * @param {string}  props.emotion            - current Yomo emotion
 * @param {number}  [props.sessionPnl]       - cumulative SOL PnL
 * @param {number}  [props.sessionDuration]  - session seconds
 * @param {Array}   [props.recentTrades]     - last 5 txs for Claude context
 * @param {string}  [props.walletAddress]
 * @param {string}  [props.yomoName]
 * @param {number}  [props.streak]           - daily check-in streak
 * @param {object}  props.addMessageRef      - ref; caller writes fn → push Yomo msg
 */
export default function ChatPanel({
  theme,
  isOwner = false,
  emotion = 'neutral',
  sessionPnl,
  sessionDuration,
  recentTrades = [],
  walletAddress = '',
  yomoName = '',
  streak = 0,
  addMessageRef,
}) {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [isMinimized, setIsMin]   = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [isTyping, setIsTyping]   = useState(false)
  const [notes, setNotes]         = useState(loadNotes)
  const [noteInput, setNoteInput] = useState('')

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  const isDay = theme === 'day'

  // Expose an "add Yomo message" function so App.jsx can push trade reactions
  // directly into the chat without the chat panel needing to know about trades.
  useEffect(() => {
    if (!addMessageRef) return
    addMessageRef.current = (text) => {
      setMessages((prev) => [...prev, { role: 'yomo', text, id: crypto.randomUUID() }])
      setIsMin(false) // expand so the user sees the reaction
    }
    return () => { if (addMessageRef) addMessageRef.current = null }
  }, [addMessageRef])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Send a user message and wait for Yomo's reply
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isTyping) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text, id: crypto.randomUUID() }])
    setIsTyping(true)
    const context = {
      emotion,
      sessionPnl,
      sessionDuration,
      recentTrades,
      walletAddress,
      yomoName,
      streak,
      userMessage: text,
    }
    console.log('[ChatPanel] generateYomoSpeech context:', context)
    const reply = await generateYomoSpeech(context)
    setIsTyping(false)
    setMessages((prev) => [...prev, { role: 'yomo', text: reply, id: crypto.randomUUID() }])
  }, [input, isTyping, emotion, sessionPnl, sessionDuration, recentTrades, walletAddress, yomoName, streak])

  // ── Notes tab helpers ────────────────────────────────────────────────────
  const addNote = () => {
    const text = noteInput.trim()
    if (!text) return
    const updated = [{ text, timestamp: Date.now() }, ...notes]
    setNotes(updated)
    setNoteInput('')
    persistNotes(updated)
  }

  const deleteNote = (i) => {
    const updated = notes.filter((_, idx) => idx !== i)
    setNotes(updated)
    persistNotes(updated)
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const panelBg = isDay
    ? 'bg-white/90 border border-gray-200 shadow-xl text-gray-800'
    : 'bg-[#0f1020]/90 border border-white/15 shadow-xl text-white backdrop-blur-md'

  const divider = isDay ? 'border-gray-100' : 'border-white/10'

  const msgYomo = isDay
    ? 'bg-gray-100 text-gray-800 rounded-bl-sm'
    : 'bg-white/10 text-white/90 rounded-bl-sm'

  const msgUser = 'bg-[#8FD4B8] text-white rounded-br-sm'

  // bg + border only — text/placeholder colour applied directly on the element
  // to avoid Tailwind cascade ordering conflicts with any parent colour class
  const inputCls = isDay
    ? 'bg-gray-50 border-gray-200'
    : 'bg-white/10 border-white/15'

  const tabActive   = isDay ? 'bg-gray-800 text-white'    : 'bg-white/20 text-white'
  const tabInactive = isDay ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'

  const sendBtn = isDay ? 'bg-gray-800 text-white' : 'bg-white/20 text-white'

  const PANEL_H = 480

  // Hide entirely for non-owners (view-only wallets, disconnected state)
  if (!isOwner) return null

  return (
    <div
      className={`rounded-xl flex flex-col overflow-hidden transition-all duration-300 ${panelBg}`}
      style={{ width: 320, maxHeight: isMinimized ? 48 : PANEL_H }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-3 flex-shrink-0 border-b ${divider}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-mono text-sm font-medium truncate ${isDay ? 'text-gray-700' : 'text-white/80'}`}>
            {yomoName || 'yomo'}
          </span>

          {/* Tab pills — only when expanded and owner */}
          {isOwner && !isMinimized && (
            <div className="flex gap-1 flex-shrink-0">
              {['chat', 'notes'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] transition-colors ${
                    activeTab === tab ? tabActive : tabInactive
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Minimize / expand */}
        <button
          onClick={() => setIsMin((v) => !v)}
          aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
          className={`ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-opacity hover:opacity-70 ${
            isDay ? 'text-gray-400' : 'text-white/40'
          }`}
        >
          {isMinimized ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 12h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {!isMinimized && (
        activeTab === 'notes' && isOwner
          ? (
            /* ── Notes tab ─────────────────────────────────────────────── */
            <div className="flex flex-col" style={{ height: PANEL_H - 48 }}>
              <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                {notes.length === 0 ? (
                  <p className={`py-6 font-mono text-xs text-center ${isDay ? 'text-gray-400' : 'text-white/30'}`}>
                    no notes yet
                  </p>
                ) : notes.map((note, i) => (
                  <div key={note.timestamp} className={`py-2 border-b last:border-0 ${divider}`}>
                    <div className="flex items-start gap-2">
                      <p className={`flex-1 font-mono text-xs leading-relaxed whitespace-pre-wrap ${isDay ? 'text-gray-700' : 'text-white/80'}`}>
                        {note.text}
                      </p>
                      <button
                        onClick={() => deleteNote(i)}
                        className={`flex-shrink-0 mt-0.5 opacity-30 hover:opacity-70 transition-opacity ${isDay ? 'text-gray-500' : 'text-white'}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className={`mt-0.5 font-mono text-[10px] ${isDay ? 'text-gray-400' : 'text-white/30'}`}>
                      {formatTime(note.timestamp)}
                    </div>
                  </div>
                ))}
              </div>

              <div className={`px-3 pb-3 pt-2 border-t ${divider}`}>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote() }}
                  placeholder="add a note… (Ctrl+Enter)"
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg font-mono text-xs border resize-none focus:outline-none transition-colors ${inputCls}`}
                />
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim()}
                  className={`mt-1.5 w-full py-1.5 rounded-lg font-mono text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isDay ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-white/15 text-white border border-white/20 hover:bg-white/25'
                  }`}
                >
                  save note
                </button>
              </div>
            </div>
          ) : (
            /* ── Chat tab ───────────────────────────────────────────────── */
            <div className="flex flex-col" style={{ height: PANEL_H - 48 }}>
              {/* Message list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
                {messages.length === 0 && !isTyping && (
                  <p className={`py-6 font-mono text-xs text-center leading-relaxed ${isDay ? 'text-gray-400' : 'text-white/30'}`}>
                    ask yomo anything about<br />your trades…
                  </p>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] px-3 py-2 rounded-2xl font-mono text-xs leading-relaxed ${
                        msg.role === 'user' ? msgUser : msgYomo
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Yomo typing indicator */}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className={`px-4 py-2.5 rounded-2xl rounded-bl-sm font-mono text-sm tracking-[0.3em] ${msgYomo}`}>
                      <span
                        style={{
                          animation: 'pulse 1.2s ease-in-out infinite',
                          display: 'inline-block',
                        }}
                      >
                        ···
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input row */}
              <div className={`px-3 py-3 border-t ${divider} flex-shrink-0`}>
                <div className="flex gap-2 items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                    placeholder="say something…"
                    className={`flex-1 px-3 py-1.5 rounded-full font-mono text-xs border focus:outline-none transition-colors ${isDay ? 'text-gray-800 placeholder-gray-400' : 'text-white placeholder-white/30'} ${inputCls}`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-30 ${sendBtn}`}
                  >
                    {/* Send arrow */}
                    <svg className="w-3.5 h-3.5" style={{ transform: 'rotate(180deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
      )}
    </div>
  )
}
