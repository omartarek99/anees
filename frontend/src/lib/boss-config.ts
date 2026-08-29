export type MechanicType = 'standard' | 'shield' | 'combo' | 'regen' | 'enrage';

export type BossArtKey =
  | 'sandworm'
  | 'zubarahGuardian'
  | 'marketDjinn'
  | 'souqGuardian'
  | 'reefSerpent'
  | 'cornicheGuardian'
  | 'cometGolem'
  | 'observatoryGuardian'
  | 'stoneColossus'
  | 'falconGuardian';

export type BossConfig = {
  levelNumber: number;
  mechanic: MechanicType;
  artKey: BossArtKey;
  colorPrimary: string;
  colorSecondary: string;
  glow: string;
  mechanicNameEn: string;
  mechanicNameAr: string;
  mechanicHintEn: string;
  mechanicHintAr: string;
  /** mechanic-specific tuning */
  shieldHits?: number;
  regenFactor?: number;
};

export const BOSS_ROSTER: BossConfig[] = [
  {
    levelNumber: 5,
    mechanic: 'standard',
    artKey: 'sandworm',
    colorPrimary: '#c17a3a',
    colorSecondary: '#7a4a1e',
    glow: '#e0a860',
    mechanicNameEn: 'Steady Strikes',
    mechanicNameAr: 'ضربات ثابتة',
    mechanicHintEn: 'Every correct answer deals steady damage to the monster. Focus and land each hit!',
    mechanicHintAr: 'كل إجابة صحيحة تُلحق ضررًا ثابتًا بالوحش. ركّز وأصب كل ضربة!',
  },
  {
    levelNumber: 10,
    mechanic: 'shield',
    artKey: 'zubarahGuardian',
    colorPrimary: '#8a1538',
    colorSecondary: '#5c0d20',
    glow: '#c9a24b',
    mechanicNameEn: 'Stone Shield',
    mechanicNameAr: 'الدرع الحجري',
    mechanicHintEn: 'The guardian protects itself with a stone shield! Answer correctly twice in a row to break it before real damage begins.',
    mechanicHintAr: 'يحمي الحارس نفسه بدرع حجري! أجب بشكل صحيح مرتين متتاليتين لتحطيمه قبل أن يبدأ الضرر الحقيقي.',
    shieldHits: 2,
  },
  {
    levelNumber: 15,
    mechanic: 'combo',
    artKey: 'marketDjinn',
    colorPrimary: '#b8563f',
    colorSecondary: '#7a3a26',
    glow: '#e08a6a',
    mechanicNameEn: 'Rising Combo',
    mechanicNameAr: 'سلسلة متصاعدة',
    mechanicHintEn: 'Consecutive correct answers increase your strike power! Any mistake resets your streak to zero.',
    mechanicHintAr: 'الإجابات الصحيحة المتتالية تزيد قوة ضربتك! أي خطأ يُعيد سلسلتك إلى الصفر.',
  },
  {
    levelNumber: 20,
    mechanic: 'regen',
    artKey: 'souqGuardian',
    colorPrimary: '#a3543a',
    colorSecondary: '#5c2e1a',
    glow: '#e0937a',
    mechanicNameEn: 'Slow Regeneration',
    mechanicNameAr: 'تجدد بطيء',
    mechanicHintEn: 'This guardian recovers a little energy each time you get one wrong! Answer fast and accurately to outpace its healing.',
    mechanicHintAr: 'يستعيد هذا الحارس القليل من طاقته كلما أخطأت! أجب بسرعة ودقة لتتغلب على تعافيه.',
    regenFactor: 0.35,
  },
  {
    levelNumber: 25,
    mechanic: 'enrage',
    artKey: 'reefSerpent',
    colorPrimary: '#2e6a96',
    colorSecondary: '#1f4a6b',
    glow: '#7fb3e8',
    mechanicNameEn: 'Rising Fury',
    mechanicNameAr: 'غضب متصاعد',
    mechanicHintEn: 'The lower its HP drops, the angrier the monster gets! Keep attacking all the way to the end.',
    mechanicHintAr: 'كلما انخفضت طاقة الوحش، يزداد غضبه! لا تتوقف عن الهجوم حتى النهاية.',
  },
  {
    levelNumber: 30,
    mechanic: 'shield',
    artKey: 'cornicheGuardian',
    colorPrimary: '#1f4a6b',
    colorSecondary: '#123047',
    glow: '#7ab8e0',
    mechanicNameEn: 'Double Shield',
    mechanicNameAr: 'درع مزدوج',
    mechanicHintEn: 'This guardian wears two stacked stone shields! You need four correct answers in a row to break them completely.',
    mechanicHintAr: 'يحمل هذا الحارس درعين حجريين متتاليين! ستحتاج أربع إجابات صحيحة متتالية لتحطيمهما بالكامل.',
    shieldHits: 4,
  },
  {
    levelNumber: 35,
    mechanic: 'combo',
    artKey: 'cometGolem',
    colorPrimary: '#5c3a96',
    colorSecondary: '#3f2a6b',
    glow: '#b8aaf0',
    mechanicNameEn: 'Meteor Combo',
    mechanicNameAr: 'سلسلة الشهاب',
    mechanicHintEn: "A correct-answer streak here reaches up to triple damage! Stay completely focused.",
    mechanicHintAr: 'سلسلة الإجابات الصحيحة هنا تصل إلى ضرر مضاعف ثلاث مرات! حافظ على تركيزك التام.',
  },
  {
    levelNumber: 40,
    mechanic: 'regen',
    artKey: 'observatoryGuardian',
    colorPrimary: '#4a3f8a',
    colorSecondary: '#2c2560',
    glow: '#a68be0',
    mechanicNameEn: 'Rapid Regeneration',
    mechanicNameAr: 'تجدد سريع',
    mechanicHintEn: 'This guardian heals very quickly after every mistake! Almost every answer needs to land.',
    mechanicHintAr: 'هذا الحارس يتعافى بسرعة كبيرة بعد كل خطأ! يجب أن تصيب كل إجابة هدفها تقريبًا.',
    regenFactor: 0.55,
  },
  {
    levelNumber: 45,
    mechanic: 'enrage',
    artKey: 'stoneColossus',
    colorPrimary: '#5c6b4f',
    colorSecondary: '#3d4736',
    glow: '#a3ad9a',
    mechanicNameEn: 'Colossal Fury',
    mechanicNameAr: 'غضب العملاق',
    mechanicHintEn: 'The closer the stone colossus gets to defeat, the more the ground shakes with its fury! Keep attacking steadily.',
    mechanicHintAr: 'كلما اقترب العملاق الحجري من الهزيمة، تهتز الأرض من شدة غضبه! استمر في الهجوم بثبات.',
  },
  {
    levelNumber: 50,
    mechanic: 'combo',
    artKey: 'falconGuardian',
    colorPrimary: '#8a1538',
    colorSecondary: '#c9a24b',
    glow: '#f0c96a',
    mechanicNameEn: 'Falcon Fury Combo',
    mechanicNameAr: 'سلسلة غضب الصقر',
    mechanicHintEn: 'The final battle! A correct-answer streak here grants the strongest strikes of the entire journey.',
    mechanicHintAr: 'المعركة الأخيرة! سلسلة الإجابات الصحيحة هنا تمنحك أقوى الضربات في الرحلة كلها.',
  },
];

