/**
 * Wallet Service - Handles wallet status checking, Yomo claiming, and Helius-based activity
 */

const HELIUS_BASE = 'https://api.helius.xyz/v0'
const LAMPORTS_PER_SOL = 1e9

// ── Pagination constants ──────────────────────────────────────────────────────
const PAGE_SIZE             = 100   // transactions per Helius request
const MAX_PAGES             = 10    // hard cap  → 1000 raw transactions total
const PAGE_DELAY_MS         = 200   // delay between paginated requests (rate-limit safety)
const SESSION_GAP_SEC       = 4 * 3600   // gap that breaks a trading chain (4 h)

/**
 * Module-level cache: mint address → { symbol: string|null, marketCap: number|null }
 * Persists across polls for the lifetime of the page.
 */
const tokenMetaCache = new Map()

/**
 * First-confirmed-name cache: mint address → string
 * Once a non-'Token' name is resolved for a mint (via DexScreener or description parsing),
 * it is locked here and reused for all subsequent transactions with the same mint.
 * This prevents a later bad DexScreener result (e.g. 'FOGO') from overwriting a correct name.
 */
const resolvedNameCache = new Map()

// ─── Description-based token name extraction ─────────────────────────────────

/**
 * Try to pull a token symbol from a Helius human-readable description string.
 * Helius descriptions for swaps look like:
 *   "User swapped 0.5 SOL for 1,000,000 BONK on Raydium."
 *   "Swapped 500 WIF for 0.2 SOL."
 * Returns the non-SOL symbol in uppercase, or null if nothing useful found.
 */
function extractTokenNameFromDescription(description) {
  if (!description || typeof description !== 'string') return null
  const d = description.trim()
  // "…for [number] SYMBOL" — buying a token with SOL
  const buyM = d.match(/\bfor\s+[\d,. ]+([A-Za-z][A-Za-z0-9]{1,15})\b/)
  if (buyM) {
    const sym = buyM[1].toUpperCase()
    if (sym !== 'SOL') return sym
  }
  // "[number] SYMBOL for …" — selling a token for SOL
  const sellM = d.match(/\b[\d,.]+\s+([A-Za-z][A-Za-z0-9]{1,15})\s+for\b/)
  if (sellM) {
    const sym = sellM[1].toUpperCase()
    if (sym !== 'SOL') return sym
  }
  return null
}

// ─── Mint extraction ─────────────────────────────────────────────────────────

/**
 * Mints that should never be treated as the "traded token":
 *   - Wrapped SOL  (So111…112)
 *   - USDC         (EPjFW…t1v)
 *   - USDT         (Es9vM…NYB)
 * Swaps whose only token transfer is one of these are pure stablecoin or
 * SOL moves and have no place in the trade panel.
 */
const EXCLUDED_MINTS = new Set([
  'So11111111111111111111111111111111111111112',   // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
])

/** Return true only for addresses that look like a genuine SPL token mint. */
function isValidMint(m) {
  return typeof m === 'string' && m.length >= 32 && !EXCLUDED_MINTS.has(m)
}

/**
 * Pull the token mint address out of a single Helius enhanced-transaction object.
 *
 * Search order (highest-confidence first):
 *   1. tokenTransfers[].mint           — set by Helius parser, most reliable
 *   2. accountData[].tokenBalanceChanges[].mint
 *   3. events.swap.tokenOutputs / tokenInputs
 *   4. events.swap.innerSwaps[].tokenOutputs / tokenInputs
 *   5. instructions[].parsed.info.mint (SPL Token program instructions)
 *
 * Wrapped-SOL (So111…112) is skipped at every level since we want the *other* token.
 */
