"""
fix_dashboard.py — DashboardHome.tsx:
  1. heroicons → lucide-react (all usages)
  2. Remove HeatmapCell (component + usage)
  3. Move Courses section ABOVE the bento stat-cells
  4. Fix mojibake in JSX strings (arrows, dashes)
"""
import re

path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\components\DashboardHome.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. Replace heroicons imports ──────────────────────────────────────────────
old_imports = (
    "import {\n"
    "  AcademicCapIcon,\n"
    "  BookOpenIcon,\n"
    "  ChevronRightIcon,\n"
    "  ClockIcon,\n"
    "  CpuChipIcon,\n"
    "  PlayIcon,\n"
    "  RectangleStackIcon,\n"
    "  StarIcon,\n"
    "  UserGroupIcon,\n"
    "} from '@heroicons/react/24/outline'\n"
    "import { StarIcon as StarSolid } from '@heroicons/react/24/solid'"
)
new_imports = (
    "import {\n"
    "  GraduationCap,\n"
    "  BookOpen,\n"
    "  ChevronRight,\n"
    "  Clock,\n"
    "  Cpu,\n"
    "  Play,\n"
    "  LayoutList,\n"
    "  Star,\n"
    "  Users,\n"
    "} from 'lucide-react'"
)
if old_imports in content:
    content = content.replace(old_imports, new_imports)
    print("Imports replaced OK")
else:
    print("WARNING: exact import block not found — applying partial")
    content = re.sub(
        r"import \{[^}]+\} from '@heroicons/react/24/outline'\nimport \{[^}]+\} from '@heroicons/react/24/solid'",
        new_imports,
        content,
        flags=re.DOTALL,
    )

# ── 2. Rename icon component usages ──────────────────────────────────────────
renames = [
    ("AcademicCapIcon", "GraduationCap"),
    ("BookOpenIcon",    "BookOpen"),
    ("ChevronRightIcon","ChevronRight"),
    ("ClockIcon",       "Clock"),
    ("CpuChipIcon",     "Cpu"),
    ("PlayIcon",        "Play"),
    ("RectangleStackIcon", "LayoutList"),
    # StarSolid → Star with fill classes
    ("StarSolid",       "Star"),
    ("StarIcon",        "Star"),
    ("UserGroupIcon",   "Users"),
]
for old, new in renames:
    content = content.replace(old, new)
print("Icon renames done")

# ── 3. Fix StarSolid (solid stars) — add fill class ──────────────────────────
# Pattern: <Star className="w-2.5 h-2.5" /> inside Premium badge → add fill
content = content.replace(
    '<Star className="w-2.5 h-2.5" /> Premium',
    '<Star className="w-2.5 h-2.5 fill-current" /> Premium',
)
content = content.replace(
    '<Star className="w-3 h-3 text-amber-400" />',
    '<Star className="w-3 h-3 text-amber-400 fill-current" />',
)

# ── 4. Fix mojibake in JSX strings ────────────────────────────────────────────
# em-dash: â€" = U+00E2 U+20AC U+201D  → —
content = content.replace("\u00e2\u20ac\u201d", "\u2014")
# right arrow: â†' = U+00E2 U+2020 U+2019 → →
content = content.replace("\u00e2\u2020\u2019", "\u2192")
# wave/warning emojis in JSX comments (fix any leftover â•  etc.)
# "Kurslar yuklanmoqdaâ€¦" → "Kurslar yuklanmoqda…"
content = content.replace("\u00e2\u20ac\u00a6", "\u2026")

# Fix the XP level text: Daraja {level} → {level + 1}
# (was: 'Daraja {level} â†' {level + 1}')
content = content.replace(
    "Daraja {level} \u00e2\u2020\u2019 {level + 1}",
    "Daraja {level} \u2192 {level + 1}",
)

# ── 5. Fix the PILLS array — update to use lucide icon refs ──────────────────
old_pills = (
    "  const PILLS = [\n"
    "    { icon: Clock,          label: \"O'qish\",   path: '/study',        },\n"
    "    { icon: LayoutList, label: 'Test',     path: '/quiz',         },\n"
    "    { icon: Cpu,        label: 'AI',       path: '/ai-companion', },\n"
    "    { icon: BookOpen,       label: 'Kitoblar', path: '/kitoblar',     },\n"
    "  ]"
)
# Only apply if NOT already correct (the rename above may have already done it)
# Check that it exists as expected after renames
if old_pills not in content:
    print("PILLS array already correct (or renamed)")

