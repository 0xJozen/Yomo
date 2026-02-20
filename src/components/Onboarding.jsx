import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Yomo from './Yomo'
import { validateSolanaAddress, getVariantForAddress, saveVariantForAddress } from '../utils/walletValidation'

const variantColors = {
  dawn:     '#F5E6D3',
  sage:     '#8FD4B8',
  twilight: '#5a6a8f',
}

const variantLabels = {
  dawn:     'Dawn',
  sage:     'Sage',
  twilight: 'Twilight',
}

const DOCS_CONTENT = (
  <>
    <p className="font-mono text-sm sm:text-base text-gray-800 leading-relaxed mb-3">
      <strong>Yomo</strong> is your AI trading companion — a friendly character that lives in your
      wallet and reacts to your trading journey.
    </p>
    <ul className="font-mono text-sm text-gray-700 space-y-1 mb-4 list-disc list-inside">
      <li>Personalized companion (Dawn, Sage, Twilight)</li>
      <li>Emotions that respond to your activity</li>
      <li>Wallet-bound identity on Solana</li>
      <li>Simple, welcoming onboarding</li>
    </ul>
    <a
      href="https://github.com/0xJozen/Yomo"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block font-mono text-sm text-accent hover:underline font-medium"
    >
      View on GitHub →
    </a>
  </>
)

// ─────────────────────────────────────────────────────────────────────────────
// Web Audio chime — 3-note ascending C-E-G melody, no external files needed
// ─────────────────────────────────────────────────────────────────────────────
function playClaimChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    // C5 → E5 → G5  (major third + perfect fifth = warm, welcoming)
    const notes = [523.25, 659.25, 783.99]

    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.value = freq

      const start    = ctx.currentTime + i * 0.18
      const isLast   = i === notes.length - 1
      const decay    = isLast ? 0.75 : 0.4
      const duration = isLast ? 0.8  : 0.45

      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.12, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, start + decay)

      osc.start(start)
      osc.stop(start + duration)
    })

    // Release AudioContext after all notes have finished
    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 1400)
  } catch {
    // Web Audio API unavailable (e.g. secure-context restriction) — skip silently
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Celebration sound — 5-note ascending C→E→G→C'→E' with octave harmonics
// More elaborate than the startup chime: fuller, brighter, triumphant feel
// ─────────────────────────────────────────────────────────────────────────────
function playCelebrationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    // C5 E5 G5 C6 E6 — full major chord expansion, two octaves
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]

    notes.forEach((freq, i) => {
      const isLast   = i === notes.length - 1
      const start    = ctx.currentTime + i * 0.14
      const peak     = isLast ? 0.18 : 0.14
      const decay    = isLast ? 1.1 : 0.45
      const duration = isLast ? 1.3 : 0.55

      // Primary tone
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(peak, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + decay)
      osc.start(start)
      osc.stop(start + duration)

      // Soft octave harmonic for shimmer
      const osc2  = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.type = 'sine'
      osc2.frequency.value = freq * 2
      gain2.gain.setValueAtTime(0, start)
      gain2.gain.linearRampToValueAtTime(peak * 0.28, start + 0.02)
      gain2.gain.exponentialRampToValueAtTime(0.001, start + decay * 0.55)
      osc2.start(start)
      osc2.stop(start + duration * 0.65)
    })

    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 2200)
  } catch {
    // silently skip
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared wizard sub-components
// ─────────────────────────────────────────────────────────────────────────────

const StepCard = ({ children }) => (
  <motion.div
    key="stepcard"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.25 }}
    className="w-full mt-4"
  >
    {children}
  </motion.div>
)

