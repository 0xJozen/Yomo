/**
 * Wallet Service - Handles wallet status checking and Yomo claiming
 * For now, this is a mock service. Later it will connect to blockchain
 */

// Mock wallet database (in production, this would be on-chain data)
const mockWalletDatabase = {
  // Format: address -> { variant: 'dawn'|'sage'|'twilight', isPublic: boolean, emotion: string }
  // Example entries for testing:
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

