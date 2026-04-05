"""
fix_cabinet.py — CabinetPage.tsx:
  1. Fix import from clause (@heroicons → lucide-react)
  2. Rename all remaining old-name heroicon usages
  3. Add heatmap section (state, fetch, JSX)
  4. Fix mojibake chars in JSX strings
"""
import re

path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\pages\CabinetPage.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. Fix the from clause ────────────────────────────────────────────────────
content = content.replace(
    "} from '@heroicons/react/24/outline'",
    "} from 'lucide-react'",
)
print("Import from clause fixed")

# ── 2. Rename all remaining heroicon component usages ────────────────────────
renames = [
    # Old heroicon names → lucide-react names (for usages in JSX)
    ("AcademicCapIcon",       "GraduationCap"),
    ("ArrowDownTrayIcon",     "Download"),
    ("ArrowPathIcon",         "RefreshCw"),
    ("ArrowRightIcon",        "ArrowRight"),
    ("BookOpenIcon",          "BookOpen"),
    ("ChartBarIcon",          "BarChart2"),
    ("ChevronRightIcon",      "ChevronRight"),
    ("ClockIcon",             "Clock"),
    ("InformationCircleIcon", "Info"),
    ("LightBulbIcon",         "Lightbulb"),
    ("LinkIcon",              "Link"),
    ("PencilSquareIcon",      "PenSquare"),
    ("SparklesIcon",          "Sparkles"),
    ("TrophyIcon",            "Trophy"),
]
for old, new in renames:
    content = content.replace(old, new)
print("Icon renames done")

# ── 3. Fix mojibake em-dashes and arrows in JSX strings ──────────────────────
content = content.replace("\u00e2\u20ac\u201d", "\u2014")   # â€" → —
content = content.replace("\u00e2\u2020\u2019", "\u2192")   # â†' → →
content = content.replace("\u00e2\u20ac\u00a6", "\u2026")   # â€¦ → …
# Fix wave/greeting emoji â€™ and other broken chars
content = content.replace("\u00f0\u0178\u2018\u00b4", "\U0001F44B")  # ðŸ'´ → 👋? 
# Other common mojibake patterns
content = content.replace("\u00f0\u0178\u2018", "\U0001F4AA"[:1])  # partial match guard

print("Mojibake chars fixed")

# ── 4. Add heatmap data import (apiService already imported) ─────────────────
# The apiService import is already at line ~44: import apiService from '../services/apiService'
# Just need to add heatmap state + effect in the component

# ── 5. Add heatmap state variables after existing state declarations ──────────
# Find the state declarations section (after useAuth, useProgressStore hooks)
# Insert heatmap state near other state variables

# Find a stable anchor: the 'courses' state declaration
heatmap_state = (
    "  const [heatmap,        setHeatmap]        = useState<{ date: string; count: number }[]>([])\n"
    "  const [heatmapLoading, setHeatmapLoading] = useState(false)\n"
)

# Find where to insert: after 'courses' or similar state vars
# Use a stable anchor that's likely unique
anchor_pattern = r"(  const \[courses[^\n]+\n)"
match = re.search(anchor_pattern, content)
if match:
    insert_at = match.end()
    content = content[:insert_at] + heatmap_state + content[insert_at:]
    print("Heatmap state inserted")
else:
    # fallback: insert after quizResults or any other state
    anchor2 = "  const [quizResults,"
    idx2 = content.find(anchor2)
    if idx2 != -1:
        end_of_line = content.find("\n", idx2) + 1
        content = content[:end_of_line] + heatmap_state + content[end_of_line:]
        print("Heatmap state inserted (fallback)")
    else:
        print("WARNING: Could not find anchor for heatmap state")

# ── 6. Add heatmap fetch effect ───────────────────────────────────────────────
# Anchor: find the last useEffect in the loading section and insert after it
# Use the completions/courses fetch pattern

heatmap_effect = """
  // Fetch heatmap data
  useEffect(() => {
    const id = effectiveTelegramId
    if (!id) return
    setHeatmapLoading(true)
    apiService.getHeatmap(id)
      .then(r => setHeatmap(r.data))
      .catch(() => {})
      .finally(() => setHeatmapLoading(false))
  }, [effectiveTelegramId])

"""

# Insert after the completions effect (find stable anchor)
completions_pattern = r"(  }, \[effectiveTelegramId, authUser\]\)[\s\n]+)"
match2 = re.search(completions_pattern, content)
if match2:
    insert_at2 = match2.end()
    content = content[:insert_at2] + heatmap_effect + content[insert_at2:]
    print("Heatmap effect inserted")
else:
    # Try alternate anchor
    alt = "  }, [effectiveTelegramId])\n"
    idx_alt = content.rfind(alt)
    if idx_alt != -1:
        insert_at3 = idx_alt + len(alt)
        content = content[:insert_at3] + heatmap_effect + content[insert_at3:]
        print("Heatmap effect inserted (alt anchor)")
    else:
        print("WARNING: Could not find anchor for heatmap effect")