// Step 1: greeting + "Let's go!" button
const ClaimStep1 = ({ onNext, theme }) => {
  const btnClass = theme === 'day'
    ? 'text-gray-800 border-gray-400 hover:bg-gray-200/80'
    : 'text-white border-white/40 hover:bg-white/15'
  return (
    <StepCard>
      <div className="flex justify-center">
        <motion.button
          onClick={onNext}
          className={`px-8 py-2.5 rounded-full font-mono text-sm border-2 backdrop-blur-md transition-all ${btnClass}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          Let&apos;s go! →
        </motion.button>
      </div>
    </StepCard>
  )
}

// Step 2: variant selection
const ClaimStep2 = ({ variant, setVariant, onNext, theme }) => {
  const btnClass  = theme === 'day' ? 'text-gray-800 border-gray-400 hover:bg-gray-200/80' : 'text-white border-white/40 hover:bg-white/15'
  const cardBase  = 'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200'
  const cardActive = theme === 'day' ? 'border-gray-700 scale-105 shadow-md' : 'border-white/70 scale-105'
  const cardIdle   = theme === 'day' ? 'border-gray-200 hover:border-gray-400' : 'border-white/20 hover:border-white/40'

  return (
    <StepCard>
      <p className={`font-mono text-xs text-center mb-3 ${theme === 'day' ? 'text-gray-500' : 'text-white/50'}`}>
        choose your yomo
      </p>
      <div className="flex gap-3 justify-center">
        {Object.entries(variantColors).map(([v, color]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={`${cardBase} ${variant === v ? cardActive : cardIdle}`}
          >
            <div className="w-9 h-9 rounded-full shadow-inner" style={{ backgroundColor: color }} />
            <span className={`font-mono text-xs ${theme === 'day' ? 'text-gray-700' : 'text-white/80'}`}>
              {variantLabels[v]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <motion.button
          onClick={onNext}
          className={`px-8 py-2.5 rounded-full font-mono text-sm border-2 backdrop-blur-md transition-all ${btnClass}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          Next →
        </motion.button>
      </div>
    </StepCard>
  )
}

/**
 * Reusable optional-name input used for both step 3 (Yomo's name) and
 * step 4 (the user's own name/handle).
 */
const NameInputStep = ({ label, placeholder, value, onChange, onSkip, onContinue, theme }) => {
  const inputClass = theme === 'day'
    ? 'border-gray-300 bg-white/80 text-gray-800 placeholder-gray-400'
    : 'border-white/30 bg-white/10 text-white placeholder-gray-400'
  const btnMinimal = theme === 'day'
    ? 'text-gray-600 border-gray-300 hover:bg-gray-100'
    : 'text-white/60 border-white/30 hover:bg-white/10'
  const btnAccent = theme === 'day'
    ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700'
    : 'bg-white/15 text-white border-white/40 hover:bg-white/25'

  return (
    <StepCard>
      <p className={`font-mono text-xs text-center mb-2 ${theme === 'day' ? 'text-gray-500' : 'text-white/50'}`}>
        {label} <span className="opacity-50">(optional)</span>
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onContinue()}
        placeholder={placeholder}
        maxLength={24}
        className={`w-full px-4 py-2.5 rounded-lg font-mono text-sm border-2 transition-all focus:outline-none focus:border-accent ${inputClass}`}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <div className="flex gap-2 mt-3">
        <motion.button
          type="button"
          onClick={onSkip}
          className={`flex-1 px-4 py-2 rounded-lg font-mono text-sm border-2 transition-all ${btnMinimal}`}
          whileTap={{ scale: 0.97 }}
        >
          Skip
        </motion.button>
        <motion.button
          type="button"
          onClick={onContinue}
          className={`flex-1 px-4 py-2 rounded-lg font-mono text-sm border-2 font-medium transition-all ${btnAccent}`}
          whileTap={{ scale: 0.97 }}
        >
          Continue
        </motion.button>
      </div>
    </StepCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const Onboarding = ({ onComplete, onViewWallet, theme = 'night' }) => {
  // Detect a returning claimed user (connectedViaPhantom + stored wallet)
  const hasClaimed = (
    localStorage.getItem('connectedViaPhantom') === 'true' &&
    !!(localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address'))
  )

  const [emotion, setEmotion]               = useState('neutral')
  const [showSpeechBubble, setShowSpeechBubble] = useState(false)
  const [speechText, setSpeechText]         = useState(hasClaimed ? "welcome back! 👋" : "hi, i'm yomo! 👋")
  const [showBeginFlow, setShowBeginFlow]   = useState(false)
  const [showDocs, setShowDocs]             = useState(false)

  // For returning claimed users show their stored per-wallet variant; otherwise random
  const [variant, setVariant] = useState(() => {
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

  // Claim wizard — steps: null | 1 (greeting) | 2 (variant) | 3 (yomo name) | 4 (user name) | 5 (CLAIM)
  const [claimStep, setClaimStep]           = useState(null)
  const [phantomAddress, setPhantomAddress] = useState('')
  const [yomoName, setYomoName]             = useState('')
  const [userName, setUserName]             = useState('')
  const [isClaiming, setIsClaiming]         = useState(false) // true while claim animation plays

  // Paste-address flow (new-user BEGIN form)
  const [walletAddress, setWalletAddress]   = useState('')
  const [walletError, setWalletError]       = useState(null)
  const [isConnecting, setIsConnecting]     = useState(false)

  // Wallet-search for claimed-user landing
  const [searchAddress, setSearchAddress]   = useState('')
  const [searchError, setSearchError]       = useState('')

  // ── Mount: greeting animation ───────────────────────────────────────────────
  useEffect(() => {
    // Claimed users see Yomo happy immediately; new users get the neutral→happy reveal
    if (hasClaimed) {
      setEmotion('happy')
      setShowSpeechBubble(true)
      setSpeechText("welcome back! 👋")
    } else {
      setEmotion('neutral')
      setShowSpeechBubble(false)
      const t = setTimeout(() => {
        setEmotion('happy')
        setShowSpeechBubble(true)
        setSpeechText("hi, i'm yomo! 👋")
      }, 1000)
      return () => clearTimeout(t)
    }
  // hasClaimed is read-once from localStorage at mount — stable for component lifetime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 5: show the CLAIM prompt ───────────────────────────────────────────
  useEffect(() => {
    if (claimStep !== 5) return
    setSpeechText('ready to make it official? ✨')
    setShowSpeechBubble(true)
    setEmotion('happy')
  }, [claimStep])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Skip onboarding — return claimed user straight to their Yomo. */
  const handleReturnToYomo = () => {
    const storedVariant = localStorage.getItem('selectedVariant') || localStorage.getItem('yomo_variant') || variant
    const storedAddress = localStorage.getItem('walletAddress') || localStorage.getItem('yomo_wallet_address') || ''
    const storedEmotion = localStorage.getItem('yomo_emotion') || 'neutral'
    onComplete(storedVariant, storedAddress, storedEmotion)
  }

  /** User clicked CLAIM — play sound, animate, save, celebrate, then enter app. */
  const handleClaim = () => {
    if (isClaiming) return
    playCelebrationSound()
    setIsClaiming(true)

    // Persist all claim data
    localStorage.setItem('hasCompletedOnboarding', 'true')
    localStorage.setItem('yomo_onboarding_completed', 'true')
    localStorage.setItem('selectedVariant', variant)
    localStorage.setItem('yomo_variant', variant)
    localStorage.setItem('walletAddress', phantomAddress)
    localStorage.setItem('yomo_wallet_address', phantomAddress)
    localStorage.setItem('yomo_claimed_wallet', phantomAddress)  // survives disconnect
    localStorage.setItem('yomo_emotion', 'neutral')
    localStorage.setItem('connectedViaPhantom', 'true')
    saveVariantForAddress(phantomAddress, variant)               // per-wallet variant key
    if (yomoName.trim()) localStorage.setItem('yomo_name', yomoName.trim())
    if (userName.trim()) localStorage.setItem('user_name', userName.trim())

    // Reaction
    setSpeechText('i am now yours! 🌟')
    setShowSpeechBubble(true)

    setTimeout(() => {
      onComplete(variant, phantomAddress, 'neutral')
    }, 2000)
  }

  const completeOnboarding = (address, connectedViaPhantomFlag) => {
    // For view-only wallets use the deterministic per-wallet variant (never overwrite a claim)
    const resolvedVariant = getVariantForAddress(address)
    localStorage.setItem('hasCompletedOnboarding', 'true')
    localStorage.setItem('selectedVariant', resolvedVariant)
    localStorage.setItem('walletAddress', address)
    localStorage.setItem('yomo_onboarding_completed', 'true')
    localStorage.setItem('yomo_variant', resolvedVariant)
    localStorage.setItem('yomo_wallet_address', address)
    localStorage.setItem('yomo_emotion', 'neutral')
    // Only promote to claimed — never demote (Disconnect is the only path that clears it)
    if (connectedViaPhantomFlag) {
      localStorage.setItem('connectedViaPhantom', 'true')
    }
    onComplete(resolvedVariant, address, 'neutral')
  }

  /** Connect via Phantom → fire chime + start 5-step claim wizard. */
  const handleConnectWallet = async () => {
    setWalletError(null)

    if (typeof window === 'undefined' || !window.solana?.isPhantom) {
      setWalletError(
        <span>
          Phantom not found — install it at{' '}
          <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" className="underline">
            phantom.app
          </a>
        </span>
      )
      return
    }

    setIsConnecting(true)
    setSpeechText('connecting to phantom… 🔗')
    setShowSpeechBubble(true)
    setEmotion('neutral')

    try {
      const response = await window.solana.connect()
      const address  = response.publicKey.toString()
      setIsConnecting(false)

      // ── Reconnect: same wallet already claimed here — skip wizard entirely ──
      const claimedWallet = localStorage.getItem('yomo_claimed_wallet')
      if (claimedWallet === address) {
        // Restore session keys so the app behaves as if onboarding was just completed
        localStorage.setItem('connectedViaPhantom', 'true')
        localStorage.setItem('hasCompletedOnboarding', 'true')
        localStorage.setItem('yomo_onboarding_completed', 'true')
        localStorage.setItem('walletAddress', address)
        localStorage.setItem('yomo_wallet_address', address)
        const restoredVariant = getVariantForAddress(address)
        localStorage.setItem('selectedVariant', restoredVariant)
        localStorage.setItem('yomo_variant', restoredVariant)
        onComplete(restoredVariant, address, localStorage.getItem('yomo_emotion') || 'neutral')
        return
      }

      // ── Legacy: connectedViaPhantom still set (session not fully cleared) ──
      if (hasClaimed) {
        handleReturnToYomo()
        return
      }

      // ── New claim wizard ──────────────────────────────────────────────────
      setPhantomAddress(address)
      playClaimChime()
      setClaimStep(1)
      setSpeechText('a new companion awakens... 🌱')
      setShowSpeechBubble(true)
      setEmotion('happy')
    } catch (err) {
      setIsConnecting(false)
      setEmotion('happy')
      setSpeechText("hi, i'm yomo! 👋")
      if (err?.code === 4001) {
        setWalletError('Connection cancelled — try again when ready')
      } else {
        console.error('[Phantom] connect error:', err)
        setWalletError('Failed to connect — please try again')
      }
    }
  }

  /** Load any wallet in view-only mode from the claimed-user search bar. */
  const handleSearchWallet = () => {
    const trimmed = searchAddress.trim()
    if (!trimmed) { setSearchError('Enter a Solana wallet address'); return }
    const { isValid, error } = validateSolanaAddress(trimmed)
    if (!isValid) { setSearchError(error); return }
    setSearchError('')
    if (onViewWallet) onViewWallet(trimmed)
  }

  const handlePasteSubmit = () => {
    const trimmed = walletAddress.trim()
    if (!trimmed) { setWalletError('Please enter a wallet address'); return }
    const { isValid, error } = validateSolanaAddress(trimmed)
    if (!isValid) { setWalletError(error); return }
    setWalletError(null)
    completeOnboarding(trimmed, false)
  }

  const handleContinueWithWallet = () => {
    const trimmed = walletAddress.trim()
    if (!trimmed) { setWalletError('Connect a wallet or paste an address'); return }
    const { isValid, error } = validateSolanaAddress(trimmed)
    if (!isValid) { setWalletError(error); return }
    setWalletError(null)
    completeOnboarding(trimmed, false)
  }

  // ── Styling ──────────────────────────────────────────────────────────────────

  const backgroundClass = theme === 'day'
    ? 'bg-gradient-to-br from-[#fde8d8] to-[#ffc4a3]'
    : 'bg-gradient-to-br from-[#0d0f1a] to-[#1a1d2e]'
  const inputClass = theme === 'day'
    ? 'border-gray-300 bg-white/80 text-gray-800 placeholder-gray-400'
    : 'border-white/30 bg-white/10 text-white placeholder-gray-400'
  const btnMinimal = theme === 'day'
    ? 'text-gray-800 border-gray-400 hover:bg-gray-200/80'
    : 'text-white border-white/40 hover:bg-white/15'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`fixed inset-0 ${backgroundClass} z-50 flex items-center justify-center transition-colors duration-300`}>
      <div className="flex flex-col items-center justify-center w-full max-w-lg px-4">

        {/* Yomo + speech bubble */}
        <div className="relative flex items-center justify-center mb-6">
          <motion.div
            animate={isClaiming ? { scale: [1, 1.13, 0.93, 1.09, 0.97, 1] } : {}}
            transition={{ duration: 0.65, ease: 'easeInOut' }}
          >
            <Yomo
              emotion={emotion}
              variant={variant}
              variantColor={variantColors[variant]}
            />
          </motion.div>

          {showSpeechBubble && !showDocs && (
            <motion.div
              key={speechText}
              className="absolute z-20 left-full ml-1 sm:ml-2 md:ml-3 top-[25%] -translate-y-1/2"
              style={{ maxWidth: 'min(400px, calc(100vw - 120px))', minWidth: '260px' }}
              initial={{ opacity: 0, scale: 0.8, x: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -20 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="relative px-4 py-3 bg-white/95 border-2 border-accent shadow-xl rounded-xl">
                <div
                  className="absolute right-full top-1/2 -translate-y-1/2 hidden sm:block"
                  style={{ width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderRight: '12px solid #8FD4B8' }}
                />
                <div
                  className="absolute right-full top-1/2 -translate-y-1/2 translate-x-[2px] hidden sm:block"
                  style={{ width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderRight: '10px solid rgba(255,255,255,0.95)' }}
                />
                <p className="text-gray-800 font-mono text-sm sm:text-base relative z-10 text-center break-words leading-relaxed">
                  {speechText}
                </p>
              </div>
            </motion.div>
          )}

          {showDocs && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute left-full ml-1 sm:ml-2 top-[25%] -translate-y-1/2 z-20"
              style={{ maxWidth: 'min(420px, calc(100vw - 140px))', minWidth: '280px' }}
            >
              <div className="px-4 py-4 bg-white/95 border-2 border-accent shadow-xl rounded-xl text-left">
                {DOCS_CONTENT}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Claim wizard steps ── */}
        <AnimatePresence mode="wait">
          {claimStep === 1 && (
            <ClaimStep1
              key="step1"
              onNext={() => setClaimStep(2)}
              theme={theme}
            />
          )}

          {claimStep === 2 && (
            <ClaimStep2
              key="step2"
              variant={variant}
              setVariant={(v) => { setVariant(v); setEmotion('happy') }}
              onNext={() => {
                setClaimStep(3)
                setSpeechText("what's my name? 🌱")
                setShowSpeechBubble(true)
              }}
              theme={theme}
            />
          )}

          {/* Step 3: name the Yomo */}
          {claimStep === 3 && (
            <NameInputStep
              key="step3"
              label="give me a name"
              placeholder="e.g. luna, max, spark…"
              value={yomoName}
              onChange={setYomoName}
              onSkip={() => {
                setClaimStep(4)
                setSpeechText("and what's your name? 👤")
                setShowSpeechBubble(true)
              }}
              onContinue={() => {
                setClaimStep(4)
                setSpeechText("and what's your name? 👤")
                setShowSpeechBubble(true)
              }}
              theme={theme}
            />
          )}

          {/* Step 4: name the user */}
          {claimStep === 4 && (
            <NameInputStep
              key="step4"
              label="what should i call you?"
              placeholder="e.g. trader, alice, degen…"
              value={userName}
              onChange={setUserName}
              onSkip={() => setClaimStep(5)}
              onContinue={() => setClaimStep(5)}
              theme={theme}
            />
          )}

          {/* Step 5: CLAIM button */}
          {claimStep === 5 && (
            <StepCard key="step5">
              <div className="flex flex-col items-center gap-3">
                <motion.button
                  onClick={handleClaim}
                  disabled={isClaiming}
                  className={`px-12 py-3 rounded-full font-mono text-base font-bold border-2 backdrop-blur-md transition-all disabled:cursor-not-allowed ${
                    isClaiming
                      ? theme === 'day'
                        ? 'bg-green-600 text-white border-green-500 opacity-80'
                        : 'bg-green-500/40 text-white border-green-400/60 opacity-80'
                      : theme === 'day'
                        ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700 hover:scale-105'
                        : 'bg-white/20 text-white border-white/60 hover:bg-white/30 hover:scale-105'
                  }`}
                  whileHover={isClaiming ? {} : { scale: 1.06 }}
                  whileTap={isClaiming ? {} : { scale: 0.97 }}
                >
                  {isClaiming ? 'Claimed! 🌟' : 'CLAIM'}
                </motion.button>
                {!isClaiming && (
                  <p className={`font-mono text-[10px] opacity-40 ${theme === 'day' ? 'text-gray-600' : 'text-white'}`}>
                    binds this Yomo to your wallet
                  </p>
                )}
              </div>
            </StepCard>
          )}
        </AnimatePresence>

        {/* ── Normal landing buttons (not in claim flow) ── */}
        {!claimStep && !showBeginFlow && !showDocs && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            {hasClaimed ? (
              <div className="w-full flex flex-col items-center gap-4">
                {/* Primary: return to own Yomo */}
                <motion.button
                  onClick={handleReturnToYomo}
                  className={`px-8 py-2.5 rounded-full font-mono text-sm border-2 backdrop-blur-md font-medium transition-all ${
                    theme === 'day'
                      ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700'
                      : 'bg-white/20 text-white border-white/50 hover:bg-white/30'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Go to your Yomo →
                </motion.button>

                {/* Divider */}
                <div className="flex items-center gap-3 w-full max-w-xs">
                  <div className={`flex-1 h-px ${theme === 'day' ? 'bg-gray-300' : 'bg-white/20'}`} />
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${theme === 'day' ? 'text-gray-400' : 'text-white/30'}`}>
                    or view any wallet
                  </span>
                  <div className={`flex-1 h-px ${theme === 'day' ? 'bg-gray-300' : 'bg-white/20'}`} />
                </div>

                {/* Search bar */}
                <div className="w-full max-w-xs">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchAddress}
                      onChange={(e) => { setSearchAddress(e.target.value); setSearchError('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchWallet()}
                      placeholder="search any wallet..."
                      className={`w-full pl-4 pr-10 py-2.5 rounded-xl font-mono text-sm border-2 transition-all focus:outline-none focus:border-accent ${
                        theme === 'day'
                          ? 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
                          : 'bg-white/15 border-white/25 text-white placeholder-white/40'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleSearchWallet}
                      aria-label="Search wallet"
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70 ${
                        theme === 'day' ? 'text-gray-400' : 'text-white/40'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                    </button>
                  </div>
                  {searchError && (
                    <p className="mt-1.5 font-mono text-xs text-red-400">{searchError}</p>
                  )}
                </div>

                {/* DOCS — subtle, below search */}
                <motion.button
                  onClick={() => setShowDocs(true)}
                  className={`px-5 py-1 rounded-full font-mono text-[11px] border backdrop-blur-md transition-all opacity-50 hover:opacity-80 ${btnMinimal}`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  DOCS
                </motion.button>
              </div>
            ) : (
              <div className="flex gap-4">
                <motion.button
                  onClick={() => setShowBeginFlow(true)}
                  className={`px-6 py-2.5 rounded-full font-mono text-sm border-2 backdrop-blur-md transition-all ${btnMinimal}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  BEGIN
                </motion.button>
                <motion.button
                  onClick={() => setShowDocs(true)}
                  className={`px-6 py-2.5 rounded-full font-mono text-sm border-2 backdrop-blur-md transition-all ${btnMinimal}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  DOCS
                </motion.button>
              </div>
            )}
          </motion.div>
        )}

        {showDocs && !claimStep && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowDocs(false)}
            className={`mt-4 px-4 py-2 rounded-full font-mono text-xs border-2 ${btnMinimal}`}
          >
            Close
          </motion.button>
        )}

        {/* ── Begin flow: paste address + Connect Wallet ── */}
        <AnimatePresence>
          {!claimStep && showBeginFlow && (
            <motion.div
              key="beginFlow"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full mt-6 space-y-3 overflow-hidden"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => { setWalletAddress(e.target.value); setWalletError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && !isConnecting && handlePasteSubmit()}
                  placeholder="Paste Solana wallet address..."
                  disabled={isConnecting}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-mono text-sm border-2 transition-all disabled:opacity-50 ${inputClass} focus:outline-none focus:border-accent`}
                />
                <motion.button
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                  className={`px-4 py-2.5 rounded-lg font-mono text-sm font-medium whitespace-nowrap border-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    theme === 'day'
                      ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700'
                      : 'bg-white/15 text-white border-white/40 hover:bg-white/25'
                  }`}
                  whileHover={isConnecting ? {} : { scale: 1.02 }}
                  whileTap={isConnecting ? {} : { scale: 0.98 }}
                >
                  {isConnecting ? 'Connecting…' : 'Connect Wallet'}
                </motion.button>
              </div>

              {walletError && (
                <p className="font-mono text-sm text-red-400">{walletError}</p>
              )}

              <div className="flex gap-2">
                <motion.button
                  onClick={() => setShowBeginFlow(false)}
                  className={`flex-1 px-4 py-2 rounded-lg font-mono text-sm border-2 ${btnMinimal}`}
                >
                  Back
                </motion.button>
                <motion.button
                  onClick={handleContinueWithWallet}
                  disabled={!walletAddress.trim() || isConnecting}
                  className="flex-1 px-4 py-2 rounded-lg font-mono text-sm bg-accent/30 text-white border-2 border-accent hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}

export default Onboarding
