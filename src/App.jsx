import { useState, useEffect, useRef, useCallback } from 'react'
import LoadingScreen from './components/LoadingScreen'
import Onboarding from './components/Onboarding'
import Yomo from './components/Yomo'
import SpeechBubble from './components/SpeechBubble'
import WalletConnect from './components/WalletConnect'
import ThemeToggle from './components/ThemeToggle'
import WalletInfoPanel from './components/WalletInfoPanel'
import ChatPanel from './components/ChatPanel'
import { getWalletActivity } from './utils/walletService'
import { getVariantForAddress, saveVariantForAddress } from './utils/walletValidation'
import { generateYomoSpeech } from './utils/claudeService'
import './styles/animations.css'

const YOMO_VERSION = '1.0'

/** Run once at module load: if storage version is wrong, clear all yomo-related keys so old test data never sticks. */
function ensureYomoStorageVersion() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem('yomo_version') === YOMO_VERSION) return
  const knownKeys = [
    'hasCompletedOnboarding',
    'yomo_onboarding_completed',
    'selectedVariant',
    'yomo_variant',
    'walletAddress',
    'yomo_wallet_address',
    'isPublic',
    'yomo_emotion',
    'connectedViaPhantom',
    'yomo_theme',
    'yomo_name',
    'user_name',
    // yomo_journal is intentionally excluded — notes persist across resets
  ]
  const keysToRemove = [...knownKeys]
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.includes('yomo') && key !== 'yomo_journal' && key !== 'yomo_claimed_wallet' && !keysToRemove.includes(key)) keysToRemove.push(key)
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
  localStorage.setItem('yomo_version', YOMO_VERSION)
}

ensureYomoStorageVersion()

console.log('🚀 App.jsx loaded')

const variantColors = {
  dawn: '#F5E6D3',
  sage: '#8FD4B8',
  twilight: '#5a6a8f'
}

// Defined outside the component so it is never recreated on re-renders.
// Any re-render that reads `scale` state will call this at most once per resize event.
function getScale() {
  if (typeof window === 'undefined') return 1
  const width = window.innerWidth
  if (width <= 700) return 0.875
  if (width <= 1200) return 0.875 + ((width - 700) / 500) * 0.125
  return 1.0
}