export function getBossConfig(levelNumber: number): BossConfig {
  return (
    BOSS_ROSTER.find((b) => b.levelNumber === levelNumber) ?? {
      levelNumber,
      mechanic: 'standard',
      artKey: 'sandworm',
      colorPrimary: '#8a1538',
      colorSecondary: '#5c0d20',
      glow: '#c9a24b',
      mechanicNameEn: 'Steady Strikes',
      mechanicNameAr: 'ضربات ثابتة',
      mechanicHintEn: 'Every correct answer deals steady damage to the monster!',
      mechanicHintAr: 'كل إجابة صحيحة تُلحق ضررًا ثابتًا بالوحش!',
    }
  );
}

function comboMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  if (streak === 2) return 1.5;
  return 2;
}

/** Computes the boss's HP (0-100) purely for the live in-arena animation, given the ordered
 * correctness of every question answered so far. Authoritative pass/fail still comes from the
 * server's /submit ratio check — this is a cosmetic mirror of that progress. */
export function computeBossHp(config: BossConfig, resultsSoFar: boolean[], total: number): number {
  if (total <= 0) return 100;
  const per = 100 / total;

  if (config.mechanic === 'shield') {
    const shieldHits = config.shieldHits ?? 2;
    let shieldRemaining = shieldHits;
    let damagingHits = 0;
    for (const r of resultsSoFar) {
      if (!r) continue;
      if (shieldRemaining > 0) shieldRemaining -= 1;
      else damagingHits += 1;
    }
    const remainingQuestions = Math.max(1, total - shieldHits);
    const perAfterShield = 100 / remainingQuestions;
    return Math.max(0, 100 - damagingHits * perAfterShield);
  }

  if (config.mechanic === 'combo') {
    let simStreak = 0;
    let normalizer = 0;
    for (let i = 0; i < total; i++) {
      simStreak += 1;
      normalizer += comboMultiplier(simStreak);
    }
    const base = 100 / normalizer;
    let hp = 100;
    let streak = 0;
    for (const r of resultsSoFar) {
      if (r) {
        streak += 1;
        hp -= base * comboMultiplier(streak);
      } else {
        streak = 0;
      }
    }
    return Math.max(0, hp);
  }

  if (config.mechanic === 'regen') {
    const regen = config.regenFactor ?? 0.4;
    let hp = 100;
    for (const r of resultsSoFar) {
      if (r) hp -= per;
      else hp += per * regen;
    }
    return Math.max(0, Math.min(100, hp));
  }

  // standard + enrage share the same underlying damage curve; enrage is a cosmetic overlay
  const correct = resultsSoFar.filter(Boolean).length;
  return Math.max(0, 100 - correct * per);
}

export const ENCOURAGEMENT_AR = {
  start: ['استعد للمعركة يا بطل! 🛡️', 'أظهر مهاراتك في الرياضيات والعلوم!', 'حان وقت المواجهة! أنت مستعد!'],
  correct: ['أحسنت! ضربة موفقة! 💥', 'رائع! استمر هكذا! 🔥', 'ضربة قوية! الوحش يتراجع!', 'ممتاز! تقدم رائع!', 'هكذا يا بطل! 👏', 'إجابة رائعة! واصل الهجوم!'],
  wrong: ['لا بأس، حاول التركيز في السؤال القادم!', 'كن حذرًا في إجابتك القادمة!', 'لا تستسلم، فكّر جيدًا!', 'كل بطل يخطئ أحيانًا، أكمل بقوة!'],
  lowHp: ['الوحش على وشك الهزيمة! ضربة أخيرة! ⚡', 'اقتربت من النصر! استمر!', 'إنه يترنح! لا تتوقف الآن!'],
  victory: ['🏆 لقد هزمت الحارس! أنت بطل حقيقي!'],
  defeat: ['لقد بذلت جهدًا رائعًا! حاول مرة أخرى لتصبح أقوى وتهزمه!'],
};

export function randomFrom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}
