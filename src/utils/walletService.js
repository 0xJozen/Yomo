/**
 * Wallet Service - Handles wallet status checking, Yomo claiming, and Helius-based activity
 */

const HELIUS_BASE = 'https://api.helius.xyz/v0'
const MAX_TRANSACTIONS = 20
const LAMPORTS_PER_SOL = 1e9

/**
 * Module-level cache: mint address → { symbol: string|null, marketCap: number|null }
 * Persists across polls for the lifetime of the page.
 */
const tokenMetaCache = new Map()

// ─── Mint extraction ─────────────────────────────────────────────────────────

/**
 * Pull the mint address out of a single Helius enhanced-transaction object.
 * Tries multiple locations in priority order:
 *   1. tokenTransfers[].mint  (most reliable — set by Helius parser)
 *   2. accountData[].tokenBalanceChanges[].mint
 * Skips fromTokenAccount / toTokenAccount because those are *token accounts*, not mints.
 */
function extractMintFromTransaction(tx) {
  // 1. tokenTransfers array — each item has a `mint` field set by Helius
  if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
    for (const tt of tx.tokenTransfers) {
      // Use explicit mint/tokenMint fields; skip fromTokenAccount / toTokenAccount
      const m = tt.mint ?? tt.tokenMint ?? null
      if (m && typeof m === 'string' && m.length >= 32) {
        console.log('[mint extract] tokenTransfers.mint =', m, '| full transfer object:', tt)
        return m
      }
    }
    // Log the full tokenTransfers to help debug field names if none found above
    console.log('[mint extract] No mint found in tokenTransfers (logging full array):', tx.tokenTransfers)
  }

  // 2. accountData[].tokenBalanceChanges[].mint
  if (tx.accountData && Array.isArray(tx.accountData)) {
    for (const ad of tx.accountData) {
      if (!ad.tokenBalanceChanges) continue
      for (const tbc of ad.tokenBalanceChanges) {
        const m = tbc.mint ?? null
        if (m && typeof m === 'string' && m.length >= 32) {
          console.log('[mint extract] accountData.tokenBalanceChanges.mint =', m)
          return m
        }
      }
    }
  }

  return null
}

// ─── DexScreener token resolution ────────────────────────────────────────────
// Endpoint: GET https://api.dexscreener.com/latest/dex/tokens/{mintAddress}
// Response: { pairs: [ { baseToken: { address, symbol, name }, priceUsd, ... }, ... ] }
// No API key required. Covers virtually all Solana tokens including new memecoins.
// We resolve mints one at a time to keep the implementation simple and reliable.

/**
 * Resolve token symbol and USD price for a list of mint addresses via DexScreener.
 * Results stored in tokenMetaCache as { symbol, marketCap (= USD price) }.
 */
async function resolveTokenMeta(mintAddresses) {
  const uncached = [...new Set(mintAddresses)].filter(
    (m) => m && !tokenMetaCache.has(m)
  )
  if (!uncached.length) return

  console.log('[Token resolve] Unique mints being passed:', uncached)

  await Promise.all(uncached.map(async (mint) => {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`
    console.log('[DexScreener] GET', url)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[DexScreener] non-OK for mint=${mint}:`, res.status)
        tokenMetaCache.set(mint, { symbol: null, marketCap: null })
        return
      }
      const json = await res.json()
      console.log(`[DexScreener] raw response for mint=${mint}:`, json)

      const pairs = Array.isArray(json?.pairs) ? json.pairs : []
      if (!pairs.length) {
        console.log(`[DexScreener] No pairs found for mint=${mint}`)
        tokenMetaCache.set(mint, { symbol: null, marketCap: null })
        return
      }

      // Use the first pair — typically the most liquid
      const pair = pairs[0]
      const symbol = pair.baseToken?.symbol?.trim() || null
      const priceRaw = pair.priceUsd
      const price = priceRaw != null ? parseFloat(priceRaw) : null
      console.log(`[DexScreener] mint=${mint} symbol=${symbol} priceUsd=${price} (pair: ${pair.dexId} ${pair.pairAddress})`)
      tokenMetaCache.set(mint, { symbol, marketCap: isNaN(price) ? null : price })
    } catch (err) {
      console.warn(`[DexScreener] fetch error for mint=${mint}:`, err)
      tokenMetaCache.set(mint, { symbol: null, marketCap: null })
    }
  }))
}