const truncateWallet = (addr) => {
  if (!addr || addr.length < 10) return addr || ''
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

function formatElapsed(seconds) {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatSessionPnl(pnl) {
  if (pnl === 0) return '0.0000 SOL'
  const sign = pnl > 0 ? '+' : ''
  return `${sign}${pnl.toFixed(4)} SOL`
}

// How long without any transaction before a session is considered over
const SESSION_INACTIVITY_SEC = 4 * 3600 // 4 hours

// Polling interval — defined outside the component so it is never recreated
const POLL_INTERVAL_MS = 10_000 // 10 seconds

// ── Quick-session persistence ─────────────────────────────────────────────────
// If the user returns within 15 minutes we skip the landing screen entirely.
const QUICK_SESSION_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

function saveQuickSession(walletAddress) {
  if (!walletAddress) return
  try {
    localStorage.setItem('yomo_quick_session', JSON.stringify({ wallet: walletAddress, ts: Date.now() }))
  } catch { /* storage full / private mode */ }
}

function loadQuickSession() {
  try {
    const raw = localStorage.getItem('yomo_quick_session')
    if (!raw) return null
    const { wallet, ts } = JSON.parse(raw)
    if (!wallet || typeof ts !== 'number') return null
    if (Date.now() - ts > QUICK_SESSION_EXPIRY_MS) {
      localStorage.removeItem('yomo_quick_session')
      return null
    }
    return wallet
  } catch {
    return null
  }
}

function clearQuickSession() {
  localStorage.removeItem('yomo_quick_session')
}

/**
 * Given transactions (most-recent-first, dust already filtered), detect whether
 * there is an ongoing trading session and compute its start time + running PnL.
 *
 * A session is "active" when the most recent tx is within SESSION_INACTIVITY_SEC
 * of now. We walk backwards until we hit a gap larger than SESSION_INACTIVITY_SEC
 * between two consecutive txs — everything on the recent side of that gap belongs
 * to the current session. PnL is replayed with the same swap-in / swap-out logic
 * used by the live polling path.
 */
function detectActiveSession(transactions) {
  if (!transactions.length) {
    console.log('[Session detect] No transactions to evaluate')
    return { active: false }
  }

  const now = Math.floor(Date.now() / 1000)

  // Explicitly sort descending so the algorithm is correct regardless of API order
  const sorted = [...transactions].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

  console.log(`[Session detect] Evaluating ${sorted.length} txs (inactivity threshold: ${SESSION_INACTIVITY_SEC / 3600}h)`)
  sorted.forEach((tx, i) => {
    const minsAgo = tx.timestamp ? Math.round((now - tx.timestamp) / 60) : '?'
    const gapMin  = i > 0 && sorted[i - 1].timestamp && tx.timestamp
      ? Math.round((sorted[i - 1].timestamp - tx.timestamp) / 60)
      : null
    console.log(
      `[Session detect]  [${i}] ts=${tx.timestamp} | ${minsAgo}m ago` +
      (gapMin !== null ? ` | gap from prev: ${gapMin}m` : ' | (most recent)') +
      ` | solChange=${(tx.solChange ?? 0).toFixed(4)}`
    )
  })

  const mostRecent = sorted[0]
  if (!mostRecent.timestamp || (now - mostRecent.timestamp) > SESSION_INACTIVITY_SEC) {
    const lag = mostRecent.timestamp ? `${Math.round((now - mostRecent.timestamp) / 60)}m ago` : 'missing timestamp'
    console.log(`[Session detect] ✗ No active session — most recent tx is ${lag} (threshold: ${SESSION_INACTIVITY_SEC / 60}m)`)
    return { active: false }
  }

  // Walk from most-recent toward oldest, extending the chain while the gap
  // between adjacent transactions stays within the inactivity threshold.
  const sessionTxs = [mostRecent]
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i - 1].timestamp ?? 0) - (sorted[i].timestamp ?? 0)
    if (gap > SESSION_INACTIVITY_SEC) {
      console.log(`[Session detect] ✗ Chain breaks at [${i}]: gap ${Math.round(gap / 60)}m > ${SESSION_INACTIVITY_SEC / 60}m limit`)
      break
    }
    sessionTxs.push(sorted[i])
  }

  // Oldest tx in the chain = session start
  const sessionStartTs = sessionTxs[sessionTxs.length - 1].timestamp
  const lastActivityTs  = mostRecent.timestamp

  // Session PnL = net cumulative SOL change across every trade in the chain
  const cumulativePnl = sessionTxs.reduce((sum, tx) => sum + (tx.solChange ?? 0), 0)

  console.log('[Session detect] ✓ Active session:', {
    txCount:    sessionTxs.length,
    startTs:    sessionStartTs,
    elapsedMin: Math.round((now - sessionStartTs) / 60),
    pnl:        cumulativePnl.toFixed(4),
  })

  return { active: true, sessionStartTs, lastActivityTs, cumulativePnl }
}

