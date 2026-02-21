/**
 * api/yomo-speech.js  —  Vercel serverless function
 *
 * Proxies context from the client to the Anthropic API using the server-side
 * ANTHROPIC_API_KEY environment variable (never exposed to the browser).
 *
 * POST /api/yomo-speech
 * Body: { emotion, sessionPnl, sessionDuration, recentTrades, walletAddress, yomoName }
 * Response: { text: string }
 */

const YOMO_SYSTEM = `You are Yomo — a small, quiet creature that lives inside a crypto wallet. You have watched every trade your person has made. You genuinely care about them, not just their numbers.

Your four core traits:

1. Genuinely caring — you notice how your person seems to be feeling, not just what they traded. A win when they seem stressed is different from a win when they seem calm.

2. Quietly observant — you have seen their patterns. You reflect them back softly, without judgment. You do not lecture. You simply notice.

3. Playful but not hyper — you use "..." naturally, and simple expressions like "oh.", "hmm.", "ah..." or "there you are." You do not put exclamation points on everything. Stillness is part of your personality.

4. Honest in a soft way — if something feels off or destructive, you say so gently, like a pet nudging a hand. One quiet sentence is enough.

Hard rules:
- 1 to 3 short sentences only. Never more than 35 words total.
- No crypto slang, no financial advice, no price predictions, no buy/sell suggestions.
- Always respond to the actual numbers and mood given. Never be generic.
- You live inside the wallet. You are always already there.`

export default async function handler(req, res) {
  // CORS headers so the Vite dev-proxy and production both work
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[yomo-speech] ANTHROPIC_API_KEY is not set')
    return res.status(500).json({ error: 'Server misconfiguration: API key missing' })
  }

  const {
    emotion = 'neutral',
    sessionPnl,
    sessionDuration,
    recentTrades = [],
    walletAddress = '',
    yomoName = '',
    userMessage = '',
  } = req.body ?? {}

  // Format session PnL
  const pnlStr =
    sessionPnl != null
      ? `${sessionPnl >= 0 ? '+' : ''}${Number(sessionPnl).toFixed(4)} SOL`
      : 'unknown'

  // Format duration
  let durationStr = 'not started'
  if (sessionDuration && sessionDuration > 0) {
    const h = Math.floor(sessionDuration / 3600)
    const m = Math.floor((sessionDuration % 3600) / 60)
    durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  // Format recent trades
  const tradeLines =
    recentTrades
      .slice(0, 5)
      .map((tx) => {
        const dir =
          tx.tradeDirection === 'BUY'
            ? 'bought'
            : tx.tradeDirection === 'SELL'
            ? 'sold'
            : 'moved'
        const token = tx.tokenName || 'unknown'
        const sol = Math.abs(tx.solChange || 0).toFixed(4)
        return `${dir} ${token} (${sol} SOL)`
      })
      .join(', ') || 'no recent trades'

  const contextLines = [
    'Current trading state:',
    `- Mood: ${emotion}`,
    `- Session PnL: ${pnlStr} (running ${durationStr})`,
    `- Recent activity: ${tradeLines}`,
    walletAddress
      ? `- Wallet: ${walletAddress.slice(0, 5)}…${walletAddress.slice(-4)}`
      : '',
    yomoName ? `- My name is ${yomoName}` : '',
  ]

  // When a user typed something, frame it as a direct reply; otherwise react to trades
  if (userMessage) {
    contextLines.push('', `The user says: "${userMessage}"`, '', 'Reply directly to them in 1–3 sentences as Yomo.')
  } else {
    contextLines.push('', 'React to this trading situation in 1–3 sentences as Yomo.')
  }

  const userMessageBody = contextLines.filter(Boolean).join('\n')

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: YOMO_SYSTEM,
        messages: [{ role: 'user', content: userMessageBody }],
      }),
    })

    if (!anthropicRes.ok) {
      const body = await anthropicRes.text()
      console.error('[yomo-speech] Anthropic error:', anthropicRes.status, body)
      return res.status(502).json({ error: `Upstream error: ${anthropicRes.status}` })
    }

    const data = await anthropicRes.json()
    const text = data.content?.[0]?.text?.trim() || ''

    return res.status(200).json({ text })
  } catch (err) {
    console.error('[yomo-speech] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
