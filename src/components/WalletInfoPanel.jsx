import { useState, useRef, useEffect } from 'react'
import { validateSolanaAddress } from '../utils/walletValidation'

const truncateAddress = (address) => {
  if (!address || address.length < 10) return address || ''
  return `${address.slice(0, 4)}...${address.slice(-3)}`
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '—'
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

function formatSolChange(solChange) {
  if (solChange === 0) return '0'
  const fixed = Math.abs(solChange).toFixed(4)
  return solChange > 0 ? `+${fixed}` : `-${fixed}`
}

function formatMarketCap(value) {
  if (value == null || value <= 0) return '—'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${Math.round(value / 1e3)}k`
  return `$${Math.round(value)}`
}

const WalletInfoPanel = ({ theme, walletAddress, transactions = [], onAddressChange }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const isDay = theme === 'day'
  const panelClass = isDay
    ? 'bg-white/90 border border-gray-200 shadow-xl text-gray-800'
    : 'bg-white/10 border border-white/20 shadow-xl text-white backdrop-blur-md'
  const inputClass = isDay
    ? 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
    : 'bg-white/15 border-white/30 text-white placeholder-white/50'
  const labelClass = isDay ? 'text-gray-600 font-mono text-xs' : 'text-white/70 font-mono text-xs'
  const rowClass = isDay ? 'border-gray-200' : 'border-white/15'

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus()
  }, [isEditing])

  const handleStartEdit = () => {
    setInputValue(walletAddress || '')
    setError('')
    setIsEditing(true)
  }

  const handleCancel = () => {
    setInputValue('')
    setError('')
    setIsEditing(false)
  }

  const handleConfirm = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      handleCancel()
      return
    }
    const { isValid, error: err } = validateSolanaAddress(trimmed)
    if (!isValid) {
      setError(err || 'Invalid address')
      return
    }
    setError('')
    setIsEditing(false)
    setInputValue('')
    onAddressChange(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm()
    else if (e.key === 'Escape') handleCancel()
  }

  return (
    <div className={`rounded-xl p-4 w-[360px] overflow-hidden ${panelClass}`}>
      <div className="mb-3">
        <div className={labelClass}>Wallet</div>
        {isEditing ? (
          <div className="mt-1 space-y-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste Solana address..."
              className={`w-full px-3 py-2 rounded-lg font-mono text-sm border-2 focus:outline-none focus:border-accent ${inputClass}`}
              aria-label="Wallet address"
            />
            {error && <p className="font-mono text-xs text-red-400">{error}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            className="mt-1 flex items-center gap-1.5 font-mono text-sm hover:opacity-80 transition-opacity"
          >
            <span>{truncateAddress(walletAddress) || 'No address'}</span>
            <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      <div className={labelClass}>Recent transactions</div>
      <div className="mt-2 max-h-[240px] overflow-y-auto overflow-x-hidden">
        {transactions.length === 0 ? (
          <p className={`py-2 font-mono text-xs ${isDay ? 'text-gray-500' : 'text-white/50'}`}>
            No recent transactions
          </p>
        ) : (
          <table className="w-full table-fixed font-mono text-xs border-collapse">
            <colgroup>
              <col style={{ width: '52px' }} />
              <col style={{ width: '94px' }} />
              <col style={{ width: '68px' }} />
              <col style={{ width: '60px' }} />
            </colgroup>
            <thead>
              <tr className={`${isDay ? 'text-gray-500' : 'text-white/50'} text-left sticky top-0 ${isDay ? 'bg-white/90' : 'bg-black/20'}`}>
                <th className="py-1.5 pr-1.5 font-medium">Token</th>
                <th className="py-1.5 pr-1.5 font-medium text-right">Amount</th>
                <th className="py-1.5 pr-1.5 font-medium text-right">Mkt Cap</th>
                <th className="py-1.5 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => (
                <tr
                  key={tx.signature ? tx.signature : `${tx.timestamp}-${tx.solChange}-${i}`}
                  className={`border-b ${rowClass} last:border-0`}
                >
                  <td className="py-2 pr-1.5 truncate" title={tx.type}>{tx.tokenName || 'SOL'}</td>
                  <td className={`py-2 pr-1.5 text-right whitespace-nowrap ${tx.solChange >= 0 ? (isDay ? 'text-green-600' : 'text-green-400') : isDay ? 'text-red-600' : 'text-red-400'}`}>
                    {formatSolChange(tx.solChange)}
                  </td>
                  <td className={`py-2 pr-1.5 text-right whitespace-nowrap ${isDay ? 'text-gray-600' : 'text-white/70'}`}>
                    {formatMarketCap(tx.marketCap)}
                  </td>
                  <td className={`py-2 text-right whitespace-nowrap ${isDay ? 'text-gray-500' : 'text-white/50'}`}>
                    {formatTimeAgo(tx.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default WalletInfoPanel
