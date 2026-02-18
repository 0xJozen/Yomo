import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

const ThemeToggle = ({ onThemeChange }) => {
  const [isDayMode, setIsDayMode] = useState(() => {
    const saved = localStorage.getItem('yomo_theme')
    return saved === 'day'
  })

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem('yomo_theme', isDayMode ? 'day' : 'night')
    // Notify parent component
    onThemeChange(isDayMode ? 'day' : 'night')
  }, [isDayMode, onThemeChange])

  const toggleTheme = () => {
    setIsDayMode(!isDayMode)
  }

  return (
    <motion.button
      onClick={toggleTheme}
      className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border-2 border-white/20 hover:border-white/40 backdrop-blur-md flex items-center justify-center transition-all duration-300 shadow-lg"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{
          rotate: isDayMode ? 0 : 180,
          scale: isDayMode ? 1 : 0.9
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="text-2xl"
      >
        {isDayMode ? '☀️' : '🌙'}
      </motion.div>
    </motion.button>
  )
}

export default ThemeToggle


