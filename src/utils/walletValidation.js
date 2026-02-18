/**
 * Validates a Solana wallet address
 * @param {string} address - The wallet address to validate
 * @returns {object} - { isValid: boolean, error: string }
 */
export const validateSolanaAddress = (address) => {
  if (!address || address.trim() === '') {
    return { isValid: false, error: 'Wallet address cannot be empty' }
  }

  const trimmed = address.trim()

  // Basic Solana address format check:
  // - Starts with a letter (Base58 encoding uses 1-9, A-H, J-N, P-Z, a-k, m-z, excluding 0, O, I, l)
  // - Length between 32-44 characters
  // - Uses Base58 characters only

  // Check length
  if (trimmed.length < 32 || trimmed.length > 44) {
    return { 
      isValid: false, 
      error: 'Invalid address length. Solana addresses are 32-44 characters.' 
    }
  }

  // Check if starts with letter or number (Base58 can start with 1-9, but typically addresses start with letters)
  const firstChar = trimmed[0]
  if (!/^[1-9A-HJ-NP-Za-km-z]/.test(firstChar)) {
    return { 
      isValid: false, 
      error: 'Invalid address format. Must start with a valid Base58 character.' 
    }
  }

  // Check if contains only Base58 characters (no 0, O, I, l)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return { 
      isValid: false, 
      error: 'Invalid characters. Solana addresses use Base58 encoding (no 0, O, I, l).' 
    }
  }

  // For testing: accept any valid-looking address
  return { isValid: true, error: null }
}


