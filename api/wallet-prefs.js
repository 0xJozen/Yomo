/**
 * api/wallet-prefs.js — Wallet preference storage (public/private Yomo)
 *
 * GET /api/wallet-prefs?address=xxx  → { isPublic: boolean }
 * POST /api/wallet-prefs  Body: { address, isPublic }  → { ok: true }
 *
 * Default: returns isPublic: true when no preference is stored.
 * Add Vercel KV or similar for persistent storage across users.
 */

// In-memory store — does not persist across serverless invocations.
// Replace with Vercel KV or a database for production.
const prefs = new Map()

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'GET') {
    const address = (req.query?.address || '').trim().toLowerCase()
    if (!address) {
      return res.status(400).json({ error: 'address required' })
    }
    const isPublic = prefs.has(address) ? prefs.get(address) : true
    return res.status(200).json({ isPublic })
  }

  if (req.method === 'POST') {
    const { address = '', isPublic = true } = req.body ?? {}
    const addr = String(address).trim().toLowerCase()
    if (!addr) {
      return res.status(400).json({ error: 'address required' })
    }
    prefs.set(addr, !!isPublic)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
