import { motion, AnimatePresence } from 'framer-motion'

const SpeechBubble = ({ text, isVisible, loading = false }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute z-20 left-full ml-2 sm:ml-3 md:ml-6 top-1/2 -translate-y-1/2"
          style={{
            maxWidth: 'min(400px, calc(100vw - 120px))',
            minWidth: '280px'
          }}
          initial={{ opacity: 0, scale: 0.8, x: -20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8, x: -20 }}
          transition={{
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          <div
            className="relative px-4 py-3 bg-white/95 border-2 border-accent shadow-xl"
            style={{
              borderRadius: '12px',
              minWidth: '100%',
              maxWidth: '100%',
            }}
          >
            {/* Speech bubble tail/pointer pointing left toward Yomo */}
            <div
              className="absolute right-full top-1/2 -translate-y-1/2 hidden sm:block"
              style={{
                width: 0,
                height: 0,
                borderTop: '12px solid transparent',
                borderBottom: '12px solid transparent',
                borderRight: '12px solid #8FD4B8',
              }}
            />
            <div
              className="absolute right-full top-1/2 -translate-y-1/2 translate-x-[2px] hidden sm:block"
              style={{
                width: 0,
                height: 0,
                borderTop: '10px solid transparent',
                borderBottom: '10px solid transparent',
                borderRight: '10px solid rgba(255, 255, 255, 0.95)',
              }}
            />

            {loading ? (
              <motion.p
                className="text-gray-400 font-mono text-sm sm:text-base relative z-10 text-center leading-relaxed tracking-widest"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                ···
              </motion.p>
            ) : (
              <p className="text-gray-800 font-mono text-sm sm:text-base relative z-10 text-center break-words leading-relaxed">
                {text}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default SpeechBubble
