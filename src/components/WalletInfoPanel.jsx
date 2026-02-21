import { useState } from 'react'


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

function formatSolAbs(solChange) {
  return Math.abs(solChange).toFixed(4)
}

function formatSolSigned(solChange) {
  if (solChange === 0) return '0'
  const fixed = Math.abs(solChange).toFixed(4)
  return solChange > 0 ? `+${fixed}` : `-${fixed}`
}

function formatPnlPct(pct) {
  const sign = pct >= 0 ? '+' : ''
  return `(${sign}${pct.toFixed(0)}%)`
}

/** Truncate token symbol to maxLen chars with a trailing ellipsis if needed. */
function truncateToken(name, maxLen = 6) {
  if (!name) return 'SOL'
  return name.length > maxLen ? `${name.slice(0, maxLen)}…` : name
}

/**
 * Format a market cap (or fallback price) value from DexScreener.
 * Large values are shown as $X.XM / $X.XB; small values (price fallback) get
 * enough decimal places to be meaningful.
 */
function formatMktCap(value) {
  if (value == null || value <= 0) return '—'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}k`
  if (value >= 1)   return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  if (value >= 0.0001) return `$${value.toFixed(6)}`
  return `<$0.0001`
}

const WalletInfoPanel = ({ theme, transactions = [] }) => {
  console.log('[WalletInfoPanel] render — transactions prop:', transactions.length, transactions)
  const [isMinimized, setIsMinimized] = useState(false)

  const isDay = theme === 'day'
  const panelClass = isDay
    ? 'bg-white/90 border border-gray-200 shadow-xl text-gray-800'
    : 'bg-white/10 border border-white/20 shadow-xl text-white backdrop-blur-md'
  const labelClass = isDay ? 'text-gray-600 font-mono text-xs' : 'text-white/70 font-mono text-xs'
  // Solid opaque colour for sticky header cells — must exactly cover scrolling body rows.
  // Day panel is white/90 over a light background → #f5f5f5 is visually indistinguishable.
  // Night panel is white/10 over the deep-indigo gradient → #181c2e approximates the result.
  const stickyBg = isDay ? '#f5f5f5' : '#181c2e'
  const rowClass = isDay ? 'border-gray-200' : 'border-white/15'

  return (
    <div className={`rounded-xl p-4 w-[460px] overflow-hidden ${panelClass}`}>

      {/* ── Header: title + minimize toggle ── */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <div className={labelClass}>Recent Trades</div>
        </div>

        {/* Minimize / expand toggle */}
        <button
          type="button"
          onClick={() => setIsMinimized((v) => !v)}
          aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
          className={`ml-2 mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-70 ${isDay ? 'text-gray-500' : 'text-white/60'}`}
        >
          {isMinimized ? (
            /* Plus sign */
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          ) : (
            /* Minus sign */
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 12h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Collapsible transaction list ── */}
      <div
        style={{
          maxHeight: isMinimized ? '0px' : '320px',
          opacity: isMinimized ? 0 : 1,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.25s ease',
        }}
      >
        <div className={`mt-3 mb-1 ${labelClass}`}>Recent transactions</div>
        <div className="overflow-y-auto overflow-x-hidden pr-2" style={{ maxHeight: '260px' }}>
          {transactions.length === 0 ? (
            <p className={`py-2 font-mono text-xs ${isDay ? 'text-gray-500' : 'text-white/50'}`}>
              No recent transactions
            </p>
          ) : (
            <table className="w-full table-fixed font-mono text-xs border-collapse">
              <colgroup>
                {/* Status | Dir | Token | Amount | Mkt Cap | Time
                    Panel 460px − p-4(32px) − scrollbar(17px) − pr-2(8px) ≈ 403px
                    Column budget: 62+40+72+96+76+56 = 402px                         */}
                <col style={{ width: '62px',  minWidth: '62px'  }} />   {/* Status  */}
                <col style={{ width: '40px',  minWidth: '40px'  }} />   {/* Dir     */}
                <col style={{ width: '72px'                      }} />   {/* Token   */}
                <col style={{ width: '96px'                      }} />   {/* Amount  */}
                <col style={{ width: '76px'                      }} />   {/* Mkt Cap */}
                <col style={{ width: '56px'                      }} />   {/* Time    */}
              </colgroup>
              <thead>
                <tr className={`${isDay ? 'text-gray-500' : 'text-white/50'} text-left`}>
                  {['Status', 'Dir', 'Token', 'Amount', 'Mkt Cap', 'Time'].map((label, col) => (
                    <th
                      key={label}
                      className={`py-2 font-medium ${col < 5 ? 'pr-3' : ''} ${col > 2 ? 'text-right' : ''}`}
                      style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: stickyBg }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => {
                  const dir    = tx.tradeDirection  // 'BUY' | 'SELL' | null
                  const status = tx.tradeStatus     // 'FIRST'|'MORE'|'PARTIAL'|'ALL'|'SELL'|null
                  const isBuy  = dir === 'BUY'
                  const isSell = dir === 'SELL'

                  // Status column colour — each label gets a distinctive hue
                  const statusColor = status === 'FIRST'
                    ? (isDay ? 'text-amber-600' : 'text-amber-400')
                    : status === 'MORE'
                      ? (isDay ? 'text-blue-600' : 'text-blue-400')
                      : status === 'PARTIAL'
                        ? (isDay ? 'text-orange-500' : 'text-orange-400')
                        : status === 'ALL'
                          ? (isDay ? 'text-violet-600' : 'text-violet-400')
                          : (isDay ? 'text-gray-400' : 'text-white/30')

                  // Direction cell colour
                  const typeColor = isBuy
                    ? (isDay ? 'text-green-600' : 'text-green-400')
                    : isSell
                      ? (isDay ? 'text-red-600' : 'text-red-400')
                      : (isDay ? 'text-gray-400' : 'text-white/30')

                  // Amount cell colour: green for BUY, red for SELL, sign-based otherwise
                  const amtColor = isBuy
                    ? (isDay ? 'text-green-600' : 'text-green-400')
                    : isSell
                      ? (isDay ? 'text-red-600' : 'text-red-400')
                      : tx.solChange >= 0
                        ? (isDay ? 'text-green-600' : 'text-green-400')
                        : (isDay ? 'text-red-600' : 'text-red-400')

                  // PnL badge colour (independent of trade type)
                  const pnlColor = tx.pnlPct != null && tx.pnlPct >= 0
                    ? (isDay ? 'text-green-600' : 'text-green-400')
                    : (isDay ? 'text-red-600' : 'text-red-400')

                  return (
                    <tr
                      key={tx.signature ? tx.signature : `${tx.timestamp}-${tx.solChange}-${i}`}
                      className={`border-b ${rowClass} last:border-0`}
                    >
                      {/* Status — fixed min-width, never compressed */}
                      <td className={`py-2.5 pr-3 font-semibold text-[10px] tracking-wide whitespace-nowrap ${statusColor}`}>
                        {status ?? '—'}
                      </td>

                      {/* Direction — fixed min-width */}
                      <td className={`py-2.5 pr-3 font-semibold whitespace-nowrap ${typeColor}`}>
                        {dir ?? '—'}
                      </td>

                      {/* Token — truncated to 6 chars, full name on hover */}
                      <td
                        className={`py-2.5 pr-3 overflow-hidden ${isDay ? 'text-gray-700' : 'text-white/80'}`}
                        title={tx.tokenName || 'SOL'}
                      >
                        {truncateToken(tx.tokenName)}
                      </td>

                      {/* Amount + optional PnL% */}
                      <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${amtColor}`}>
                        {isBuy || isSell
                          ? formatSolAbs(tx.solChange)
                          : formatSolSigned(tx.solChange)}
                        {isSell && tx.pnlPct != null && (
                          <span className={`ml-1 ${pnlColor}`}>
                            {formatPnlPct(tx.pnlPct)}
                          </span>
                        )}
                      </td>

                      {/* Mkt Cap */}
                      <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${isDay ? 'text-gray-600' : 'text-white/70'}`}>
                        {formatMktCap(tx.marketCap)}
                      </td>

                      {/* Time */}
                      <td className={`py-2.5 text-right whitespace-nowrap ${isDay ? 'text-gray-500' : 'text-white/50'}`}>
                        {formatTimeAgo(tx.timestamp)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default WalletInfoPanel