# ── 6. Remove HeatmapCell component (the whole const HeatmapCell = ...) ──────
# Match from the comment line before it to the closing }
heatmap_pattern = re.compile(
    r"// [^\n]*BENTO CELL 4[^\n]*\n// [^\n]*\n"  # two comment lines
    r"const HeatmapCell: React\.FC.*?^\}\n",
    re.DOTALL | re.MULTILINE,
)
if heatmap_pattern.search(content):
    content = heatmap_pattern.sub("", content)
    print("HeatmapCell component removed")
else:
    # Fallback: use the â•â• box-drawing comment pattern
    heatmap_pattern2 = re.compile(
        r"// [\u00e2\u201d\u20ac]{2,}.*?GitHub-style.*?\n"
        r"// [\u00e2\u201d\u20ac]{2,}.*?\n"
        r"const HeatmapCell: React\.FC.*?^\}\n",
        re.DOTALL | re.MULTILINE,
    )
    if heatmap_pattern2.search(content):
        content = heatmap_pattern2.sub("", content)
        print("HeatmapCell component removed (fallback pattern)")
    else:
        # Last resort: match from unique const name
        start = content.find("const HeatmapCell: React.FC")
        if start != -1:
            # Find the closing } of the function
            # Look for "\n}\n" after the component
            end = content.find("\n// ", start + 100)
            if end == -1:
                end = content.find("\n\n// ", start + 100)
            if end != -1:
                content = content[:start] + content[end+1:]
                print("HeatmapCell removed (manual slice)")
            else:
                print("WARNING: Could not remove HeatmapCell")

# ── 7. Remove HeatmapCell from imports (if useMemo is only used there) ───────
# useMemo was only used by HeatmapCell, remove it from React import
content = content.replace(
    "import React, { useEffect, useMemo, useState } from 'react'",
    "import React, { useEffect, useState } from 'react'",
)

# ── 8. Restructure main dashboard return ─────────────────────────────────────
# Strategy: in the JSX return section, restructure the layout by finding
# the bento-grid opening and the courses section, then reorganizing.

# ── 8a. Find and remove the BENTO GRID <div> wrapper around Hero + cells
#        keeping only the stats cells (ContinueLearning, XPRing, FocusGoal)
# The current structure (with mojibake comment):
# <div className="bento-grid">
#   {/* 1. Hero banner */}    <- remove from bento-grid
#   {user && (<HeroBanner .../> )}
#   {/* 2. Continue Learning */}
#   <ContinueLearningCell />  <- keep
#   {/* 3. XP Ring */}
#   {isInitialized && (<XPRingCell .../> )}  <- keep
#   {/* 4. Heatmap */}
#   {isInitialized && <HeatmapCell focusMinsToday={focusMins} />}  <- removed
#   {/* 5. Focus Goal */}
#   {isInitialized && (<FocusGoalCell .../> )}  <- keep
# </div>
# <motion.section {...fadeUp(0.24)}>  <- COURSES, move to top

# Find the exact bento-grid opening to courses section
old_bento_to_courses = (
    '      <div className="bento-grid">\n'
    '\n'
    '        {/* 1. Hero banner */}\n'
    '        {user && (\n'
    '          <HeroBanner\n'
    '            user={{ first_name: user.first_name, photo_url: user.photo_url }}\n'
    '            totalXP={totalXP} level={level} focusSeconds={focusSeconds}\n'
    '            xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}\n'
    '          />\n'
    '        )}\n'
    '\n'
    '        {/* 2. Continue Learning */}\n'
    '        <ContinueLearningCell />\n'
    '\n'
    '        {/* 3. XP Ring */}\n'
    '        {isInitialized && (\n'
    '          <XPRingCell\n'
    '            level={level} totalXP={totalXP}\n'
    '            xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}\n'
    '          />\n'
    '        )}\n'
    '\n'
    '        {/* 4. Heatmap */}\n'
    '        {isInitialized && <HeatmapCell focusMinsToday={focusMins} />}\n'
    '\n'
    '        {/* 5. Focus Goal */}\n'
    '        {isInitialized && (\n'
    '          <FocusGoalCell focusSeconds={focusSeconds} quizzesCompleted={quizzesCompleted ?? 0} />\n'
    '        )}\n'
    '      </div>\n'
)

