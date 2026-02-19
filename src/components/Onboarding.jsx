import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Yomo from './Yomo'
import SpeechBubble from './SpeechBubble'
import { validateSolanaAddress } from '../utils/walletValidation'

const variantColors = {
  dawn: '#F5E6D3',
  sage: '#8FD4B8',
  twilight: '#5a6a8f'
}

const DOCS_CONTENT = (
  <>
    <p className="font-mono text-sm sm:text-base text-gray-800 leading-relaxed mb-3">
      <strong>Yomo</strong> is your AI trading companion — a friendly character that lives in your wallet and reacts to your trading journey.
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

const Onboarding = ({ onComplete, theme = 'night' }) => {
  const [emotion, setEmotion] = useState('neutral')
  const [showSpeechBubble, setShowSpeechBubble] = useState(false)
  const [speechText, setSpeechText] = useState("hi, i'm yomo! 👋")
  const [showBeginFlow, setShowBeginFlow] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletError, setWalletError] = useState('')
  const [connectedViaPhantom, setConnectedViaPhantom] = useState(false)
  const [variant] = useState(() => {
    const variants = ['dawn', 'sage', 'twilight']
    return variants[Math.floor(Math.random() * variants.length)]
  })

  // Neutral → happy after 1s
  useEffect(() => {
    setEmotion('neutral')
    setShowSpeechBubble(false)
    const t = setTimeout(() => {
      setEmotion('happy')
      setShowSpeechBubble(true)
      setSpeechText("hi, i'm yomo! 👋")
    }, 1000)
    return () => clearTimeout(t)
  }, [])

  const handleConnectWallet = async () => {
    setWalletError('')
    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      try {
        const response = await window.solana.connect()
        const address = response.publicKey.toString()
        setWalletAddress(address)
        setConnectedViaPhantom(true)
      } catch (err) {
        console.error('Error connecting wallet:', err)
        setWalletError('Failed to connect wallet. Please try again.')
      }
    } else {
      setWalletAddress('DemoWallet1234567890')
      setConnectedViaPhantom(false)
    }
  }

  const handlePasteSubmit = () => {
    const trimmed = walletAddress.trim()
    if (!trimmed) {
      setWalletError('Please enter a wallet address')
      return
    }
    const validation = validateSolanaAddress(trimmed)
    if (!validation.isValid) {
      setWalletError(validation.error)
      return
    }
    setWalletError('')
    completeOnboarding(trimmed, false)
  }

  const completeOnboarding = (address, connectedViaPhantomFlag) => {
    localStorage.setItem('hasCompletedOnboarding', 'true')
    localStorage.setItem('selectedVariant', variant)
    localStorage.setItem('walletAddress', address)
    localStorage.setItem('yomo_onboarding_completed', 'true')
    localStorage.setItem('yomo_variant', variant)
    localStorage.setItem('yomo_wallet_address', address)
    localStorage.setItem('yomo_emotion', 'neutral')
    localStorage.setItem('connectedViaPhantom', connectedViaPhantomFlag ? 'true' : 'false')
    onComplete(variant, address, 'neutral')
  }

  const handleContinueWithWallet = () => {
    const trimmed = walletAddress.trim()
    if (!trimmed) {
      setWalletError('Connect a wallet or paste an address')
      return
    }
    // Allow demo wallet from Connect Wallet fallback; otherwise validate format
    if (trimmed !== 'DemoWallet1234567890') {
      const validation = validateSolanaAddress(trimmed)
      if (!validation.isValid) {
        setWalletError(validation.error)
        return
      }
    }
    setWalletError('')
    completeOnboarding(trimmed, connectedViaPhantom)
  }

  const backgroundClass = theme === 'day'
    ? 'bg-gradient-to-br from-[#fde8d8] to-[#ffc4a3]'
    : 'bg-gradient-to-br from-[#0d0f1a] to-[#1a1d2e]'

  const inputClass = theme === 'day'
    ? 'border-gray-300 bg-white/80 text-gray-800 placeholder-gray-400'
    : 'border-white/30 bg-white/10 text-white placeholder-gray-400'

  const btnMinimal = theme === 'day'
    ? 'text-gray-800 border-gray-400 hover:bg-gray-200/80'
    : 'text-white border-white/40 hover:bg-white/15'

  return (
    <div className={`fixed inset-0 ${backgroundClass} z-50 flex items-center justify-center transition-colors duration-300`}>
      <div className="flex flex-col items-center justify-center w-full max-w-lg px-4">
        <div className="relative flex items-center justify-center mb-6">
          <Yomo
            emotion={emotion}
            variant={variant}
            variantColor={variantColors[variant]}
          />
          {showSpeechBubble && !showDocs && (
            <motion.div
              className="absolute z-20 left-full ml-1 sm:ml-2 md:ml-3 top-[25%] -translate-y-1/2"
              style={{
                maxWidth: 'min(400px, calc(100vw - 120px))',
                minWidth: '280px'
              }}
              initial={{ opacity: 0, scale: 0.8, x: -20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -20 }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0, 0.2, 1]
              }}
            >
              <div className="relative px-4 py-3 bg-white/95 border-2 border-accent shadow-xl rounded-xl">
                <div
                  className="absolute right-full top-1/2 -translate-y-1/2 hidden sm:block"
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderRight: '12px solid #8FD4B8',
                  }}
                />
                <div
                  className="absolute right-full top-1/2 -translate-y-1/2 translate-x-[2px] hidden sm:block"
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '10px solid transparent',
                    borderBottom: '10px solid transparent',
                    borderRight: '10px solid rgba(255, 255, 255, 0.95)',
                  }}
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

        {!showBeginFlow && !showDocs && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex gap-4"
          >
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
          </motion.div>
        )}

        {showDocs && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowDocs(false)}
            className={`mt-4 px-4 py-2 rounded-full font-mono text-xs border-2 ${btnMinimal}`}
          >
            Close
          </motion.button>
        )}

        <AnimatePresence>
          {showBeginFlow && (
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
                  onChange={(e) => {
                    setWalletAddress(e.target.value)
                    setWalletError('')
                    setConnectedViaPhantom(false)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasteSubmit()}
                  placeholder="Paste Solana wallet address..."
                  className={`flex-1 px-4 py-2.5 rounded-lg font-mono text-sm border-2 transition-all ${inputClass} focus:outline-none focus:border-accent`}
                />
                <motion.button
                  onClick={handleConnectWallet}
                  className={`px-4 py-2.5 rounded-lg font-mono text-sm font-medium whitespace-nowrap border-2 transition-all ${
                    theme === 'day'
                      ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700'
                      : 'bg-white/15 text-white border-white/40 hover:bg-white/25'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Connect Wallet
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
                  disabled={!walletAddress.trim()}
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