# ── 7. Insert heatmap JSX section in the page layout ─────────────────────────
# Place before the badges section or stats section
# Find a stable anchor near the stats/bento area

heatmap_jsx = """
          {/* ── GitHub-style study heatmap ───────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-[24px] bg-white dark:bg-[#1C1C22] border border-slate-100 dark:border-white/[0.07] p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">Faollik tarixim</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">So'nggi yil — testlar va o'qish</p>
              </div>
              {heatmapLoading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
            </div>
            <HeatmapDisplay data={heatmap} />
          </motion.section>

"""

# Insert before the badges section
badges_anchor = "          {/* Badges"
idx_badges = content.find(badges_anchor)
if idx_badges != -1:
    content = content[:idx_badges] + heatmap_jsx + content[idx_badges:]
    print("Heatmap JSX section inserted before badges")
else:
    # Try before enrolled courses
    alt_anchor = "          {/* Enrolled"
    idx_alt2 = content.find(alt_anchor)
    if idx_alt2 != -1:
        content = content[:idx_alt2] + heatmap_jsx + content[idx_alt2:]
        print("Heatmap JSX section inserted (alt position)")
    else:
        print("WARNING: Could not find insertion point for heatmap JSX")

# ── 8. Add HeatmapDisplay helper component before CabinetPage ────────────────
heatmap_component = """
/* ──────────────────────────────────────────────────────────────────────────────
   HeatmapDisplay — GitHub-style 52×7 grid using real quiz-completion data
   Props: data — array of {date: 'YYYY-MM-DD', count: int} from backend
────────────────────────────────────────────────────────────────────────────── */
interface HeatmapDay { date: string; count: number }

const HeatmapDisplay: React.FC<{ data: HeatmapDay[] }> = ({ data }) => {
  const today    = new Date()
  const dayMap   = new Map(data.map(d => [d.date, d.count]))
  const maxCount = Math.max(1, ...data.map(d => d.count))

  // Build 52 columns × 7 rows (364 days back + today)
  const weeks: { date: string; count: number }[][] = []
  for (let w = 0; w < 52; w++) {
    const col: { date: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const daysAgo = (51 - w) * 7 + (6 - d)
      const dt      = new Date(today)
      dt.setDate(today.getDate() - daysAgo)
      const iso   = dt.toISOString().slice(0, 10)
      const count = dayMap.get(iso) ?? 0
      col.push({ date: iso, count })
    }
    weeks.push(col)
  }

  const cellColor = (count: number): string => {
    if (count === 0) return 'bg-slate-100 dark:bg-[#2A2A3A]'
    const pct = count / maxCount
    if (pct < 0.25) return 'bg-sahifa-200 dark:bg-sahifa-900/40'
    if (pct < 0.5)  return 'bg-sahifa-300 dark:bg-sahifa-700/60'
    if (pct < 0.75) return 'bg-sahifa-400 dark:bg-sahifa-600'
    return 'bg-sahifa-500'
  }

  return (
    <div>
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-[3px]" style={{ minWidth: 52 * 14 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell.count > 0 ? `${cell.date}: ${cell.count} ta test` : cell.date}
                  className={`w-[10px] h-[10px] rounded-sm transition-colors ${cellColor(cell.count)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Kam</span>
        {['bg-slate-100 dark:bg-[#2A2A3A]', 'bg-sahifa-200 dark:bg-sahifa-900/40', 'bg-sahifa-300 dark:bg-sahifa-700/60', 'bg-sahifa-400 dark:bg-sahifa-600', 'bg-sahifa-500'].map((c, i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Ko'p</span>
        {data.length > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-sahifa-500">{data.reduce((s, d) => s + d.count, 0)} test</span>
        )}
      </div>
    </div>
  )
}

"""

# Insert before "const CabinetPage"
cabinet_fn = "const CabinetPage"
idx_cabinet = content.find(cabinet_fn)
if idx_cabinet != -1:
    content = content[:idx_cabinet] + heatmap_component + content[idx_cabinet:]
    print("HeatmapDisplay component inserted")
else:
    print("WARNING: 'const CabinetPage' not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("\nCabinetPage.tsx updated!")

# ── Verify ────────────────────────────────────────────────────────────────────
with open(path, "r", encoding="utf-8") as f:
    check = f.read()

print("heroicons remaining:", "@heroicons" in check)
print("lucide import:", "lucide-react" in check)
print("HeatmapDisplay present:", "HeatmapDisplay" in check)
print("getHeatmap call:", "apiService.getHeatmap" in check)
print("AcademicCapIcon remaining:", "AcademicCapIcon" in check)
print("TrophyIcon remaining:", "TrophyIcon" in check)
