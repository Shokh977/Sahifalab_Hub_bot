"""
current_week_progress_v1.py — companion to weekly_review_v3.py, but for the
TRUE in-progress week (Monday-of-this-week through today) instead of the
most recently completed one. Same base JSON schema as v3 (headline/summary/
recommendation/feature_spotlight) so the mobile client can reuse its
existing weekly-review rendering components unchanged — only the framing
and the comparison basis differ.

Framing: the week isn't over. Never let the model write in a past-tense
"your week was X" voice (that's v3's job, for the completed week) — this
narrates "so far this week" and must read naturally regardless of whether
today is Monday or Sunday.

Comparison basis: `prev_week_minutes_same_point`, not raw `prev_week_minutes`
— comparing a partial current week against a FULL completed week is
misleading (of course 2 days < 7 days). prev_week_minutes_same_point is
Python-computed (weekly_review_service.gather_user_stats) as last week's
minutes through the SAME number of elapsed days, so the model is handed an
already-fair number and never has to (unreliably) do that math itself —
same "Python decides, the LLM only phrases it" rule this codebase already
applies to feature_spotlight.

Personalization (added on request): learning_motivation/experience_level
(onboarding answers, profiles.user_settings) set the TONE only — the model
is never asked to invent facts about the user, only to phrase things in a
way that fits why/how they said they're learning. study_method_hint/
category_context_hint/tutor_hint are the same "Python picks a real,
pre-written fact, the model only phrases it" pattern as feature_spotlight_hint
(see weekly_review_service._pick_study_method/_pick_category_context/
_check_tutor_opportunity + _curated_content.py) — none of these three are
ever left for the model to invent, specifically because "tell the user
what's happening in their field" is exactly the kind of prompt that
produces confident, plausible-sounding, WRONG claims (the same failure
mode as the 5-savol quiz's "Honavar effekti" hallucination) if the model
is allowed to supply the content itself instead of only its phrasing.

Same non-negotiable rule as v3: every number must come from the input JSON,
nothing invented.
"""

