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

// ─────────────────────────────────────────────────────────────────────────────
// Per-wallet variant helpers
// ─────────────────────────────────────────────────────────────────────────────
const VARIANTS = ['dawn', 'sage', 'twilight']

/**
 * Return the variant for a given wallet address.
 *
 * Priority:
 *  1. `yomo_variant_{address}` in localStorage (user-chosen or previously assigned)
 *  2. Deterministic hash of the address — always the same value for the same address
 *     so every viewer sees a consistent Yomo without needing a stored key.
 *
 * The result is saved back to localStorage on first assignment so future reads
 * never need to recompute.
 */
export function getVariantForAddress(address) {
  if (!address) return 'sage'
  const stored = localStorage.getItem(`yomo_variant_${address}`)
  if (stored && VARIANTS.includes(stored)) return stored

  // Simple deterministic hash (djb2-style, unsigned)
  let h = 5381
  for (let i = 0; i < address.length; i++) {
    h = ((h << 5) + h + address.charCodeAt(i)) >>> 0
  }
  const v = VARIANTS[h % VARIANTS.length]
  try { localStorage.setItem(`yomo_variant_${address}`, v) } catch { /* quota / private mode */ }
  return v
}

/** Persist a user-chosen variant for a specific wallet address. */
export function saveVariantForAddress(address, variant) {
  if (!address || !VARIANTS.includes(variant)) return
  try { localStorage.setItem(`yomo_variant_${address}`, variant) } catch { /* quota / private mode */ }
}

