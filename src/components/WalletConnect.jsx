import { useState } from 'react'
import { motion } from 'framer-motion'

const WalletConnect = ({ theme = 'night' }) => {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')

  const handleConnect = async () => {
    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      try {
        const response = await window.solana.connect()
        setWalletAddress(response.publicKey.toString())
        setIsConnected(true)
      } catch (err) {
        console.error('Error connecting wallet:', err)
      }
    } else {
      // For MVP demo, simulate connection
      setWalletAddress('DemoWallet1234567890')
      setIsConnected(true)
    }
  }

  const handleDisconnect = () => {
    if (window.solana && window.solana.disconnect) {
      window.solana.disconnect()
    }
    setIsConnected(false)
    setWalletAddress('')
  }

  const truncateAddress = (address) => {
    if (!address) return ''
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const isDay = theme === 'day'
  const connectBtnClass = isDay
    ? 'px-4 py-2.5 rounded-lg bg-slate-800 text-white border-2 border-slate-600 font-mono text-sm font-medium hover:bg-slate-700 hover:border-slate-500 transition-all shadow-lg'
    : 'px-4 py-2.5 rounded-lg bg-white/15 text-white border-2 border-white/40 font-mono text-sm font-medium hover:bg-white/25 hover:border-white/50 backdrop-blur-md transition-all shadow-lg'
  const connectedBoxClass = isDay
    ? 'flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border-2 border-slate-600 shadow-lg'
    : 'flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/15 border-2 border-white/40 backdrop-blur-md shadow-lg'
  const addressClass = isDay ? 'text-white font-mono text-sm' : 'text-white font-mono text-sm'
  const disconnectBtnClass = isDay
    ? 'text-slate-300 hover:text-white transition-colors text-lg leading-none'
    : 'text-white/80 hover:text-white transition-colors text-lg leading-none'

  return (
    <div className="fixed top-4 right-4 z-50">
      {!isConnected ? (
        <motion.button
          onClick={handleConnect}
          className={connectBtnClass}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Connect Wallet
        </motion.button>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={connectedBoxClass}
        >
          <span className={addressClass}>
            {truncateAddress(walletAddress)}
          </span>
          <motion.button
            onClick={handleDisconnect}
            className={disconnectBtnClass}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            ×
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}

export default WalletConnect

