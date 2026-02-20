import { useState, useRef } from 'react'

const STORAGE_KEY = 'yomo_journal'

function formatTimestamp(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* quota / private mode */ }
}

const JournalPanel = ({ theme }) => {
  const [entries, setEntries] = useState(loadEntries)
  const [inputText, setInputText] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const textareaRef = useRef(null)

  const isDay = theme === 'day'

  const panelClass = isDay
    ? 'bg-white/90 border border-gray-200 shadow-xl text-gray-800'
    : 'bg-white/10 border border-white/20 shadow-xl text-white backdrop-blur-md'
  const labelClass = isDay ? 'text-gray-600 font-mono text-xs' : 'text-white/70 font-mono text-xs'
  const rowClass   = isDay ? 'border-gray-100' : 'border-white/10'
  const textareaClass = isDay
    ? 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
    : 'bg-white/10 border-white/20 text-white placeholder-white/30'
  const saveBtnClass = isDay
    ? 'bg-gray-800 text-white hover:bg-gray-700'
    : 'bg-white/15 text-white border border-white/20 hover:bg-white/25'

  const addEntry = () => {
    const text = inputText.trim()
    if (!text) return
    const updated = [{ text, timestamp: Date.now() }, ...entries]
    setEntries(updated)
    setInputText('')
    persist(updated)
  }

  const deleteEntry = (index) => {
    const updated = entries.filter((_, i) => i !== index)
    setEntries(updated)
    persist(updated)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      addEntry()
    }
  }

  return (
    <div className={`rounded-xl p-4 w-[460px] overflow-hidden ${panelClass}`}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <div className={labelClass}>Journal</div>
          <div className={`mt-1 font-mono text-sm ${isDay ? 'text-gray-500' : 'text-white/50'}`}>
            session notes
          </div>
        </div>

        {/* Minimize / expand toggle */}
        <button
          type="button"
          onClick={() => setIsMinimized((v) => !v)}
          aria-label={isMinimized ? 'Expand journal' : 'Minimize journal'}
          className={`ml-2 mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-70 ${isDay ? 'text-gray-500' : 'text-white/60'}`}
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

      {/* ── Collapsible body ── */}
      <div
        style={{
          maxHeight: isMinimized ? '0px' : '380px',
          opacity: isMinimized ? 0 : 1,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.25s ease',
        }}
      >
        {/* Note input */}
        <div className="mt-3">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a session note… (Ctrl+Enter to save)"
            rows={3}
            className={`w-full px-3 py-2 rounded-lg font-mono text-xs border resize-none focus:outline-none focus:border-accent transition-colors ${textareaClass}`}
          />
          <button
            type="button"
            onClick={addEntry}
            disabled={!inputText.trim()}
            className={`mt-1.5 w-full py-1.5 rounded-lg font-mono text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${saveBtnClass}`}
          >
            Save note
          </button>
        </div>

        {/* Entries list */}
        <div className={`mt-3 mb-1 ${labelClass}`}>
          {entries.length > 0 ? 'Notes' : ''}
        </div>
        <div className="overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight: '220px' }}>
          {entries.length === 0 ? (
            <p className={`py-1 font-mono text-xs ${isDay ? 'text-gray-400' : 'text-white/30'}`}>
              No notes yet
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.timestamp}
                className={`py-2 border-b last:border-0 ${rowClass}`}
              >
                <div className="flex items-start gap-2">
                  <p className={`font-mono text-xs flex-1 leading-relaxed whitespace-pre-wrap ${isDay ? 'text-gray-700' : 'text-white/80'}`}>
                    {entry.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteEntry(i)}
                    aria-label="Delete note"
                    className={`flex-shrink-0 mt-0.5 opacity-30 hover:opacity-70 transition-opacity ${isDay ? 'text-gray-500' : 'text-white'}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className={`mt-0.5 font-mono text-[10px] ${isDay ? 'text-gray-400' : 'text-white/30'}`}>
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default JournalPanel
