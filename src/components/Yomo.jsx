import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

// Import all emotion images dynamically using Vite's glob import
// This will import all images matching the pattern at build time
const emotionImageModules = import.meta.glob('/src/assets/images/*-*.{png,jpg,jpeg}', { 
  eager: true,
  import: 'default' 
})

// Debug: Log loaded images on module load
if (Object.keys(emotionImageModules).length > 0) {
  console.log('✅ Loaded emotion images:', Object.keys(emotionImageModules).map(k => k.split('/').pop()))
} else {
  console.warn('⚠️ No emotion images found! Check /src/assets/images/ directory')
}

const Yomo = ({ emotion, variant, variantColor }) => {
  const [particles, setParticles] = useState([])
  const [currentImageSrc, setCurrentImageSrc] = useState(null)
  const [nextImageSrc, setNextImageSrc] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Generate image path based on variant and emotion
  const getImagePath = (variantName, emotionName) => {
    // Try .jpg first since most images are .jpg, then .png as fallback
    const possibleKeys = [
      `/src/assets/images/${variantName}-${emotionName}.jpg`,
      `/src/assets/images/${variantName}-${emotionName}.png`,
      `/src/assets/images/${variantName}-${emotionName}.jpeg`,
    ]
    
    for (const key of possibleKeys) {
      if (emotionImageModules[key]) {
        return emotionImageModules[key]
      }
    }
    
    // Log all available keys for debugging if image not found
    const availableKeys = Object.keys(emotionImageModules)
    if (availableKeys.length > 0) {
      console.log('Available emotion images:', availableKeys)
      console.log(`Looking for: ${variantName}-${emotionName}`)
    } else {
      console.warn('No emotion images found in /src/assets/images/. Please ensure images are placed there with naming format: {variant}-{emotion}.jpg or .png')
    }
    
    console.warn(`Image not found: ${variantName}-${emotionName} (tried: ${possibleKeys.join(', ')})`)
    return null
  }

  // Particle generation for positive emotions
  useEffect(() => {
    if (emotion === 'happy') {
      const interval = setInterval(() => {
        setParticles(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            x: Math.random() * 100,
            delay: Math.random() * 0.5
          }
        ])
      }, 300)

      return () => clearInterval(interval)
    } else {
      setParticles([])
    }
  }, [emotion])

  // Remove particles after animation
  useEffect(() => {
    if (particles.length > 0) {
      const timer = setTimeout(() => {
        setParticles(prev => prev.slice(1))
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [particles])

  // Handle image transitions
  useEffect(() => {
    const newImageSrc = getImagePath(variant, emotion)
    
    if (!newImageSrc) {
      const possibleKeys = [
        `/src/assets/images/${variant}-${emotion}.jpg`,
        `/src/assets/images/${variant}-${emotion}.png`,
        `/src/assets/images/${variant}-${emotion}.jpeg`,
      ]
      console.warn(`Image not found: ${variant}-${emotion}`)
      console.warn('Tried paths:', possibleKeys)
      const availableImages = Object.keys(emotionImageModules)
      if (availableImages.length > 0) {
        console.warn('Available images:', availableImages)
      } else {
        console.error('No images loaded! Check that images exist in /src/assets/images/')
      }
      return
    }
    
    if (!currentImageSrc) {
      // Initial load
      setCurrentImageSrc(newImageSrc)
    } else if (currentImageSrc !== newImageSrc) {
      // Transition to new image
      setIsTransitioning(true)
      setNextImageSrc(newImageSrc)
      
      // After transition completes (0.4s), switch images
      const switchTimer = setTimeout(() => {
        setCurrentImageSrc(newImageSrc)
        setNextImageSrc(null)
        setIsTransitioning(false)
      }, 400) // Full transition duration

      return () => clearTimeout(switchTimer)
    }
  }, [variant, emotion, currentImageSrc])

  return (
    <div className="relative flex items-center justify-center">
      {/* Yomo Container with Breathing Animation */}
      <motion.div
        className="relative z-10"
        animate={{
          scale: [1, 1.02, 1],
          y: [0, -5, 0]
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        {/* Image Container with Crossfade */}
        <div className="relative w-64 h-64 md:w-80 md:h-80" style={{ backgroundColor: 'transparent' }}>
          {/* Fallback placeholder when no image is loaded */}
          {!currentImageSrc && !nextImageSrc && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-gray-400 text-sm font-mono p-4 border border-gray-700 rounded-lg bg-black/50">
                <p>Loading {variant}-{emotion}...</p>
              </div>
            </div>
          )}
          
          {/* Current image - fades out during transition */}
          {currentImageSrc && !nextImageSrc && (
            <motion.img
              key={`current-${currentImageSrc}`}
              src={currentImageSrc}
              alt={`Yomo ${variant} ${emotion}`}
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                backgroundColor: 'transparent'
              }}
              initial={{ opacity: 1, scale: 1.0 }}
              animate={{ 
                opacity: 1,
                scale: 1.0
              }}
              onError={(e) => {
                console.error(`Failed to load image: ${currentImageSrc}`)
                e.target.style.display = 'none'
              }}
            />
          )}
          
          {/* Fade out current image during transition */}
          {currentImageSrc && isTransitioning && (
            <motion.img
              key={`fadeout-${currentImageSrc}`}
              src={currentImageSrc}
              alt={`Yomo ${variant}`}
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                backgroundColor: 'transparent'
              }}
              initial={{ opacity: 1, scale: 1.0 }}
              animate={{ 
                opacity: 0,
                scale: 1.0
              }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0, 0.2, 1]
              }}
            />
          )}
          
          {/* Next image - fades in during transition with scale pulse */}
          {nextImageSrc && isTransitioning && (
            <motion.img
              key={`fadein-${nextImageSrc}`}
              src={nextImageSrc}
              alt={`Yomo ${variant} ${emotion}`}
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                backgroundColor: 'transparent'
              }}
              initial={{ opacity: 0, scale: 1.0 }}
              animate={{ 
                opacity: 1,
                scale: [1.0, 1.02, 1.0]
              }}
              transition={{
                opacity: {
                  duration: 0.4,
                  ease: [0.4, 0, 0.2, 1]
                },
                scale: {
                  duration: 0.4,
                  ease: [0.4, 0, 0.2, 1]
                }
              }}
              onError={(e) => {
                console.error(`Failed to load image: ${nextImageSrc}`)
                e.target.style.display = 'none'
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Particles */}
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full"
          style={{
            backgroundColor: variantColor,
            left: `${particle.x}%`,
            bottom: '50%',
            boxShadow: `0 0 10px ${variantColor}`
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 0],
            y: -400,
            x: 20
          }}
          transition={{
            duration: 3,
            delay: particle.delay,
            ease: 'easeOut'
          }}
        />
      ))}
    </div>
  )
}

export default Yomo