function extractMintFromTransaction(tx) {
  const sig = tx.signature?.slice(0, 8) ?? '?'

  // 1. tokenTransfers — set by Helius for SWAP / TRANSFER
  if (Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
    for (const tt of tx.tokenTransfers) {
      const m = tt.mint ?? tt.tokenMint ?? null
      if (isValidMint(m)) {
        console.log(`[mint][${sig}] tokenTransfers.mint =`, m)
        return m
      }
    }
    console.log(`[mint][${sig}] tokenTransfers present but no valid mint — continuing to fallbacks`)
  } else {
    console.log(`[mint][${sig}] tokenTransfers empty — trying fallbacks for type=${tx.type}`)
  }

  // 2. accountData[].tokenBalanceChanges[].mint
  if (Array.isArray(tx.accountData)) {
    for (const ad of tx.accountData) {
      for (const tbc of ad.tokenBalanceChanges ?? []) {
        const m = tbc.mint ?? null
        if (isValidMint(m)) {
          console.log(`[mint][${sig}] accountData.tokenBalanceChanges.mint =`, m)
          return m
        }
      }
    }
  }

  // 3 & 4. events.swap (top-level outputs/inputs + innerSwaps)
  const swap = tx.events?.swap
  if (swap) {
    // For a BUY the acquired token appears in tokenOutputs; for a SELL in tokenInputs.
    // Try outputs first, then inputs — one of them will hold the non-SOL token.
    const topLevelLists = [swap.tokenOutputs, swap.tokenInputs]
    for (const list of topLevelLists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const m = item.mint ?? item.rawTokenAmount?.mint ?? null
        if (isValidMint(m)) {
          console.log(`[mint][${sig}] events.swap tokenOutputs/Inputs.mint =`, m)
          return m
        }
      }
    }

    if (Array.isArray(swap.innerSwaps)) {
      for (const inner of swap.innerSwaps) {
        const innerLists = [inner.tokenOutputs, inner.tokenInputs]
        for (const list of innerLists) {
          if (!Array.isArray(list)) continue
          for (const item of list) {
            const m = item.mint ?? null
            if (isValidMint(m)) {
              console.log(`[mint][${sig}] events.swap.innerSwaps tokenOutputs/Inputs.mint =`, m)
              return m
            }
          }
        }
      }
    }
  }

  // 5. instructions[].parsed.info.mint (SPL Token program instructions)
  if (Array.isArray(tx.instructions)) {
    for (const ix of tx.instructions) {
      const m = ix.parsed?.info?.mint ?? null
      if (isValidMint(m)) {
        console.log(`[mint][${sig}] instructions.parsed.info.mint =`, m)
        return m
      }
      // Also check nested inner instructions
      for (const inner of ix.innerInstructions ?? []) {
        const im = inner.parsed?.info?.mint ?? null
        if (isValidMint(im)) {
          console.log(`[mint][${sig}] instructions.innerInstructions.parsed.info.mint =`, im)
          return im
        }
      }
    }
  }

  console.log(`[mint][${sig}] No mint found — type=${tx.type} description="${tx.description?.slice(0, 60)}"`)
  return null
}

/**
 * Extract the UI token amount for `mint` from a Helius enhanced-transaction.
 *
 * Priority:
 *   1. tokenTransfers[].tokenAmount  — already UI-scaled float provided by Helius
 *   2. events.swap tokenOutputs / tokenInputs rawTokenAmount.uiAmount
 *   3. events.swap.innerSwaps same fields
 *
 * Returns 0 when nothing useful is found (caller should fall back to SOL amount).
 */
