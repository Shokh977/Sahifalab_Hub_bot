import re

path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\pages\StudyPage.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. Fix MOTIV_MESSAGES array ───────────────────────────────────────────────
new_motiv = (
    "const MOTIV_MESSAGES = [\n"
    "  { emoji: '\U0001F525', title: \"Barakalla! Birga o'qimoqdamiz!\",   sub: \"Siz yolg'iz emasiz \u2014 kuch birlashganda\" },\n"
    "  { emoji: '\u2B50', title: \"Zo'r ketayapsiz!\",                 sub: \"Davom eting, muvaffaqiyat kutmoqda\" },\n"
    "  { emoji: '\U0001F4AA', title: \"Kuch sizda!\",                      sub: \"Bugun yangi rekord qo'ying\" },\n"
    "  { emoji: '\U0001F680', title: \"Parvozda!\",                        sub: \"Bilim \u2014 eng yaxshi investitsiya\" },\n"
    "  { emoji: '\U0001F3AF', title: \"Maqsadga intiling!\",               sub: \"Har bir sessiya \u2014 bir qadam oldinga\" },\n"
    "  { emoji: '\U0001F4DA', title: \"Ilm \u2014 nur!\",                       sub: \"Har bir daqiqa qadrlidir\" },\n"
    "]"
)
content = re.sub(r"const MOTIV_MESSAGES = \[.*?\]", new_motiv, content, flags=re.DOTALL)

# ── 2. Fix FLOAT_EMOJIS line ──────────────────────────────────────────────────
new_floats = (
    "const FLOAT_EMOJIS = ["
    "'\u2B50', '\U0001F525', '\u2728', '\U0001F4AA', '\U0001F4DA', "
    "'\U0001F3AF', '\U0001F680', '\U0001F4A1', '\u2764\uFE0F', '\U0001F31F', '\u26A1', '\U0001F3C6'"
    "]"
)
content = re.sub(r"const FLOAT_EMOJIS = \[.*?\]", new_floats, content)

