import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Yomo from './Yomo'
import SpeechBubble from './SpeechBubble'
import { validateSolanaAddress } from '../utils/walletValidation'
import { checkWalletStatus, claimYomo } from '../utils/walletService'

const variantColors = {
  dawn: '#F5E6D3',
  sage: '#8FD4B8',
  twilight: '#5a6a8f'
}

const variants = [
  { id: 'dawn', label: 'Dawn', color: variantColors.dawn },
  { id: 'sage', label: 'Sage', color: variantColors.sage },
  { id: 'twilight', label: 'Twilight', color: variantColors.twilight }
]

const Onboarding = ({ onComplete, theme = 'night' }) => {
  console.log('📚 Onboarding component mounted/render', { theme, onComplete: typeof onComplete })
  
  const [step, setStep] = useState(1) // 1: Greeting, 2: Color Selection, 3: Wallet Binding
  const [selectedVariant, setSelectedVariant] = useState(() => {
    // Randomly select initial variant for greeting
    const variants = ['dawn', 'sage', 'twilight']
    const selected = variants[Math.floor(Math.random() * variants.length)]
    console.log('🎲 Onboarding: Selected random variant:', selected)
    return selected
  })
  const [emotion, setEmotion] = useState('neutral')
  const [showSpeechBubble, setShowSpeechBubble] = useState(false)
  const [speechText, setSpeechText] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletError, setWalletError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [walletStatus, setWalletStatus] = useState(null) // { hasYomo, variant, isPublic, emotion, isOwnWallet }
  
  // DEBUG: Log when component mounts
  useEffect(() => {
    console.log('✅ Onboarding component mounted successfully')
    return () => {
      console.log('🧹 Onboarding component unmounting')
    }
  }, [])

  // Debug logging
  useEffect(() => {
    console.log(`🔄 Onboarding Step ${step}:`, {
      selectedVariant,
      emotion,
      walletAddress: walletAddress ? `${walletAddress.slice(0, 8)}...` : 'none'
    })
  }, [step, selectedVariant, emotion, walletAddress])

  // Step 1: Greeting - Show neutral, then transition to happy after 1s
  useEffect(() => {
    if (step === 1) {
      console.log('📝 Step 1: Starting greeting sequence')
      setEmotion('neutral')
      setShowSpeechBubble(false)
      
      const happyTimer = setTimeout(() => {
        console.log('😊 Step 1: Transitioning to happy emotion')
        setEmotion('happy')
        setShowSpeechBubble(true)
        setSpeechText("Hi! I'm Yomo, your trading companion!")
      }, 1000)

      return () => clearTimeout(happyTimer)
    }
  }, [step])

  const handleGreetingClick = () => {
    console.log('👋 Step 1: User clicked greeting button, moving to Step 2')
    setStep(2)
    setEmotion('happy')
    setShowSpeechBubble(true)
    setSpeechText('Pick your color!')
  }

  const handleVariantSelect = (variantId) => {
    console.log(`🎨 Step 2: User selected variant: ${variantId}`)
    setSelectedVariant(variantId)
    setEmotion('happy')
    // Keep speech bubble visible with same text during transition
    
    // Smooth transition - wait for image to load, then move to wallet step
    setTimeout(() => {
      console.log('✅ Step 2: Variant transition complete, moving to Step 3')
      setStep(3)
      setShowSpeechBubble(true)
      setSpeechText('Bind your wallet to claim your Yomo, or enter any wallet to view their Yomo!')
    }, 500) // Wait for smooth color transition
  }

  const handleWalletInputChange = (e) => {
    const value = e.target.value
    setWalletAddress(value)
    setWalletError('')
    setWalletStatus(null) // Clear previous status
  }

  const handleConnectWallet = async () => {
    console.log('🔌 Attempting to connect wallet...')
    setWalletError('')
    
    // Check for Phantom wallet
    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      try {
        console.log('👻 Phantom wallet detected, connecting...')
        const response = await window.solana.connect()
        const address = response.publicKey.toString()
        console.log('✅ Wallet connected:', address.slice(0, 8) + '...')
        setWalletAddress(address)
        // Auto-enable "Let's Go!" button
      } catch (err) {
        console.error('❌ Error connecting Phantom wallet:', err)
        setWalletError('Failed to connect wallet. Please try again.')
      }
    }
    // Check for Solflare
    else if (typeof window !== 'undefined' && window.solflare) {
      try {
        console.log('🌟 Solflare wallet detected, connecting...')
        const response = await window.solflare.connect()
        const address = response.publicKey.toString()
        console.log('✅ Wallet connected:', address.slice(0, 8) + '...')
        setWalletAddress(address)
      } catch (err) {
        console.error('❌ Error connecting Solflare wallet:', err)
        setWalletError('Failed to connect wallet. Please try again.')
      }
    }
    // No wallet extension found
    else {
      console.warn('⚠️ No wallet extension found')
      setWalletError('No wallet extension found. Please install Phantom or Solflare, or enter a wallet address manually.')
    }
  }

  const handleSubmitWallet = async () => {
    const trimmedAddress = walletAddress.trim()
    
    if (!trimmedAddress) {
      setWalletError('Please enter a wallet address')
      return
    }

    // Validate wallet address format
    const validation = validateSolanaAddress(trimmedAddress)
    if (!validation.isValid) {
      setWalletError(validation.error)
      return
    }

    setIsValidating(true)
    setWalletError('')
    console.log('🔍 Step 3: Checking wallet status for:', trimmedAddress.slice(0, 8) + '...')

    try {
      // Check wallet status
      const status = await checkWalletStatus(trimmedAddress)
      console.log('📊 Wallet Status:', status)
      setWalletStatus(status)

      // Case 1: Has Yomo + Public → Complete onboarding
      if (status.hasYomo && status.isPublic) {
        console.log('✅ Wallet has public Yomo, completing onboarding')
        // Save to localStorage
        localStorage.setItem('hasCompletedOnboarding', 'true')
        localStorage.setItem('selectedVariant', status.variant)
        localStorage.setItem('walletAddress', trimmedAddress)
        localStorage.setItem('isPublic', 'true')
        
        setTimeout(() => {
          onComplete(status.variant, trimmedAddress, status.emotion || 'neutral')
        }, 1000)
        return
      }

      // Case 2: Has Yomo + Private → Show private message
      if (status.hasYomo && !status.isPublic) {
        console.log('🔒 Wallet has private Yomo')
        setWalletError('This Yomo is private 🔒')
        setIsValidating(false)
        return
      }

      // Case 3: No Yomo → Show claim option
      console.log('📭 Wallet has no Yomo, showing claim option')
      setIsValidating(false)
      
      // Always allow claiming if no Yomo found (treat as own wallet for now)
      // In production, you'd verify wallet ownership here
      
    } catch (error) {
      console.error('❌ Error checking wallet status:', error)
      setWalletError('Error checking wallet. Please try again.')
      setIsValidating(false)
    }
  }

  const handleClaimYomo = async () => {
    const trimmedAddress = walletAddress.trim()
    setIsValidating(true)
    setWalletError('')

    try {
      console.log(`🎁 Claiming Yomo for wallet: ${trimmedAddress.slice(0, 8)}... (variant: ${selectedVariant})`)
      await claimYomo(trimmedAddress, selectedVariant)

      // Save to localStorage
      localStorage.setItem('hasCompletedOnboarding', 'true')
      localStorage.setItem('selectedVariant', selectedVariant)
      localStorage.setItem('walletAddress', trimmedAddress)
      localStorage.setItem('isPublic', 'false')
      localStorage.setItem('yomo_emotion', 'neutral')

      console.log('✅ Yomo claimed successfully, completing onboarding')
      
      setTimeout(() => {
        onComplete(selectedVariant, trimmedAddress, 'neutral')
      }, 1000)

    } catch (error) {
      console.error('❌ Error claiming Yomo:', error)
      setWalletError('Error claiming Yomo. Please try again.')
      setIsValidating(false)
    }
  }

  // Theme-based background
  const backgroundClass = theme === 'day'
    ? 'bg-gradient-to-br from-slate-100 via-blue-50 to-purple-50'
    : 'bg-black'

  return (
    <div className={`fixed inset-0 ${backgroundClass} z-50 flex items-center justify-center transition-colors duration-300`}>
      <AnimatePresence mode="wait">
        {/* Step 1: Greeting */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center w-full h-full"
          >
            {/* Yomo and speech bubble container - centered */}
            <div className="relative flex items-center justify-center">
              <Yomo
                emotion={emotion}
                variant={selectedVariant}
                variantColor={variantColors[selectedVariant]}
              />
              {showSpeechBubble && (
                <SpeechBubble text={speechText} isVisible={showSpeechBubble} />
              )}
            </div>

            {/* Button positioned below Yomo/speech bubble with proper spacing */}
            {showSpeechBubble && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                onClick={handleGreetingClick}
                className="mt-[50px] px-8 py-3 rounded-full text-base font-mono bg-white/10 hover:bg-white/20 text-white border-2 border-accent/50 hover:border-accent transition-all duration-300 backdrop-blur-md shadow-lg"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Hi, Yomo! 👋
              </motion.button>
            )}
          </motion.div>
        )}

        {/* Step 2: Color Selection */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center w-full h-full px-4"
          >
            {/* Yomo centered at top */}
            <div className="relative flex items-center justify-center mb-8">
              <Yomo
                emotion={emotion}
                variant={selectedVariant}
                variantColor={variantColors[selectedVariant]}
              />
              {showSpeechBubble && (
                <SpeechBubble text={speechText} isVisible={showSpeechBubble} />
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex gap-6 md:gap-8 mb-8"
            >
              {variants.map((variant) => (
                <motion.button
                  key={variant.id}
                  onClick={() => handleVariantSelect(variant.id)}
                  className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full border-4 transition-all duration-300 backdrop-blur-md shadow-xl ${
                    selectedVariant === variant.id
                      ? 'border-accent scale-110 shadow-2xl'
                      : 'border-white/30 hover:border-white/60'
                  }`}
                  style={{
                    backgroundColor: variant.color,
                    boxShadow: selectedVariant === variant.id
                      ? `0 0 30px ${variant.color}, 0 0 60px ${variant.color}`
                      : `0 0 20px ${variant.color}`
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: selectedVariant === variant.id ? 1.1 : 1 }}
                  transition={{ delay: 0.1 * variants.indexOf(variant) }}
                >
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-white text-sm font-mono whitespace-nowrap">
                    {variant.label}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Step 3: Wallet Binding */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center w-full h-full px-4"
          >
            {/* Yomo centered at top */}
            <div className="relative flex items-center justify-center mb-8">
              <Yomo
                emotion={emotion}
                variant={selectedVariant}
                variantColor={variantColors[selectedVariant]}
              />
              {showSpeechBubble && (
                <SpeechBubble text={speechText} isVisible={showSpeechBubble} />
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="w-full max-w-md space-y-4"
            >
              {/* Connect Wallet Button - Primary Action */}
              <motion.button
                onClick={handleConnectWallet}
                disabled={isValidating || !!walletAddress}
                className={`w-full px-8 py-3 rounded-full text-base font-mono bg-accent/30 hover:bg-accent/40 text-white border-2 border-accent transition-all duration-300 backdrop-blur-md shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                  walletAddress ? 'opacity-70' : ''
                }`}
                whileHover={{ scale: (isValidating || walletAddress) ? 1 : 1.05 }}
                whileTap={{ scale: (isValidating || walletAddress) ? 1 : 0.95 }}
              >
                {walletAddress ? '✓ Wallet Connected' : 'Connect Wallet'}
              </motion.button>

              {/* OR Divider */}
              <div className="flex items-center gap-4">
                <div className={`flex-1 h-px ${theme === 'day' ? 'bg-gray-300' : 'bg-white/20'}`} />
                <span className={`text-sm font-mono ${theme === 'day' ? 'text-gray-600' : 'text-gray-400'}`}>OR</span>
                <div className={`flex-1 h-px ${theme === 'day' ? 'bg-gray-300' : 'bg-white/20'}`} />
              </div>

              {/* Manual Wallet Input Field */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={handleWalletInputChange}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !isValidating && !walletStatus) {
                      handleSubmitWallet()
                    }
                  }}
                  placeholder="Enter Solana wallet address..."
                  className={`w-full px-4 py-3 rounded-lg font-mono text-base border-2 transition-all duration-300 backdrop-blur-md ${
                    walletError
                      ? 'border-red-400 bg-red-500/10'
                      : theme === 'day'
                      ? 'border-gray-300 bg-white/80 text-gray-800 placeholder-gray-400'
                      : 'border-white/30 bg-white/10 text-white placeholder-gray-400'
                  } focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20`}
                  disabled={isValidating || (walletStatus && walletStatus.hasYomo && !walletStatus.isPublic)}
                />
                {walletError && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-sm font-mono px-2 break-words"
                  >
                    {walletError}
                  </motion.p>
                )}
              </div>

              {/* Helper Text */}
              <p className={`text-center text-xs font-mono ${theme === 'day' ? 'text-gray-600' : 'text-gray-400'}`}>
                For now, you can explore any wallet!
              </p>

              {/* Wallet Status Messages */}
              {walletStatus && walletStatus.hasYomo && !walletStatus.isPublic && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <p className={`text-center text-sm font-mono ${theme === 'day' ? 'text-red-700' : 'text-red-400'}`}>
                    This Yomo is private 🔒
                  </p>
                  <button
                    onClick={() => {
                      setWalletAddress('')
                      setWalletStatus(null)
                      setWalletError('')
                    }}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-mono border-2 transition-all duration-300 backdrop-blur-md ${
                      theme === 'day'
                        ? 'border-gray-300 bg-white/50 hover:bg-white/70 text-gray-800'
                        : 'border-white/30 bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    Enter a different wallet address
                  </button>
                </motion.div>
              )}

              {walletStatus && !walletStatus.hasYomo && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <p className={`text-center text-sm font-mono ${theme === 'day' ? 'text-gray-700' : 'text-gray-300'}`}>
                    This wallet hasn't claimed a Yomo yet!
                  </p>
                  {/* Allow claiming for any wallet without a Yomo (for testing) */}
                  <motion.button
                    onClick={handleClaimYomo}
                    disabled={isValidating}
                    className="w-full px-8 py-3 rounded-full text-base font-mono bg-accent/30 hover:bg-accent/40 text-white border-2 border-accent transition-all duration-300 backdrop-blur-md shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: isValidating ? 1 : 1.05 }}
                    whileTap={{ scale: isValidating ? 1 : 0.95 }}
                  >
                    {isValidating ? 'Claiming...' : 'Claim This Yomo'}
                  </motion.button>
                </motion.div>
              )}

              {/* Submit/Continue Button - Only show if no wallet status or has public Yomo */}
              {(!walletStatus || (walletStatus.hasYomo && walletStatus.isPublic)) && (
                <motion.button
                  onClick={handleSubmitWallet}
                  disabled={!walletAddress.trim() || isValidating}
                  className="w-full px-8 py-3 rounded-full text-base font-mono bg-accent/30 hover:bg-accent/40 text-white border-2 border-accent transition-all duration-300 backdrop-blur-md shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: (!walletAddress.trim() || isValidating) ? 1 : 1.05 }}
                  whileTap={{ scale: (!walletAddress.trim() || isValidating) ? 1 : 0.95 }}
                >
                  {isValidating ? 'Checking...' : "Let's Go!"}
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Onboarding
