import { useState, useEffect, useRef, useCallback } from 'react'
import LoadingScreen from './components/LoadingScreen'
import Onboarding from './components/Onboarding'
import Yomo from './components/Yomo'
import SpeechBubble from './components/SpeechBubble'
import WalletConnect from './components/WalletConnect'
import ThemeToggle from './components/ThemeToggle'
import WalletInfoPanel from './components/WalletInfoPanel'
import { getWalletActivity } from './utils/walletService'
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
  ]
  const keysToRemove = [...knownKeys]
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.includes('yomo') && !keysToRemove.includes(key)) keysToRemove.push(key)
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

const EMOTION_REACTIONS = {
  happy: 'your portfolio is looking good! 📈',
  sad: 'rough patch lately... 📉',
  sleepy: "you've been quiet lately 😴",
  neutral: 'watching the markets... 👀'
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
        'walletAddress', 'yomo_wallet_address', 'isPublic', 'yomo_emotion', 'connectedViaPhantom'
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
    // Check localStorage for saved variant (new structure: selectedVariant)
    const savedVariant = localStorage.getItem('selectedVariant') || localStorage.getItem('yomo_variant')
    if (savedVariant && ['dawn', 'sage', 'twilight'].includes(savedVariant)) {
      return savedVariant
    }
    // Default to random if no saved variant
    const variants = ['dawn', 'sage', 'twilight']
    return variants[Math.floor(Math.random() * variants.length)]
  })

  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  const [showWelcomeBackOnMain, setShowWelcomeBackOnMain] = useState(false)
  const [displayedWallet, setDisplayedWallet] = useState('')
  const [walletTransactions, setWalletTransactions] = useState([])
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

  // Emotion reaction bubble (initial load or trade PnL)
  const [heliusReactionBubble, setHeliusReactionBubble] = useState(null) // { text } or null
  const heliusReactionTimeoutRef = useRef(null)

  // Session-based emotion: swap-in starts session, swap-out realizes PnL, 4h inactivity resets
  const POLL_INTERVAL_MS = 10000
  const SESSION_INACTIVITY_SEC = 4 * 3600
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

  const processWalletResult = useCallback((result, isInitial = false) => {
    setWalletTransactions(result.transactions || [])
    const txs = result.transactions || []
    const now = Math.floor(Date.now() / 1000)

    if (isInitial) {
      processedTxKeysRef.current = new Set(
        txs.map((tx, i) => tx.signature || `${tx.timestamp}-${tx.solChange}-${i}`)
      )
      const emotion = result.emotion || 'neutral'
      setEmotion(emotion)
      localStorage.setItem('yomo_emotion', emotion)
      setHeliusReactionBubble({ text: EMOTION_REACTIONS[emotion] ?? EMOTION_REACTIONS.neutral })
      if (heliusReactionTimeoutRef.current) clearTimeout(heliusReactionTimeoutRef.current)
      heliusReactionTimeoutRef.current = setTimeout(() => setHeliusReactionBubble(null), 4000)
      return
    }

    // Poll: only process new txs
    let showedBubble = false
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      const key = tx.signature || `${tx.timestamp}-${tx.solChange}-${i}`
      if (processedTxKeysRef.current.has(key)) continue
      processedTxKeysRef.current.add(key)

      lastActivityTsRef.current = tx.timestamp || now

      const solChange = tx.solChange ?? 0
      if (solChange > 0) {
        if (sessionStartTsRef.current === 0) {
          sessionStartTsRef.current = now
          lastActivityTsRef.current = tx.timestamp || now
        }
        lastEntrySolRef.current += solChange
      } else if (solChange < 0) {
        const realizedPnl = lastEntrySolRef.current + solChange
        lastEntrySolRef.current = Math.max(0, lastEntrySolRef.current + solChange)
        sessionCumulativePnlRef.current += realizedPnl

        const gain = Math.abs(realizedPnl)
        const gainStr = gain >= 0.0001 ? gain.toFixed(4) : gain.toExponential(2)
        if (realizedPnl > 0) {
          setEmotion('happy')
          setHeliusReactionBubble({ text: `+${gainStr} SOL! 📈` })
        } else {
          setEmotion('sad')
          setHeliusReactionBubble({ text: `-${gainStr} SOL 📉` })
        }
        showedBubble = true
        if (heliusReactionTimeoutRef.current) clearTimeout(heliusReactionTimeoutRef.current)
        heliusReactionTimeoutRef.current = setTimeout(() => {
          setHeliusReactionBubble(null)
          applySessionEmotion()
        }, 4000)
      }
    }
    // Only apply session emotion if a trading session has actually started.
    // Before the first swap-in, sessionStartTsRef is 0 — don't overwrite the
    // initial emotion that was set from the Helius activity result.
    if (!showedBubble && sessionStartTsRef.current !== 0) applySessionEmotion()
  }, [applySessionEmotion, resetSession])

  // Initial fetch when displayedWallet is set
  useEffect(() => {
    if (isLoading || showOnboarding || !displayedWallet) return
    let cancelled = false
    getWalletActivity(displayedWallet).then((result) => {
      if (cancelled) return
      console.log('Helius getWalletActivity result:', {
        transactionCount: result.transactionCount,
        recentActivity: result.recentActivity,
        solChange: result.solChange,
        emotion: result.emotion
      })
      processWalletResult(result, true)
    })
    return () => {
      cancelled = true
      if (heliusReactionTimeoutRef.current) {
        clearTimeout(heliusReactionTimeoutRef.current)
        heliusReactionTimeoutRef.current = null
      }
    }
  }, [isLoading, showOnboarding, displayedWallet, processWalletResult])

  // 10s polling: refetch and process new txs for session-based emotion
  useEffect(() => {
    if (isLoading || showOnboarding || !displayedWallet) return
    const interval = setInterval(() => {
      getWalletActivity(displayedWallet).then((result) => {
        setWalletTransactions(result.transactions || [])
        const now = Math.floor(Date.now() / 1000)
        if (sessionStartTsRef.current !== 0 && now - lastActivityTsRef.current > SESSION_INACTIVITY_SEC) {
          resetSession()
        }
        processWalletResult(result, false)
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isLoading, showOnboarding, displayedWallet, processWalletResult, resetSession])

  const handleWalletAddressChange = useCallback((newAddress) => {
    localStorage.setItem('walletAddress', newAddress)
    localStorage.setItem('yomo_wallet_address', newAddress)
    processedTxKeysRef.current = new Set()
    resetSession()
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
          'walletAddress', 'yomo_wallet_address', 'isPublic', 'yomo_emotion', 'connectedViaPhantom'
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
    if (walletAddress) setDisplayedWallet(walletAddress)
    console.log('🏁 Onboarding hidden, showing main app')
  }, [])

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme)
  }, [])

  // Calculate responsive scale based on viewport width
  // Target: good from 700px to 1920px width
  // Scale factor: 0.875 at 700px, 1.0 at 1200px, 1.0 at 1920px (capped)
  const getScale = () => {
    if (typeof window === 'undefined') return 1
    
    const width = window.innerWidth
    if (width <= 700) {
      return 0.875 // Scale down for small screens
    } else if (width <= 1200) {
      // Linear interpolation between 700px (0.875) and 1200px (1.0)
      return 0.875 + ((width - 700) / (1200 - 700)) * (1.0 - 0.875)
    } else {
      return 1.0 // Full size for larger screens
    }
  }

  // Responsive scaling state
  const [scale, setScale] = useState(() => {
    if (typeof window === 'undefined') return 1
    return getScale()
  })

  useEffect(() => {
    const handleResize = () => {
      setScale(getScale())
    }
    
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

  return (
    <div className={`min-h-screen ${backgroundStyle} text-accent flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-300`}>
      {/* Theme toggle and wallet button - fixed at top right, outside scaling wrapper */}
      {!isLoading && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-3">
          <ThemeToggle onThemeChange={handleThemeChange} theme={theme} />
          {!showOnboarding && <WalletConnect theme={theme} />}
        </div>
      )}
      
      {/* Responsive scaling wrapper */}
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          maxWidth: '1920px',
          margin: '0 auto'
        }}
      >
        
        {isLoading ? (
          <LoadingScreen 
            onComplete={handleLoadingComplete}
            variantColor={variantColors[variant]}
          />
        ) : showOnboarding ? (
          <Onboarding onComplete={handleOnboardingComplete} theme={theme} />
        ) : (
          <>
            {/* Wallet info panel — absolutely positioned left side, does not affect Yomo centering */}
            <div
              className="absolute z-20"
              style={{ left: '5rem', top: '50%', transform: 'translateY(-50%)' }}
            >
              <WalletInfoPanel
                theme={theme}
                walletAddress={displayedWallet}
                transactions={walletTransactions}
                onAddressChange={handleWalletAddressChange}
              />
            </div>

            {/* Yomo — full-width full-height centered */}
            <div className="flex flex-col items-center justify-center w-full h-full">
              <div className="relative flex items-center justify-center">
                <Yomo
                  emotion={showWelcomeBack ? 'happy' : emotion}
                  variant={variant}
                  variantColor={variantColors[variant]}
                />
                {showWelcomeBack && (
                  <SpeechBubble text="welcome back! 👋" isVisible={true} />
                )}
                {heliusReactionBubble && (
                  <SpeechBubble text={heliusReactionBubble.text} isVisible={true} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App