function extractTokenAmount(tx, mint) {
  // 1. tokenTransfers — Helius provides a ready-to-use UI float
  if (Array.isArray(tx.tokenTransfers)) {
    for (const tt of tx.tokenTransfers) {
      if ((tt.mint ?? tt.tokenMint) === mint) {
        const amt = parseFloat(tt.tokenAmount ?? '0')
        if (amt > 0) return amt
      }
    }
  }

  // 2 & 3. events.swap (top-level + innerSwaps)
  const swap = tx.events?.swap
  if (swap) {
    const allLists = [
      swap.tokenOutputs,
      swap.tokenInputs,
      ...(swap.innerSwaps ?? []).flatMap((s) => [s.tokenOutputs, s.tokenInputs]),
    ]
    for (const list of allLists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        if (item.mint !== mint) continue
        const uiAmt = item.rawTokenAmount?.uiAmount
        if (uiAmt != null) {
          const amt = parseFloat(uiAmt)
          if (amt > 0) return amt
        }
      }
    }
  }

  return 0
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

      // Log every pair's baseToken.address so we can see exactly where mismatches occur.
      console.log(
        `[DexScreener] queried mint: ${mint} | pairs (${pairs.length}):`,
        pairs.slice(0, 5).map((p) => ({
          dex: p.dexId,
          baseAddr: p.baseToken?.address,
          baseSym: p.baseToken?.symbol,
          quoteAddr: p.quoteToken?.address,
          quoteSym: p.quoteToken?.symbol,
          strictMatch: p.baseToken?.address?.toLowerCase() === mint.toLowerCase()
        }))
      )

      // Strict match: only accept a pair where baseToken.address === queried mint.
      // DexScreener returns all pairs that *include* the mint — it may appear as
      // quoteToken in some pairs (e.g. SOL/BONK), which would give us the wrong symbol.
      const mintLower = mint.toLowerCase()
      const pair = pairs.find(
        (p) => typeof p.baseToken?.address === 'string' && p.baseToken.address.toLowerCase() === mintLower
      )
      if (!pair) {
        const sample = pairs.slice(0, 3).map((p) => `${p.baseToken?.symbol}(${p.baseToken?.address?.slice(0,8)})`)
        console.warn(`[DexScreener] ✗ No strict baseToken match for mint=${mint}. Pairs: ${sample.join(', ')}`)
        tokenMetaCache.set(mint, { symbol: null, marketCap: null })
        return
      }

      const symbol = pair.baseToken.symbol?.trim() || null

      // Prefer marketCap, then fdv (fully diluted valuation), then fall back to priceUsd
      const mcRaw = pair.marketCap ?? pair.fdv ?? null
      const priceRaw = pair.priceUsd ?? null
      const marketCap = mcRaw != null && !isNaN(Number(mcRaw)) && Number(mcRaw) > 0
        ? Number(mcRaw)
        : (priceRaw != null && !isNaN(parseFloat(priceRaw)) ? parseFloat(priceRaw) : null)
      console.log(`[DexScreener] ✓ mint=${mint} symbol=${symbol} marketCap=${mcRaw} fdv=${pair.fdv} priceUsd=${priceRaw} → stored=${marketCap} (pair: ${pair.dexId} ${pair.pairAddress})`)
      tokenMetaCache.set(mint, { symbol, marketCap })
    } catch (err) {
      console.warn(`[DexScreener] fetch error for mint=${mint}:`, err)
      tokenMetaCache.set(mint, { symbol: null, marketCap: null })
    }
  }))
}

/**
 * @typedef {Object} TransactionEntry
 * @property {string} type - raw Helius type, e.g. 'SWAP', 'TRANSFER'
 * @property {'BUY'|'SELL'|null} tradeDirection - BUY = spent SOL to acquire token; SELL = received SOL from token
 * @property {'FIRST'|'MORE'|'PARTIAL'|'ALL'|'SELL'|null} tradeStatus - position status for the trade
 * @property {string} tokenName - e.g. 'SOL', 'BONK', 'WIF'
 * @property {number|null} marketCap - USD market cap if available
 * @property {number} solChange - SOL amount (positive = received, negative = sent)
 * @property {number|null} pnlPct - for SELL txs: % gain/loss vs most recent prior BUY of same token
 * @property {number} timestamp - Unix seconds
 * @property {string} [signature] - tx signature for dedup
 */