/**
 * @typedef {Object} TransactionEntry
 * @property {string} type - e.g. 'SWAP', 'Received', 'Sent', 'Transfer'
 * @property {string} tokenName - e.g. 'SOL', 'BONK', 'WIF'
 * @property {number|null} marketCap - USD market cap if available
 * @property {number} solChange - SOL amount (positive = received, negative = sent)
 * @property {number} timestamp - Unix seconds
 * @property {string} [signature] - tx signature for dedup
 */

/**
 * Fetch last 20 transactions for a Solana address via Helius and derive emotion from SOL changes.
 * Also returns last 10 transactions for display (type, solChange, timestamp).
 * @param {string} address - Solana wallet address
 * @returns {Promise<{ transactionCount: number, recentActivity: number, solChange: number, emotion: string, transactions: TransactionEntry[] }>}
 */
export const getWalletActivity = async (address) => {
  const defaultResult = {
    transactionCount: 0,
    recentActivity: 0,
    solChange: 0,
    emotion: 'neutral',
    transactions: []
  }

  const apiKey = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HELIUS_API_KEY
    ? import.meta.env.VITE_HELIUS_API_KEY
    : ''
  if (!apiKey || !address || typeof address !== 'string') {
    return defaultResult
  }

  const trimmed = address.trim()
  console.log('Fetching Helius data for:', trimmed)
  const url = `${HELIUS_BASE}/addresses/${trimmed}/transactions?api-key=${apiKey}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('Helius getWalletActivity: non-OK response', res.status)
      return defaultResult
    }
    const data = await res.json()
    console.log('Helius raw API response:', data)
    const rawList = Array.isArray(data) ? data : (data && data.transactions ? data.transactions : [])
    const transactions = rawList.slice(0, MAX_TRANSACTIONS)

    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - 24 * 3600
    const twoDaysAgo = now - 48 * 3600

    let recentActivity = 0
    let solChangeLamports = 0
    let mostRecentTimestamp = 0
    /** @type {TransactionEntry[]} */
    const transactionList = []

    const normalizedAddress = trimmed.toLowerCase()

    for (const tx of transactions) {
      const ts = tx.timestamp != null ? Number(tx.timestamp) : 0
      if (ts > mostRecentTimestamp) mostRecentTimestamp = ts

      const isRecent24h = ts >= oneDayAgo

      if (isRecent24h) {
        recentActivity += 1
      }

      // SOL balance change for this address
      let txChange = 0

      if (tx.accountData && Array.isArray(tx.accountData)) {
        const forAccount = tx.accountData.find(
          (a) => a.account && String(a.account).toLowerCase() === normalizedAddress
        )
        if (forAccount != null && forAccount.nativeBalanceChange != null) {
          txChange = Number(forAccount.nativeBalanceChange)
        }
      }

      if (txChange === 0 && tx.nativeTransfers && Array.isArray(tx.nativeTransfers)) {
        for (const nt of tx.nativeTransfers) {
          const amount = Number(nt.amount) || 0
          const from = (nt.fromUserAccount || '').toLowerCase()
          const to = (nt.toUserAccount || '').toLowerCase()
          if (to === normalizedAddress) txChange += amount
          if (from === normalizedAddress) txChange -= amount
        }
      }

      if (tx.feePayer && String(tx.feePayer).toLowerCase() === normalizedAddress && typeof tx.fee === 'number') {
        txChange -= tx.fee
      }

      if (isRecent24h) {
        solChangeLamports += txChange
      }

      const solChangeTx = txChange / LAMPORTS_PER_SOL
      let type = 'Transfer'
      if (tx.type) type = tx.type
      else if (solChangeTx > 0) type = 'Received'
      else if (solChangeTx < 0) type = 'Sent'
      const signature = tx.signature || tx.transactionSignature || null

      const primaryMint = extractMintFromTransaction(tx)

      transactionList.push({
        type,
        tokenName: primaryMint ? null : 'SOL',
        marketCap: null,
        _mint: primaryMint,
        solChange: solChangeTx,
        timestamp: ts,
        ...(signature && { signature })
      })
    }

    // Resolve symbol + price for any new mints via Jupiter
    const mints = transactionList.map((t) => t._mint).filter(Boolean)
    if (mints.length) await resolveTokenMeta(mints)

    // Apply resolved metadata and clean up internal _mint field
    for (const entry of transactionList) {
      if (entry._mint) {
        const meta = tokenMetaCache.get(entry._mint)
        entry.tokenName = meta?.symbol || 'Token'
        entry.marketCap = meta?.marketCap ?? null
      }
      delete entry._mint
    }

    const solChange = solChangeLamports / LAMPORTS_PER_SOL

    let emotion = 'neutral'
    if (transactions.length === 0 || mostRecentTimestamp < twoDaysAgo) {
      emotion = 'sleepy'
    } else if (solChange > 0) {
      emotion = 'happy'
    } else if (solChange < 0) {
      emotion = 'sad'
    }

    return {
      transactionCount: transactions.length,
      recentActivity,
      solChange,
      emotion,
      transactions: transactionList.slice(0, 10)
    }
  } catch (err) {
    console.warn('Helius getWalletActivity error:', err)
    return defaultResult
  }
}

// Mock wallet database (for checkWalletStatus only)
const mockWalletDatabase = {
  // Format: address -> { variant: 'dawn'|'sage'|'twilight', isPublic: boolean, emotion: string }
}

/**
 * Check if a wallet has claimed a Yomo
 * @param {string} address - Solana wallet address
 * @returns {Promise<object>} - { hasYomo: boolean, variant?: string, isPublic?: boolean, emotion?: string, isOwnWallet?: boolean }
 */
export const checkWalletStatus = async (address) => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 800))

  const normalizedAddress = address.trim().toLowerCase()

  // Check localStorage first (for claimed Yomos)
  const storedWallet = localStorage.getItem('yomo_wallet_address') || localStorage.getItem('walletAddress')
  const hasCompletedOnboarding = localStorage.getItem('hasCompletedOnboarding') === 'true'
  
  // Determine if this is the user's own wallet
  const isOwnWallet = storedWallet && storedWallet.toLowerCase() === normalizedAddress

  // If wallet matches stored wallet and onboarding is complete, return stored data
  if (isOwnWallet && hasCompletedOnboarding) {
    const variant = localStorage.getItem('selectedVariant') || localStorage.getItem('yomo_variant') || 'dawn'
    const isPublic = localStorage.getItem('isPublic') === 'true'
    const emotion = localStorage.getItem('yomo_emotion') || 'neutral'
    
    console.log('✅ Found wallet in localStorage:', { variant, isPublic, emotion, isOwnWallet: true })
    
    return {
      hasYomo: true,
      variant,
      isPublic,
      emotion,
      isOwnWallet: true
    }
  }

  // Check mock database (for testing other wallets)
  const walletData = mockWalletDatabase[normalizedAddress]
  if (walletData) {
    return {
      hasYomo: true,
      variant: walletData.variant,
      isPublic: walletData.isPublic,
      emotion: walletData.emotion || 'neutral',
      isOwnWallet: false
    }
  }

  // No Yomo found - return status based on whether it's the user's wallet
  console.log('📭 Wallet has no Yomo:', { address: normalizedAddress.slice(0, 8) + '...', isOwnWallet })
  
  return {
    hasYomo: false,
    isOwnWallet: isOwnWallet || !storedWallet // If no stored wallet, treat as own wallet (for claiming)
  }
}

/**
 * Claim a Yomo for a wallet address
 * @param {string} address - Solana wallet address
 * @param {string} variant - Selected variant ('dawn'|'sage'|'twilight')
 * @returns {Promise<boolean>} - Success status
 */
export const claimYomo = async (address, variant) => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500))

  const normalizedAddress = address.trim().toLowerCase()

  // Save to localStorage
  localStorage.setItem('yomo_wallet_address', normalizedAddress)
  localStorage.setItem('selectedVariant', variant)
  localStorage.setItem('isPublic', 'false') // Default to private
  localStorage.setItem('yomo_emotion', 'neutral')

  console.log(`✅ Yomo claimed for wallet: ${normalizedAddress} (${variant})`)

  return true
}