# New structure: Hero banner standalone, then courses, then bento-grid for stats
new_bento_to_courses = (
    '      {/* Hero banner */}\n'
    '      {user && (\n'
    '        <HeroBanner\n'
    '          user={{ first_name: user.first_name, photo_url: user.photo_url }}\n'
    '          totalXP={totalXP} level={level} focusSeconds={focusSeconds}\n'
    '          xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}\n'
    '        />\n'
    '      )}\n'
    '\n'
)

if old_bento_to_courses in content:
    content = content.replace(old_bento_to_courses, new_bento_to_courses)
    print("Bento-grid hero section restructured OK")
else:
    print("WARNING: bento-grid hero section not matched exactly")
    # Debug: check what's around the bento-grid
    idx = content.find('<div className="bento-grid">')
    if idx != -1:
        print(f"Found bento-grid at index {idx}")
        print(repr(content[idx-50:idx+200]))

# ── 8b. Fix the courses section: change delay from 0.24 to 0.12 ──────────────
# Also remove the mojibake COURSES comment
# Find the motion.section with fadeUp(0.24) (courses section)
old_courses_header = '      <motion.section {...fadeUp(0.24)}>'
new_courses_header = (
    '      {/* Courses — directly under hero */}\n'
    '      <motion.section {...fadeUp(0.12)}>'
)
content = content.replace(old_courses_header, new_courses_header)

# ── 8c. After courses section ends, insert the bento-grid for stats ──────────
# Find the end of courses </motion.section> followed by HeroSection
# The comment before HeroSection has mojibake box-drawing chars

# Match the end of courses section and the HeroSection comment
old_courses_end = (
    '      </motion.section>\n'
    '\n'
)
new_courses_end_with_bento = (
    '      </motion.section>\n'
    '\n'
    '      {/* Bento grid — progress & learning stats */}\n'
    '      <div className="bento-grid">\n'
    '        <ContinueLearningCell />\n'
    '        {isInitialized && (\n'
    '          <XPRingCell\n'
    '            level={level} totalXP={totalXP}\n'
    '            xpPct={xpPct} xpInLevel={xpInLevel} xpForLevel={xpForLevel}\n'
    '          />\n'
    '        )}\n'
    '        {isInitialized && (\n'
    '          <FocusGoalCell focusSeconds={focusSeconds} quizzesCompleted={quizzesCompleted ?? 0} />\n'
    '        )}\n'
    '      </div>\n'
    '\n'
)
# Replace only ONCE (the first occurrence after courses section)
# Find index of </motion.section> followed by HeroSection
idx = content.find('      </motion.section>\n\n      {/* ')
if idx != -1:
    # Check what follows to make sure it's the courses end, not something else
    snippet = content[idx:idx+100]
    print(f"Found courses end at idx {idx}: {repr(snippet[:60])}")
    content = content[:idx] + new_courses_end_with_bento + content[idx+len(old_courses_end):]
    print("Bento stats grid inserted after courses OK")
else:
    print("WARNING: courses </motion.section> boundary not found")
    # Try alternate
    idx2 = content.find('      </motion.section>\n\n      <HeroSection')
    if idx2 != -1:
        content = (
            content[:idx2]
            + new_courses_end_with_bento
            + content[idx2+len(old_courses_end):]
        )
        print("Bento stats grid inserted (alt pattern)")

# ── 9. Remove the mojibake comment lines (optional cleanup) ──────────────────
# Replace box-drawing comment separators with clean ASCII
box3 = "\u00e2\u201d\u20ac" * 3  # â"€â"€â"€
content = re.sub(r'\{/\* [\u00e2\u201d\u20ac\s\-\w]+\*/\}', '', content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("\nDashboardHome.tsx restructured!")

# ── Verify ────────────────────────────────────────────────────────────────────
with open(path, "r", encoding="utf-8") as f:
    check = f.read()

print("heroicons remaining:", "@heroicons" in check)
print("HeatmapCell remaining:", "HeatmapCell" in check)
print("lucide-react import:", "lucide-react" in check)
print("ChevronRight (renamed):", "ChevronRight" in check and "ChevronRightIcon" not in check)
print("bento-grid present:", 'className="bento-grid"' in check)