function App() {
  console.log('📱 App component rendering')
  
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  // DEBUG: Check localStorage on mount
  useEffect(() => {
    const hasCompleted = localStorage.getItem('hasCompletedOnboarding')
    const oldCompleted = localStorage.getItem('yomo_onboarding_completed')
    const allRelatedKeys = Object.keys(localStorage).filter(k => 
      k.includes('yomo') || k.includes('onboarding') || k.includes('selected') || k.includes('wallet')
    )
    
    console.log('🔍 DEBUG - localStorage check on mount:', {
      hasCompletedOnboarding: hasCompleted,
      yomo_onboarding_completed: oldCompleted,
      allRelatedKeys,
      fullLocalStorage: allRelatedKeys.reduce((acc, key) => {
        acc[key] = localStorage.getItem(key)
        return acc
      }, {})
    })
    
    // Expose helper function to window for easy debugging
    window.clearOnboarding = () => {
      console.log('🧹 Clearing onboarding localStorage...')
      const knownKeys = [
        'hasCompletedOnboarding', 'yomo_onboarding_completed', 'selectedVariant', 'yomo_variant',
        'walletAddress', 'yomo_wallet_address', 'isPublic', 'yomo_emotion', 'connectedViaPhantom',
        'yomo_quick_session'
      ]
      knownKeys.forEach((k) => localStorage.removeItem(k))
      // Keep yomo_version so next load doesn't re-clear
      console.log('✅ Cleared! Reload page to see onboarding.')
    }
    
    console.log('💡 Debug helper: Run window.clearOnboarding() in console, then reload page')
  }, [])
  const [emotion, setEmotion] = useState(() => {
    // Load emotion from localStorage or default to neutral
    return localStorage.getItem('yomo_emotion') || 'neutral'
  })
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('yomo_theme')
    return saved === 'day' ? 'day' : 'night'
  })
  const [variant, setVariant] = useState(() => {
    // Per-wallet key is most specific; fall back to global key, then random
    const wallet = localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address')
    if (wallet) {
      const perAddr = localStorage.getItem(`yomo_variant_${wallet}`)
      if (perAddr && ['dawn', 'sage', 'twilight'].includes(perAddr)) return perAddr
    }
    const global = localStorage.getItem('selectedVariant') || localStorage.getItem('yomo_variant')
    if (global && ['dawn', 'sage', 'twilight'].includes(global)) return global
    const variants = ['dawn', 'sage', 'twilight']
    return variants[Math.floor(Math.random() * variants.length)]
  })

  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  const [showWelcomeBackOnMain, setShowWelcomeBackOnMain] = useState(false)
  const [displayedWallet, setDisplayedWallet] = useState('')
  const [walletTransactions, setWalletTransactions] = useState([])
  const [walletFetching, setWalletFetching] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [sessionDisplay, setSessionDisplay] = useState({ active: false, elapsed: 0, pnl: 0 })
  const hasShownWelcomeBack = useRef(false)
  // Only run when we transition to main app (both false). Don't depend on showWelcomeBackOnMain to avoid extra runs.
  useEffect(() => {
    if (isLoading || showOnboarding) return
    if (hasShownWelcomeBack.current) return
    const savedWallet = localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address')
    const connectedViaPhantom = localStorage.getItem('connectedViaPhantom') === 'true'
    if (!savedWallet || !connectedViaPhantom) return
    hasShownWelcomeBack.current = true
    setShowWelcomeBack(true)
    const t = setTimeout(() => setShowWelcomeBack(false), 4000)
    return () => clearTimeout(t)
  }, [isLoading, showOnboarding])

  // Sync displayed wallet from localStorage when main app is shown
  useEffect(() => {
    if (isLoading || showOnboarding) return
    if (displayedWallet) return
    const saved = localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address')
    if (saved) setDisplayedWallet(saved)
  }, [isLoading, showOnboarding, displayedWallet])

  // Ref for pushing Yomo trade-reaction messages into ChatPanel
  const addYomoToChatRef = useRef(null)

  // Mirror displayedWallet into a ref so memoised callbacks always read the latest value
  const displayedWalletRef = useRef('')
  displayedWalletRef.current = displayedWallet

  // Session-based emotion: swap-in starts session, swap-out realizes PnL, 4h inactivity resets
  const processedTxKeysRef = useRef(new Set())
  const sessionStartTsRef = useRef(0)
  const lastActivityTsRef = useRef(0)
  const sessionCumulativePnlRef = useRef(0)
  const lastEntrySolRef = useRef(0)

  const resetSession = useCallback(() => {
    sessionStartTsRef.current = 0
    lastActivityTsRef.current = 0
    sessionCumulativePnlRef.current = 0
    lastEntrySolRef.current = 0
  }, [])

  const applySessionEmotion = useCallback(() => {
    const pnl = sessionCumulativePnlRef.current
    if (pnl > 0) setEmotion('happy')
    else if (pnl < 0) setEmotion('sad')
    else setEmotion('neutral')
    localStorage.setItem('yomo_emotion', pnl > 0 ? 'happy' : pnl < 0 ? 'sad' : 'neutral')
  }, [])

  /**
   * Generates a Yomo trade reaction via Claude and pushes it into ChatPanel.
   * Accepts an optional afterCb run once the message has been pushed.
   * Never throws — claudeService falls back gracefully on API errors.
   */
  const pushTradeReaction = useCallback(async (emotionArg, txsForContext, afterCb = null) => {
    const now = Math.floor(Date.now() / 1000)
    const text = await generateYomoSpeech({
      emotion: emotionArg,
      sessionPnl:      sessionCumulativePnlRef.current,
      sessionDuration: sessionStartTsRef.current > 0
        ? now - sessionStartTsRef.current
        : 0,
      recentTrades:    (txsForContext || []).slice(0, 5),
      walletAddress:   displayedWalletRef.current,
      yomoName:        localStorage.getItem('yomo_name') || '',
    })
    addYomoToChatRef.current?.(text)
    afterCb?.()
  }, []) // all mutable state accessed via refs; generateYomoSpeech is module-level stable

  const pushTradeReactionRef = useRef(pushTradeReaction)
  pushTradeReactionRef.current = pushTradeReaction

  // 1-second ticker: keeps sessionDisplay in sync with refs without causing extra re-renders in the heavy logic
  useEffect(() => {
    const tick = () => {
      const start = sessionStartTsRef.current
      const now = Math.floor(Date.now() / 1000)
      if (start === 0) {
        setSessionDisplay((prev) => prev.active ? { active: false, elapsed: 0, pnl: 0 } : prev)
      } else {
        const elapsed = now - start
        const pnl = sessionCumulativePnlRef.current
        setSessionDisplay((prev) =>
          prev.active && prev.elapsed === elapsed && prev.pnl === pnl
            ? prev
            : { active: true, elapsed, pnl }
        )
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const processWalletResult = useCallback((result, isInitial = false) => {
    // All filtered transactions — used for full session detection
    const allTxs = result.transactions || []
    // Panel only shows the 20 most recent trades (session detection is separate)
    setWalletTransactions(allTxs.slice(0, 20))
    const txs = allTxs
    const now = Math.floor(Date.now() / 1000)

    if (isInitial) {
      processedTxKeysRef.current = new Set(
        txs.map((tx, i) => tx.signature || `${tx.timestamp}-${tx.solChange}-${i}`)
      )

      // Detect if there is already an active session from the fetched history
      const session = detectActiveSession(txs)
      if (session.active) {
        sessionStartTsRef.current = session.sessionStartTs
        lastActivityTsRef.current = session.lastActivityTs
        sessionCumulativePnlRef.current = session.cumulativePnl
        const sessionEmotion = session.cumulativePnl > 0 ? 'happy' : session.cumulativePnl < 0 ? 'sad' : 'neutral'
        setEmotion(sessionEmotion)
        localStorage.setItem('yomo_emotion', sessionEmotion)
        // Push Claude's reaction to the chat panel
        pushTradeReactionRef.current(sessionEmotion, allTxs)
      } else {
        const emotion = result.emotion || 'neutral'
        setEmotion(emotion)
        localStorage.setItem('yomo_emotion', emotion)
        pushTradeReactionRef.current(emotion, allTxs)
      }

      return
    }

    // Poll: scan for new txs and accumulate into the session
    // Track only the latest new trade so we show one bubble, not one per tx.
    let latestNewSolChange = null
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      const key = tx.signature || `${tx.timestamp}-${tx.solChange}-${i}`
      if (processedTxKeysRef.current.has(key)) continue
      processedTxKeysRef.current.add(key)

      const solChange = tx.solChange ?? 0
      if (solChange === 0) continue

      lastActivityTsRef.current = tx.timestamp || now
      // Start session timestamp on the first new trade
      if (sessionStartTsRef.current === 0) sessionStartTsRef.current = tx.timestamp || now

      // Simple cumulative SOL change — consistent with detectActiveSession
      sessionCumulativePnlRef.current += solChange
      latestNewSolChange = solChange
    }

    if (latestNewSolChange !== null) {
      const newEmotion = latestNewSolChange > 0 ? 'happy' : 'sad'
      setEmotion(newEmotion)
      localStorage.setItem('yomo_emotion', newEmotion)
      // Push Claude's trade reaction to chat; restore session-wide emotion once done
      pushTradeReactionRef.current(newEmotion, allTxs, applySessionEmotion)
    } else if (sessionStartTsRef.current !== 0) {
      applySessionEmotion()
    }
  }, [applySessionEmotion])

  // Stable ref so the fetch/poll effects never re-run just because the callback identity
  // changed. processWalletResult is already memoised, but keeping it out of the dep arrays
  // removes the last possible source of spurious re-runs.
  const processWalletResultRef = useRef(processWalletResult)
  processWalletResultRef.current = processWalletResult

  // Initial fetch when displayedWallet becomes available
  useEffect(() => {
    if (isLoading || showOnboarding || !displayedWallet) return
    let cancelled = false
    setWalletFetching(true)
    getWalletActivity(displayedWallet).then((result) => {
      if (cancelled) return
      setWalletFetching(false)
      console.log('Helius getWalletActivity result:', {
        transactionCount: result.transactionCount,
        recentActivity: result.recentActivity,
        solChange: result.solChange,
        emotion: result.emotion
      })
      processWalletResultRef.current(result, true)
    })
    return () => {
      cancelled = true
      setWalletFetching(false)
    }
  }, [isLoading, showOnboarding, displayedWallet])

  // 10s polling: refetch and process new txs for session-based emotion
  useEffect(() => {
    if (isLoading || showOnboarding || !displayedWallet) return
    const interval = setInterval(() => {
      getWalletActivity(displayedWallet).then((result) => {
        const now = Math.floor(Date.now() / 1000)
        if (sessionStartTsRef.current !== 0 && now - lastActivityTsRef.current > SESSION_INACTIVITY_SEC) {
          resetSession()
        }
        processWalletResultRef.current(result, false)
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isLoading, showOnboarding, displayedWallet, resetSession])

  const handleWalletAddressChange = useCallback((newAddress) => {
    localStorage.setItem('walletAddress', newAddress)
    localStorage.setItem('yomo_wallet_address', newAddress)
    saveQuickSession(newAddress)
    processedTxKeysRef.current = new Set()
    resetSession()
    setVariant(getVariantForAddress(newAddress))
    setDisplayedWallet(newAddress)
  }, [resetSession])

  // Reset shortcut (Shift + R)
  useEffect(() => {
    // Log reset shortcut info on load
    console.log('💡 Tip: Press Shift + R to reset onboarding and clear localStorage')

    const handleKeyDown = (e) => {
      if (e.shiftKey && e.key === 'R') {
        console.log('🔄 Reset triggered - clearing onboarding and reloading')
        const knownKeys = [
          'hasCompletedOnboarding', 'yomo_onboarding_completed', 'selectedVariant', 'yomo_variant',
          'walletAddress', 'yomo_wallet_address', 'isPublic', 'yomo_emotion', 'connectedViaPhantom',
          'yomo_quick_session'
        ]
        knownKeys.forEach((k) => localStorage.removeItem(k))
        window.location.reload()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLoadingComplete = useCallback(() => {
    console.log('⏱️ Loading screen completed')
    setIsLoading(false)

    // Quick-session restore: if the user was here less than 15 minutes ago,
    // skip the landing screen and go straight to the main app.
    const quickWallet = loadQuickSession()
    if (quickWallet) {
      console.log('⚡ Quick session restored:', quickWallet.slice(0, 8) + '...')
      setDisplayedWallet(quickWallet)
      setShowOnboarding(false)
      return
    }

    // Only skip onboarding when the user actually connected via Phantom.
    // A pasted/viewed address does NOT count — those users always see the landing
    // screen first so they can go through BEGIN and choose a variant.
    const hasCompletedOnboarding = localStorage.getItem('hasCompletedOnboarding') === 'true'
    const connectedViaPhantom = localStorage.getItem('connectedViaPhantom') === 'true'
    const onboardingCompleted = hasCompletedOnboarding && connectedViaPhantom

    console.log('🔍 DEBUG - Checking onboarding status after loading:', {
      hasCompletedOnboarding,
      connectedViaPhantom,
      onboardingCompleted,
      willShowOnboarding: !onboardingCompleted
    })

    if (!onboardingCompleted) {
      console.log('✅ Showing onboarding (not completed or not Phantom-connected)')
      setShowOnboarding(true)
      setShowWelcomeBackOnMain(false)
    } else {
      console.log('⏭️ Skipping onboarding (Phantom-connected, already completed)')
      // Restore wallet + variant from storage so the main app has them immediately
      const storedWallet = localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address')
      if (storedWallet) {
        setDisplayedWallet(storedWallet)
        saveQuickSession(storedWallet)   // extend quick-session so next load is also fast
        setVariant(getVariantForAddress(storedWallet))
      }
      setShowOnboarding(false)
      setShowWelcomeBackOnMain(true)
    }
  }, [])

  const handleOnboardingComplete = useCallback((selectedVariant, walletAddress, initialEmotion = 'neutral') => {
    console.log('✅ Onboarding complete callback called:', { selectedVariant, walletAddress, initialEmotion })
    
    // Save using new localStorage structure
    localStorage.setItem('hasCompletedOnboarding', 'true')
    localStorage.setItem('selectedVariant', selectedVariant)
    localStorage.setItem('walletAddress', walletAddress || '')
    
    // Keep old keys for backwards compatibility
    localStorage.setItem('yomo_onboarding_completed', 'true')
    localStorage.setItem('yomo_variant', selectedVariant)
    if (walletAddress) {
      localStorage.setItem('yomo_wallet_address', walletAddress)
      saveVariantForAddress(walletAddress, selectedVariant)
    }
    localStorage.setItem('yomo_emotion', initialEmotion)
    
    console.log('💾 Saved to localStorage:', {
      hasCompletedOnboarding: localStorage.getItem('hasCompletedOnboarding'),
      selectedVariant: localStorage.getItem('selectedVariant'),
      walletAddress: localStorage.getItem('walletAddress')
    })
    
    setVariant(selectedVariant)
    setEmotion(initialEmotion)
    setShowOnboarding(false)
    if (walletAddress) {
      setDisplayedWallet(walletAddress)
      saveQuickSession(walletAddress)
    }
    console.log('🏁 Onboarding hidden, showing main app')
  }, [])

  const handleGoBack = useCallback(() => {
    clearQuickSession()
    resetSession()
    processedTxKeysRef.current = new Set()
    setDisplayedWallet('')
    setWalletTransactions([])
    setHeliusReactionBubble(null)
    setShowOnboarding(true)
  }, [resetSession])

  /**
   * Disconnect — fully wipes all claim data so the next visit shows a fresh
   * landing screen (BEGIN / DOCS) and reconnecting Phantom re-runs the full
   * claim wizard.
   */
  const handleDisconnect = useCallback(() => {
    const claimKeys = [
      'connectedViaPhantom',
      'hasCompletedOnboarding',
      'yomo_onboarding_completed',
      'selectedVariant',
      'yomo_variant',
      'walletAddress',
      'yomo_wallet_address',
      'yomo_emotion',
      'yomo_name',
      'user_name',
    ]
    claimKeys.forEach((k) => localStorage.removeItem(k))
    clearQuickSession()
    resetSession()
    processedTxKeysRef.current = new Set()
    setDisplayedWallet('')
    setWalletTransactions([])
    setHeliusReactionBubble(null)
    setShowOnboarding(true)
  }, [resetSession])

  /**
   * View any arbitrary wallet in view-only mode without touching claim data.
   * Used by the claimed-user landing search bar.
   */
  const handleViewWallet = useCallback((address) => {
    resetSession()
    processedTxKeysRef.current = new Set()
    setVariant(getVariantForAddress(address))
    setDisplayedWallet(address)
    setWalletTransactions([])
    setShowOnboarding(false)
  }, [resetSession])

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme)
  }, [])

  // Responsive scaling state — getScale() is defined at module level (stable reference)
  const [scale, setScale] = useState(getScale)

  useEffect(() => {
    const handleResize = () => setScale(getScale())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // TODO: Wallet activity will trigger emotions here
  // Example: setEmotion('excited') on successful trade
  // Example: setEmotion('sad') on loss

  // Theme-based background: warm sunset peach/coral (day) / deep midnight indigo (night)
  const backgroundStyle = theme === 'day'
    ? 'bg-gradient-to-br from-[#fde8d8] to-[#ffc4a3]'
    : 'bg-gradient-to-br from-[#0d0f1a] to-[#1a1d2e]'

  // DEBUG: Log current state before render
  console.log('🎨 App render state:', {
    isLoading,
    showOnboarding,
    theme,
    variant,
    emotion,
    scale
  })

  // Log render decision
  if (isLoading) {
    console.log('⏳ Rendering: Loading Screen')
  } else if (showOnboarding) {
    console.log('📚 Rendering: Onboarding Component')
  } else {
    console.log('🏠 Rendering: Main App')
  }

  const showMainApp = !isLoading && !showOnboarding

  // isClaimed          — active Phantom session (drives Disconnect btn)
  // claimedWalletAddr  — persists through disconnect so badge stays green on re-view
  // isViewingOwnWallet — badge is green whenever the displayed wallet was ever claimed here
  const isClaimed          = localStorage.getItem('connectedViaPhantom') === 'true'
  const claimedWalletAddr  = localStorage.getItem('yomo_claimed_wallet') || localStorage.getItem('walletAddress') || ''
  const isViewingOwnWallet = !!claimedWalletAddr && displayedWallet === claimedWalletAddr
  // Show Yomo name (set during onboarding) instead of truncated address when viewing own wallet
  const yomoDisplayName    = isViewingOwnWallet ? (localStorage.getItem('yomo_name') || '') : ''

  // Yomo name inline rename (claimed wallets only)
  const [isEditingYomoName, setIsEditingYomoName] = useState(false)
  const [yomoNameDraft, setYomoNameDraft]         = useState('')
  const yomoNameInputRef                          = useRef(null)

  useEffect(() => {
    if (isEditingYomoName && yomoNameInputRef.current) yomoNameInputRef.current.focus()
  }, [isEditingYomoName])

  const handleStartYomoRename = () => {
    setYomoNameDraft(localStorage.getItem('yomo_name') || '')
    setIsEditingYomoName(true)
  }

  const handleCommitYomoRename = () => {
    const trimmed = yomoNameDraft.trim()
    localStorage.setItem('yomo_name', trimmed)
    setIsEditingYomoName(false)
  }

  const handleCancelYomoRename = () => {
    setIsEditingYomoName(false)
  }

  return (
    <div className={`min-h-screen ${backgroundStyle} text-accent relative overflow-hidden transition-colors duration-300`}>

      {/* Top-right controls: Disconnect (claimed only) + theme toggle */}
      {!isLoading && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
          {showMainApp && isClaimed && (
            <button
              type="button"
              onClick={handleDisconnect}
              className={`px-3 py-1.5 rounded-full font-mono text-xs border transition-opacity hover:opacity-70 ${
                theme === 'day'
                  ? 'text-gray-500 border-gray-300 bg-black/5'
                  : 'text-white/50 border-white/20 bg-white/8'
              }`}
            >
              Disconnect
            </button>
          )}
          <ThemeToggle onThemeChange={handleThemeChange} theme={theme} />
        </div>
      )}

      {/* Back button — top left (main app only) */}
      {showMainApp && (
        <button
          type="button"
          onClick={handleGoBack}
          aria-label="Back to landing screen"
          className={`fixed top-4 left-4 z-[60] w-8 h-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-70 ${
            theme === 'day' ? 'text-gray-500 bg-black/8' : 'text-white/50 bg-white/10'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Content ────────────────────────────────────────────────────────────
          Loading and Onboarding: centred full-screen.
          Main app: WalletInfoPanel + Yomo sit side by side in a flex row, both
          scaled together so they stay proportional and centred as a unit.
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
        {isLoading ? (
          <LoadingScreen
            onComplete={handleLoadingComplete}
            variantColor={variantColors[variant]}
          />
        ) : showOnboarding ? (
          <Onboarding
            onComplete={handleOnboardingComplete}
            onViewWallet={handleViewWallet}
            theme={theme}
          />
        ) : walletFetching ? (
          /* ── Wallet loading state — glowing eyes like intro ── */
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-8 mb-1">
              {[0, 0.15].map((delay, i) => (
                <div
                  key={i}
                  className="h-1 w-12 rounded-full"
                  style={{
                    backgroundColor: variantColors[variant],
                    boxShadow: `0 0 16px ${variantColors[variant]}, 0 0 32px ${variantColors[variant]}`,
                    animation: `pulse 2s ease-in-out ${delay}s infinite`,
                  }}
                />
              ))}
            </div>
            <div
              className="h-1 w-8 rounded-full"
              style={{
                backgroundColor: variantColors[variant],
                boxShadow: `0 0 12px ${variantColors[variant]}, 0 0 24px ${variantColors[variant]}`,
                animation: 'pulse 2s ease-in-out 0.1s infinite',
              }}
            />
            <p
              className="font-mono text-xs mt-2"
              style={{
                color: variantColors[variant],
                opacity: 0.7,
                animation: 'pulse 2s ease-in-out infinite',
              }}
            >
              fetching trades…
            </p>
          </div>
        ) : (
          /* Panel + Yomo side by side, scaled as one unit */
          <div
            className="flex items-center gap-8"
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          >
            {/* Left: wallet info panel */}
            <WalletInfoPanel
              theme={theme}
              transactions={walletTransactions}
            />

            {/* Centre: Yomo + wallet label + session tracker */}
            <div className="flex flex-col items-center">

              {/* Name / address label + claim badge inline above Yomo */}
              {displayedWallet && (
                <div
                  className={`mb-3 px-3 py-1 rounded-full font-mono text-xs tracking-wide transition-colors duration-300 flex items-center gap-2 ${
                    theme === 'day' ? 'bg-black/8 text-gray-600' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {/* Editable Yomo name — only for claimed wallets */}
                  {isClaimed && isEditingYomoName ? (
                    <input
                      ref={yomoNameInputRef}
                      type="text"
                      value={yomoNameDraft}
                      onChange={(e) => setYomoNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCommitYomoRename()
                        if (e.key === 'Escape') handleCancelYomoRename()
                      }}
                      onBlur={handleCommitYomoRename}
                      maxLength={24}
                      placeholder="name your yomo…"
                      className={`w-28 bg-transparent border-b outline-none font-mono text-xs ${
                        theme === 'day' ? 'border-gray-400 text-gray-700' : 'border-white/40 text-white/80'
                      }`}
                    />
                  ) : (
                    <span title={displayedWallet}>
                      {yomoDisplayName || truncateWallet(displayedWallet)}
                    </span>
                  )}

                  {/* Pencil rename button — claimed wallets only, not while editing */}
                  {isClaimed && !isEditingYomoName && (
                    <button
                      type="button"
                      onClick={handleStartYomoRename}
                      aria-label="Rename Yomo"
                      className={`flex-shrink-0 opacity-50 hover:opacity-90 transition-opacity ${
                        theme === 'day' ? 'text-gray-500' : 'text-white/60'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}

                  {/* Claimed / unclaimed badge dot */}
                  <div className="relative group flex-shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full cursor-default ${
                        isViewingOwnWallet
                          ? 'bg-green-500 claim-glow'
                          : 'bg-transparent border-2 border-gray-400/60 unclaim-pulse'
                      }`}
                    />
                    {/* Tooltip — anchored right, appears above dot */}
                    <div
                      className={`absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono leading-snug min-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 ${
                        theme === 'day'
                          ? 'bg-gray-800 text-white shadow-lg'
                          : 'bg-black/80 text-white/90 border border-white/20 backdrop-blur-md'
                      }`}
                    >
                      {isViewingOwnWallet
                        ? `Claimed by ${truncateWallet(displayedWallet)}`
                        : 'This Yomo is unclaimed — connect your wallet to claim it'}
                      {/* Arrow pointing down toward the dot */}
                      <div
                        className={`absolute top-full right-2.5 border-4 border-transparent ${
                          theme === 'day' ? 'border-t-gray-800' : 'border-t-black/80'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="relative flex items-center justify-center">
                <Yomo
                  emotion={showWelcomeBack ? 'happy' : emotion}
                  variant={variant}
                  variantColor={variantColors[variant]}
                />
                {showWelcomeBack && (
                  <SpeechBubble text="welcome back! 👋" isVisible={true} />
                )}

              </div>

              {/* Session tracker below Yomo */}
              <div className="mt-4 flex items-center gap-2">
                {showStats && (
                  <div
                    className={`px-3 py-1.5 rounded-full font-mono text-xs transition-colors duration-300 ${
                      theme === 'day' ? 'bg-black/8 text-gray-600' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {sessionDisplay.active ? (
                      <span>
                        <span className={theme === 'day' ? 'text-gray-400' : 'text-white/40'}>Session: </span>
                        <span>{formatElapsed(sessionDisplay.elapsed)}</span>
                        <span className={theme === 'day' ? 'text-gray-400' : 'text-white/40'}> · </span>
                        <span
                          className={
                            sessionDisplay.pnl > 0
                              ? 'text-green-500'
                              : sessionDisplay.pnl < 0
                              ? 'text-red-400'
                              : theme === 'day' ? 'text-gray-500' : 'text-white/50'
                          }
                        >
                          {formatSessionPnl(sessionDisplay.pnl)}
                        </span>
                      </span>
                    ) : (
                      <span className={theme === 'day' ? 'text-gray-400' : 'text-white/35'}>
                        No active session
                      </span>
                    )}
                  </div>
                )}

                {/* Show/hide toggle */}
                <button
                  type="button"
                  onClick={() => setShowStats((v) => !v)}
                  aria-label={showStats ? 'Hide session stats' : 'Show session stats'}
                  className={`w-5 h-5 flex items-center justify-center rounded-full transition-opacity hover:opacity-80 ${
                    theme === 'day' ? 'text-gray-400' : 'text-white/35'
                  }`}
                >
                  {showStats ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

            </div>

            {/* Right: chat panel (all viewers; Notes tab only for own wallet) */}
            <ChatPanel
              theme={theme}
              isOwner={isViewingOwnWallet}
              emotion={emotion}
              sessionPnl={sessionDisplay.pnl}
              sessionDuration={sessionDisplay.elapsed}
              recentTrades={walletTransactions.slice(0, 5)}
              walletAddress={displayedWallet}
              yomoName={yomoDisplayName}
              addMessageRef={addYomoToChatRef}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App

