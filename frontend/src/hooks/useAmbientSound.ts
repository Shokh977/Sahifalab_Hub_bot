import { useRef, useCallback, useState, useEffect } from 'react'

export type SoundType = 'rain' | 'ocean' | 'forest' | 'coffee' | 'fireplace' | 'silence'

/**
 * Web Audio API–based ambient sound generator.
 * No audio files needed — everything is synthesized in real time.
 * Audio keeps playing when the phone is locked / app is backgrounded
 * because the AudioContext runs on a separate thread.
 */
export const useAmbientSound = () => {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<AudioNode[]>([])
  const gainRef = useRef<GainNode | null>(null)
  const [activeSound, setActiveSound] = useState<SoundType>('silence')
  const [volume, setVolume] = useState(0.5)
  const [isPlaying, setIsPlaying] = useState(false)

  // Ensure AudioContext exists
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }, [])

  // Disconnect all current nodes
  const stopAll = useCallback(() => {
    nodesRef.current.forEach((n) => {
      try {
        n.disconnect()
        if (n instanceof AudioBufferSourceNode) n.stop()
        if (n instanceof OscillatorNode) n.stop()
      } catch { /* already stopped */ }
    })
    nodesRef.current = []
  }, [])

  // ─── Sound Generators ──────────────────────────────────────────────────

  const createWhiteNoise = (ctx: AudioContext, duration = 2): AudioBufferSourceNode => {
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    return source
  }

  const buildRain = useCallback((ctx: AudioContext, master: GainNode) => {
    // Brown-ish noise through bandpass filter
    const noise = createWhiteNoise(ctx)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 800
    lp.Q.value = 0.5

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 200
    hp.Q.value = 0.5

    // Gentle volume modulation for "patter" effect
    const modGain = ctx.createGain()
    modGain.gain.value = 0.9
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.3
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.1
    lfo.connect(lfoGain)
    lfoGain.connect(modGain.gain)
    lfo.start()

    noise.connect(lp)
    lp.connect(hp)
    hp.connect(modGain)
    modGain.connect(master)
    noise.start()

    nodesRef.current.push(noise, lp, hp, modGain, lfo, lfoGain)
  }, [])

  const buildOcean = useCallback((ctx: AudioContext, master: GainNode) => {
    const noise = createWhiteNoise(ctx)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500

    // Slow wave-like volume sweep
    const modGain = ctx.createGain()
    modGain.gain.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.08 // ~8 sec wave cycle
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.4
    lfo.connect(lfoGain)
    lfoGain.connect(modGain.gain)
    lfo.start()

    // Second layer — deeper rumble
    const noise2 = createWhiteNoise(ctx)
    const lp2 = ctx.createBiquadFilter()
    lp2.type = 'lowpass'
    lp2.frequency.value = 200
    const g2 = ctx.createGain()
    g2.gain.value = 0.3
    noise2.connect(lp2)
    lp2.connect(g2)
    g2.connect(master)
    noise2.start()

    noise.connect(lp)
    lp.connect(modGain)
    modGain.connect(master)
    noise.start()

    nodesRef.current.push(noise, lp, modGain, lfo, lfoGain, noise2, lp2, g2)
  }, [])

  const buildForest = useCallback((ctx: AudioContext, master: GainNode) => {
    // Base: gentle wind (filtered noise)
    const wind = createWhiteNoise(ctx)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 600
    const windGain = ctx.createGain()
    windGain.gain.value = 0.25
    wind.connect(lp)
    lp.connect(windGain)
    windGain.connect(master)
    wind.start()

    // Bird chirps — high-frequency oscillators with random modulation
    const birdOsc = ctx.createOscillator()
    birdOsc.type = 'sine'
    birdOsc.frequency.value = 2800
    const birdGain = ctx.createGain()
    birdGain.gain.value = 0
    const birdLfo = ctx.createOscillator()
    birdLfo.type = 'square'
    birdLfo.frequency.value = 3
    const birdLfoGain = ctx.createGain()
    birdLfoGain.gain.value = 0.06
    birdLfo.connect(birdLfoGain)
    birdLfoGain.connect(birdGain.gain)
    birdOsc.connect(birdGain)
    birdGain.connect(master)
    birdOsc.start()
    birdLfo.start()

    // Second bird at different pitch
    const bird2 = ctx.createOscillator()
    bird2.type = 'sine'
    bird2.frequency.value = 3400
    const bird2Gain = ctx.createGain()
    bird2Gain.gain.value = 0
    const bird2Lfo = ctx.createOscillator()
    bird2Lfo.type = 'square'
    bird2Lfo.frequency.value = 1.7
    const bird2LfoGain = ctx.createGain()
    bird2LfoGain.gain.value = 0.04
    bird2Lfo.connect(bird2LfoGain)
    bird2LfoGain.connect(bird2Gain.gain)
    bird2.connect(bird2Gain)
    bird2Gain.connect(master)
    bird2.start()
    bird2Lfo.start()

    nodesRef.current.push(wind, lp, windGain, birdOsc, birdGain, birdLfo, birdLfoGain, bird2, bird2Gain, bird2Lfo, bird2LfoGain)
  }, [])

  const buildCoffee = useCallback((ctx: AudioContext, master: GainNode) => {
    // Low murmur — filtered brown noise
    const noise = createWhiteNoise(ctx)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 350
    bp.Q.value = 0.3
    const murmurGain = ctx.createGain()
    murmurGain.gain.value = 0.5

    // Subtle volume variation
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.15
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.15
    lfo.connect(lfoGain)
    lfoGain.connect(murmurGain.gain)
    lfo.start()

    // High sparkle — cups clinking (tiny filtered noise bursts)
    const sparkle = createWhiteNoise(ctx)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const sparkleGain = ctx.createGain()
    sparkleGain.gain.value = 0.03
    sparkle.connect(hp)
    hp.connect(sparkleGain)
    sparkleGain.connect(master)
    sparkle.start()

    noise.connect(bp)
    bp.connect(murmurGain)
    murmurGain.connect(master)
    noise.start()

    nodesRef.current.push(noise, bp, murmurGain, lfo, lfoGain, sparkle, hp, sparkleGain)
  }, [])

  const buildFireplace = useCallback((ctx: AudioContext, master: GainNode) => {
    // Crackling fire — low rumble + random high pops
    const noise = createWhiteNoise(ctx)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400
    const fireGain = ctx.createGain()
    fireGain.gain.value = 0.5

    // Crackle modulation
    const lfo = ctx.createOscillator()
    lfo.type = 'sawtooth'
    lfo.frequency.value = 0.5
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.25
    lfo.connect(lfoGain)
    lfoGain.connect(fireGain.gain)
    lfo.start()

    // Pop/crackle layer
    const crackle = createWhiteNoise(ctx)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2000
    bp.Q.value = 5
    const crackleGain = ctx.createGain()
    crackleGain.gain.value = 0.08
    const crackleLfo = ctx.createOscillator()
    crackleLfo.type = 'square'
    crackleLfo.frequency.value = 7
    const crackleLfoGain = ctx.createGain()
    crackleLfoGain.gain.value = 0.08
    crackleLfo.connect(crackleLfoGain)
    crackleLfoGain.connect(crackleGain.gain)
    crackleLfo.start()
    crackle.connect(bp)
    bp.connect(crackleGain)
    crackleGain.connect(master)
    crackle.start()

    noise.connect(lp)
    lp.connect(fireGain)
    fireGain.connect(master)
    noise.start()

    nodesRef.current.push(noise, lp, fireGain, lfo, lfoGain, crackle, bp, crackleGain, crackleLfo, crackleLfoGain)
  }, [])

  // ─── Play / Stop ───────────────────────────────────────────────────────

  const play = useCallback((sound: SoundType) => {
    stopAll()
    setActiveSound(sound)

    if (sound === 'silence') {
      setIsPlaying(false)
      return
    }

    const ctx = getCtx()
    const master = ctx.createGain()
    master.gain.value = volume
    master.connect(ctx.destination)
    gainRef.current = master

    switch (sound) {
      case 'rain': buildRain(ctx, master); break
      case 'ocean': buildOcean(ctx, master); break
      case 'forest': buildForest(ctx, master); break
      case 'coffee': buildCoffee(ctx, master); break
      case 'fireplace': buildFireplace(ctx, master); break
    }

    setIsPlaying(true)
  }, [stopAll, getCtx, volume, buildRain, buildOcean, buildForest, buildCoffee, buildFireplace])

  const stop = useCallback(() => {
    stopAll()
    setActiveSound('silence')
    setIsPlaying(false)
  }, [stopAll])

  // Update volume in real time
  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    if (gainRef.current) {
      gainRef.current.gain.setValueAtTime(v, ctxRef.current?.currentTime ?? 0)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll()
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
        ctxRef.current = null
      }
    }
  }, [stopAll])

  return { activeSound, volume, isPlaying, play, stop, changeVolume }
}
