import { motion } from 'framer-motion'

const emotions = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Happy' },
  { id: 'sad', label: 'Sad' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'sleepy', label: 'Sleepy' }
]

const EmotionControls = ({ currentEmotion, onEmotionChange }) => {
  return (
    <div className="flex flex-wrap gap-2 justify-center px-4 py-4">
      {emotions.map((emotion) => (
        <motion.button
          key={emotion.id}
          onClick={() => onEmotionChange(emotion.id)}
          className={`px-4 py-2 rounded-lg text-sm font-mono transition-all backdrop-blur-md ${
            currentEmotion === emotion.id
              ? 'bg-accent/30 text-white border-2 border-accent'
              : 'bg-white/5 text-gray-400 border-2 border-transparent hover:border-gray-600 hover:text-gray-300'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {emotion.label}
        </motion.button>
      ))}
    </div>
  )
}

export default EmotionControls

