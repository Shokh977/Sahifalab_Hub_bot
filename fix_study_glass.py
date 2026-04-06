"""
fix_study_glass.py
  1. Add .premium-focus-glass CSS class to globals.css
  2. Rewrite StudyPage.tsx return block with:
     - max-w-5xl wider layout
     - lg: two-column grid (timer | sidebar)
     - premium-focus-glass on timer card
     - Orange timer numbers with glow text-shadow
     - Session pill in header
     - Motivational subtext under ring
"""

# ══════════════════════════════════════════════════════════════
# 1. globals.css — Add .premium-focus-glass
# ══════════════════════════════════════════════════════════════
css_path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\styles\globals.css"
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

# Insert after the existing .glass-timer block, before .sound-mixer
NEW_CSS = r"""
  /* ── Premium Focus Glass — "Grid-in-Glass" bento timer card ──────────────── */
  .premium-focus-glass {
    @apply relative overflow-hidden rounded-[32px];
    padding: 1.75rem 1.5rem;
    /* Layer 1 — solid brand-dark base */
    background-color: #1C1C22;
    /* Layer 2 — orange grid matrix: 10×10 px cells, lines at 6% opacity */
    background-image:
      linear-gradient(rgba(241, 89, 41, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(241, 89, 41, 0.06) 1px, transparent 1px);
    background-size: 10px 10px;
    /* Edge — catch-light orange hairline */
    border: 1px solid rgba(241, 89, 41, 0.15);
    /* Depth — inset orange bloom + heavy elevation */
    box-shadow:
      0 0 0 1px rgba(241, 89, 41, 0.06),
      inset 0 0 100px rgba(241, 89, 41, 0.04),
      0 32px 80px rgba(0, 0, 0, 0.65),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  /* Layer 3 — frosted glass overlay: dark semi-transparent + blur on grid below */
  .premium-focus-glass::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(28, 28, 34, 0.60);
    backdrop-filter: blur(10px) saturate(1.15);
    -webkit-backdrop-filter: blur(10px) saturate(1.15);
    pointer-events: none;
    z-index: 0;
  }
  /* Ambient orange corner glow accent */
  .premium-focus-glass::after {
    content: '';
    position: absolute;
    top: -50px; right: -50px;
    width: 160px; height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(241, 89, 41, 0.12) 0%, transparent 65%);
    pointer-events: none;
    z-index: 0;
  }
  /* All direct children sit above the glass overlay */
  .premium-focus-glass > * {
    position: relative;
    z-index: 1;
  }

"""

ANCHOR = "  /* ── Ambient Sound Mixer panel"
if ANCHOR in css:
    css = css.replace(ANCHOR, NEW_CSS + "  /* ── Ambient Sound Mixer panel")
    print("CSS inserted OK")
else:
    print("WARNING: CSS anchor not found — appending before closing }")
    css = css.rstrip().rstrip("}") + NEW_CSS + "}\n"

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css)

# ══════════════════════════════════════════════════════════════
# 2. StudyPage.tsx — Replace return block
# ══════════════════════════════════════════════════════════════
tsx_path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\pages\StudyPage.tsx"
with open(tsx_path, "r", encoding="utf-8") as f:
    tsx = f.read()

# Find the return statement start
return_marker = "  return (\n    <PageWrapper topPadding=\"\" className=\"!px-0\">"
return_start = tsx.find(return_marker)
if return_start == -1:
    print("ERROR: Could not find return marker in StudyPage.tsx")
    exit(1)

# Find export default at end
export_marker = "\nexport default StudyWithMe\n"
export_pos = tsx.rfind(export_marker)
if export_pos == -1:
    print("ERROR: Could not find export default")
    exit(1)

# Everything before return stays untouched
before_return = tsx[:return_start]