/**
 * Fetch raw Helius enhanced-transactions for `address`, paginating forward
 * until the session boundary is found or the hard cap is reached.
 *
 * Pagination stops when ANY of the following is true:
 *   a) A page comes back empty (no more history).
 *   b) A 4-hour gap is detected between consecutive SWAP transactions in the
 *      accumulated set — the session boundary has been found.
 *   c) MAX_PAGES (10) pages have been fetched — 1000 transactions hard cap.
 *
 * A 200 ms delay is inserted between requests to stay within rate limits.
 *
 * @param {string} address  – trimmed Solana wallet address
 * @param {string} apiKey   – Helius API key
 * @returns {Promise<object[]>} Raw Helius transaction objects (newest-first)
 */
async function fetchTransactionPages(address, apiKey) {
  const allRaw = []
  let cursor = null  // oldest signature seen so far — used as `&before=` cursor
  const now = Math.floor(Date.now() / 1000)

  for (let page = 0; page < MAX_PAGES; page++) {
    // Rate-limit safety: wait 200 ms before every request after the first
    if (page > 0) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS))
    }

    const url =
      `${HELIUS_BASE}/addresses/${address}/transactions` +
      `?api-key=${apiKey}&limit=${PAGE_SIZE}` +
      (cursor ? `&before=${cursor}` : '')

    console.log(`[paginate] page=${page + 1}/${MAX_PAGES}${cursor ? ` before=${cursor.slice(0, 8)}…` : ''}`)

    let pageData
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[paginate] HTTP ${res.status} on page ${page + 1} — stopping`)
        break
      }
      const json = await res.json()
      pageData = Array.isArray(json) ? json : (json?.transactions ?? [])
    } catch (err) {
      console.warn(`[paginate] fetch error on page ${page + 1}:`, err)
      break
    }

    // (a) Empty page — no more history
    if (!pageData.length) {
      console.log(`[paginate] Empty page ${page + 1} — no more history`)
      break
    }

    allRaw.push(...pageData)

    const oldest    = pageData[pageData.length - 1]
    const oldestTs  = oldest?.timestamp ? Number(oldest.timestamp) : 0
    const oldestSig = oldest?.signature ?? null
    const newestTs  = pageData[0]?.timestamp ? Number(pageData[0].timestamp) : 0

    console.log(
      `[paginate] page ${page + 1}: ${pageData.length} txs | ` +
      `newest=${Math.round((now - newestTs) / 60)}m ago | ` +
      `oldest=${oldestTs ? Math.round((now - oldestTs) / 60) + 'm ago' : 'unknown'} | ` +
      `total=${allRaw.length}`
    )

    // (b) Check whether a 4-hour gap already exists in the accumulated SWAP chain.
    //     When found the session boundary is known — no further pages needed.
    const swapTimestamps = allRaw
      .filter((tx) => (tx.type || '').toUpperCase() === 'SWAP' && tx.timestamp)
      .map((tx) => Number(tx.timestamp))
      .sort((a, b) => b - a) // newest-first

    let chainBroken = false
    for (let i = 1; i < swapTimestamps.length; i++) {
      const gapSec = swapTimestamps[i - 1] - swapTimestamps[i]
      if (gapSec > SESSION_GAP_SEC) {
        chainBroken = true
        console.log(
          `[paginate] 4h gap found in SWAP chain ` +
          `(${Math.round(gapSec / 60)}m between swaps) — session boundary found, stopping`
        )
        break
      }
    }
    if (chainBroken) break

    // (c) Hard cap — loop condition handles it, but log clearly on last page
    if (page === MAX_PAGES - 1) {
      console.log(`[paginate] Reached MAX_PAGES (${MAX_PAGES}) — ${allRaw.length} txs total`)
      break
    }

    // Advance cursor to oldest signature on this page
    if (!oldestSig) {
      console.log(`[paginate] No cursor signature on page ${page + 1} — stopping`)
      break
    }
    cursor = oldestSig
  }

  console.log(`[paginate] Done: ${allRaw.length} raw transactions fetched`)
  return allRaw
}

/**
 * Fetch wallet activity for `address` via Helius (with automatic session-aware
 * pagination) and derive emotion + enriched trade list.
 *
 * Returns:
 *   transactions — full set (up to MAX_PAGES × PAGE_SIZE), used by
 *                  detectActiveSession for accurate session calculation.
 *   App.jsx slices the first 20 for the panel display.
 *
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

  try {
    const transactions = await fetchTransactionPages(trimmed, apiKey)
    if (!transactions.length) {
      console.log('[getWalletActivity] No transactions returned')
      return defaultResult
    }

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

      // For SWAP transactions: BUY = spent SOL to get a token (negative change),
      // SELL = received SOL from disposing a token (positive change).
      const isSwap = (tx.type || '').toUpperCase() === 'SWAP'
      const tradeDirection = isSwap
        ? (solChangeTx < 0 ? 'BUY' : solChangeTx > 0 ? 'SELL' : null)
        : null

      const primaryMint = extractMintFromTransaction(tx)
      const primaryTokenAmt = primaryMint ? extractTokenAmount(tx, primaryMint) : 0
      const description = typeof tx.description === 'string' ? tx.description : null

      transactionList.push({
        type,
        tradeDirection,
        tradeStatus: null,
        tokenName: primaryMint ? null : 'SOL',
        marketCap: null,
        pnlPct: null,
        _mint: primaryMint,
        _tokenAmt: primaryTokenAmt, // UI token amount; 0 means use SOL as proxy
        _description: description,
        solChange: solChangeTx,
        timestamp: ts,
        ...(signature && { signature })
      })
    }

    // Drop dust: fees, tiny automated transfers, etc.
    const DUST_THRESHOLD_SOL = 0.001
    const dustFiltered = transactionList.filter((t) => Math.abs(t.solChange) > DUST_THRESHOLD_SOL)

    // Keep only actual token swaps — exclude plain SOL transfers, USDC/USDT moves,
    // TRANSFER / UNKNOWN types, and any swap whose token could not be resolved.
    // tradeDirection is only non-null for SWAPs (set above), so this double-checks:
    //   - type is SWAP (tradeDirection !== null)
    //   - a real non-SOL, non-stablecoin mint was found (_mint !== null)
    const swapOnly = dustFiltered.filter(
      (t) => t.tradeDirection !== null && t._mint !== null
    )
    console.log(
      `[filter] ${transactionList.length} raw → ${dustFiltered.length} after dust → ${swapOnly.length} after swap-only`
    )

    transactionList.length = 0
    transactionList.push(...swapOnly)

    // PnL for SELL transactions: compare SOL received vs SOL spent on the most
    // recent prior BUY of the same mint. Transactions are newest-first, so
    // searching forward from a SELL finds the chronologically preceding BUY.
    // Use Math.abs on both sides to guard against fee-adjusted sign edge cases.
    for (let i = 0; i < transactionList.length; i++) {
      const sell = transactionList[i]
      if (sell.tradeDirection !== 'SELL' || !sell._mint) continue
      for (let j = i + 1; j < transactionList.length; j++) {
        const buy = transactionList[j]
        if (buy._mint === sell._mint && buy.tradeDirection === 'BUY') {
          const receivedSol = Math.abs(sell.solChange) // SOL received on sell (always positive)
          const costSol = Math.abs(buy.solChange)       // SOL spent on buy  (always positive)
          if (costSol > 0) {
            // Positive = profitable exit, negative = loss
            sell.pnlPct = ((receivedSol - costSol) / costSol) * 100
            console.log(`[PnL] SELL mint=${sell._mint} received=${receivedSol.toFixed(4)} cost=${costSol.toFixed(4)} pnl=${sell.pnlPct.toFixed(1)}%`)
          }
          break
        }
      }
    }

    // Status pass — process chronologically (oldest-first) tracking cumulative
    // TOKEN UNITS per mint so the 95% threshold is meaningful regardless of price.
    //
    // When Helius provides a UI token amount (_tokenAmt > 0) we use that directly.
    // When it is missing we fall back to |solChange| as a proxy so the ratio still
    // behaves reasonably (buy and sell both measured in the same SOL units).
    //
    // Thresholds:
    //   FIRST   — first BUY of a mint with no prior open position
    //   MORE    — additional BUY while a position is already open
    //   ALL     — SELL covering ≥ 98 % of total units bought (dust threshold)
    //   PARTIAL — SELL covering < 98 % of total units bought
    //   SELL    — SELL with no prior BUY tracked in this history window
    const FULL_EXIT_THRESHOLD = 0.98

    // mint → { totalBought, totalSold } in consistent units
    const positionMap = new Map()

    const units = (entry) =>
      entry._tokenAmt > 0 ? entry._tokenAmt : Math.abs(entry.solChange)

    for (const entry of [...transactionList].reverse()) {
      const mint = entry._mint
      if (!mint) continue

      if (!positionMap.has(mint)) positionMap.set(mint, { totalBought: 0, totalSold: 0 })
      const pos = positionMap.get(mint)

      if (entry.tradeDirection === 'BUY') {
        // FIRST if net position was zero before this buy, MORE if already open
        const netOpen = pos.totalBought - pos.totalSold
        entry.tradeStatus = netOpen <= 0 ? 'FIRST' : 'MORE'
        pos.totalBought += units(entry)

      } else if (entry.tradeDirection === 'SELL') {
        if (pos.totalBought === 0) {
          entry.tradeStatus = 'SELL' // no prior buy in history window
        } else {
          pos.totalSold += units(entry)
          const soldFraction = pos.totalSold / pos.totalBought
          console.log(
            `[status] SELL mint=${mint.slice(0, 8)}… units_sold=${pos.totalSold.toFixed(4)} / units_bought=${pos.totalBought.toFixed(4)} = ${(soldFraction * 100).toFixed(1)}% → ${soldFraction >= FULL_EXIT_THRESHOLD ? 'ALL' : 'PARTIAL'}`
          )
          entry.tradeStatus = soldFraction >= FULL_EXIT_THRESHOLD ? 'ALL' : 'PARTIAL'
        }
      }
    }

    // Resolve symbol + market cap for any new mints via DexScreener
    const mints = transactionList.map((t) => t._mint).filter(Boolean)
    if (mints.length) await resolveTokenMeta(mints)

    // Apply resolved metadata with first-confirmed-name-wins logic.
    // resolvedNameCache ensures the same mint always gets the same symbol within
    // a page session — a bad DexScreener result (e.g. 'FOGO' for a mismatched pair)
    // cannot overwrite a previously confirmed correct name.
    for (const entry of transactionList) {
      if (entry._mint) {
        const mint = entry._mint
        if (resolvedNameCache.has(mint)) {
          // Reuse the first confirmed name — never overwrite with a later value
          entry.tokenName = resolvedNameCache.get(mint)
        } else {
          const meta = tokenMetaCache.get(mint)
          const dexSymbol = meta?.symbol || null
          const descSymbol = extractTokenNameFromDescription(entry._description)
          // Priority: DexScreener symbol → description parse → 'Token'
          entry.tokenName = dexSymbol || descSymbol || 'Token'
          // Lock this name in for all future references to the same mint
          if (entry.tokenName !== 'Token') {
            resolvedNameCache.set(mint, entry.tokenName)
            console.log(`[NameCache] Locked mint=${mint.slice(0, 8)}… → "${entry.tokenName}"`)
          }
        }
        entry.marketCap = tokenMetaCache.get(mint)?.marketCap ?? null
      }
      delete entry._mint
      delete entry._description
      delete entry._tokenAmt
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
      // Return all filtered transactions (up to MAX_TRANSACTIONS) so that
      // detectActiveSession can walk the full history. The panel renders them all
      // in a scrollable list; it is not capped to 10 here.
      transactions: transactionList
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

