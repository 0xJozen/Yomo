import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const LoadingScreen = ({ onComplete, variantColor }) => {
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    console.log('⏱️ LoadingScreen: Starting 2s timer')
    const timer = setTimeout(() => {
      console.log('✅ LoadingScreen: Timer complete, setting isComplete')
      setIsComplete(true)
      setTimeout(() => {
        console.log('📞 LoadingScreen: Calling onComplete callback')
        onComplete()
      }, 500)
    }, 2000)

    return () => {
      console.log('🧹 LoadingScreen: Cleanup timer')
      clearTimeout(timer)
    }
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ backgroundColor: '#000000' }}
      animate={{ 
        backgroundColor: isComplete ? 'rgba(10, 10, 10, 0)' : '#000000' 
      }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="relative"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ 
          scale: isComplete ? 1 : 0.5,
          opacity: isComplete ? 0 : 1
        }}
        transition={{ 
          duration: 1.5,
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {/* Eyes */}
        <div className="flex gap-8 mb-4">
          <motion.div
            className="h-1 w-12 rounded-full"
            style={{ 
              backgroundColor: variantColor,
              boxShadow: `0 0 20px ${variantColor}, 0 0 40px ${variantColor}`
            }}
            animate={{
              opacity: [0.6, 1, 0.6],
              filter: ['blur(2px)', 'blur(4px)', 'blur(2px)'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
          <motion.div
            className="h-1 w-12 rounded-full"
            style={{ 
              backgroundColor: variantColor,
              boxShadow: `0 0 20px ${variantColor}, 0 0 40px ${variantColor}`
            }}
            animate={{
              opacity: [0.6, 1, 0.6],
              filter: ['blur(2px)', 'blur(4px)', 'blur(2px)'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
        </div>
        
        {/* Mouth */}
        <motion.div
          className="h-1 w-8 mx-auto rounded-full"
          style={{ 
            backgroundColor: variantColor,
            boxShadow: `0 0 15px ${variantColor}, 0 0 30px ${variantColor}`
          }}
          animate={{
            opacity: [0.6, 1, 0.6],
            filter: ['blur(2px)', 'blur(4px)', 'blur(2px)'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.1
          }}
        />
      </motion.div>
    </motion.div>
  )
}

export default LoadingScreen