NEW_RETURN = """  return (
    <PageWrapper topPadding="" className="!px-0">
      {/* Motivation Burst overlay */}
      <AnimatePresence>
        {motivBurst && <MotivationBurst onDone={() => setMotivBurst(false)} />}
      </AnimatePresence>

      <div className="min-h-screen bg-[#0A0A14] dark:bg-[#0A0A14]">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 pb-10 space-y-5">

          {/* \u2500\u2500 Page header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                <GraduationCap className="w-5 h-5 text-[#F15929]" />
                Study With Sahifalab
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {timer.isBreak ? '\U0001f33f Dam olish vaqti \u2014 biroz nafas ol' : '\U0001f3af Diqqatni jamlang \u2014 sen uddalaysan'}
              </p>
            </div>
            {timer.sessionsCompleted > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F15929]/10 border border-[#F15929]/25 text-[#F15929] text-xs font-bold"
              >
                <Flame className="w-3 h-3" />
                {timer.sessionsCompleted} sessiya
              </motion.div>
            )}
          </div>

          {/* \u2500\u2500 Live Pulse banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <LivePulseBanner onMotivationReceived={() => { if (!motivBurst) setMotivBurst(true) }} />

          {/* \u2500\u2500 Main grid: Timer (left) + Sidebar (right) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

            {/* \u2550\u2550 TIMER CARD \u2014 Premium Focus Glass \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */}
            <motion.div
              className="premium-focus-glass"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Status badge */}
              <div className="flex justify-center mb-6">
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase border ${
                  timer.isBreak
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-[#F15929]/15 border-[#F15929]/30 text-[#F15929]'
                }`}>
                  {timer.isBreak ? '\U0001f33f Dam olish' : '\u26a1 Fokus sessiyasi'}
                </span>
              </div>

              {/* SVG Timer ring */}
              <div className="flex justify-center mb-4">
                <div className="relative w-52 h-52 sm:w-64 sm:h-64">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                    <defs>
                      <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor={ringColor} />
                        <stop offset="100%" stopColor={timer.isBreak ? '#86EFAC' : '#FF8C5A'} />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    {/* Progress fill */}
                    <circle
                      cx="100" cy="100" r={R}
                      fill="none"
                      stroke="url(#timerGrad)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={strokeDash}
                      style={{ transition: 'stroke-dasharray 0.5s linear', filter: ringGlow }}
                    />
                  </svg>

                  {/* Center: big orange numbers + progress */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    <span
                      className="font-mono font-extrabold text-[#F15929] tracking-tighter tabular-nums"
                      style={{
                        fontSize: 'clamp(2.6rem, 6vw, 3.5rem)',
                        textShadow: '0 0 32px rgba(241,89,41,0.55)',
                      }}
                    >
                      {timer.formatted}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {Math.round(progressPct)}% tamamlandi
                    </span>
                  </div>
                </div>
              </div>

              {/* Motivational context text */}
              <div className="text-center mb-5 space-y-0.5">
                <p className="text-sm font-semibold text-white/65">
                  {timer.isBreak ? 'Biroz nafas oling' : 'Diqqatni jamlang'}
                </p>
                <p className="text-xs text-slate-600">
                  {timer.isBreak ? "Keyingi sessiyaga tayyor bo'ling" : "Muvaffaqiyat sabr talab qiladi"}
                </p>
              </div>

              {/* Session completion dots */}
              <div className="flex justify-center items-center gap-2 mb-5">
                {[...Array(Math.max(4, timer.sessionsCompleted + 1))].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      i < timer.sessionsCompleted
                        ? 'bg-[#F15929] shadow-[0_0_8px_rgba(241,89,41,0.9)]'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
                <span className="text-xs text-slate-600 ml-1">{timer.sessionsCompleted} sessiya</span>
              </div>

              {/* Focus duration presets */}
              {!timer.isRunning && !timer.isBreak && (
                <div className="flex justify-center gap-2 mb-5">
                  {FOCUS_PRESETS.map(min => (
                    <button
                      key={min}
                      onClick={() => timer.setRemaining(min * 60)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        timer.remaining === min * 60
                          ? 'bg-[#F15929] text-white shadow-[0_0_14px_rgba(241,89,41,0.55)]'
                          : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80'
                      }`}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
              )}

              {/* Controls: Play/Pause · Reset · Skip */}
              <div className="flex gap-3">
                <button
                  onClick={timer.toggle}
                  className={`flex-1 py-4 rounded-[18px] font-bold text-white text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    timer.isRunning
                      ? 'bg-white/10 border border-white/15 hover:bg-white/15'
                      : 'bg-[#F15929] shadow-[0_6px_28px_rgba(241,89,41,0.5)] hover:bg-[#e84e22] active:bg-[#d4451f]'
                  }`}
                >
                  {timer.isRunning
                    ? <><Pause className="w-4 h-4" /> Pauza</>
                    : <><Play  className="w-4 h-4" /> Boshlash</>
                  }
                </button>
                <button
                  onClick={() => timer.reset()}
                  className="w-12 h-12 rounded-[18px] flex items-center justify-center bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={timer.skip}
                  className="w-12 h-12 rounded-[18px] flex items-center justify-center bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* \u2550\u2550 SIDEBAR: Sound Mixer + Info Pills \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */}
            <div className="space-y-4">

              {/* Ambient sound mixer */}
              <motion.div
                className="sound-mixer"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-white/60" />
                    <span className="text-sm font-bold text-white">Ambient tovushlar</span>
                  </div>
                  {sound.isPlaying && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/12 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ijro etilmoqda
                    </span>
                  )}
                </div>

                {/* Sound selection grid */}
                {soundsLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[16px] bg-white/5 animate-pulse" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {/* Silence option */}
                    <button
                      onClick={handleSilence}
                      className={`sound-mixer-btn ${!sound.isPlaying ? 'active' : ''}`}
                    >
                      <VolumeX className="w-5 h-5" />
                      <span className="text-[10px] font-medium">Jimjitlik</span>
                    </button>

                    {sounds.map(s => {
                      const isActive = sound.activeSound === String(s.id) && sound.isPlaying
                      return (
                        <button
                          key={s.id}
                          onClick={() => handleSoundSelect(s)}
                          disabled={resolvingId === s.id && sound.isLoading}
                          className={`sound-mixer-btn ${isActive ? 'active' : ''}`}
                        >
                          {resolvingId === s.id && sound.isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-white/70" />
                          ) : (
                            <span className="text-lg">{s.emoji || '\U0001f3b5'}</span>
                          )}
                          <span className="text-[10px] font-medium line-clamp-1">{s.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Per-sound volume slider */}
                <AnimatePresence>
                  {sound.isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-white/8 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-white/50">
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>{activeSound?.name ?? 'Tovush'} ovozi</span>
                          </div>
                          <span className="text-xs font-bold text-[#F15929]">{Math.round(sound.volume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0} max={1} step={0.02}
                          value={sound.volume}
                          onChange={e => sound.changeVolume(parseFloat(e.target.value))}
                          className="vol-slider w-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sound error */}
                {sound.error && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/25 rounded-[14px] p-3">
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {sound.error}
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Info tip pills */}
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              >
                <div className="flex items-start gap-2.5 rounded-[16px] bg-white/[0.04] border border-white/8 px-3.5 py-3">
                  <Battery className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/45 leading-relaxed">
                    Fon rejimi: taymer va tovushlar telefon qulflanganda ham ishlaydi.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-[16px] bg-white/[0.04] border border-white/8 px-3.5 py-3">
                  <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/45 leading-relaxed">
                    Pomodoro: 25 daq fokus + 5 daq dam olish. Har 4 sessiyadan keyin uzunroq dam oling!
                  </p>
                </div>
              </motion.div>

            </div>
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}

export default StudyWithMe
"""

# Replace from the `return (` marker to the end of file
tsx = before_return + NEW_RETURN

with open(tsx_path, "w", encoding="utf-8") as f:
    f.write(tsx)

print("StudyPage.tsx return block replaced!")

# ══════════════════════════════════════════════════════════════
# Verify
# ══════════════════════════════════════════════════════════════
with open(css_path, "r", encoding="utf-8") as f:
    css_check = f.read()
with open(tsx_path, "r", encoding="utf-8") as f:
    tsx_check = f.read()

print("CSS .premium-focus-glass:", ".premium-focus-glass" in css_check)
print("CSS ::before on glass:", ".premium-focus-glass::before" in css_check)
print("TSX premium-focus-glass:", "premium-focus-glass" in tsx_check)
print("TSX orange timer:", "text-[#F15929]" in tsx_check and "textShadow" in tsx_check)
print("TSX responsive grid:", "lg:grid-cols-[1fr_300px]" in tsx_check)
print("TSX max-w-5xl:", "max-w-5xl" in tsx_check)
print("TSX old glass-timer:", "glass-timer" in tsx_check)
print("TSX old max-w-md:", "max-w-md" in tsx_check)
