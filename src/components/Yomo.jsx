import { useState, useEffect, useRef } from 'react'
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
  const currentImageSrcRef = useRef(null)
  currentImageSrcRef.current = currentImageSrc

  // Asset folder uses "mint" for the sage variant; app uses "sage"
  const variantToAssetPrefix = { sage: 'mint', dawn: 'dawn', twilight: 'twilight' }
  const getImagePath = (variantName, emotionName) => {
    const assetPrefix = variantToAssetPrefix[variantName] ?? variantName
    const base = `${assetPrefix}-${emotionName}`
    const extensions = ['.jpg', '.png', '.jpeg']
    // Vite glob keys can be with or without leading slash (e.g. /src/... or src/...)
    const pathPrefixes = ['/src/assets/images/', 'src/assets/images/']
    const possibleKeys = []
    for (const prefix of pathPrefixes) {
      for (const ext of extensions) {
        possibleKeys.push(`${prefix}${base}${ext}`)
      }
    }
    for (const key of possibleKeys) {
      if (emotionImageModules[key]) {
        return emotionImageModules[key]
      }
    }
    // Fallback: try matching any key that ends with our base+ext (handles OS path differences)
    const matchKey = Object.keys(emotionImageModules).find(
      (k) => k.includes(base) && (k.endsWith('.jpg') || k.endsWith('.png') || k.endsWith('.jpeg'))
    )
    if (matchKey) return emotionImageModules[matchKey]

    const availableKeys = Object.keys(emotionImageModules)
    if (availableKeys.length > 0) {
      console.warn(`Image not found: ${variantName}-${emotionName} (asset prefix: ${assetPrefix}), tried:`, possibleKeys.slice(0, 3), 'Available:', availableKeys.map((k) => k.split('/').pop()))
    } else {
      console.warn('No emotion images found in /src/assets/images/. Use naming format: {variant}-{emotion}.jpg or .png')
    }
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

  // Handle image transitions: only run when variant or emotion change to avoid re-run loops from setState
  useEffect(() => {
    const loadedKeys = Object.keys(emotionImageModules)
    console.log(
      `[Yomo] emotion="${emotion}" variant="${variant}" — ${loadedKeys.length} image(s) loaded:`,
      loadedKeys.map((k) => k.split('/').pop())
    )

    const newImageSrc = getImagePath(variant, emotion)
    console.log(
      `[Yomo] getImagePath("${variant}", "${emotion}") →`,
      newImageSrc ? `found (${typeof newImageSrc === 'string' ? newImageSrc.slice(0, 60) : '[module]'})` : 'NOT FOUND'
    )

    const current = currentImageSrcRef.current

    if (!newImageSrc) {
      const assetPrefix = { sage: 'mint', dawn: 'dawn', twilight: 'twilight' }[variant] ?? variant
      console.warn(
        `[Yomo] Image not found for variant="${variant}" (asset prefix="${assetPrefix}") emotion="${emotion}".`,
        `\nTried: ${assetPrefix}-${emotion}.{jpg,png,jpeg} in /src/assets/images/`,
        `\nLoaded images:`, loadedKeys.map((k) => k.split('/').pop())
      )
      return
    }

    if (!current) {
      console.log(`[Yomo] Initial image set: ${variant}-${emotion}`)
      setCurrentImageSrc(newImageSrc)
    } else if (current !== newImageSrc) {
      console.log(`[Yomo] Transitioning image: ${variant}-${emotion}`)
      setIsTransitioning(true)
      setNextImageSrc(newImageSrc)
      const switchTimer = setTimeout(() => {
        setCurrentImageSrc(newImageSrc)
        setNextImageSrc(null)
        setIsTransitioning(false)
      }, 400)
      return () => clearTimeout(switchTimer)
    } else {
      console.log(`[Yomo] Image already showing: ${variant}-${emotion}`)
    }
  }, [variant, emotion])

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
