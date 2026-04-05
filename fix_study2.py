"""
fix_study2.py — Replace heroicons with lucide-react in StudyPage.tsx
                + fix remaining mojibake emojis in JSX strings
"""
import re

path = r"d:\My Data\Coding\SAHIFALAB\Telegram App\frontend\src\pages\StudyPage.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. Replace heroicons import block ─────────────────────────────────────────
old_import = (
    "import {\n"
    "  AcademicCapIcon,\n"
    "  ArrowPathIcon,\n"
    "  Battery100Icon,\n"
    "  ExclamationCircleIcon,\n"
    "  FireIcon,\n"
    "  ForwardIcon,\n"
    "  LightBulbIcon,\n"
    "  MusicalNoteIcon,\n"
    "  PauseIcon,\n"
    "  PlayIcon,\n"
    "  SpeakerWaveIcon,\n"
    "  SpeakerXMarkIcon,\n"
    "  UserGroupIcon,\n"
    "} from '@heroicons/react/24/outline'"
)
new_import = (
    "import {\n"
    "  GraduationCap,\n"
    "  RefreshCw,\n"
    "  Battery,\n"
    "  AlertCircle,\n"
    "  Flame,\n"
    "  SkipForward,\n"
    "  Lightbulb,\n"
    "  Music,\n"
    "  Pause,\n"
    "  Play,\n"
    "  Volume2,\n"
    "  VolumeX,\n"
    "  Users,\n"
    "} from 'lucide-react'"
)
if old_import in content:
    content = content.replace(old_import, new_import)
    print("Import replaced OK")
else:
    print("WARNING: import block not matched exactly — trying partial")
    content = re.sub(
        r"import \{[^}]+\} from '@heroicons/react/24/outline'",
        new_import,
        content,
        flags=re.DOTALL,
    )

# ── 2. Rename icon component usages ──────────────────────────────────────────
renames = [
    ("AcademicCapIcon", "GraduationCap"),
    ("ArrowPathIcon",   "RefreshCw"),
    ("Battery100Icon",  "Battery"),
    ("ExclamationCircleIcon", "AlertCircle"),
    ("FireIcon",        "Flame"),
    ("ForwardIcon",     "SkipForward"),
    ("LightBulbIcon",   "Lightbulb"),
    ("MusicalNoteIcon", "Music"),
    ("PauseIcon",       "Pause"),
    ("PlayIcon",        "Play"),
    ("SpeakerWaveIcon", "Volume2"),
    ("SpeakerXMarkIcon","VolumeX"),
    ("UserGroupIcon",   "Users"),
]
for old, new in renames:
    content = content.replace(old, new)
print("Icon renames done")

# ── 3. Fix remaining broken emoji literals in JSX strings ────────────────────
# Each mojibake → correct emoji (byte-exact mapping via CP1252→UTF-8 logic)
emoji_fixes = [
    # 🌿 (U+1F33F)  F0 9F 8C BF  →  ð (F0) Ÿ (9F) Œ (8C=U+0152) ¿ (BF) = ðŸŒ¿
    ("\u00f0\u0178\u0152\u00bf", "\U0001F33F"),
    # 🎯 (U+1F3AF)  F0 9F 8E AF  →  ð Ÿ Ž (8E=U+017D) ¯ (AF) = ðŸŽ¯
    ("\u00f0\u0178\u017d\u00af", "\U0001F3AF"),
    # 🎵 (U+1F3B5)  F0 9F 8E B5  →  ð Ÿ Ž µ = ðŸŽµ
    ("\u00f0\u0178\u017d\u00b5", "\U0001F3B5"),
    # ⚡ (U+26A1) E2 9A A1  →  â š (9A=U+0161) ¡ (A1) = âš¡
    ("\u00e2\u0161\u00a1", "\u26A1"),
    # ⟳ (U+27F3) E2 9F B3  →  â Ÿ ³ = âŸ³
    ("\u00e2\u0178\u00b3", "\u27F3"),
    # Also fix any remaining â€" em-dashes missed earlier
    ("\u00e2\u20ac\u201d", "\u2014"),
]
for broken, fixed in emoji_fixes:
    if broken in content:
        content = content.replace(broken, fixed)
        print(f"  Fixed: {repr(broken)} → {fixed}")

# ── 4. Replace the spinning âŸ³ span with a lucide RefreshCw ────────────────
# Pattern: <span className="animate-spin text-sm">⟳</span>
content = content.replace(
    '<span className="animate-spin text-sm">\u27F3</span>',
    '<RefreshCw className="w-4 h-4 animate-spin text-white/70" />',
)
# Also replace any remaining mojibake spinner
content = content.replace(
    '<span className="animate-spin text-sm">\u00e2\u0178\u00b3</span>',
    '<RefreshCw className="w-4 h-4 animate-spin text-white/70" />',
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("StudyPage.tsx heroicons + JSX emojis fixed!")

# ── Verify ────────────────────────────────────────────────────────────────────
with open(path, "r", encoding="utf-8") as f:
    check = f.read()

print("heroicons import remaining:", "@heroicons/react" in check)
print("AcademicCapIcon remaining:", "AcademicCapIcon" in check)
print("lucide import present:", "lucide-react" in check)
print("GraduationCap present:", "GraduationCap" in check)
