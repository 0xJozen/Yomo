/**
 * claudeService.js
 * Client-side wrapper for the /api/yomo-speech serverless function.
 * The Anthropic API key never touches the browser — all calls go through
 * the server-side handler in api/yomo-speech.js.
 */

// In-memory cache: context fingerprint → response string
// Capped at 60 entries to prevent unbounded growth in long sessions.
const cache = new Map()
const CACHE_MAX = 60

// Fallbacks shown when the API route is unreachable or returns an error
const FALLBACK = {
  happy:   'things are looking up out there 📈',
  sad:     'rough patch, but every degen has been here 📉',
  sleepy:  'waiting for the next move... 😴',
  neutral: 'watching the markets quietly 👀',
}

/**
 * Generates a Yomo speech line for the current trading context.
 * Always resolves — falls back to a static string on network or API error.
 *
 * @param {object} context
 * @param {string} context.emotion           - 'happy' | 'sad' | 'sleepy' | 'neutral'
 * @param {number} [context.sessionPnl]      - cumulative SOL PnL this session
 * @param {number} [context.sessionDuration] - session length in seconds
 * @param {Array}  [context.recentTrades]    - last 5 trades from walletService
 * @param {string} [context.walletAddress]
 * @param {string} [context.yomoName]        - user-given name for this Yomo
 * @returns {Promise<string>}
 */
export async function generateYomoSpeech(context) {
  const {
    emotion = 'neutral',
    sessionPnl,
    sessionDuration,
    recentTrades = [],
    walletAddress = '',
    yomoName = '',
    userMessage = '',
  } = context

  // User-initiated chat messages are never cached (they're conversational)
  // Trade reactions are cached by context fingerprint
  const latestSig =
    recentTrades[0]?.signature ||
    recentTrades[0]?.timestamp ||
    'none'
  const cacheKey = userMessage
    ? null
    : `${emotion}|${Math.round((sessionPnl ?? 0) * 10000)}|${latestSig}`

  if (cacheKey && cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  try {
    const res = await fetch('/api/yomo-speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        emotion,
        sessionPnl,
        sessionDuration,
        recentTrades: recentTrades.slice(0, 5),
        walletAddress,
        yomoName,
        userMessage,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`/api/yomo-speech returned ${res.status}: ${body}`)
    }

    const data = await res.json()
    const text = data.text?.trim() || FALLBACK[emotion] || FALLBACK.neutral

    // Only cache trade-reaction responses, not user-initiated chat
    if (cacheKey) {
      if (cache.size >= CACHE_MAX) {
        cache.delete(cache.keys().next().value)
      }
      cache.set(cacheKey, text)
    }

    return text
  } catch (err) {
    console.warn('[Yomo] Speech API error — using fallback:', err.message)
    return FALLBACK[emotion] || FALLBACK.neutral
  }
}
