import { useState } from 'react'
import { motion } from 'framer-motion'

const WalletConnect = () => {
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

  return (
    <div className="absolute top-4 right-4 z-20">
      {!isConnected ? (
        <motion.button
          onClick={handleConnect}
          className="px-4 py-2 rounded-lg bg-accent/20 text-accent border-2 border-accent/50 backdrop-blur-md font-mono text-sm hover:bg-accent/30 transition-all"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Connect Wallet
        </motion.button>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/20 border-2 border-accent/50 backdrop-blur-md"
        >
          <span className="text-accent font-mono text-sm">
            {truncateAddress(walletAddress)}
          </span>
          <motion.button
            onClick={handleDisconnect}
            className="text-accent hover:text-white transition-colors text-sm"
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

