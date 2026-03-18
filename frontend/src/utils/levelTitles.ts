// Level titles and descriptions for gamification system
export interface LevelInfo {
  level: number;
  title: string; // Uzbek title
  description: string; // Uzbek description
}

export const LEVEL_TITLES: LevelInfo[] = [
  {
    level: 1,
    title: 'Navkar',
    description: 'Ilm xizmatiga endigina bel bog\'lagan jangchi.'
  },
  {
    level: 2,
    title: 'Chokar',
    description: 'Sodiqlik bilan o\'rganishni davom ettirayotgan shogird.'
  },
  {
    level: 3,
    title: 'G\'ulom',
    description: 'Ustozlar nazoratida bilim oluvchi yosh iste\'dod.'
  },
  {
    level: 4,
    title: 'Yasovul',
    description: 'Intizom va tartibni o\'rganayotgan bilim posboni.'
  },
  {
    level: 5,
    title: 'Munshiy',
    description: 'Yozish va xulosalar chiqarishda mahoratli kotib.'
  },
  {
    level: 6,
    title: 'Mirzo',
    description: 'Savodli, ziyoli va o\'qimishli yosh olim.'
  },
  {
    level: 7,
    title: 'Mahram',
    description: 'Xonlik (bilim) sirlariga yaqinlashgan ishonchli shaxs.'
  },
  {
    level: 8,
    title: 'Ko\'kalosh',
    description: 'Xonning (SAHIFALAB\'ning) eng yaqin safdoshi.'
  },
  {
    level: 9,
    title: 'To\'qsabo',
    description: 'Harbiy-ma\'rifiy guruh boshlig\'i.'
  },
  {
    level: 10,
    title: 'Yuzboshi',
    description: '100 ta quiz yoki muvaffaqiyat egasi.'
  },
  {
    level: 11,
    title: 'Mingboshi',
    description: 'Katta jamoa va tajribaga ega bo\'lgan rahbar.'
  },
  {
    level: 12,
    title: 'Darug\'a',
    description: 'Ma\'lum bir bilim sohasining noibi (gubernatori).'
  },
  {
    level: 13,
    title: 'Parvonachi',
    description: 'Muhim farmonlar (bilimlar) yetkazuvchisi.'
  },
  {
    level: 14,
    title: 'Shog\'ovul',
    description: 'Saroy odobi va ilmiy marosimlar ustasi.'
  },
  {
    level: 15,
    title: 'Otaliq',
    description: 'Yoshlarga yo\'l ko\'rsatuvchi, tajribali murabbiy.'
  },
  {
    level: 16,
    title: 'Inoq',
    description: 'Xonning eng yaqin maslahatgo\'yi va do\'sti.'
  },
  {
    level: 17,
    title: 'Bijiy',
    description: 'El orasida hurmat qozongan aslzoda.'
  },
  {
    level: 18,
    title: 'Bek',
    description: 'O\'z bilim mulkiga ega bo\'lgan mustaqil shaxs.'
  },
  {
    level: 19,
    title: 'Biy',
    description: 'Donoligi bilan muammolarni hal qiluvchi hakam.'
  },
  {
    level: 20,
    title: 'Beklarbegi',
    description: 'Barcha beklarning boshlig\'i, oliy ma\'mur.'
  },
  {
    level: 21,
    title: 'Noib',
    description: 'Hukmdorning o\'rinbosari, katta vakolat sohibi.'
  },
  {
    level: 22,
    title: 'Qo\'shbegi',
    description: 'Davlat (bilim markazi) bosh vaziri.'
  },
  {
    level: 23,
    title: 'Amir',
    description: 'Buyuk qo\'mondon va strategik daho.'
  },
  {
    level: 24,
    title: 'Sulton',
    description: 'Bilim saltanatining yuksak hukmdori.'
  },
  {
    level: 25,
    title: 'Xon',
    description: 'Mutloq rahbar va loyihaning asosiy ustuni.'
  },
  {
    level: 26,
    title: 'Xoqon',
    description: 'Imperiya darajasidagi buyuk hukmron.'
  },
  {
    level: 27,
    title: 'Sohibqiron',
    description: 'Mutloq cho\'qqi. Dunyo ilm-fanini zabt etgan jahongir.'
  }
];

// Get level info by level number
export function getLevelInfo(level: number): LevelInfo {
  const info = LEVEL_TITLES.find(l => l.level === level);
  return info || LEVEL_TITLES[0]; // Default to Navkar if not found
}

// Get level title by level number
export function getLevelTitle(level: number): string {
  const info = getLevelInfo(level);
  return info.title;
}

// Get level description by level number
export function getLevelDescription(level: number): string {
  const info = getLevelInfo(level);
  return info.description;
}

// Get emoji for level (keeping visual distinction)
export function getLevelEmoji(level: number): string {
  if (level >= 27) return '👑' // Sohibqiron
  if (level >= 25) return '🔱' // Xon/Xoqon
  if (level >= 20) return '♔'  // Beklarbegi/Noib/Qo'shbegi/Amir
  if (level >= 15) return '🎖️' // Inoq/Bijiy to Otaliq
  if (level >= 10) return '👑' // Yuzboshi to Darug'a
  if (level >= 7)  return '🚀' // Mahram/Ko'kalosh/To'qsabo
  if (level >= 5)  return '🏆' // Munshiy
  if (level >= 3)  return '📚' // G'ulom/Yasovul
  if (level >= 2)  return '🌿' // Chokar
  return '🌱'                   // Navkar
}