# ── 3. Fix remaining mojibake em-dashes / arrows in comments ─────────────────
# em-dash: â€" = U+00E2 U+20AC U+201D  → —
content = content.replace("\u00e2\u20ac\u201d", "\u2014")
# right arrow: â†' = U+00E2 U+2020 U+2019 → →
content = content.replace("\u00e2\u2020\u2019", "\u2192")
# box-drawing dashes in comment lines: â"€ = U+00E2 U+201D U+20AC → just replace runs
content = re.sub(r"[\u00e2\u201d\u20ac]{3,}", lambda m: "-" * (len(m.group(0)) // 3), content)

# ── 4. Fix MotivationBurst: remove pointer-events-none, add Escape + X btn ───
old_burst = (
    'const MotivationBurst: React.FC<MotivationBurstProps> = ({ onDone }) => {\n'
    '  const [msg]       = useState(() => MOTIV_MESSAGES[Math.floor(Math.random() * MOTIV_MESSAGES.length)])\n'
    '  const [particles] = useState(() =>\n'
    '    FLOAT_EMOJIS.map((emoji) => ({\n'
    '      emoji,\n'
    '      left:  `${8 + Math.random() * 84}%`,\n'
    '      top:   `${8 + Math.random() * 84}%`,\n'
    '      delay: Math.random() * 0.5,\n'
    '      dur:   1.2 + Math.random() * 0.8,\n'
    '    }))\n'
    '  )\n'
    '\n'
    '  useEffect(() => {\n'
    '    const t = setTimeout(onDone, 3500)\n'
    '    return () => clearTimeout(t)\n'
    '  }, [onDone])\n'
    '\n'
    '  return (\n'
    '    <motion.div\n'
    '      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"\n'
    '      initial={{ opacity: 0 }}\n'
    '      animate={{ opacity: 1 }}\n'
    '      exit={{ opacity: 0 }}\n'
    '      transition={{ duration: 0.25 }}\n'
    '    >\n'
    '      {/* Frosted backdrop */}\n'
    '      <div className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" />\n'
    '\n'
    '      {/* Floating emoji particles */}\n'
    '      {particles.map((p, i) => (\n'
    '        <motion.span\n'
    '          key={i}\n'
    '          className="absolute text-2xl select-none"\n'
    '          style={{ left: p.left, top: p.top }}\n'
    '          initial={{ opacity: 0, y: 30, scale: 0 }}\n'
    '          animate={{ opacity: [0, 1, 1, 0], y: -110, scale: [0, 1.3, 1] }}\n'
    "          transition={{ delay: p.delay, duration: p.dur, ease: 'easeOut' }}\n"
    '        >\n'
    '          {p.emoji}\n'
    '        </motion.span>\n'
    '      ))}\n'
    '\n'
    '      {/* Central motivational card */}\n'
    '      <motion.div\n'
    '        className="relative bg-white dark:bg-[#222230] rounded-[28px] px-8 py-7 shadow-2xl text-center max-w-[280px] mx-4"\n'
    '        initial={{ scale: 0.4, opacity: 0, y: 30 }}\n'
    '        animate={{ scale: 1,   opacity: 1, y: 0 }}\n'
    '        exit={{ scale: 0.85, opacity: 0 }}\n'
    "        transition={{ type: 'spring', stiffness: 320, damping: 22 }}\n"
    '      >\n'
    '        <div className="text-6xl mb-3 leading-none">{msg.emoji}</div>\n'
    '        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">{msg.title}</h2>\n'
    '        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{msg.sub}</p>\n'
    '        {/* Sahifa brand stripe */}\n'
    '        <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-[28px] bg-gradient-to-r from-[#F15929] via-orange-400 to-[#F15929]" />\n'
    '      </motion.div>\n'
    '    </motion.div>\n'
    '  )\n'
    '}'
)

new_burst = (
    'const MotivationBurst: React.FC<MotivationBurstProps> = ({ onDone }) => {\n'
    '  const [msg]       = useState(() => MOTIV_MESSAGES[Math.floor(Math.random() * MOTIV_MESSAGES.length)])\n'
    '  const [particles] = useState(() =>\n'
    '    FLOAT_EMOJIS.map((emoji) => ({\n'
    '      emoji,\n'
    '      left:  `${8 + Math.random() * 84}%`,\n'
    '      top:   `${8 + Math.random() * 84}%`,\n'
    '      delay: Math.random() * 0.5,\n'
    '      dur:   1.2 + Math.random() * 0.8,\n'
    '    }))\n'
    '  )\n'
    '\n'
    '  // Auto-dismiss after 4 s\n'
    '  useEffect(() => {\n'
    '    const t = setTimeout(onDone, 4000)\n'
    '    return () => clearTimeout(t)\n'
    '  }, [onDone])\n'
    '\n'
    '  // Escape key to close\n'
    '  useEffect(() => {\n'
    "    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }\n"
    "    window.addEventListener('keydown', handler)\n"
    "    return () => window.removeEventListener('keydown', handler)\n"
    '  }, [onDone])\n'
    '\n'
    '  return (\n'
    '    <motion.div\n'
    '      className="fixed inset-0 z-[200] flex items-center justify-center"\n'
    '      initial={{ opacity: 0 }}\n'
    '      animate={{ opacity: 1 }}\n'
    '      exit={{ opacity: 0 }}\n'
    '      transition={{ duration: 0.25 }}\n'
    '    >\n'
    '      {/* Clickable frosted backdrop */}\n'
    '      <div\n'
    '        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] cursor-pointer"\n'
    '        onClick={onDone}\n'
    '      />\n'
    '\n'
    '      {/* Floating emoji particles (pointer-events-none so backdrop stays clickable) */}\n'
    '      {particles.map((p, i) => (\n'
    '        <motion.span\n'
    '          key={i}\n'
    '          className="absolute text-2xl select-none pointer-events-none"\n'
    '          style={{ left: p.left, top: p.top }}\n'
    '          initial={{ opacity: 0, y: 30, scale: 0 }}\n'
    '          animate={{ opacity: [0, 1, 1, 0], y: -110, scale: [0, 1.3, 1] }}\n'
    "          transition={{ delay: p.delay, duration: p.dur, ease: 'easeOut' }}\n"
    '        >\n'
    '          {p.emoji}\n'
    '        </motion.span>\n'
    '      ))}\n'
    '\n'
    '      {/* Central motivational card */}\n'
    '      <motion.div\n'
    '        className="relative bg-white dark:bg-[#1C1C2A] rounded-[28px] px-8 py-7 shadow-2xl text-center max-w-[300px] mx-4 z-10"\n'
    '        initial={{ scale: 0.4, opacity: 0, y: 30 }}\n'
    '        animate={{ scale: 1,   opacity: 1, y: 0 }}\n'
    '        exit={{ scale: 0.85, opacity: 0 }}\n'
    "        transition={{ type: 'spring', stiffness: 320, damping: 22 }}\n"
    '        onClick={(e) => e.stopPropagation()}\n'
    '      >\n'
    '        {/* X close button */}\n'
    '        <button\n'
    '          onClick={onDone}\n'
    '          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors text-sm font-bold"\n'
    '          aria-label="Yopish"\n'
    '        >\n'
    '          \u2715\n'
    '        </button>\n'
    '        <div className="text-6xl mb-3 leading-none">{msg.emoji}</div>\n'
    '        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white leading-tight">{msg.title}</h2>\n'
    '        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{msg.sub}</p>\n'
    '        <button\n'
    '          onClick={onDone}\n'
    '          className="mt-4 px-5 py-2 rounded-2xl bg-sahifa-500 text-white text-xs font-bold hover:bg-sahifa-600 transition-colors"\n'
    '        >\n'
    '          Davom etish \u2192\n'
    '        </button>\n'
    '        {/* Brand stripe */}\n'
    '        <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-[28px] bg-gradient-to-r from-[#F15929] via-orange-400 to-[#F15929]" />\n'
    '      </motion.div>\n'
    '    </motion.div>\n'
    '  )\n'
    '}'
)

if old_burst in content:
    content = content.replace(old_burst, new_burst)
    print("MotivationBurst replaced OK")
else:
    print("WARNING: MotivationBurst old pattern not found — doing targeted fixes")
    # Targeted fallback: at minimum remove pointer-events-none
    content = content.replace(
        'className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"',
        'className="fixed inset-0 z-[200] flex items-center justify-center"'
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("StudyPage.tsx fixed!")

# ── Verify ────────────────────────────────────────────────────────────────────
with open(path, "r", encoding="utf-8") as f:
    check = f.read()

m = re.search(r"const MOTIV_MESSAGES = \[.*?\]", check, re.DOTALL)
print("MOTIV sample:", repr(m.group(0)[:100]) if m else "NOT FOUND")

m2 = re.search(r"const FLOAT_EMOJIS = \[.*?\]", check)
print("FLOAT:", repr(m2.group(0)) if m2 else "NOT FOUND")

print("pointer-events-none present:", "pointer-events-none" in check)
print("Escape handler present:", "'Escape'" in check)
print("X button present:", "Yopish" in check)
