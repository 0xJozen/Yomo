import { useState, useEffect } from 'react'
import LoadingScreen from './components/LoadingScreen'
import Onboarding from './components/Onboarding'
import Yomo from './components/Yomo'
import WalletConnect from './components/WalletConnect'
import ThemeToggle from './components/ThemeToggle'
import './styles/animations.css'

console.log('🚀 App.jsx loaded')

const variantColors = {
  dawn: '#F5E6D3',
  sage: '#8FD4B8',
  twilight: '#5a6a8f'
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
      localStorage.removeItem('hasCompletedOnboarding')
      localStorage.removeItem('yomo_onboarding_completed')
      localStorage.removeItem('selectedVariant')
      localStorage.removeItem('yomo_variant')
      localStorage.removeItem('walletAddress')
      localStorage.removeItem('yomo_wallet_address')
      localStorage.removeItem('isPublic')
      localStorage.removeItem('yomo_emotion')
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

  // Reset shortcut (Shift + R)
  useEffect(() => {
    // Log reset shortcut info on load
    console.log('💡 Tip: Press Shift + R to reset onboarding and clear localStorage')

    const handleKeyDown = (e) => {
      if (e.shiftKey && e.key === 'R') {
        console.log('🔄 Reset triggered - clearing localStorage and restarting onboarding')
        // Clear all onboarding-related localStorage
        localStorage.removeItem('hasCompletedOnboarding')
        localStorage.removeItem('yomo_onboarding_completed')
        localStorage.removeItem('selectedVariant')
        localStorage.removeItem('yomo_variant')
        localStorage.removeItem('walletAddress')
        localStorage.removeItem('yomo_wallet_address')
        localStorage.removeItem('isPublic')
        localStorage.removeItem('yomo_emotion')
        // Reload page to restart onboarding
        window.location.reload()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLoadingComplete = () => {
    console.log('⏱️ Loading screen completed')
    setIsLoading(false)
    
    // Check if user has completed onboarding (new structure)
    const hasCompletedOnboarding = localStorage.getItem('hasCompletedOnboarding')
    const oldOnboardingCompleted = localStorage.getItem('yomo_onboarding_completed')
    const onboardingCompleted = hasCompletedOnboarding || oldOnboardingCompleted
    
    console.log('🔍 DEBUG - Checking onboarding status after loading:', {
      hasCompletedOnboarding,
      oldOnboardingCompleted,
      onboardingCompleted,
      willShowOnboarding: !onboardingCompleted
    })
    
    // TEMP: Force show onboarding for debugging - comment this out after testing
    // setShowOnboarding(true)
    // console.log('🔧 DEBUG MODE: Forcing onboarding to show')
    
    if (!onboardingCompleted) {
      console.log('✅ Showing onboarding (not completed)')
      setShowOnboarding(true)
    } else {
      console.log('⏭️ Skipping onboarding (already completed)')
      setShowOnboarding(false)
    }
  }

  const handleOnboardingComplete = (selectedVariant, walletAddress, initialEmotion = 'neutral') => {
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
    console.log('🏁 Onboarding hidden, showing main app')
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
  }

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

  // Theme-based background styles
  const backgroundStyle = theme === 'day'
    ? 'bg-gradient-to-br from-slate-100 via-blue-50 to-purple-50'
    : 'bg-[#0a0a0a]'

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
        {/* DEBUG: Visual indicator (remove after debugging) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 right-4 z-50 bg-black/80 text-white text-xs font-mono p-2 rounded border border-white/20">
            <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
            <div>Onboarding: {showOnboarding ? 'Yes' : 'No'}</div>
            <div>Step: {showOnboarding ? '?' : 'N/A'}</div>
            <div>Scale: {scale.toFixed(2)}</div>
          </div>
        )}
        
        {!isLoading && <ThemeToggle onThemeChange={handleThemeChange} />}
        
        {isLoading ? (
          <LoadingScreen 
            onComplete={handleLoadingComplete}
            variantColor={variantColors[variant]}
          />
        ) : showOnboarding ? (
          <Onboarding onComplete={handleOnboardingComplete} theme={theme} />
        ) : (
          <>
            <WalletConnect />
            
            <div className="flex flex-col items-center justify-center flex-1 w-full px-4 py-8 max-w-6xl mx-auto">
              {/* Yomo Character */}
              <div className="relative my-8 flex items-center justify-center">
                <Yomo
                  emotion={emotion}
                  variant={variant}
                  variantColor={variantColors[variant]}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App

