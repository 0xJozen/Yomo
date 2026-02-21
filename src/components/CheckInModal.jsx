import { useState } from 'react'

const CHECKIN_KEY = 'yomo_checkin'
const STREAK_KEY = 'yomo_streak'

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function daysBetween(aKey, bKey) {
  const a = parseDateKey(aKey)
  const b = parseDateKey(bKey)
  return Math.round((a - b) / (24 * 60 * 60 * 1000))
}

export function getStreak() {
  try {
    const raw = localStorage.getItem(CHECKIN_KEY)
    if (!raw) return 0
    const data = JSON.parse(raw)
    const lastDate = data?.lastDate
    if (!lastDate) return 0
    const today = getTodayKey()
    const days = daysBetween(today, lastDate)
    if (days === 0) return data?.streak ?? 1
    if (days === 1) return data?.streak ?? 0 // would become +1 on check-in
    return 0
  } catch { return 0 }
}

export function loadCheckInData() {
  try {
    const raw = localStorage.getItem(CHECKIN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveCheckIn(response) {
  const today = getTodayKey()
  const data = loadCheckInData()
  let streak = 1
  if (data?.lastDate) {
    const days = daysBetween(today, data.lastDate)
    if (days === 0) streak = data.streak ?? 1
    else if (days === 1) streak = (data.streak ?? 0) + 1
  }
  const next = {
    lastDate: today,
    lastResponse: response,
    lastTs: Date.now(),
    streak,
  }
  localStorage.setItem(CHECKIN_KEY, JSON.stringify(next))
  return streak
}

export function shouldShowCheckIn() {
  const data = loadCheckInData()
  const today = getTodayKey()
  if (!data?.lastDate) return true
  return data.lastDate !== today
}

export default function CheckInModal({ theme, onComplete, yomoName = 'Yomo' }) {
  const [response, setResponse] = useState('')
  const isDay = theme === 'day'

  const handleSubmit = () => {
    const trimmed = response.trim()
    saveCheckIn(trimmed || 'no goal set')
    onComplete?.()
  }

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center ${
        isDay ? 'bg-black/20' : 'bg-black/40'
      } backdrop-blur-sm`}
    >
      <div
        className={`max-w-sm w-full mx-4 rounded-2xl p-6 shadow-xl ${
          isDay ? 'bg-white border border-gray-200' : 'bg-white/10 border border-white/20'
        }`}
      >
        <p
          className={`font-mono text-sm mb-4 ${
            isDay ? 'text-gray-700' : 'text-white/90'
          }`}
        >
          what's your trading goal for today?
        </p>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="e.g. stay calm, take one good trade..."
          rows={3}
          className={`w-full px-3 py-2 rounded-xl font-mono text-sm border resize-none focus:outline-none focus:ring-2 ${
            isDay
              ? 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-gray-400'
              : 'bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-white/30'
          }`}
        />
        <button
          type="button"
          onClick={handleSubmit}
          className={`mt-4 w-full py-2 rounded-xl font-mono text-sm font-medium transition-opacity hover:opacity-90 ${
            isDay ? 'bg-gray-800 text-white' : 'bg-white/20 text-white'
          }`}
        >
          check in
        </button>
      </div>
    </div>
  )
}