VERSION = "current_week_progress.v2"

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ilovasidagi shaxsiy o'quv maslahatchisan. Foydalanuvchining "
    "HALI TUGAMAGAN, DAVOM ETAYOTGAN haftalik statistikasi (shu haftaning "
    "hozirgacha bo'lgan fokus vaqti, seriya, flashcard natijalari, kunlik "
    "viktorina, Bellashuv, kurs progressi), uning o'quv maqsadi/tajriba "
    "darajasi va uchta 'e'tibor qaratish kerak bo'lgan xususiyat' "
    "(feature_spotlight_hint, study_method_hint, category_context_hint) hamda "
    "ixtiyoriy tutor_hint JSON ko'rinishida beriladi.\n\n"
    "ENG MUHIM QOIDA — VAQT SHAKLI: bu hafta HALI TUGAMAGAN. Hech qachon "
    "o'tgan zamon bilan \"bu hafta ... bo'ldingiz\" deb yozma — buning "
    "o'rniga \"hozirgacha\", \"shu paytgacha\", \"bugungi kungacha\" kabi "
    "davom etayotgan shaklda yoz. Agar today hafta boshida (dushanba/"
    "seshanba) bo'lsa, hafta hali yangi boshlanganini hisobga ol — kam "
    "faollikni tanqid qilma.\n\n"
    "SHAXSIYLASHTIRISH — OHANG: agar learning_motivation berilgan bo'lsa, "
    "ohangni shunga moslashtir — 'exam' bo'lsa imtihonga tayyorgarlik "
    "nuqtai nazaridan, 'career' bo'lsa kasbiy o'sish nuqtai nazaridan, "
    "'skill' yoki 'self' bo'lsa shaxsiy rivojlanish nuqtai nazaridan yoz. "
    "Agar experience_level='beginner' bo'lsa, tilni sodda va rag'batlantiruvchi "
    "tut; 'advanced' bo'lsa, undan ko'proq mustaqillik kutilayotganini "
    "ko'rsatish mumkin. Bu FAQAT ohangga ta'sir qiladi — foydalanuvchi "
    "haqida hech qanday yangi fakt o'ylab topma.\n\n"
    "Qoidalar:\n"
    "- Faqat berilgan raqamlar va faktlardan foydalan — hech qanday raqamni, "
    "voqeani yoki statistikani o'ylab topma. Agar biror maydon berilmagan "
    "yoki null bo'lsa, u haqida gapirma.\n"
    "- Solishtirish uchun FAQAT prev_week_minutes_same_point'dan foydalan "
    "(o'tgan haftaning AYNAN shu kungacha bo'lgan qismi) — xom "
    "prev_week_minutes'ni (o'tgan haftaning TO'LIQ yakuni) ishlatma, chunki "
    "yarim hafta bilan to'liq haftani solishtirish adolatsiz va chalg'ituvchi.\n"
    "- summary'da kamida 2 ta ANIQ raqamni solishtirib ko'rsat (masalan: "
    "hozirgacha bo'lgan fokus daqiqasi va o'tgan haftaning shu kungacha "
    "bo'lgan qismi, faol kunlar soni, yoki flashcard aniqligi).\n"
    "- Agar projected_week_minutes berilgan bo'lsa, uni shu sur'atda hafta "
    "oxirigacha taxminiy natija sifatida ISHLATISHING MUMKIN (majburiy "
    "emas) — rag'batlantiruvchi yoki ehtiyotkorlik bilan ogohlantiruvchi "
    "ohangda, hech qachon qat'iy bashorat sifatida emas.\n"
    "- Qisqa (3-5 jumla) samimiy, rag'batlantiruvchi umumiy sharh yoz "
    "(summary) — yuqoridagi qoidalarga qat'iy amal qil.\n"
    "- Bitta aniq, amalga oshirish mumkin bo'lgan tavsiya ber "
    "(recommendation) — hafta hali tugamaganini hisobga olib, qolgan "
    "kunlar uchun amaliy maslahat ber.\n"
    "- feature_spotlight_hint asosida alohida qism yoz (feature_spotlight): "
    "unda ko'rsatilgan haqiqatni (fact) va foydalanuvchining shu haftadagi "
    "raqamlarini ishlatib, iliq taklif qil. Hech qachon ayblama yoki bosim "
    "o'tkazma.\n"
    "- study_method_hint HAR DOIM beriladi — uni study_tip maydoniga "
    "aylantir: hint'dagi nom (name) va tavsif (description) ANIQ shu "
    "ko'rinishda saqlansin, faqat foydalanuvchining maqsadiga (masalan "
    "dasturlash o'rganish yoki imtihonga tayyorgarlik) moslab bitta amaliy "
    "jumla qo'sh — usulning o'zini o'zgartirma yoki boshqa usul bilan "
    "aralashtirma.\n"
    "- category_context_hint berilgan bo'lsa (null bo'lmasa), uni "
    "category_insight maydoniga aylantir — undagi fact'ni ANIQ shu "
    "ko'rinishda ishlat, o'zingdan yangi da'vo qo'shma. Berilmagan bo'lsa "
    "(null), category_insight'ni butunlay tashla.\n"
    "- tutor_hint berilgan bo'lsa (null bo'lmasa), uni tutor_suggestion "
    "maydoniga aylantir — FAQAT ilovaning o'zidagi 'o'qituvchi bo'lish' "
    "dasturiga taklif sifatida yoz (masalan boshqalarga category_name "
    "bo'yicha yordam berish/dars berish imkoniyati), hech qachon ilova "
    "tashqarisidagi imkoniyat yoki dasturni o'ylab topma yoki tilga olma. "
    "Berilmagan bo'lsa (null), tutor_suggestion'ni butunlay tashla.\n"
    "- Agar hint_key='all_active' bo'lsa, tabriklovchi va yana ilgarilab "
    "borishga undovchi qisqa qism yoz.\n"
    "- Hafta hozircha sust o'tayotgan bo'lsa ham, tushunuvchan va "
    "motivatsion bo'l — hafta hali tugamagani uchun vaqt bor, hech qachon "
    "ayblovchi ohangda yozma.\n"
    "- O'zbek tilida yoz.\n"
    "- Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "headline":       {"type": "string"},
        "summary":        {"type": "string"},
        "recommendation": {"type": "string"},
        "feature_spotlight": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body":  {"type": "string"},
            },
            "required": ["title", "body"],
        },
        "study_tip": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body":  {"type": "string"},
            },
            "required": ["title", "body"],
        },
        "category_insight": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body":  {"type": "string"},
            },
            "required": ["title", "body"],
        },
        "tutor_suggestion": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body":  {"type": "string"},
            },
            "required": ["title", "body"],
        },
    },
    "required": ["headline", "summary", "recommendation", "feature_spotlight", "study_tip"],
}


def build_user_prompt(
    stats: dict, spotlight_hint: dict, *,
    learning_motivation: str | None = None,
    experience_level: str | None = None,
    study_method_hint: dict | None = None,
    category_context_hint: dict | None = None,
    tutor_hint: dict | None = None,
) -> str:
    import json
    payload = {
        **stats,
        "feature_spotlight_hint": spotlight_hint,
        "learning_motivation": learning_motivation,
        "experience_level": experience_level,
        "study_method_hint": study_method_hint,
        "category_context_hint": category_context_hint,
        "tutor_hint": tutor_hint,
    }
    return f"Hozirgi (davom etayotgan) hafta statistikasi va shaxsiylashtirish ma'lumotlari:\n{json.dumps(payload, ensure_ascii=False)}"
