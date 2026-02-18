import { motion } from 'framer-motion'

const variants = [
  { name: 'dawn', color: '#F5E6D3', label: 'Dawn' },
  { name: 'sage', color: '#8FD4B8', label: 'Sage' },
  { name: 'twilight', color: '#5a6a8f', label: 'Twilight' }
]

const VariantSelector = ({ currentVariant, onVariantChange }) => {
  return (
    <div className="flex gap-4 justify-center items-center mb-4">
      {variants.map((variant) => (
        <motion.button
          key={variant.name}
          onClick={() => onVariantChange(variant.name)}
          className={`relative w-12 h-12 rounded-full border-2 transition-all ${
            currentVariant === variant.name
              ? 'border-white scale-110'
              : 'border-gray-600 hover:border-gray-400'
          }`}
          style={{
            backgroundColor: variant.color,
            boxShadow: currentVariant === variant.name
              ? `0 0 20px ${variant.color}, 0 0 40px ${variant.color}`
              : 'none'
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          {currentVariant === variant.name && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                backgroundColor: variant.color,
                opacity: 0.5
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity
              }}
            />
          )}
        </motion.button>
      ))}
    </div>
  )
}

export default VariantSelector

