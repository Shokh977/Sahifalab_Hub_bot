"""
_curated_content.py — small, static, Python-owned facts for the Haftalik
sharh personalization feature (weekly study-method tip, per-category
context). Same rule as weekly_review_service._pick_feature_spotlight:
these are real, verifiable, evergreen facts written by a human, never
invented by the model — the model only phrases whichever one Python picks.

Deliberately hardcoded here rather than a DB-backed curated_facts table
(unlike the 5-savol O'zbek adabiyoti/tarix_meros case): this set is small
(8 study methods, 8 categories), genuinely evergreen (a technique's
description or "why this field matters" doesn't go stale the way a
specific current-events claim would), and carries none of the "getting a
specific cultural/historical fact wrong in front of the community" risk
that motivated the DB-backed curation there. If this ever needs runtime
editing without a deploy, promote it to app_config the same way
daily_quiz_categories was.
"""

# Prefixed with an index for a stable, order-independent rotation key —
# _pick_study_method indexes by position, so don't reorder existing entries
# once shipped (a user's "this week's method" would silently jump weeks).
STUDY_METHODS: list[dict] = [
    {
        "key": "pomodoro",
        "name": "Pomodoro texnikasi",
        "description": (
            "25 daqiqa to'liq diqqat bilan ishlab, keyin 5 daqiqa tanaffus olish — "
            "bu tsiklni takrorlash charchoqni kamaytiradi va uzoq davomiyroq "
            "diqqatni saqlashga yordam beradi."
        ),
    },
    {
        "key": "active_recall",
        "name": "Faol eslash (Active Recall)",
        "description": (
            "O'qigan narsangizni qayta o'qish o'rniga, kitobga qaramay xotiradan "
            "qayta tiklashga harakat qiling — bu passiv qayta o'qishdan sezilarli "
            "darajada samaraliroq ekanligi ko'plab tadqiqotlarda tasdiqlangan."
        ),
    },
    {
        "key": "spaced_repetition",
        "name": "Oraliqli takrorlash (Spaced Repetition)",
        "description": (
            "Ma'lumotni bir marta emas, balki o'sib boruvchi vaqt oralig'ida "
            "(masalan 1 kun, 3 kun, 1 hafta) takrorlash uni uzoq muddatli "
            "xotirada mustahkam saqlashga yordam beradi."
        ),
    },
    {
        "key": "feynman",
        "name": "Feynman texnikasi",
        "description": (
            "O'rgangan mavzuingizni xuddi boshqa birovga, oddiy so'zlar bilan "
            "tushuntirayotgandek yozib chiqing — qayerda to'xtab qolsangiz, "
            "aynan o'sha joyda bilim bo'shlig'ingiz bor."
        ),
    },
    {
        "key": "interleaving",
        "name": "Aralashtirib o'rganish (Interleaving)",
        "description": (
            "Bir mavzuni uzoq davom ettirish o'rniga, bir necha bog'liq mavzu "
            "yoki ko'nikmani almashtirib mashq qilish — miyani moslashuvchan "
            "fikrlashga o'rgatadi va bilimni chuqurroq singdiradi."
        ),
    },
    {
        "key": "pareto",
        "name": "Pareto printsipi (80/20)",
        "description": (
            "Ko'pincha natijaning 80 foizi harakatning atigi 20 foizidan keladi — "
            "eng ko'p foyda beradigan eng muhim mavzu yoki ko'nikmalarni "
            "aniqlab, birinchi navbatda ularga vaqt ajrating."
        ),
    },
    {
        "key": "eisenhower",
        "name": "Eyzenxauer matritsasi",
        "description": (
            "Vazifalarni \"muhim/muhim emas\" va \"shoshilinch/shoshilinch "
            "emas\" o'qlariga joylashtirib, qaysi birini avval, qaysi birini "
            "keyinroq bajarish kerakligini aniq belgilang."
        ),
    },
    {
        "key": "time_blocking",
        "name": "Vaqt blokirovkasi (Time Blocking)",
        "description": (
            "Kun davomida har bir muhim vazifa uchun kalendarda aniq vaqt "
            "oralig'ini oldindan belgilab qo'ying — \"vaqt topilganda\" "
            "qilaman, deyish o'rniga."
        ),
    },
]


# Keyed by the real category slug (migrations/007_categories_courses.sql).
CATEGORY_CONTEXT: dict[str, dict] = {
    "programming": {
        "name": "Dasturlash",
        "fact": (
            "Dasturlash ko'nikmalari endi faqat IT sohasida emas — moliya, "
            "sog'liqni saqlash, ta'lim va ishlab chiqarishning deyarli barcha "
            "zamonaviy tarmoqlarida talab qilinadi."
        ),
    },
    "languages": {
        "name": "Tillar",
        "fact": (
            "Chet tilini bilish xalqaro ta'lim, masofaviy ish va sayohat "
            "imkoniyatlari doirasini sezilarli darajada kengaytiradi."
        ),
    },
    "math": {
        "name": "Matematika",
        "fact": (
            "Matematik fikrlash — mantiqiy tahlil va muammoni bosqichma-bosqich "
            "yechish qobiliyati — dasturlashdan moliyagacha bo'lgan ko'plab "
            "sohalarda asosiy ko'nikma hisoblanadi."
        ),
    },
    "science": {
        "name": "Fan",
        "fact": (
            "Ilmiy fikrlash — gipoteza qurish va uni dalillar bilan tekshirish "
            "odati — kundalik qarorlarni ham aniqroq qabul qilishga yordam "
            "beradi."
        ),
    },
    "business": {
        "name": "Biznes",
        "fact": (
            "Biznes va moliyaviy savodxonlik shaxsiy byudjetni boshqarishdan "
            "tortib, mustaqil loyiha yoki kompaniya boshlashgacha bo'lgan "
            "qarorlarga bevosita ta'sir qiladi."
        ),
    },
    "personal-dev": {
        "name": "Shaxsiy rivojlanish",
        "fact": (
            "Odat va vaqtni boshqarish ko'nikmalari — ular o'rganilgan aniq "
            "mavzudan qat'i nazar — barcha boshqa maqsadlarga erishishni "
            "tezlashtiradi."
        ),
    },
    "design": {
        "name": "Dizayn",
        "fact": (
            "Dizayn tafakkuri — foydalanuvchi ehtiyojidan kelib chiqib "
            "yechim topish — endi nafaqat ijodiy, balki texnik va biznes "
            "loyihalarda ham qadrlanadigan ko'nikma."
        ),
    },
    "other": {
        "name": "Boshqa",
        "fact": (
            "Qaysi sohani tanlamang, muntazam va izchil mashq qilish "
            "iste'dodning o'zidan ko'ra ko'proq natija beradi."
        ),
    },
}
