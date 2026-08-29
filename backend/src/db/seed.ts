import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

type Q = {
  text: string;
  textAr: string;
  choices: [string, string, string, string];
  choicesAr: [string, string, string, string];
  correct: number;
  explain: string;
  explainAr: string;
};

function toSqlite(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Worksheet questions were authored with the correct answer always first; rotate it to a
 * varied position so students can't just learn "always pick A". No-op if already varied. */
function rotateCorrect(q: Q, targetIndex: number): Q {
  if (q.correct !== 0 || targetIndex === 0) return q;
  const choices = [...q.choices] as [string, string, string, string];
  const choicesAr = [...q.choicesAr] as [string, string, string, string];
  [choices[0], choices[targetIndex]] = [choices[targetIndex], choices[0]];
  [choicesAr[0], choicesAr[targetIndex]] = [choicesAr[targetIndex], choicesAr[0]];
  return { ...q, choices, choicesAr, correct: targetIndex };
}

function pickQs(pool: Q[], offset: number, count = 4): Q[] {
  return Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length]);
}

/** Takes a Q[]-typed literal (so `choices` tuples are contextually checked) and rotates
 * the correct answer position so it isn't always "A". */
function makePool(qs: Q[]): Q[] {
  return qs.map((q, i) => rotateCorrect(q, i % 4));
}

export function seed() {
  const subjectCount = (db.prepare('SELECT COUNT(*) as c FROM subjects').get() as { c: number }).c;
  if (subjectCount > 0) return; // already seeded

  const insertSubject = db.prepare('INSERT INTO subjects (key, name, name_ar, icon) VALUES (?,?,?,?)');
  const mathId = Number(insertSubject.run('math', 'Math', 'الرياضيات', '\u{1F9EE}').lastInsertRowid);
  const scienceId = Number(insertSubject.run('science', 'Science', 'العلوم', '\u{1F52C}').lastInsertRowid);

  const insertLevel = db.prepare(
    `INSERT INTO map_levels (level_number, subject_id, kind, title, title_ar, xp_threshold, status) VALUES (?,?,?,?,?,?,?)`
  );
  const levelIds = new Map<number, number>();

  // ---------------------------------------------------------------------
  // Map levels — Desert Oasis (1-10): boss every 5 levels now (L5 + L10)
  // ---------------------------------------------------------------------
  const desertPlan: { n: number; subject: 'math' | 'science' | null; kind: 'normal' | 'boss'; title: string; titleAr: string }[] = [
    { n: 1, subject: 'math', kind: 'normal', title: 'Place Value & Big Numbers', titleAr: 'القيمة المكانية والأعداد الكبيرة' },
    { n: 2, subject: 'science', kind: 'normal', title: 'The Scientific Method', titleAr: 'الطريقة العلمية' },
    { n: 3, subject: 'math', kind: 'normal', title: 'Addition & Subtraction Strategies', titleAr: 'استراتيجيات الجمع والطرح' },
    { n: 4, subject: 'science', kind: 'normal', title: 'States of Matter', titleAr: 'حالات المادة' },
    { n: 5, subject: null, kind: 'boss', title: 'Sandworm Sentinel', titleAr: 'حارس دودة الرمال' },
    { n: 6, subject: 'math', kind: 'normal', title: 'Multiplication Mastery', titleAr: 'إتقان الضرب' },
    { n: 7, subject: 'science', kind: 'normal', title: 'Our Solar System', titleAr: 'نظامنا الشمسي' },
    { n: 8, subject: 'math', kind: 'normal', title: 'Division & Remainders', titleAr: 'القسمة والباقي' },
    { n: 9, subject: 'science', kind: 'normal', title: 'Simple Machines', titleAr: 'الآلات البسيطة' },
    { n: 10, subject: null, kind: 'boss', title: 'The Guardian of Al Zubarah', titleAr: 'حارس الزبارة' },
  ];
  for (const lvl of desertPlan) {
    const subjId = lvl.subject === 'math' ? mathId : lvl.subject === 'science' ? scienceId : null;
    const id = Number(insertLevel.run(lvl.n, subjId, lvl.kind, lvl.title, lvl.titleAr, (lvl.n - 1) * 50, 'ready').lastInsertRowid);
    levelIds.set(lvl.n, id);
  }

  // ---------------------------------------------------------------------
  // Map levels — the other 4 zones (11-50): boss every 5, rest are now
  // real "practice" levels (level 11 gets the Fractions lesson moved here)
  // ---------------------------------------------------------------------
  const genZones = [
    {
      min: 11,
      max: 20,
      name: 'The Souq Quarter',
      nameAr: 'حي السوق',
      bossMid: { title: 'Market Djinn', titleAr: 'جني السوق' },
      bossEnd: { title: 'Guardian of the Souq', titleAr: 'حارس السوق' },
      difficulty: 'easy' as const,
    },
    {
      min: 21,
      max: 30,
      name: 'Corniche Coast',
      nameAr: 'ساحل الكورنيش',
      bossMid: { title: 'Reef Serpent', titleAr: 'أفعى الشعاب' },
      bossEnd: { title: 'Guardian of the Corniche', titleAr: 'حارس الكورنيش' },
      difficulty: 'medium' as const,
    },
    {
      min: 31,
      max: 40,
      name: 'Sky Observatory',
      nameAr: 'مرصد السماء',
      bossMid: { title: 'Comet Golem', titleAr: 'جالوت المذنب' },
      bossEnd: { title: 'Guardian of the Observatory', titleAr: 'حارس المرصد' },
      difficulty: 'medium' as const,
    },
    {
      min: 41,
      max: 50,
      name: "Falcon's Peak",
      nameAr: 'قمة الصقر',
      bossMid: { title: 'Stone Colossus', titleAr: 'عملاق الصخر' },
      bossEnd: { title: "Guardian of Falcon's Peak", titleAr: 'حارس قمة الصقر' },
      difficulty: 'hard' as const,
    },
  ];

  const titleOverrides: Record<number, { title: string; titleAr: string }> = {
    11: { title: 'Fractions Basics', titleAr: 'أساسيات الكسور' },
  };

  for (const zone of genZones) {
    for (let n = zone.min; n <= zone.max; n++) {
      const localIdx = n - zone.min + 1;
      if (localIdx === 5 || localIdx === 10) {
        const b = localIdx === 5 ? zone.bossMid : zone.bossEnd;
        const id = Number(insertLevel.run(n, null, 'boss', b.title, b.titleAr, (n - 1) * 50, 'ready').lastInsertRowid);
        levelIds.set(n, id);
        continue;
      }
      const subjId = n % 2 === 0 ? scienceId : mathId;
      const override = titleOverrides[n];
      const title = override ? override.title : `${zone.name} Practice — Level ${n}`;
      const titleAr = override ? override.titleAr : `تدريب ${zone.nameAr} — المستوى ${n}`;
      const id = Number(insertLevel.run(n, subjId, 'normal', title, titleAr, (n - 1) * 50, 'ready').lastInsertRowid);
      levelIds.set(n, id);
    }
  }

  // ---------------------------------------------------------------------
  // Reels + quiz questions
  // ---------------------------------------------------------------------
  const insertReel = db.prepare(
    `INSERT INTO reels (subject_id, map_level_id, title, title_ar, script_text, script_text_ar, video_url, duration_sec, order_in_level) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insertReelQuestion = db.prepare(
    `INSERT INTO reel_questions (reel_id, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, xp_value, order_in_reel) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );

  function addReel(levelN: number, subjectId: number, title: string, titleAr: string, script: string, scriptAr: string, questions: Q[]) {
    const levelId = levelIds.get(levelN)!;
    const reelId = Number(insertReel.run(subjectId, levelId, title, titleAr, script, scriptAr, null, 60, 1).lastInsertRowid);
    questions.forEach((q, i) => {
      insertReelQuestion.run(reelId, q.text, q.textAr, JSON.stringify(q.choices), JSON.stringify(q.choicesAr), q.correct, q.explain, q.explainAr, 15, i + 1);
    });
  }

  addReel(
    1,
    mathId,
    'Place Value & Big Numbers',
    'القيمة المكانية والأعداد الكبيرة',
    "Every digit in a number has a job depending on where it sits! In 4,672 the 4 means four thousand, the 6 means six hundred, the 7 means seventy, and the 2 just means two. Once you can read place value, you can compare huge numbers and round them like a pro. Watch the lesson, then prove what you learned!",
    'لكل رقم في العدد قيمة تعتمد على موضعه! في العدد 4,672 الرقم 4 يعني أربعة آلاف، والرقم 6 يعني ستمئة، والرقم 7 يعني سبعين، والرقم 2 يعني اثنين فقط. عندما تتقن قراءة القيمة المكانية، ستتمكن من مقارنة الأعداد الكبيرة وتقريبها كالمحترفين. شاهد الدرس، ثم أثبت ما تعلمته!',
    [
      { text: 'In the number 4,672, what is the value of the digit 6?', textAr: 'في العدد 4,672، ما قيمة الرقم 6؟', choices: ['6', '60', '600', '6,000'], choicesAr: ['6', '60', '600', '6,000'], correct: 2, explain: 'The 6 is in the hundreds place, so it is worth 600.', explainAr: 'الرقم 6 يقع في خانة المئات، لذا فإن قيمته 600.' },
      { text: 'Which of these numbers is the greatest?', textAr: 'أي هذه الأعداد هو الأكبر؟', choices: ['45,321', '45,312', '45,231', '45,132'], choicesAr: ['45,321', '45,312', '45,231', '45,132'], correct: 0, explain: 'Comparing digit by digit, 45,321 has the largest tens and ones value once thousands match.', explainAr: 'بمقارنة الأرقام رقمًا برقم، العدد 45,321 له أكبر قيمة في خانتي العشرات والآحاد بعد تساوي الآلاف.' },
      { text: 'What is 300,000 + 40,000 + 5,000 + 200 + 7 written as a standard number?', textAr: 'ما ناتج 300,000 + 40,000 + 5,000 + 200 + 7 مكتوبًا كعدد واحد؟', choices: ['345,207', '345,270', '342,507', '345,027'], choicesAr: ['345,207', '345,270', '342,507', '345,027'], correct: 0, explain: 'Adding each place value together gives 345,207.', explainAr: 'بجمع كل قيمة مكانية نحصل على 345,207.' },
      { text: 'Round 68,492 to the nearest thousand.', textAr: 'قرّب العدد 68,492 إلى أقرب ألف.', choices: ['68,000', '69,000', '68,500', '67,000'], choicesAr: ['68,000', '69,000', '68,500', '67,000'], correct: 0, explain: 'The hundreds digit is 4 (less than 5), so we round down to 68,000.', explainAr: 'رقم خانة المئات هو 4 (أصغر من 5)، لذا نقرّب لأسفل إلى 68,000.' },
    ]
  );

  addReel(
    2,
    scienceId,
    'The Scientific Method',
    'الطريقة العلمية',
    'How do scientists figure things out? They follow a plan called the Scientific Method: ask a question, do research, make a hypothesis (a testable guess), run an experiment, look at the results, and draw a conclusion. Scientists repeat experiments to make sure their results are reliable. Watch the lesson and become a young scientist!',
    'كيف يكتشف العلماء الأشياء؟ يتبعون خطة تُسمى الطريقة العلمية: طرح سؤال، إجراء بحث، وضع فرضية (تخمين قابل للاختبار)، إجراء تجربة، ملاحظة النتائج، ثم استخلاص استنتاج. يكرر العلماء تجاربهم للتأكد من أن نتائجهم موثوقة. شاهد الدرس وكن عالمًا صغيرًا!',
    [
      { text: 'What is the first step of the scientific method?', textAr: 'ما الخطوة الأولى في الطريقة العلمية؟', choices: ['Ask a question', 'Run the experiment', 'Write a conclusion', 'Publish the results'], choicesAr: ['طرح سؤال', 'إجراء التجربة', 'كتابة الاستنتاج', 'نشر النتائج'], correct: 0, explain: 'Every investigation starts with a question you want to answer.', explainAr: 'كل بحث علمي يبدأ بسؤال تريد الإجابة عنه.' },
      { text: 'A hypothesis is best described as...', textAr: 'أفضل وصف للفرضية هو...', choices: ['A proven fact', 'A random guess with no reasoning', 'A testable prediction based on observation', 'The final answer to the experiment'], choicesAr: ['حقيقة مثبتة', 'تخمين عشوائي بلا تفكير', 'توقع قابل للاختبار مبني على الملاحظة', 'الإجابة النهائية للتجربة'], correct: 2, explain: 'A hypothesis is an educated, testable guess, not a proven fact.', explainAr: 'الفرضية تخمين مدروس وقابل للاختبار، وليست حقيقة مثبتة.' },
      { text: 'Why do scientists repeat experiments?', textAr: 'لماذا يكرر العلماء تجاربهم؟', choices: ['To waste time', 'To check if the results are reliable', 'Because they forgot the first result', 'To make the experiment longer'], choicesAr: ['لإضاعة الوقت', 'للتأكد من أن النتائج موثوقة', 'لأنهم نسوا النتيجة الأولى', 'لإطالة مدة التجربة'], correct: 1, explain: 'Repeating experiments helps confirm the results are consistent and trustworthy.', explainAr: 'تكرار التجارب يساعد على التأكد من أن النتائج ثابتة وموثوقة.' },
      { text: 'In an experiment testing plant growth with and without sunlight, what is the "control"?', textAr: "في تجربة تختبر نمو النبات مع ضوء الشمس وبدونه، ما المقصود بـ'المجموعة الضابطة'؟", choices: ['The plant grown under normal, unchanged conditions used for comparison', 'The plant getting extra fertilizer', 'The scientist running the test', 'The pot with the biggest plant'], choicesAr: ['النبات الذي يُزرع في ظروف طبيعية دون تغيير لتُستخدم للمقارنة', 'النبات الذي يحصل على سماد إضافي', 'العالم الذي يجري التجربة', 'الإناء الذي يحتوي على أكبر نبات'], correct: 0, explain: 'The control is kept unchanged so it can be compared with the test group.', explainAr: 'تُترك المجموعة الضابطة دون تغيير حتى يمكن مقارنتها بالمجموعة التجريبية.' },
    ]
  );

  addReel(
    3,
    mathId,
    'Addition & Subtraction Strategies',
    'استراتيجيات الجمع والطرح',
    "Big addition and subtraction problems are easy once you know the tricks! Regroup when a column adds up too high, borrow when you can't subtract, and always estimate first by rounding so you know if your answer makes sense. You can even check subtraction by adding the answer back to the number you subtracted. Let's practice!",
    'مسائل الجمع والطرح الكبيرة تصبح سهلة عندما تعرف الحيل! أعد التجميع عندما يكون مجموع الخانة كبيرًا جدًا، واستلف عندما لا تستطيع الطرح، ودائمًا قدّر الناتج أولًا بالتقريب لتتأكد من معقولية إجابتك. يمكنك أيضًا التحقق من الطرح بجمع الناتج مرة أخرى إلى العدد الذي طرحته. لنتدرب!',
    [
      { text: '4,586 + 2,749 = ?', textAr: '4,586 + 2,749 = ؟', choices: ['7,335', '7,235', '6,335', '7,325'], choicesAr: ['7,335', '7,235', '6,335', '7,325'], correct: 0, explain: '4,586 + 2,749 = 7,335.', explainAr: '4,586 + 2,749 = 7,335.' },
      { text: '8,003 − 4,568 = ?', textAr: '8,003 − 4,568 = ؟', choices: ['3,435', '3,535', '4,435', '3,445'], choicesAr: ['3,435', '3,535', '4,435', '3,445'], correct: 0, explain: '8,003 − 4,568 = 3,435.', explainAr: '8,003 − 4,568 = 3,435.' },
      { text: 'Estimate 6,895 + 3,102 by rounding each number to the nearest thousand first.', textAr: 'قدّر ناتج 6,895 + 3,102 بتقريب كل عدد إلى أقرب ألف أولًا.', choices: ['10,000', '9,000', '11,000', '10,900'], choicesAr: ['10,000', '9,000', '11,000', '10,900'], correct: 0, explain: '6,895 rounds to 7,000 and 3,102 rounds to 3,000, so the estimate is 10,000.', explainAr: '6,895 يُقرَّب إلى 7,000 و3,102 يُقرَّب إلى 3,000، إذن التقدير هو 10,000.' },
      { text: 'Which is the best way to check that 512 − 197 = 315 is correct?', textAr: 'ما أفضل طريقة للتحقق من صحة 512 − 197 = 315؟', choices: ['Add 197 + 315 and see if you get 512', 'Divide 512 by 197', 'Multiply 197 × 315', 'Subtract 315 from 197'], choicesAr: ['جمع 197 + 315 والتحقق من الحصول على 512', 'قسمة 512 على 197', 'ضرب 197 × 315', 'طرح 315 من 197'], correct: 0, explain: 'Addition undoes subtraction, so 197 + 315 should equal 512.', explainAr: 'الجمع يعاكس الطرح، لذا يجب أن يساوي 197 + 315 العدد 512.' },
    ]
  );

  addReel(
    4,
    scienceId,
    'States of Matter',
    'حالات المادة',
    'Everything around you is matter, and matter can be a solid, liquid, or gas! In a solid, tiny particles are packed tightly and just vibrate in place. In a liquid, they can slide past each other. In a gas, they spread far apart and move freely. Heat can change matter from one state to another, like ice melting into water!',
    'كل ما حولك هو مادة، والمادة يمكن أن تكون صلبة أو سائلة أو غازية! في الجسم الصلب، تكون الجسيمات الدقيقة متراصة بإحكام وتهتز فقط في مكانها. في السائل، يمكنها الانزلاق فوق بعضها. في الغاز، تنتشر بعيدًا وتتحرك بحرية. يمكن للحرارة أن تغيّر حالة المادة من حالة إلى أخرى، مثل ذوبان الثلج ليصبح ماءً!',
    [
      { text: 'In a solid, particles are...', textAr: 'في المادة الصلبة، تكون الجسيمات...', choices: ['Far apart and moving freely', 'Tightly packed and vibrating in place', 'Spread out filling the container', 'Completely motionless with no energy'], choicesAr: ['متباعدة وتتحرك بحرية', 'متراصة بإحكام وتهتز في مكانها', 'منتشرة تملأ الوعاء', 'ساكنة تمامًا بلا طاقة'], correct: 1, explain: 'Solid particles are tightly packed together and vibrate, but stay in place.', explainAr: 'جسيمات المادة الصلبة متراصة بإحكام وتهتز، لكنها تبقى في مكانها.' },
      { text: 'What is it called when a liquid changes into a gas?', textAr: 'ماذا يُسمى تحوّل السائل إلى غاز؟', choices: ['Freezing', 'Condensation', 'Evaporation', 'Melting'], choicesAr: ['التجمد', 'التكاثف', 'التبخر', 'الانصهار'], correct: 2, explain: 'Evaporation is when a liquid changes into a gas.', explainAr: 'التبخر هو تحوّل السائل إلى غاز.' },
      { text: 'Ice melting into water is an example of a solid turning into a...', textAr: 'ذوبان الثلج ليصبح ماءً مثال على تحوّل مادة صلبة إلى...', choices: ['Gas', 'Liquid', 'Plasma', 'New chemical'], choicesAr: ['غاز', 'سائل', 'بلازما', 'مادة كيميائية جديدة'], correct: 1, explain: 'Melting changes a solid into a liquid.', explainAr: 'الانصهار يحوّل المادة الصلبة إلى سائلة.' },
      { text: 'Which of these is a gas at room temperature?', textAr: 'أي مما يلي يكون غازًا في درجة حرارة الغرفة؟', choices: ['Water', 'Oxygen', 'Iron', 'Sand'], choicesAr: ['الماء', 'الأكسجين', 'الحديد', 'الرمل'], correct: 1, explain: 'Oxygen is a gas that makes up part of the air we breathe.', explainAr: 'الأكسجين غاز يشكّل جزءًا من الهواء الذي نتنفسه.' },
    ]
  );

  addReel(
    6,
    mathId,
    'Multiplication Mastery',
    'إتقان الضرب',
    "Multiplication is just fast repeated addition! You can break big multiplications into smaller, friendlier ones using the distributive property — for example, 6 × 23 becomes (6 × 20) + (6 × 3). Arrays and grouping can help you picture it too. Master your times tables and multi-digit multiplication will feel simple!",
    'الضرب هو ببساطة جمع متكرر وسريع! يمكنك تقسيم عمليات الضرب الكبيرة إلى عمليات أصغر وأسهل باستخدام خاصية التوزيع — على سبيل المثال، 6 × 23 تصبح (6 × 20) + (6 × 3). المصفوفات والتجميع يمكن أن تساعدك على تخيّل ذلك أيضًا. أتقن جدول الضرب وستصبح عمليات الضرب متعددة الخانات بسيطة!',
    [
      { text: '34 × 6 = ?', textAr: '34 × 6 = ؟', choices: ['204', '194', '214', '244'], choicesAr: ['204', '194', '214', '244'], correct: 0, explain: '34 × 6 = 204.', explainAr: '34 × 6 = 204.' },
      { text: '127 × 4 = ?', textAr: '127 × 4 = ؟', choices: ['508', '518', '498', '608'], choicesAr: ['508', '518', '498', '608'], correct: 0, explain: '127 × 4 = 508.', explainAr: '127 × 4 = 508.' },
      { text: 'Using the distributive property, 6 × 23 can be broken into...', textAr: 'باستخدام خاصية التوزيع، يمكن تقسيم 6 × 23 إلى...', choices: ['(6×20) + (6×3)', '(6+20) × (6+3)', '6 × 2 × 3', '(6×20) − (6×3)'], choicesAr: ['(6×20) + (6×3)', '(6+20) × (6+3)', '6 × 2 × 3', '(6×20) − (6×3)'], correct: 0, explain: '23 splits into 20 + 3, so 6 × 23 = (6×20) + (6×3) = 120 + 18 = 138.', explainAr: '23 تنقسم إلى 20 + 3، إذن 6 × 23 = (6×20) + (6×3) = 120 + 18 = 138.' },
      { text: 'A classroom has 8 tables with 6 chairs at each table. How many chairs in total?', textAr: 'يوجد في الفصل 8 طاولات، على كل طاولة 6 كراسٍ. ما عدد الكراسي الكلي؟', choices: ['48', '56', '42', '54'], choicesAr: ['48', '56', '42', '54'], correct: 0, explain: '8 × 6 = 48 chairs.', explainAr: '8 × 6 = 48 كرسيًا.' },
    ]
  );

  addReel(
    7,
    scienceId,
    'Our Solar System',
    'نظامنا الشمسي',
    'Our solar system has 8 planets that all orbit the Sun, a giant star at the center. In order from the Sun, the planets are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Mercury is closest to the Sun and blazing hot, while Mars is famous for its rusty-red color. Let’s blast off and explore!',
    'يحتوي نظامنا الشمسي على 8 كواكب تدور جميعها حول الشمس، وهي نجم عملاق في المركز. بالترتيب من الشمس، الكواكب هي عطارد، والزهرة، والأرض، والمريخ، والمشتري، وزحل، وأورانوس، ونبتون. عطارد هو الأقرب إلى الشمس وشديد الحرارة، بينما يشتهر المريخ بلونه الأحمر الصدئ. هيا بنا ننطلق ونستكشف!',
    [
      { text: 'Which planet is closest to the Sun?', textAr: 'أي الكواكب هو الأقرب إلى الشمس؟', choices: ['Earth', 'Venus', 'Mercury', 'Mars'], choicesAr: ['الأرض', 'الزهرة', 'عطارد', 'المريخ'], correct: 2, explain: 'Mercury is the closest planet to the Sun.', explainAr: 'عطارد هو أقرب كوكب إلى الشمس.' },
      { text: 'What is the Sun?', textAr: 'ما هي الشمس؟', choices: ['A planet', 'A star', 'A moon', 'A comet'], choicesAr: ['كوكب', 'نجم', 'قمر', 'مذنب'], correct: 1, explain: 'The Sun is a star at the center of our solar system.', explainAr: 'الشمس نجم يقع في مركز نظامنا الشمسي.' },
      { text: 'Which planet is known as the "Red Planet"?', textAr: "أي الكواكب يُعرف بـ'الكوكب الأحمر'؟", choices: ['Jupiter', 'Mars', 'Saturn', 'Venus'], choicesAr: ['المشتري', 'المريخ', 'زحل', 'الزهرة'], correct: 1, explain: 'Mars looks reddish because of iron oxide (rust) on its surface.', explainAr: 'يبدو المريخ محمرًّا بسبب أكسيد الحديد (الصدأ) على سطحه.' },
      { text: 'Which of these lists the planets in the correct order outward from the Sun?', textAr: 'أي هذه القوائم يرتب الكواكب بالترتيب الصحيح ابتداءً من الشمس؟', choices: ['Mercury, Venus, Earth, Mars', 'Earth, Mercury, Venus, Mars', 'Venus, Mercury, Mars, Earth', 'Mars, Venus, Mercury, Earth'], choicesAr: ['عطارد، الزهرة، الأرض، المريخ', 'الأرض، عطارد، الزهرة، المريخ', 'الزهرة، عطارد، المريخ، الأرض', 'المريخ، الزهرة، عطارد، الأرض'], correct: 0, explain: 'From the Sun outward, the order is Mercury, Venus, Earth, then Mars.', explainAr: 'بدءًا من الشمس، الترتيب هو عطارد، ثم الزهرة، ثم الأرض، ثم المريخ.' },
    ]
  );

  addReel(
    8,
    mathId,
    'Division & Remainders',
    'القسمة والباقي',
    "Division means sharing equally into groups. Sometimes it splits evenly, and sometimes there's a bit left over — that's called the remainder! Knowing your multiplication facts makes division much faster, and you can always check a division answer by multiplying back. Let's divide and conquer!",
    'القسمة تعني التوزيع بالتساوي على مجموعات. أحيانًا تنقسم بالتساوي تمامًا، وأحيانًا يتبقى جزء — وهذا ما يُسمى الباقي! معرفة حقائق الضرب تجعل القسمة أسرع بكثير، ويمكنك دائمًا التحقق من ناتج القسمة بالضرب مرة أخرى. لنقسم ونتقن!',
    [
      { text: '47 ÷ 5 = ?', textAr: '47 ÷ 5 = ؟', choices: ['9 remainder 2', '8 remainder 7', '9 remainder 5', '10 remainder 3'], choicesAr: ['9 والباقي 2', '8 والباقي 7', '9 والباقي 5', '10 والباقي 3'], correct: 0, explain: '5 × 9 = 45, and 47 − 45 = 2, so the answer is 9 remainder 2.', explainAr: '5 × 9 = 45، و47 − 45 = 2، إذن الناتج هو 9 والباقي 2.' },
      { text: '96 ÷ 8 = ?', textAr: '96 ÷ 8 = ؟', choices: ['12', '11', '14', '16'], choicesAr: ['12', '11', '14', '16'], correct: 0, explain: '8 × 12 = 96.', explainAr: '8 × 12 = 96.' },
      { text: 'If 53 candies are shared equally among 6 friends, how many whole candies does each friend get, and how many are left over?', textAr: 'إذا وُزّعت 53 قطعة حلوى بالتساوي على 6 أصدقاء، فكم قطعة كاملة يحصل عليها كل صديق، وكم يتبقى؟', choices: ['8 candies, 5 left over', '9 candies, 0 left over', '7 candies, 11 left over', '8 candies, 4 left over'], choicesAr: ['8 قطع، ويتبقى 5', '9 قطع، ولا يتبقى شيء', '7 قطع، ويتبقى 11', '8 قطع، ويتبقى 4'], correct: 0, explain: '6 × 8 = 48, and 53 − 48 = 5 left over.', explainAr: '6 × 8 = 48، و53 − 48 = 5 يتبقى.' },
      { text: 'Which multiplication fact helps check that 72 ÷ 9 = 8?', textAr: 'أي حقيقة ضرب تساعد على التحقق من أن 72 ÷ 9 = 8؟', choices: ['9 × 8 = 72', '8 × 7 = 56', '9 × 9 = 81', '8 × 8 = 64'], choicesAr: ['9 × 8 = 72', '8 × 7 = 56', '9 × 9 = 81', '8 × 8 = 64'], correct: 0, explain: 'Multiplication undoes division: 9 × 8 = 72 confirms the answer.', explainAr: 'الضرب يعاكس القسمة: 9 × 8 = 72 يؤكد صحة الناتج.' },
    ]
  );

  addReel(
    9,
    scienceId,
    'Simple Machines',
    'الآلات البسيطة',
    'Simple machines help us do work with less effort by changing the size or direction of a force. A seesaw is a lever, a ramp is an inclined plane, and a flagpole uses a pulley to lift things up with a rope and wheel. Look around — simple machines are everywhere, making our lives easier!',
    'تساعدنا الآلات البسيطة على إنجاز العمل بجهد أقل من خلال تغيير مقدار القوة أو اتجاهها. الأرجوحة المتوازنة (السي سو) رافعة، والمنحدر مستوى مائل، وسارية العلم تستخدم بكرة لرفع الأشياء بواسطة حبل وعجلة. انظر حولك — الآلات البسيطة موجودة في كل مكان، وتجعل حياتنا أسهل!',
    [
      { text: 'A seesaw is an example of which simple machine?', textAr: 'الأرجوحة المتوازنة (السي سو) مثال على أي آلة بسيطة؟', choices: ['Pulley', 'Lever', 'Screw', 'Wedge'], choicesAr: ['بكرة', 'رافعة', 'برغي', 'إسفين'], correct: 1, explain: 'A seesaw pivots on a fixed point, which makes it a lever.', explainAr: 'تدور الأرجوحة المتوازنة حول نقطة ثابتة، مما يجعلها رافعة.' },
      { text: 'What do simple machines help us do?', textAr: 'بماذا تساعدنا الآلات البسيطة؟', choices: ['Create energy from nothing', 'Make work easier by changing force or direction', 'Stop all motion', 'Remove the need for any force'], choicesAr: ['توليد طاقة من العدم', 'تسهيل العمل بتغيير مقدار القوة أو اتجاهها', 'إيقاف كل حركة', 'إلغاء الحاجة إلى أي قوة'], correct: 1, explain: 'Simple machines make tasks easier by changing the amount or direction of force needed.', explainAr: 'تسهّل الآلات البسيطة المهام بتغيير مقدار القوة اللازمة أو اتجاهها.' },
      { text: 'A ramp used to roll a heavy box up into a truck is an example of a(n)...', textAr: 'المنحدر المستخدم لدفع صندوق ثقيل إلى داخل شاحنة مثال على...', choices: ['Inclined plane', 'Pulley', 'Wheel and axle', 'Lever'], choicesAr: ['مستوى مائل', 'بكرة', 'عجلة ومحور', 'رافعة'], correct: 0, explain: 'A ramp is a classic inclined plane.', explainAr: 'المنحدر مثال كلاسيكي على المستوى المائل.' },
      { text: 'Which simple machine uses a rope and a wheel to lift objects, like raising a flag on a flagpole?', textAr: 'أي آلة بسيطة تستخدم حبلًا وعجلة لرفع الأشياء، مثل رفع علم على سارية؟', choices: ['Wedge', 'Screw', 'Pulley', 'Lever'], choicesAr: ['إسفين', 'برغي', 'بكرة', 'رافعة'], correct: 2, explain: 'A pulley uses a wheel and rope to change the direction of force, making lifting easier.', explainAr: 'تستخدم البكرة عجلة وحبلًا لتغيير اتجاه القوة، مما يسهّل عملية الرفع.' },
    ]
  );

  addReel(
    11,
    mathId,
    'Fractions Basics',
    'أساسيات الكسور',
    'A fraction shows part of a whole. The bottom number (denominator) tells you how many equal parts the whole is split into, and the top number (numerator) tells you how many parts you have. Fractions can look different but be equal in value — like 1/2 and 3/6. Let’s slice things up!',
    'الكسر يمثل جزءًا من الكل. المقام (الرقم السفلي) يخبرك بعدد الأجزاء المتساوية التي قُسّم إليها الكل، والبسط (الرقم العلوي) يخبرك بعدد الأجزاء التي لديك. قد تبدو الكسور مختلفة لكنها متساوية في القيمة — مثل 1/2 و3/6. هيا نقسّم الأشياء!',
    [
      { text: 'In the fraction 3/8, what does the 8 represent?', textAr: 'في الكسر 3/8، ماذا يمثل الرقم 8؟', choices: ['The number of parts shaded', 'The total number of equal parts the whole is divided into', 'The whole number', 'The remainder'], choicesAr: ['عدد الأجزاء المظللة', 'العدد الكلي للأجزاء المتساوية التي قُسّم إليها الكل', 'العدد الصحيح', 'الباقي'], correct: 1, explain: 'The denominator (8) shows how many equal parts make up the whole.', explainAr: 'المقام (8) يوضح عدد الأجزاء المتساوية التي يتكون منها الكل.' },
      { text: 'Which fraction is equivalent to 1/2?', textAr: 'أي كسر يساوي 1/2؟', choices: ['2/5', '3/6', '4/9', '5/8'], choicesAr: ['2/5', '3/6', '4/9', '5/8'], correct: 1, explain: '3/6 simplifies to 1/2.', explainAr: '3/6 يُختصر إلى 1/2.' },
      { text: 'Which is greater, 3/4 or 5/8?', textAr: 'أيهما أكبر، 3/4 أم 5/8؟', choices: ['3/4', '5/8', 'They are equal', 'Cannot be determined'], choicesAr: ['3/4', '5/8', 'متساويان', 'لا يمكن تحديد ذلك'], correct: 0, explain: '3/4 = 6/8, which is greater than 5/8.', explainAr: '3/4 = 6/8، وهو أكبر من 5/8.' },
      { text: 'What is 2/6 written in simplest form?', textAr: 'ما هو الكسر 2/6 مكتوبًا في أبسط صورة؟', choices: ['1/3', '2/3', '1/6', '3/1'], choicesAr: ['1/3', '2/3', '1/6', '3/1'], correct: 0, explain: 'Dividing both 2 and 6 by 2 gives 1/3.', explainAr: 'بقسمة كل من 2 و6 على 2 نحصل على 1/3.' },
    ]
  );

  // ---------------------------------------------------------------------
  // Worksheet question bank (named pools so map "practice" levels can
  // reuse them too). Rotated so the correct answer isn't always "A".
  // ---------------------------------------------------------------------
  const mathEasyQs: Q[] = makePool([
    { text: '45 + 38 = ?', textAr: '45 + 38 = ؟', choices: ['83', '73', '93', '82'], choicesAr: ['83', '73', '93', '82'], correct: 0, explain: '45 + 38 = 83.', explainAr: '45 + 38 = 83.' },
    { text: '90 − 47 = ?', textAr: '90 − 47 = ؟', choices: ['43', '53', '33', '44'], choicesAr: ['43', '53', '33', '44'], correct: 0, explain: '90 − 47 = 43.', explainAr: '90 − 47 = 43.' },
    { text: '7 × 6 = ?', textAr: '7 × 6 = ؟', choices: ['42', '36', '48', '49'], choicesAr: ['42', '36', '48', '49'], correct: 0, explain: '7 × 6 = 42.', explainAr: '7 × 6 = 42.' },
    { text: '36 ÷ 6 = ?', textAr: '36 ÷ 6 = ؟', choices: ['6', '7', '5', '8'], choicesAr: ['6', '7', '5', '8'], correct: 0, explain: '6 × 6 = 36.', explainAr: '6 × 6 = 36.' },
    { text: 'Which number is even?', textAr: 'أي هذه الأعداد زوجي؟', choices: ['23', '47', '58', '71'], choicesAr: ['23', '47', '58', '71'], correct: 2, explain: '58 ends in an even digit.', explainAr: '58 ينتهي برقم زوجي.' },
    { text: 'What is 100 more than 4,562?', textAr: 'ما العدد الذي يزيد عن 4,562 بمقدار 100؟', choices: ['4,662', '4,572', '5,562', '4,652'], choicesAr: ['4,662', '4,572', '5,562', '4,652'], correct: 0, explain: '4,562 + 100 = 4,662.', explainAr: '4,562 + 100 = 4,662.' },
    { text: 'Round 47 to the nearest ten.', textAr: 'قرّب العدد 47 إلى أقرب عشرة.', choices: ['50', '40', '45', '60'], choicesAr: ['50', '40', '45', '60'], correct: 0, explain: '47 is closer to 50 than 40.', explainAr: '47 أقرب إلى 50 منه إلى 40.' },
    { text: 'What is the value of the digit 5 in 653?', textAr: 'ما قيمة الرقم 5 في العدد 653؟', choices: ['50', '5', '500', '5,000'], choicesAr: ['50', '5', '500', '5,000'], correct: 0, explain: 'The 5 is in the tens place, worth 50.', explainAr: 'الرقم 5 يقع في خانة العشرات، وقيمته 50.' },
    { text: 'Which fraction shows one half?', textAr: 'أي كسر يمثل النصف؟', choices: ['1/2', '1/3', '1/4', '2/3'], choicesAr: ['1/2', '1/3', '1/4', '2/3'], correct: 0, explain: '1/2 means one of two equal parts.', explainAr: '1/2 يعني جزءًا واحدًا من جزأين متساويين.' },
    { text: '3 × 100 = ?', textAr: '3 × 100 = ؟', choices: ['300', '30', '3,000', '103'], choicesAr: ['300', '30', '3,000', '103'], correct: 0, explain: '3 × 100 = 300.', explainAr: '3 × 100 = 300.' },
    { text: 'What is 250 + 125?', textAr: 'ما ناتج 250 + 125؟', choices: ['375', '365', '385', '350'], choicesAr: ['375', '365', '385', '350'], correct: 0, explain: '250 + 125 = 375.', explainAr: '250 + 125 = 375.' },
    { text: 'Which sign makes this true: 8 __ 5 = 13?', textAr: 'أي إشارة تجعل هذه الجملة صحيحة: 8 __ 5 = 13؟', choices: ['+', '−', '×', '÷'], choicesAr: ['+', '−', '×', '÷'], correct: 0, explain: '8 + 5 = 13.', explainAr: '8 + 5 = 13.' },
  ]);

  const mathMediumQs: Q[] = makePool([
    { text: '234 × 3 = ?', textAr: '234 × 3 = ؟', choices: ['702', '712', '692', '732'], choicesAr: ['702', '712', '692', '732'], correct: 0, explain: '234 × 3 = 702.', explainAr: '234 × 3 = 702.' },
    { text: '528 ÷ 4 = ?', textAr: '528 ÷ 4 = ؟', choices: ['132', '131', '142', '128'], choicesAr: ['132', '131', '142', '128'], correct: 0, explain: '4 × 132 = 528.', explainAr: '4 × 132 = 528.' },
    { text: 'What is 3/5 + 1/5?', textAr: 'ما ناتج 3/5 + 1/5؟', choices: ['4/5', '4/10', '2/5', '3/10'], choicesAr: ['4/5', '4/10', '2/5', '3/10'], correct: 0, explain: 'Add the numerators: 3 + 1 = 4, over 5.', explainAr: 'اجمع البسطين: 3 + 1 = 4، على مقام 5.' },
    { text: 'A rectangle has length 9 cm and width 4 cm. What is its area?', textAr: 'مستطيل طوله 9 سم وعرضه 4 سم. ما مساحته؟', choices: ['36 cm²', '26 cm²', '13 cm²', '40 cm²'], choicesAr: ['36 cm²', '26 cm²', '13 cm²', '40 cm²'], correct: 0, explain: 'Area = length × width = 9 × 4 = 36 cm².', explainAr: 'المساحة = الطول × العرض = 9 × 4 = 36 سم².' },
    { text: 'A rectangle has length 9 cm and width 4 cm. What is its perimeter?', textAr: 'مستطيل طوله 9 سم وعرضه 4 سم. ما محيطه؟', choices: ['26 cm', '36 cm', '13 cm', '18 cm'], choicesAr: ['26 cm', '36 cm', '13 cm', '18 cm'], correct: 0, explain: 'Perimeter = 2 × (9 + 4) = 26 cm.', explainAr: 'المحيط = 2 × (9 + 4) = 26 سم.' },
    { text: 'Round 5,847 to the nearest hundred.', textAr: 'قرّب العدد 5,847 إلى أقرب مئة.', choices: ['5,800', '5,900', '5,700', '5,850'], choicesAr: ['5,800', '5,900', '5,700', '5,850'], correct: 0, explain: 'The tens digit is 4, so round down to 5,800.', explainAr: 'رقم خانة العشرات هو 4، لذا نقرّب لأسفل إلى 5,800.' },
    { text: '7,205 − 3,468 = ?', textAr: '7,205 − 3,468 = ؟', choices: ['3,737', '3,837', '3,747', '3,637'], choicesAr: ['3,737', '3,837', '3,747', '3,637'], correct: 0, explain: '7,205 − 3,468 = 3,737.', explainAr: '7,205 − 3,468 = 3,737.' },
    { text: 'Which fraction is greater: 2/3 or 3/5?', textAr: 'أي كسر أكبر: 2/3 أم 3/5؟', choices: ['2/3', '3/5', 'They are equal', 'Cannot tell'], choicesAr: ['2/3', '3/5', 'متساويان', 'لا يمكن معرفة ذلك'], correct: 0, explain: '2/3 ≈ 0.667 while 3/5 = 0.6, so 2/3 is greater.', explainAr: '2/3 ≈ 0.667 بينما 3/5 = 0.6، إذن 2/3 أكبر.' },
    { text: 'A school bus holds 42 students. If 6 buses are full, how many students are there in total?', textAr: 'تتسع حافلة المدرسة لـ42 طالبًا. إذا امتلأت 6 حافلات، فكم عدد الطلاب الكلي؟', choices: ['252', '248', '258', '246'], choicesAr: ['252', '248', '258', '246'], correct: 0, explain: '42 × 6 = 252.', explainAr: '42 × 6 = 252.' },
    { text: 'What is the missing number? 8 × ? = 96', textAr: 'ما العدد الناقص؟ 8 × ؟ = 96', choices: ['12', '11', '14', '13'], choicesAr: ['12', '11', '14', '13'], correct: 0, explain: '8 × 12 = 96.', explainAr: '8 × 12 = 96.' },
    { text: 'How many centimeters are in 3 meters?', textAr: 'كم سنتيمترًا في 3 أمتار؟', choices: ['300', '30', '3,000', '130'], choicesAr: ['300', '30', '3,000', '130'], correct: 0, explain: '1 meter = 100 cm, so 3 meters = 300 cm.', explainAr: 'المتر الواحد = 100 سم، إذن 3 أمتار = 300 سم.' },
    { text: 'What is 1/4 of 60?', textAr: 'كم يساوي 1/4 من 60؟', choices: ['15', '20', '12', '10'], choicesAr: ['15', '20', '12', '10'], correct: 0, explain: '60 ÷ 4 = 15.', explainAr: '60 ÷ 4 = 15.' },
  ]);

  const mathHardQs: Q[] = makePool([
    { text: 'What is 12 + 6 × 3?', textAr: 'ما ناتج 12 + 6 × 3؟', choices: ['30', '54', '21', '36'], choicesAr: ['30', '54', '21', '36'], correct: 0, explain: 'Multiply first: 6 × 3 = 18, then add 12 to get 30.', explainAr: 'اضرب أولًا: 6 × 3 = 18، ثم أضف 12 لتحصل على 30.' },
    { text: 'What is 4.5 + 3.2?', textAr: 'ما ناتج 4.5 + 3.2؟', choices: ['7.7', '7.6', '8.7', '7.5'], choicesAr: ['7.7', '7.6', '8.7', '7.5'], correct: 0, explain: '4.5 + 3.2 = 7.7.', explainAr: '4.5 + 3.2 = 7.7.' },
    { text: 'What is 9.8 − 2.6?', textAr: 'ما ناتج 9.8 − 2.6؟', choices: ['7.2', '7.4', '6.2', '7.8'], choicesAr: ['7.2', '7.4', '6.2', '7.8'], correct: 0, explain: '9.8 − 2.6 = 7.2.', explainAr: '9.8 − 2.6 = 7.2.' },
    { text: 'A shop sells pencils in packs of 24. If a school orders 15 packs, how many pencils in total?', textAr: 'يبيع متجر أقلامًا في عبوات تحتوي كل منها على 24 قلمًا. إذا طلبت مدرسة 15 عبوة، فكم عدد الأقلام الكلي؟', choices: ['360', '340', '350', '380'], choicesAr: ['360', '340', '350', '380'], correct: 0, explain: '24 × 15 = 360.', explainAr: '24 × 15 = 360.' },
    { text: 'Sara has $45. She buys 3 notebooks that cost $6 each and a pen for $4. How much money does she have left?', textAr: 'لدى سارة 45 دولارًا. اشترت 3 دفاتر بسعر 6 دولارات لكل منها وقلمًا بـ4 دولارات. كم يتبقى معها من المال؟', choices: ['$23', '$27', '$18', '$25'], choicesAr: ['$23', '$27', '$18', '$25'], correct: 0, explain: '3 × 6 = 18, plus 4 = 22 spent. 45 − 22 = 23.', explainAr: '3 × 6 = 18، بالإضافة إلى 4 = 22 دولارًا أُنفقت. 45 − 22 = 23.' },
    { text: 'What is 3/4 written as a decimal?', textAr: 'ما هو الكسر 3/4 مكتوبًا كعدد عشري؟', choices: ['0.75', '0.34', '4.3', '7.5'], choicesAr: ['0.75', '0.34', '4.3', '7.5'], correct: 0, explain: '3 ÷ 4 = 0.75.', explainAr: '3 ÷ 4 = 0.75.' },
    { text: 'What is the perimeter of a square with side length 14 cm?', textAr: 'ما محيط مربع طول ضلعه 14 سم؟', choices: ['56 cm', '28 cm', '196 cm', '42 cm'], choicesAr: ['56 cm', '28 cm', '196 cm', '42 cm'], correct: 0, explain: 'Perimeter = 4 × 14 = 56 cm.', explainAr: 'المحيط = 4 × 14 = 56 سم.' },
    { text: 'If a train travels 60 km every hour, how far does it travel in 4.5 hours?', textAr: 'إذا كان قطار يقطع 60 كم كل ساعة، فكم يقطع في 4.5 ساعة؟', choices: ['270 km', '240 km', '265 km', '300 km'], choicesAr: ['270 km', '240 km', '265 km', '300 km'], correct: 0, explain: '60 × 4.5 = 270 km.', explainAr: '60 × 4.5 = 270 كم.' },
    { text: 'What is 500 − (85 + 129)?', textAr: 'ما ناتج 500 − (85 + 129)؟', choices: ['286', '296', '276', '214'], choicesAr: ['286', '296', '276', '214'], correct: 0, explain: '85 + 129 = 214, and 500 − 214 = 286.', explainAr: '85 + 129 = 214، و500 − 214 = 286.' },
    { text: 'Which of these fractions is equivalent to 0.5?', textAr: 'أي هذه الكسور يساوي 0.5؟', choices: ['5/10', '1/5', '2/10', '5/100'], choicesAr: ['5/10', '1/5', '2/10', '5/100'], correct: 0, explain: '5/10 simplifies to 1/2, which equals 0.5.', explainAr: '5/10 يُختصر إلى 1/2، وهو يساوي 0.5.' },
    { text: 'What is the value of 6² (6 squared)?', textAr: 'ما قيمة 6² (6 تربيع)؟', choices: ['36', '12', '18', '66'], choicesAr: ['36', '12', '18', '66'], correct: 0, explain: '6² = 6 × 6 = 36.', explainAr: '6² = 6 × 6 = 36.' },
    { text: 'A recipe needs 2 3/4 cups of flour. If you double the recipe, how many cups of flour are needed?', textAr: 'تحتاج وصفة إلى 2 3/4 كوب من الدقيق. إذا ضاعفت الوصفة، فكم كوبًا من الدقيق ستحتاج؟', choices: ['5 1/2', '5 1/4', '4 3/4', '6'], choicesAr: ['5 1/2', '5 1/4', '4 3/4', '6'], correct: 0, explain: '2 3/4 × 2 = 5 1/2.', explainAr: '2 3/4 × 2 = 5 1/2.' },
  ]);

  const scienceEasyQs: Q[] = makePool([
    { text: 'Which of these is a living thing?', textAr: 'أي مما يلي كائن حي؟', choices: ['Tree', 'Rock', 'Water', 'Cloud'], choicesAr: ['شجرة', 'صخرة', 'ماء', 'سحابة'], correct: 0, explain: 'A tree is alive — it grows and needs energy.', explainAr: 'الشجرة كائن حي — تنمو وتحتاج إلى طاقة.' },
    { text: 'What do plants need to make their own food?', textAr: 'ماذا تحتاج النباتات لتصنع غذاءها؟', choices: ['Sunlight, water, and air', 'Only soil', 'Only water', 'Only sunlight'], choicesAr: ['ضوء الشمس والماء والهواء', 'التربة فقط', 'الماء فقط', 'ضوء الشمس فقط'], correct: 0, explain: 'Plants use sunlight, water, and air (carbon dioxide) for photosynthesis.', explainAr: 'تستخدم النباتات ضوء الشمس والماء وثاني أكسيد الكربون من الهواء لعملية البناء الضوئي.' },
    { text: 'Which sense organ do we use to hear sounds?', textAr: 'أي عضو حسي نستخدمه لسماع الأصوات؟', choices: ['Ears', 'Eyes', 'Nose', 'Skin'], choicesAr: ['الأذنان', 'العينان', 'الأنف', 'الجلد'], correct: 0, explain: 'Ears detect sound waves so we can hear.', explainAr: 'تلتقط الأذنان الموجات الصوتية لنتمكن من السماع.' },
    { text: 'What is the closest star to Earth?', textAr: 'ما أقرب نجم إلى الأرض؟', choices: ['The Sun', 'The Moon', 'Polaris', 'Mars'], choicesAr: ['الشمس', 'القمر', 'النجم القطبي', 'المريخ'], correct: 0, explain: 'The Sun is the star closest to Earth.', explainAr: 'الشمس هي أقرب نجم إلى الأرض.' },
    { text: 'Which of these is a solid?', textAr: 'أي مما يلي مادة صلبة؟', choices: ['Ice', 'Milk', 'Air', 'Steam'], choicesAr: ['الثلج', 'الحليب', 'الهواء', 'البخار'], correct: 0, explain: 'Ice is water in its solid state.', explainAr: 'الثلج هو الماء في حالته الصلبة.' },
    { text: 'What do we call animals that only eat plants?', textAr: 'ماذا نسمي الحيوانات التي تأكل النباتات فقط؟', choices: ['Herbivores', 'Carnivores', 'Omnivores', 'Predators'], choicesAr: ['آكلات الأعشاب', 'آكلات اللحوم', 'آكلات كل شيء', 'الحيوانات المفترسة'], correct: 0, explain: 'Herbivores eat only plants.', explainAr: 'آكلات الأعشاب تتغذى على النباتات فقط.' },
    { text: 'Which organ pumps blood through your body?', textAr: 'أي عضو يضخ الدم في جسمك؟', choices: ['Heart', 'Lungs', 'Stomach', 'Brain'], choicesAr: ['القلب', 'الرئتان', 'المعدة', 'الدماغ'], correct: 0, explain: 'The heart pumps blood through the whole body.', explainAr: 'يضخ القلب الدم إلى جميع أنحاء الجسم.' },
    { text: 'What gas do humans breathe in that we need to live?', textAr: 'ما الغاز الذي يتنفسه الإنسان ويحتاجه للحياة؟', choices: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], choicesAr: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيليوم'], correct: 0, explain: 'We breathe in oxygen to survive.', explainAr: 'نتنفس الأكسجين لنبقى على قيد الحياة.' },
    { text: 'Which season comes right after winter?', textAr: 'أي فصل يأتي مباشرة بعد الشتاء؟', choices: ['Spring', 'Summer', 'Fall', 'Winter'], choicesAr: ['الربيع', 'الصيف', 'الخريف', 'الشتاء'], correct: 0, explain: 'Spring follows winter in the yearly cycle.', explainAr: 'يأتي الربيع بعد الشتاء في الدورة السنوية.' },
    { text: 'What is the process by which plants make food using sunlight called?', textAr: 'ما اسم العملية التي تصنع بها النباتات غذاءها باستخدام ضوء الشمس؟', choices: ['Photosynthesis', 'Respiration', 'Digestion', 'Evaporation'], choicesAr: ['البناء الضوئي', 'التنفس', 'الهضم', 'التبخر'], correct: 0, explain: 'Photosynthesis lets plants turn sunlight into food.', explainAr: 'البناء الضوئي يمكّن النباتات من تحويل ضوء الشمس إلى غذاء.' },
    { text: 'Which of these materials is a good conductor of electricity?', textAr: 'أي هذه المواد موصل جيد للكهرباء؟', choices: ['Copper', 'Wood', 'Rubber', 'Plastic'], choicesAr: ['النحاس', 'الخشب', 'المطاط', 'البلاستيك'], correct: 0, explain: 'Copper is a metal and conducts electricity well.', explainAr: 'النحاس معدن وموصل جيد للكهرباء.' },
    { text: 'What do we call water falling from clouds?', textAr: 'ماذا نسمي الماء المتساقط من السحب؟', choices: ['Precipitation', 'Evaporation', 'Condensation', 'Pollution'], choicesAr: ['الهطول', 'التبخر', 'التكاثف', 'التلوث'], correct: 0, explain: 'Precipitation is water falling from clouds as rain, snow, etc.', explainAr: 'الهطول هو سقوط الماء من السحب على شكل مطر أو ثلج وغيرها.' },
  ]);

  const scienceMediumQs: Q[] = makePool([
    { text: 'What is the main job of roots in a plant?', textAr: 'ما الوظيفة الرئيسية لجذور النبات؟', choices: ['To absorb water and nutrients', 'To make food', 'To produce flowers', 'To release oxygen only'], choicesAr: ['امتصاص الماء والمغذيات', 'صنع الغذاء', 'إنتاج الأزهار', 'إطلاق الأكسجين فقط'], correct: 0, explain: 'Roots absorb water and nutrients from the soil.', explainAr: 'تمتص الجذور الماء والمغذيات من التربة.' },
    { text: 'Which layer of the Earth do we live on?', textAr: 'على أي طبقة من طبقات الأرض نعيش؟', choices: ['Crust', 'Core', 'Mantle', 'Atmosphere'], choicesAr: ['القشرة', 'اللب', 'الوشاح', 'الغلاف الجوي'], correct: 0, explain: 'The crust is the outer layer where we live.', explainAr: 'القشرة هي الطبقة الخارجية التي نعيش عليها.' },
    { text: 'What force pulls objects toward the Earth?', textAr: 'ما القوة التي تجذب الأجسام نحو الأرض؟', choices: ['Gravity', 'Magnetism', 'Friction', 'Tension'], choicesAr: ['الجاذبية', 'المغناطيسية', 'الاحتكاك', 'الشد'], correct: 0, explain: 'Gravity pulls objects toward the Earth’s center.', explainAr: 'الجاذبية تجذب الأجسام نحو مركز الأرض.' },
    { text: 'Which of the following is NOT a simple machine?', textAr: 'أي مما يلي ليس آلة بسيطة؟', choices: ['Battery', 'Lever', 'Pulley', 'Wedge'], choicesAr: ['البطارية', 'الرافعة', 'البكرة', 'الإسفين'], correct: 0, explain: 'A battery stores energy; it is not a simple machine.', explainAr: 'البطارية تُخزّن الطاقة، وليست آلة بسيطة.' },
    { text: 'What type of energy does a moving car have?', textAr: 'أي نوع من الطاقة تمتلكه السيارة المتحركة؟', choices: ['Kinetic energy', 'Potential energy', 'Chemical energy only', 'Sound energy'], choicesAr: ['طاقة حركية', 'طاقة كامنة', 'طاقة كيميائية فقط', 'طاقة صوتية'], correct: 0, explain: 'Moving objects have kinetic energy.', explainAr: 'الأجسام المتحركة تمتلك طاقة حركية.' },
    { text: 'In the food chain grass → rabbit → fox, what is the fox called?', textAr: 'في السلسلة الغذائية عشب ← أرنب ← ثعلب، ماذا يُسمى الثعلب؟', choices: ['Secondary consumer', 'Producer', 'Primary consumer', 'Decomposer'], choicesAr: ['مستهلك ثانوي', 'منتج', 'مستهلك أولي', 'محلل'], correct: 0, explain: 'The fox eats the rabbit (a primary consumer), making it a secondary consumer.', explainAr: 'يأكل الثعلب الأرنب (المستهلك الأولي)، مما يجعله مستهلكًا ثانويًا.' },
    { text: 'Which planet is known as Earth’s "twin" because of its similar size?', textAr: "أي كوكب يُعرف بـ'توأم' الأرض بسبب تشابه حجمه معها؟", choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'], choicesAr: ['الزهرة', 'المريخ', 'المشتري', 'عطارد'], correct: 0, explain: 'Venus is very close to Earth in size.', explainAr: 'الزهرة قريبة جدًا من الأرض في الحجم.' },
    { text: 'What is the boiling point of water at sea level in Celsius?', textAr: 'ما درجة غليان الماء عند مستوى سطح البحر بالمئوية؟', choices: ['100°C', '0°C', '50°C', '212°C'], choicesAr: ['100°C', '0°C', '50°C', '212°C'], correct: 0, explain: 'Water boils at 100°C at sea level.', explainAr: 'يغلي الماء عند 100 درجة مئوية عند مستوى سطح البحر.' },
    { text: 'Which body system is responsible for breathing?', textAr: 'أي جهاز في الجسم مسؤول عن التنفس؟', choices: ['Respiratory system', 'Digestive system', 'Skeletal system', 'Circulatory system'], choicesAr: ['الجهاز التنفسي', 'الجهاز الهضمي', 'الجهاز الهيكلي', 'الجهاز الدوري'], correct: 0, explain: 'The respiratory system controls breathing.', explainAr: 'الجهاز التنفسي يتحكم في عملية التنفس.' },
    { text: 'What happens to particles in a substance when it is heated?', textAr: 'ماذا يحدث لجسيمات المادة عند تسخينها؟', choices: ['They move faster and spread apart', 'They move slower and get closer', 'They disappear', 'They stop moving'], choicesAr: ['تتحرك أسرع وتتباعد', 'تتحرك أبطأ وتتقارب', 'تختفي', 'تتوقف عن الحركة'], correct: 0, explain: 'Heating gives particles more energy, so they move faster and spread apart.', explainAr: 'التسخين يمنح الجسيمات طاقة أكبر، فتتحرك أسرع وتتباعد.' },
    { text: 'Which of these is a renewable source of energy?', textAr: 'أي مما يلي مصدر طاقة متجدد؟', choices: ['Solar power', 'Coal', 'Natural gas', 'Oil'], choicesAr: ['الطاقة الشمسية', 'الفحم', 'الغاز الطبيعي', 'النفط'], correct: 0, explain: 'Solar power comes from the sun and never runs out.', explainAr: 'تأتي الطاقة الشمسية من الشمس ولا تنفد أبدًا.' },
    { text: 'What is the main gas that plants absorb from the air during photosynthesis?', textAr: 'ما الغاز الرئيسي الذي تمتصه النباتات من الهواء أثناء البناء الضوئي؟', choices: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'], choicesAr: ['ثاني أكسيد الكربون', 'الأكسجين', 'النيتروجين', 'الهيدروجين'], correct: 0, explain: 'Plants absorb carbon dioxide to make food during photosynthesis.', explainAr: 'تمتص النباتات ثاني أكسيد الكربون لتصنع غذاءها أثناء البناء الضوئي.' },
  ]);

  const scienceHardQs: Q[] = makePool([
    { text: 'Which organ system includes the brain and nerves, letting the body send and receive signals?', textAr: 'أي جهاز في الجسم يضم الدماغ والأعصاب، ويتيح للجسم إرسال الإشارات واستقبالها؟', choices: ['Nervous system', 'Circulatory system', 'Digestive system', 'Skeletal system'], choicesAr: ['الجهاز العصبي', 'الجهاز الدوري', 'الجهاز الهضمي', 'الجهاز الهيكلي'], correct: 0, explain: 'The nervous system controls signals throughout the body.', explainAr: 'يتحكم الجهاز العصبي في الإشارات في جميع أنحاء الجسم.' },
    { text: 'Why do we experience seasons on Earth?', textAr: 'لماذا نمر بفصول مختلفة على الأرض؟', choices: ["Earth is tilted on its axis as it orbits the sun", "Earth's distance from the sun changes a lot", 'The sun moves around the Earth', "The moon blocks the sun's light"], choicesAr: ['لأن الأرض مائلة على محورها أثناء دورانها حول الشمس', 'لأن بُعد الأرض عن الشمس يتغير كثيرًا', 'لأن الشمس تدور حول الأرض', 'لأن القمر يحجب ضوء الشمس'], correct: 0, explain: "Earth's tilt causes different amounts of sunlight throughout the year.", explainAr: 'ميلان محور الأرض يسبب اختلاف كمية ضوء الشمس على مدار العام.' },
    { text: 'What is the smallest unit of an element that still has the properties of that element?', textAr: 'ما أصغر وحدة في العنصر تحتفظ بخصائص ذلك العنصر؟', choices: ['Atom', 'Molecule', 'Cell', 'Compound'], choicesAr: ['الذرة', 'الجزيء', 'الخلية', 'المركب'], correct: 0, explain: 'An atom is the smallest unit that keeps an element’s properties.', explainAr: 'الذرة هي أصغر وحدة تحتفظ بخصائص العنصر.' },
    { text: 'Which of these best describes an ecosystem?', textAr: 'أي مما يلي يصف النظام البيئي بشكل أفضل؟', choices: ['A community of living things interacting with their environment', 'Only the animals living in an area', 'A single type of plant', 'The weather in a region'], choicesAr: ['مجتمع من الكائنات الحية يتفاعل مع بيئته', 'الحيوانات التي تعيش في منطقة ما فقط', 'نوع واحد من النباتات', 'الطقس في منطقة ما'], correct: 0, explain: 'An ecosystem includes living things and their environment interacting together.', explainAr: 'يشمل النظام البيئي الكائنات الحية وبيئتها المتفاعلة معًا.' },
    { text: 'What is the main difference between weather and climate?', textAr: 'ما الفرق الرئيسي بين الطقس والمناخ؟', choices: ['Weather is short-term, climate is the long-term pattern', 'Weather and climate are the same thing', 'Climate changes every day, weather does not', 'Weather only happens in summer'], choicesAr: ['الطقس قصير المدى، والمناخ نمط طويل المدى', 'الطقس والمناخ شيء واحد', 'المناخ يتغير كل يوم، والطقس لا يتغير', 'الطقس يحدث فقط في الصيف'], correct: 0, explain: 'Weather changes day to day; climate is the long-term average pattern.', explainAr: 'يتغير الطقس يوميًا؛ أما المناخ فهو النمط العام على المدى الطويل.' },
    { text: 'Which simple machine is a ramp considered to be?', textAr: 'أي آلة بسيطة يُعد المنحدر مثالًا عليها؟', choices: ['Inclined plane', 'Lever', 'Pulley', 'Wheel and axle'], choicesAr: ['مستوى مائل', 'رافعة', 'بكرة', 'عجلة ومحور'], correct: 0, explain: 'A ramp is a classic inclined plane.', explainAr: 'المنحدر مثال كلاسيكي على المستوى المائل.' },
    { text: 'During the water cycle, what is it called when water vapor rises and cools to form clouds?', textAr: 'خلال دورة الماء، ماذا يُسمى ارتفاع بخار الماء وتبرده ليكوّن السحب؟', choices: ['Condensation', 'Precipitation', 'Evaporation', 'Collection'], choicesAr: ['التكاثف', 'الهطول', 'التبخر', 'التجمع'], correct: 0, explain: 'Condensation is water vapor cooling into tiny droplets that form clouds.', explainAr: 'التكاثف هو تبرد بخار الماء ليكوّن قطيرات صغيرة تشكّل السحب.' },
    { text: 'Which of these is a decomposer that helps break down dead material?', textAr: 'أي مما يلي محلل يساعد على تحليل المواد الميتة؟', choices: ['Mushroom (fungus)', 'Lion', 'Eagle', 'Rabbit'], choicesAr: ['الفطر', 'الأسد', 'النسر', 'الأرنب'], correct: 0, explain: 'Fungi like mushrooms break down dead organisms.', explainAr: 'الفطريات مثل عيش الغراب تحلل الكائنات الميتة.' },
    { text: 'What is the main role of the skeletal system?', textAr: 'ما الدور الرئيسي للجهاز الهيكلي؟', choices: ['To support and protect the body', 'To pump blood', 'To digest food', 'To control emotions'], choicesAr: ['دعم الجسم وحمايته', 'ضخ الدم', 'هضم الطعام', 'التحكم في المشاعر'], correct: 0, explain: 'Bones support the body and protect organs.', explainAr: 'تدعم العظام الجسم وتحمي الأعضاء.' },
    { text: 'If an object floats in water, what does that tell us about its density compared to water?', textAr: 'إذا طفا جسم على الماء، فماذا يخبرنا ذلك عن كثافته مقارنة بالماء؟', choices: ['It is less dense than water', 'It is denser than water', 'It has no density', 'It is the same temperature as water'], choicesAr: ['كثافته أقل من كثافة الماء', 'كثافته أكبر من كثافة الماء', 'ليس له كثافة', 'درجة حرارته مثل الماء'], correct: 0, explain: 'Objects less dense than water float on the surface.', explainAr: 'الأجسام الأقل كثافة من الماء تطفو على سطحه.' },
    { text: 'Which of the following is an example of a chemical change?', textAr: 'أي مما يلي مثال على تغيّر كيميائي؟', choices: ['Burning wood', 'Melting ice', 'Tearing paper', 'Stretching a rubber band'], choicesAr: ['احتراق الخشب', 'ذوبان الثلج', 'تمزيق الورق', 'شدّ شريط مطاطي'], correct: 0, explain: 'Burning creates new substances (ash, smoke, gas), making it a chemical change.', explainAr: 'الاحتراق ينتج مواد جديدة (رماد ودخان وغازات)، مما يجعله تغيّرًا كيميائيًا.' },
    { text: 'What do we call the force that opposes motion between two touching surfaces?', textAr: 'ماذا نسمي القوة التي تعاكس الحركة بين سطحين متلامسين؟', choices: ['Friction', 'Gravity', 'Magnetism', 'Inertia'], choicesAr: ['الاحتكاك', 'الجاذبية', 'المغناطيسية', 'القصور الذاتي'], correct: 0, explain: 'Friction resists motion between surfaces in contact.', explainAr: 'الاحتكاك يقاوم الحركة بين الأسطح المتلامسة.' },
  ]);

  const insertWQ = db.prepare(
    `INSERT INTO worksheet_questions (subject_id, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  function addWs(subjectId: number, difficulty: 'easy' | 'medium' | 'hard', items: Q[]) {
    for (const q of items) {
      insertWQ.run(subjectId, difficulty, q.text, q.textAr, JSON.stringify(q.choices), JSON.stringify(q.choicesAr), q.correct, q.explain, q.explainAr);
    }
  }
  addWs(mathId, 'easy', mathEasyQs);
  addWs(mathId, 'medium', mathMediumQs);
  addWs(mathId, 'hard', mathHardQs);
  addWs(scienceId, 'easy', scienceEasyQs);
  addWs(scienceId, 'medium', scienceMediumQs);
  addWs(scienceId, 'hard', scienceHardQs);

  // ---------------------------------------------------------------------
  // Generic "practice" reels for the 31 non-boss, non-special map levels —
  // reuse the (already fact-checked) worksheet pools above, cycled per level.
  // ---------------------------------------------------------------------
  const genericScript: Record<'math' | 'science', { en: string; ar: string }> = {
    math: {
      en: "Time for a practice round! Sharpen your math skills with these quick questions — take your time, think it through, and show what you know!",
      ar: 'حان وقت جولة تدريبية! نمِّ مهاراتك في الرياضيات من خلال هذه الأسئلة السريعة — خذ وقتك، فكّر جيدًا، وأظهر ما تعرفه!',
    },
    science: {
      en: "Ready for a science practice round? Put on your thinking cap and see how much you remember. You've got this!",
      ar: 'هل أنت مستعد لجولة تدريبية في العلوم؟ ارتدِ قبعة التفكير وانظر كم تتذكر. أنت قادر على ذلك!',
    },
  };

  const poolFor = (subjectId: number, difficulty: 'easy' | 'medium' | 'hard'): Q[] => {
    const isMath = subjectId === mathId;
    if (difficulty === 'easy') return isMath ? mathEasyQs : scienceEasyQs;
    if (difficulty === 'medium') return isMath ? mathMediumQs : scienceMediumQs;
    return isMath ? mathHardQs : scienceHardQs;
  };

  for (const zone of genZones) {
    for (let n = zone.min; n <= zone.max; n++) {
      const localIdx = n - zone.min + 1;
      if (localIdx === 5 || localIdx === 10) continue; // boss, handled separately
      if (titleOverrides[n]) continue; // level 11 Fractions already added above
      const subjectId = n % 2 === 0 ? scienceId : mathId;
      const pool = poolFor(subjectId, zone.difficulty);
      const offset = ((n - zone.min) * 4) % pool.length;
      const qs = pickQs(pool, offset, 4);
      const kind: 'math' | 'science' = subjectId === mathId ? 'math' : 'science';
      const title = `${zone.name} Practice — Level ${n}`;
      const titleAr = `تدريب ${zone.nameAr} — المستوى ${n}`;
      addReel(n, subjectId, title, titleAr, genericScript[kind].en, genericScript[kind].ar, qs);
    }
  }

  // ---------------------------------------------------------------------
  // Boss fights — one every 5 levels now. Harder, mixed-subject questions.
  // ---------------------------------------------------------------------
  const insertBossQ = db.prepare(
    `INSERT INTO boss_questions (map_level_id, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, order_in_fight) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  function addBossQuestions(levelN: number, questions: Q[]) {
    const levelId = levelIds.get(levelN)!;
    questions.forEach((q, i) => {
      insertBossQ.run(levelId, q.text, q.textAr, JSON.stringify(q.choices), JSON.stringify(q.choicesAr), q.correct, q.explain, q.explainAr, i + 1);
    });
  }

  addBossQuestions(5, [
    { text: 'In the number 82,417, what is the value of the digit 8?', textAr: 'في العدد 82,417، ما قيمة الرقم 8؟', choices: ['8,000', '80,000', '800', '8'], choicesAr: ['8,000', '80,000', '800', '8'], correct: 1, explain: 'The 8 is in the ten-thousands place, so it is worth 80,000.', explainAr: 'الرقم 8 يقع في خانة عشرات الآلاف، لذا فإن قيمته 80,000.' },
    { text: 'Which of these is an example of a hypothesis?', textAr: 'أي مما يلي مثال على الفرضية؟', choices: ['Plants need water to survive', 'If a plant gets more sunlight, it will grow taller', 'The plant in the sunny window is green', 'Water the plant every day'], choicesAr: ['النباتات تحتاج إلى الماء للبقاء على قيد الحياة', 'إذا حصل النبات على ضوء شمس أكثر، فسينمو أطول', 'النبات الموجود في النافذة المشمسة أخضر اللون', 'اسقِ النبات كل يوم'], correct: 1, explain: "A hypothesis is a testable, if-then style prediction — like 'if a plant gets more sunlight, it will grow taller.'", explainAr: "الفرضية توقع قابل للاختبار على شكل 'إذا...فإن...' — مثل 'إذا حصل النبات على ضوء شمس أكثر، فسينمو أطول.'" },
    { text: '6,204 − 2,875 = ?', textAr: '6,204 − 2,875 = ؟', choices: ['3,329', '3,429', '3,229', '3,339'], choicesAr: ['3,329', '3,429', '3,229', '3,339'], correct: 0, explain: '6,204 − 2,875 = 3,329.', explainAr: '6,204 − 2,875 = 3,329.' },
    { text: 'Which change of state happens when a liquid is cooled enough to become solid?', textAr: 'أي تغيّر في الحالة يحدث عندما يُبرَّد السائل بدرجة كافية ليصبح صلبًا؟', choices: ['Evaporation', 'Melting', 'Freezing', 'Condensation'], choicesAr: ['التبخر', 'الانصهار', 'التجمد', 'التكاثف'], correct: 2, explain: 'Freezing is when a liquid becomes a solid as it cools.', explainAr: 'التجمد هو تحوّل السائل إلى صلب عند تبرّده.' },
    { text: 'A desert camp had 3,450 liters of water. After a week they used 1,680 liters. How many liters remain?', textAr: 'كان لدى مخيم في الصحراء 3,450 لترًا من الماء. بعد أسبوع استخدموا 1,680 لترًا. كم لترًا تبقّى؟', choices: ['1,770 liters', '1,670 liters', '1,870 liters', '1,970 liters'], choicesAr: ['1,770 لترًا', '1,670 لترًا', '1,870 لترًا', '1,970 لترًا'], correct: 0, explain: '3,450 − 1,680 = 1,770 liters.', explainAr: '3,450 − 1,680 = 1,770 لترًا.' },
    { text: "Which of these is NOT a state of matter you'd find in a glass of ice water?", textAr: 'أي مما يلي ليس حالة من حالات المادة يمكن أن تجدها في كوب ماء مثلج؟', choices: ['Solid (ice)', 'Liquid (water)', 'Gas (water vapor rising)', 'Plasma'], choicesAr: ['صلبة (الثلج)', 'سائلة (الماء)', 'غازية (بخار الماء المتصاعد)', 'بلازما'], correct: 3, explain: "Plasma is a state of matter, but it's not something you'd find in a glass of ice water.", explainAr: 'البلازما حالة من حالات المادة، لكنها غير موجودة في كوب ماء مثلج.' },
  ]);

  addBossQuestions(10, [
    { text: 'What is the value of the digit 7 in 27,384?', textAr: 'ما قيمة الرقم 7 في العدد 27,384؟', choices: ['7,000', '700', '70', '70,000'], choicesAr: ['7,000', '700', '70', '70,000'], correct: 0, explain: 'The 7 is in the thousands place, worth 7,000.', explainAr: 'الرقم 7 يقع في خانة الآلاف، وقيمته 7,000.' },
    { text: 'What is the first step of the scientific method?', textAr: 'ما الخطوة الأولى في الطريقة العلمية؟', choices: ['Ask a question', 'Write a conclusion', 'Run the experiment', 'Publish the results'], choicesAr: ['طرح سؤال', 'كتابة الاستنتاج', 'إجراء التجربة', 'نشر النتائج'], correct: 0, explain: 'Every investigation starts with a question.', explainAr: 'كل بحث يبدأ بسؤال.' },
    { text: '5,247 + 3,689 = ?', textAr: '5,247 + 3,689 = ؟', choices: ['8,936', '8,836', '9,936', '8,926'], choicesAr: ['8,936', '8,836', '9,936', '8,926'], correct: 0, explain: '5,247 + 3,689 = 8,936.', explainAr: '5,247 + 3,689 = 8,936.' },
    { text: 'Water vapor turning into tiny liquid droplets, like fog, is called...', textAr: 'تحوّل بخار الماء إلى قطيرات سائلة صغيرة، مثل الضباب، يُسمى...', choices: ['Evaporation', 'Condensation', 'Melting', 'Freezing'], choicesAr: ['التبخر', 'التكاثف', 'الانصهار', 'التجمد'], correct: 1, explain: 'Condensation is a gas changing into a liquid.', explainAr: 'التكاثف هو تحوّل الغاز إلى سائل.' },
    { text: '6 × 34 = ?', textAr: '6 × 34 = ؟', choices: ['204', '214', '194', '244'], choicesAr: ['204', '214', '194', '244'], correct: 0, explain: '6 × 34 = 204.', explainAr: '6 × 34 = 204.' },
    { text: 'Which planet is famous for its large, beautiful rings?', textAr: 'أي الكواكب يشتهر بحلقاته الكبيرة والجميلة؟', choices: ['Mars', 'Saturn', 'Mercury', 'Earth'], choicesAr: ['المريخ', 'زحل', 'عطارد', 'الأرض'], correct: 1, explain: 'Saturn is known for its spectacular ring system.', explainAr: 'يشتهر زحل بنظام حلقاته المذهل.' },
    { text: '84 ÷ 7 = ?', textAr: '84 ÷ 7 = ؟', choices: ['12', '11', '14', '13'], choicesAr: ['12', '11', '14', '13'], correct: 0, explain: '7 × 12 = 84.', explainAr: '7 × 12 = 84.' },
    { text: 'A crowbar used to pry up a lid is an example of which simple machine?', textAr: 'العتلة (القضيب الحديدي) المستخدمة لرفع غطاء مثال على أي آلة بسيطة؟', choices: ['Wedge', 'Lever', 'Pulley', 'Screw'], choicesAr: ['إسفين', 'رافعة', 'بكرة', 'برغي'], correct: 1, explain: 'A crowbar pivots against a point, making it a lever.', explainAr: 'تدور العتلة حول نقطة ارتكاز، مما يجعلها رافعة.' },
  ]);

  addBossQuestions(15, [
    { text: 'Which fraction is equivalent to 2/3?', textAr: 'أي كسر يساوي 2/3؟', choices: ['4/6', '3/4', '2/6', '4/9'], choicesAr: ['4/6', '3/4', '2/6', '4/9'], correct: 0, explain: '4/6 simplifies to 2/3 (divide both by 2).', explainAr: '4/6 يُختصر إلى 2/3 (بقسمة كل من البسط والمقام على 2).' },
    { text: 'What do we call a baby frog before it grows legs?', textAr: 'ماذا نسمي صغير الضفدع قبل أن تنمو له أرجل؟', choices: ['Larva', 'Tadpole', 'Pupa', 'Nymph'], choicesAr: ['يرقة', 'شرغوف', 'عذراء', 'حورية'], correct: 1, explain: 'A tadpole is the early stage of a frog’s life cycle, before it grows legs.', explainAr: 'الشرغوف هو المرحلة المبكرة من دورة حياة الضفدع، قبل أن تنمو له أرجل.' },
    { text: 'What is 3/4 − 1/4, in simplest form?', textAr: 'ما ناتج 3/4 − 1/4 في أبسط صورة؟', choices: ['1/2', '3/8', '1/4', '2/3'], choicesAr: ['1/2', '3/8', '1/4', '2/3'], correct: 0, explain: '3/4 − 1/4 = 2/4, which simplifies to 1/2.', explainAr: '3/4 − 1/4 = 2/4، وهو ما يُختصر إلى 1/2.' },
    { text: 'Which of these is a renewable resource?', textAr: 'أي مما يلي مورد متجدد؟', choices: ['Coal', 'Wind', 'Natural gas', 'Oil'], choicesAr: ['الفحم', 'الرياح', 'الغاز الطبيعي', 'النفط'], correct: 1, explain: "Wind is renewable — it doesn't run out like fossil fuels.", explainAr: 'الرياح مورد متجدد — لا تنفد مثل الوقود الأحفوري.' },
    { text: 'A merchant packs 8 dates into each box. If he has 176 dates, how many boxes can he fill?', textAr: 'يضع تاجر 8 حبات تمر في كل صندوق. إذا كان لديه 176 حبة تمر، فكم صندوقًا يستطيع ملأه؟', choices: ['22 boxes', '24 boxes', '20 boxes', '28 boxes'], choicesAr: ['22 صندوقًا', '24 صندوقًا', '20 صندوقًا', '28 صندوقًا'], correct: 0, explain: '176 ÷ 8 = 22 boxes.', explainAr: '176 ÷ 8 = 22 صندوقًا.' },
    { text: 'Which of these materials would float on water?', textAr: 'أي هذه المواد يطفو على الماء؟', choices: ['A cork', 'A steel coin', 'A rock', 'A glass marble'], choicesAr: ['فلينة (سدادة فلين)', 'عملة من الفولاذ', 'صخرة', 'كرة زجاجية'], correct: 0, explain: 'Cork is less dense than water, so it floats.', explainAr: 'الفلين أقل كثافة من الماء، لذا يطفو.' },
  ]);

  addBossQuestions(20, [
    { text: 'What is 4/5 of 45?', textAr: 'كم يساوي 4/5 من 45؟', choices: ['36', '40', '32', '38'], choicesAr: ['36', '40', '32', '38'], correct: 0, explain: '45 ÷ 5 = 9, and 9 × 4 = 36.', explainAr: '45 ÷ 5 = 9، و9 × 4 = 36.' },
    { text: "Which gas makes up the largest percentage of Earth's atmosphere?", textAr: 'أي غاز يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟', choices: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], choicesAr: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيدروجين'], correct: 2, explain: "Nitrogen makes up about 78% of Earth's atmosphere.", explainAr: 'يشكّل النيتروجين حوالي 78٪ من الغلاف الجوي للأرض.' },
    { text: 'What is the perimeter of a rectangle with length 15 m and width 9 m?', textAr: 'ما محيط مستطيل طوله 15 مترًا وعرضه 9 أمتار؟', choices: ['48 m', '24 m', '135 m', '42 m'], choicesAr: ['48 مترًا', '24 مترًا', '135 مترًا', '42 مترًا'], correct: 0, explain: 'Perimeter = 2 × (15 + 9) = 48 m.', explainAr: 'المحيط = 2 × (15 + 9) = 48 مترًا.' },
    { text: 'Which part of a plant carries water from the roots to the leaves?', textAr: 'أي جزء من النبات ينقل الماء من الجذور إلى الأوراق؟', choices: ['Petals', 'Stem', 'Flower', 'Fruit'], choicesAr: ['البتلات', 'الساق', 'الزهرة', 'الثمرة'], correct: 1, explain: 'The stem carries water and nutrients from the roots up to the leaves.', explainAr: 'تنقل الساق الماء والمغذيات من الجذور إلى الأوراق.' },
    { text: 'Which of these numbers rounds to 6,000 when rounded to the nearest thousand?', textAr: 'أي هذه الأعداد يُقرَّب إلى 6,000 عند التقريب لأقرب ألف؟', choices: ['5,678', '5,401', '6,512', '4,999'], choicesAr: ['5,678', '5,401', '6,512', '4,999'], correct: 0, explain: '5,678 has a hundreds digit of 6 (≥5), so it rounds up to 6,000.', explainAr: 'رقم خانة المئات في 5,678 هو 6، لذا يُقرَّب لأعلى إلى 6,000.' },
    { text: 'What is the main function of the human lungs?', textAr: 'ما الوظيفة الرئيسية لرئتَي الإنسان؟', choices: ['Pump blood', 'Exchange oxygen and carbon dioxide', 'Digest food', 'Filter waste'], choicesAr: ['ضخ الدم', 'تبادل الأكسجين وثاني أكسيد الكربون', 'هضم الطعام', 'تصفية الفضلات'], correct: 1, explain: 'The lungs take in oxygen and release carbon dioxide as we breathe.', explainAr: 'تأخذ الرئتان الأكسجين وتطلقان ثاني أكسيد الكربون أثناء التنفس.' },
  ]);

  addBossQuestions(25, [
    { text: 'What is 7.25 + 3.6?', textAr: 'ما ناتج 7.25 + 3.6؟', choices: ['10.85', '10.25', '9.85', '11.85'], choicesAr: ['10.85', '10.25', '9.85', '11.85'], correct: 0, explain: '7.25 + 3.6 = 10.85.', explainAr: '7.25 + 3.6 = 10.85.' },
    { text: 'Which sea creature is known for having eight arms?', textAr: 'أي كائن بحري يشتهر بامتلاكه ثمانية أذرع؟', choices: ['Starfish', 'Octopus', 'Jellyfish', 'Crab'], choicesAr: ['نجم البحر', 'الأخطبوط', 'قنديل البحر', 'السلطعون'], correct: 1, explain: 'An octopus has eight arms.', explainAr: 'يمتلك الأخطبوط ثمانية أذرع.' },
    { text: 'A boat travels 18 km in 3 hours at a steady speed. How far will it travel in 5 hours?', textAr: 'يقطع قارب 18 كم في 3 ساعات بسرعة ثابتة. كم كيلومترًا سيقطع في 5 ساعات؟', choices: ['30 km', '24 km', '36 km', '33 km'], choicesAr: ['30 كم', '24 كم', '36 كم', '33 كم'], correct: 0, explain: '18 ÷ 3 = 6 km/h, and 6 × 5 = 30 km.', explainAr: '18 ÷ 3 = 6 كم في الساعة، و6 × 5 = 30 كم.' },
    { text: 'Why do fish have gills?', textAr: 'لماذا تمتلك الأسماك خياشيم؟', choices: ['To see underwater', 'To breathe by absorbing oxygen from water', 'To swim faster', 'To stay warm'], choicesAr: ['لترى تحت الماء', 'لتتنفس عبر امتصاص الأكسجين من الماء', 'لتسبح بسرعة أكبر', 'لتبقى دافئة'], correct: 1, explain: 'Gills let fish absorb oxygen dissolved in water.', explainAr: 'تتيح الخياشيم للأسماك امتصاص الأكسجين الذائب في الماء.' },
    { text: 'What is 5/6 − 1/3, in simplest form?', textAr: 'ما ناتج 5/6 − 1/3 في أبسط صورة؟', choices: ['1/2', '2/3', '1/3', '1/6'], choicesAr: ['1/2', '2/3', '1/3', '1/6'], correct: 0, explain: '1/3 = 2/6, so 5/6 − 2/6 = 3/6 = 1/2.', explainAr: '1/3 = 2/6، إذن 5/6 − 2/6 = 3/6 = 1/2.' },
    { text: 'What is coral actually made of?', textAr: 'ممّ يتكوّن المرجان في الحقيقة؟', choices: ['Rock', 'Tiny living animals called polyps', 'Plant leaves', 'Sand'], choicesAr: ['صخر', 'حيوانات صغيرة حية تُسمى البوليبات', 'أوراق نباتية', 'رمل'], correct: 1, explain: 'Coral reefs are built by tiny living animals called polyps.', explainAr: 'تُبنى الشعاب المرجانية بواسطة حيوانات صغيرة حية تُسمى البوليبات.' },
  ]);

  addBossQuestions(30, [
    { text: 'What is 6² + 3²?', textAr: 'ما ناتج 6² + 3²؟', choices: ['45', '54', '36', '81'], choicesAr: ['45', '54', '36', '81'], correct: 0, explain: '6² = 36 and 3² = 9, so 36 + 9 = 45.', explainAr: '6² = 36 و3² = 9، إذن 36 + 9 = 45.' },
    { text: 'What causes ocean tides?', textAr: 'ما الذي يسبب المد والجزر في المحيط؟', choices: ['Wind only', 'The pull of gravity from the Moon (and Sun)', 'Ocean currents only', "Earth's rotation only"], choicesAr: ['الرياح فقط', 'جاذبية القمر (والشمس)', 'التيارات المحيطية فقط', 'دوران الأرض فقط'], correct: 1, explain: 'Tides are mainly caused by the gravitational pull of the Moon.', explainAr: 'يحدث المد والجزر بشكل رئيسي بسبب جاذبية القمر.' },
    { text: 'A fisherman catches 240 fish and sells them equally among 15 buyers. How many fish does each buyer get?', textAr: 'يصطاد صياد 240 سمكة ويبيعها بالتساوي على 15 مشتريًا. كم سمكة يحصل عليها كل مشترٍ؟', choices: ['16', '15', '18', '20'], choicesAr: ['16', '15', '18', '20'], correct: 0, explain: '240 ÷ 15 = 16.', explainAr: '240 ÷ 15 = 16.' },
    { text: 'Which of these is a producer in a coastal food chain?', textAr: 'أي مما يلي منتج في السلسلة الغذائية الساحلية؟', choices: ['Seaweed', 'Crab', 'Seagull', 'Shark'], choicesAr: ['الطحالب البحرية', 'السلطعون', 'النورس', 'سمك القرش'], correct: 0, explain: 'Seaweed makes its own food through photosynthesis.', explainAr: 'تصنع الطحالب البحرية غذاءها بنفسها عبر البناء الضوئي.' },
    { text: 'What is 0.4 written as a fraction in simplest form?', textAr: 'ما هو العدد 0.4 مكتوبًا ككسر في أبسط صورة؟', choices: ['2/5', '4/10', '1/4', '4/5'], choicesAr: ['2/5', '4/10', '1/4', '4/5'], correct: 0, explain: '0.4 = 4/10, which simplifies to 2/5.', explainAr: '0.4 = 4/10، وهو ما يُختصر إلى 2/5.' },
    { text: 'Which of these best describes erosion?', textAr: 'أي مما يلي يصف التعرية بشكل أفضل؟', choices: ['The wearing away of land by wind or water', 'The growth of new land', 'The freezing of the ocean', 'The planting of new coral'], choicesAr: ['تآكل الأرض بفعل الرياح أو الماء', 'نمو أرض جديدة', 'تجمّد المحيط', 'زراعة مرجان جديد'], correct: 0, explain: 'Erosion is the gradual wearing away of land.', explainAr: 'التعرية هي تآكل الأرض تدريجيًا.' },
  ]);

  addBossQuestions(35, [
    { text: 'What is 9 × 12?', textAr: 'ما ناتج 9 × 12؟', choices: ['108', '98', '118', '96'], choicesAr: ['108', '98', '118', '96'], correct: 0, explain: '9 × 12 = 108.', explainAr: '9 × 12 = 108.' },
    { text: 'How long does it take Earth to orbit the Sun once?', textAr: 'كم من الوقت تستغرق الأرض لتكمل دورة واحدة حول الشمس؟', choices: ['1 day', '1 month', '1 year', '10 years'], choicesAr: ['يوم واحد', 'شهر واحد', 'سنة واحدة', '10 سنوات'], correct: 2, explain: 'Earth takes about one year to complete one orbit around the Sun.', explainAr: 'تستغرق الأرض حوالي سنة واحدة لإكمال دورة واحدة حول الشمس.' },
    { text: 'What is 144 ÷ 12?', textAr: 'ما ناتج 144 ÷ 12؟', choices: ['12', '14', '10', '16'], choicesAr: ['12', '14', '10', '16'], correct: 0, explain: '144 ÷ 12 = 12.', explainAr: '144 ÷ 12 = 12.' },
    { text: 'What is a light-year used to measure?', textAr: 'ما الذي تُستخدم السنة الضوئية لقياسه؟', choices: ['Time', 'Distance', 'Weight', 'Temperature'], choicesAr: ['الزمن', 'المسافة', 'الوزن', 'درجة الحرارة'], correct: 1, explain: 'A light-year measures distance.', explainAr: 'تقيس السنة الضوئية المسافة.' },
    { text: 'If a rocket launches at 3:15 PM and the flight takes 2 hours and 40 minutes, what time does it land?', textAr: 'إذا انطلق صاروخ في تمام الساعة 3:15 مساءً واستغرقت الرحلة ساعتين و40 دقيقة، فما الوقت الذي سيهبط فيه؟', choices: ['5:55 PM', '5:45 PM', '6:05 PM', '5:35 PM'], choicesAr: ['5:55 مساءً', '5:45 مساءً', '6:05 مساءً', '5:35 مساءً'], correct: 0, explain: '3:15 PM + 2 hours 40 minutes = 5:55 PM.', explainAr: '3:15 مساءً + ساعتان و40 دقيقة = 5:55 مساءً.' },
    { text: 'Which of these is NOT one of the eight planets in our solar system?', textAr: 'أي مما يلي ليس أحد الكواكب الثمانية في نظامنا الشمسي؟', choices: ['Pluto', 'Neptune', 'Uranus', 'Saturn'], choicesAr: ['بلوتو', 'نبتون', 'أورانوس', 'زحل'], correct: 0, explain: 'Pluto was reclassified as a dwarf planet in 2006.', explainAr: 'أُعيد تصنيف بلوتو ككوكب قزم عام 2006.' },
  ]);

  addBossQuestions(40, [
    { text: 'What is 15% of 200?', textAr: 'كم يساوي 15٪ من 200؟', choices: ['30', '20', '25', '35'], choicesAr: ['30', '20', '25', '35'], correct: 0, explain: '15% of 200 = 0.15 × 200 = 30.', explainAr: '15٪ من 200 = 0.15 × 200 = 30.' },
    { text: 'What is the closest large galaxy to our own Milky Way, visible to the naked eye on a clear night?', textAr: 'ما أقرب مجرة كبيرة إلى مجرتنا درب التبانة، ويمكن رؤيتها بالعين المجردة في ليلة صافية؟', choices: ['Andromeda Galaxy', 'Triangulum Galaxy', 'Whirlpool Galaxy', 'Sombrero Galaxy'], choicesAr: ['مجرة المرأة المسلسلة (أندروميدا)', 'مجرة المثلث', 'مجرة الدوامة', 'مجرة السومبريرو'], correct: 0, explain: 'The Andromeda Galaxy is the closest large galaxy to the Milky Way.', explainAr: 'مجرة المرأة المسلسلة هي أقرب مجرة كبيرة إلى درب التبانة.' },
    { text: 'What is 2/3 × 9?', textAr: 'ما ناتج 2/3 × 9؟', choices: ['6', '5', '7', '8'], choicesAr: ['6', '5', '7', '8'], correct: 0, explain: '9 ÷ 3 = 3, and 3 × 2 = 6.', explainAr: '9 ÷ 3 = 3، و3 × 2 = 6.' },
    { text: 'What is the name for a large group of stars, gas, and dust held together by gravity?', textAr: 'ما اسم المجموعة الكبيرة من النجوم والغاز والغبار التي تجمعها الجاذبية معًا؟', choices: ['A galaxy', 'A comet', 'A constellation', 'A nebula'], choicesAr: ['مجرة', 'مذنب', 'كوكبة نجمية', 'سديم'], correct: 0, explain: 'A galaxy is a massive collection of stars, gas, and dust bound by gravity.', explainAr: 'المجرة تجمّع ضخم من النجوم والغاز والغبار تربطه الجاذبية.' },
    { text: 'What is the next number in this pattern: 3, 6, 12, 24, ...?', textAr: 'ما العدد التالي في هذا النمط: 3, 6, 12, 24, ...؟', choices: ['48', '36', '30', '20'], choicesAr: ['48', '36', '30', '20'], correct: 0, explain: 'Each number doubles: 24×2=48.', explainAr: 'كل عدد يتضاعف: 24×2=48.' },
    { text: 'Why does the Moon appear to change shape throughout the month?', textAr: 'لماذا يبدو أن شكل القمر يتغيّر خلال الشهر؟', choices: ['It moves closer and farther from Earth', 'We see different amounts of its sunlit side as it orbits Earth', 'Clouds cover part of it', 'It spins very fast'], choicesAr: ['لأنه يقترب ويبتعد عن الأرض', 'لأننا نرى كميات مختلفة من جانبه المضاء بالشمس أثناء دورانه حول الأرض', 'لأن الغيوم تغطي جزءًا منه', 'لأنه يدور بسرعة كبيرة'], correct: 1, explain: "The Moon's phases happen because we see different portions of its sunlit half.", explainAr: 'تحدث أطوار القمر لأننا نرى أجزاءً مختلفة من نصفه المضاء بالشمس.' },
  ]);

  addBossQuestions(45, [
    { text: 'What is 7/8 − 3/8, in simplest form?', textAr: 'ما ناتج 7/8 − 3/8 في أبسط صورة؟', choices: ['1/2', '1/4', '3/4', '5/8'], choicesAr: ['1/2', '1/4', '3/4', '5/8'], correct: 0, explain: '7/8 − 3/8 = 4/8, which simplifies to 1/2.', explainAr: '7/8 − 3/8 = 4/8، وهو ما يُختصر إلى 1/2.' },
    { text: 'Which adaptation helps falcons catch prey at high speed?', textAr: 'أي تكيّف يساعد الصقور على اصطياد فرائسها بسرعة عالية؟', choices: ['Sharp talons and streamlined bodies', 'Bright colorful feathers', 'Webbed feet', 'A long neck'], choicesAr: ['مخالب حادة وأجسام انسيابية', 'ريش زاهي الألوان', 'أقدام مكففة', 'رقبة طويلة'], correct: 0, explain: 'Falcons have sharp talons and streamlined, aerodynamic bodies.', explainAr: 'تمتلك الصقور مخالب حادة وأجسامًا انسيابية.' },
    { text: 'A mountain trail is 12.5 km long. A hiker has walked 7.75 km. How much farther until the end?', textAr: 'طول مسار جبلي هو 12.5 كم. مشى أحد المتسلقين 7.75 كم. كم يتبقى حتى النهاية؟', choices: ['4.75 km', '5.25 km', '4.25 km', '5.75 km'], choicesAr: ['4.75 كم', '5.25 كم', '4.25 كم', '5.75 كم'], correct: 0, explain: '12.5 − 7.75 = 4.75 km.', explainAr: '12.5 − 7.75 = 4.75 كم.' },
    { text: 'What type of rock is formed when magma cools and hardens?', textAr: 'أي نوع من الصخور يتكوّن عندما يبرد الصهارة ويتصلّب؟', choices: ['Igneous rock', 'Sedimentary rock', 'Metamorphic rock', 'Limestone'], choicesAr: ['الصخور النارية', 'الصخور الرسوبية', 'الصخور المتحولة', 'الحجر الجيري'], correct: 0, explain: 'Igneous rock forms when magma (or lava) cools and hardens.', explainAr: 'تتكوّن الصخور النارية عندما تبرد الصهارة وتتصلّب.' },
    { text: 'What is 8³ (8 cubed)?', textAr: 'ما قيمة 8³ (8 تكعيب)؟', choices: ['512', '64', '256', '216'], choicesAr: ['512', '64', '256', '216'], correct: 0, explain: '8³ = 8 × 8 × 8 = 512.', explainAr: '8³ = 8 × 8 × 8 = 512.' },
    { text: "Which layer of the atmosphere is closest to Earth's surface, where weather happens?", textAr: 'أي طبقة من طبقات الغلاف الجوي هي الأقرب إلى سطح الأرض، وفيها يحدث الطقس؟', choices: ['Troposphere', 'Stratosphere', 'Mesosphere', 'Thermosphere'], choicesAr: ['التروبوسفير', 'الستراتوسفير', 'الميزوسفير', 'الثيرموسفير'], correct: 0, explain: 'The troposphere is the lowest layer of the atmosphere.', explainAr: 'التروبوسفير هو أدنى طبقة في الغلاف الجوي.' },
  ]);

  addBossQuestions(50, [
    { text: 'What is 3/4 + 5/6, written as a mixed number in simplest form?', textAr: 'ما ناتج 3/4 + 5/6، مكتوبًا كعدد كسري في أبسط صورة؟', choices: ['1 7/12', '1 5/12', '1 1/6', '2 1/12'], choicesAr: ['1 7/12', '1 5/12', '1 1/6', '2 1/12'], correct: 0, explain: '3/4 = 9/12 and 5/6 = 10/12, so 9/12 + 10/12 = 19/12 = 1 7/12.', explainAr: '3/4 = 9/12 و5/6 = 10/12، إذن 9/12 + 10/12 = 19/12 = 1 7/12.' },
    { text: "Qatar's national bird, the falcon, is known for its incredibly fast hunting dive. What is this dive called?", textAr: 'يشتهر الصقر، طائر قطر الوطني، بانقضاضه السريع جدًا أثناء الصيد. ماذا يُسمى هذا الانقضاض؟', choices: ['A stoop', 'A glide', 'A molt', 'A roost'], choicesAr: ['الانقضاض (ستووب)', 'الانزلاق', 'الانسلاخ', 'الجثوم'], correct: 0, explain: "A falcon's high-speed hunting dive is called a 'stoop.'", explainAr: "يُسمى انقضاض الصقر السريع أثناء الصيد 'الستووب.'" },
    { text: 'What is 625 ÷ 25?', textAr: 'ما ناتج 625 ÷ 25؟', choices: ['25', '20', '30', '15'], choicesAr: ['25', '20', '30', '15'], correct: 0, explain: '25 × 25 = 625.', explainAr: '25 × 25 = 625.' },
    { text: 'Which force must a falcon overcome to fly upward?', textAr: 'أي قوة يجب على الصقر التغلب عليها ليطير للأعلى؟', choices: ['Gravity', 'Friction', 'Magnetism', 'Buoyancy'], choicesAr: ['الجاذبية', 'الاحتكاك', 'المغناطيسية', 'الطفو'], correct: 0, explain: 'Gravity pulls objects toward Earth, so a flying falcon must generate enough lift.', explainAr: 'تجذب الجاذبية الأجسام نحو الأرض، لذا يجب على الصقر توليد رفع كافٍ.' },
    { text: 'A stone tower is built in layers. Layer 1 has 3 stones, and each new layer has 4 more stones than the last. How many stones are in layer 5?', textAr: 'يُبنى برج حجري على شكل طبقات. الطبقة الأولى تحتوي على 3 أحجار، وكل طبقة جديدة تحتوي على 4 أحجار أكثر من السابقة. كم حجرًا في الطبقة الخامسة؟', choices: ['19', '15', '23', '21'], choicesAr: ['19', '15', '23', '21'], correct: 0, explain: 'The pattern adds 4 each time: 3, 7, 11, 15, 19.', explainAr: 'يزيد النمط بمقدار 4 في كل مرة: 3، 7، 11، 15، 19.' },
    { text: 'What do we call the elevation above which mountains stay covered in snow all year?', textAr: 'ماذا نسمي الارتفاع الذي تبقى الجبال فوقه مغطاة بالثلوج طوال العام؟', choices: ['The snow line', 'The equator', 'The horizon', 'The tree line'], choicesAr: ['خط الثلج', 'خط الاستواء', 'الأفق', 'خط الأشجار'], correct: 0, explain: 'Above the snow line, temperatures stay cold enough for snow to remain year-round.', explainAr: 'فوق خط الثلج، تبقى درجات الحرارة باردة بما يكفي لبقاء الثلوج طوال العام.' },
  ]);

  // ---------------------------------------------------------------------
  // News posts
  // ---------------------------------------------------------------------
  const insertNews = db.prepare(
    `INSERT INTO news_posts (subject_id, title, title_ar, body, body_ar, icon, published_at) VALUES (?,?,?,?,?,?,?)`
  );
  const now = new Date();
  function daysAgo(n: number) {
    return toSqlite(new Date(now.getTime() - n * 24 * 60 * 60 * 1000));
  }

  insertNews.run(
    null,
    'Welcome to Anees! 🦅',
    'مرحبًا بكم في أنيس! 🦅',
    "Get ready for an epic journey through Math and Science! Watch bite-sized lesson reels, answer quizzes to earn XP, and battle a boss every 5 levels on the 50-level adventure map. Let's begin!",
    'استعدوا لرحلة ملحمية عبر الرياضيات والعلوم! شاهدوا دروسًا قصيرة، وأجيبوا عن الاختبارات لكسب نقاط الخبرة، وواجهوا وحشًا كل 5 مستويات على خريطة المغامرة المكونة من 50 مستوى. لنبدأ!',
    '🦅',
    daysAgo(14)
  );

  insertNews.run(
    null,
    'New Boss Unlocked: The Sandworm Sentinel! 🐛',
    'وحش جديد فُتح: حارس دودة الرمال! 🐛',
    'A fearsome guardian now blocks the path at Level 5 in the Desert Oasis. Answer questions correctly to strike it down and reveal the rest of the desert!',
    'حارس مخيف يسد الطريق الآن عند المستوى 5 في واحة الصحراء. أجب عن الأسئلة بشكل صحيح لإسقاطه وكشف بقية الصحراء!',
    '🐛',
    daysAgo(10)
  );

  insertNews.run(
    null,
    'The Full 50-Level Map Is Now Open! 🗺️',
    'خريطة الخمسين مستوى مفتوحة بالكامل الآن! 🗺️',
    'From the Desert Oasis all the way to the peak of Falcon\'s Peak, every single level is now playable — with a boss fight waiting every 5 levels. How far can you climb?',
    'من واحة الصحراء وحتى قمة الصقر، أصبحت كل المستويات قابلة للعب الآن — مع مواجهة وحش تنتظرك كل 5 مستويات. إلى أي مدى يمكنك التقدم؟',
    '🗺️',
    daysAgo(7)
  );

  insertNews.run(
    mathId,
    'Math Tip: Master Your Times Tables',
    'نصيحة رياضيات: أتقن جدول الضرب',
    'Knowing your times tables by heart makes division, fractions, and word problems so much faster. Try practicing 5 minutes a day!',
    'إتقان جدول الضرب عن ظهر قلب يجعل القسمة والكسور والمسائل اللفظية أسرع بكثير. جرّب التدرب 5 دقائق يوميًا!',
    '🧮',
    daysAgo(5)
  );

  insertNews.run(
    scienceId,
    'Science Tip: Think Like a Scientist',
    'نصيحة علوم: فكّر كعالِم',
    'Next time you wonder why something happens, try the scientific method: ask a question, make a hypothesis, and test it out!',
    'في المرة القادمة التي تتساءل فيها عن سبب حدوث شيء ما، جرّب الطريقة العلمية: اطرح سؤالًا، وضع فرضية، واختبرها!',
    '🔬',
    daysAgo(4)
  );

  insertNews.run(
    null,
    'Sports Day Is Coming Up! ⚽',
    'يوم رياضي قادم قريبًا! ⚽',
    "Don't forget — school Sports Day is this month. Keep earning XP so you're ready to celebrate on the leaderboard too!",
    'لا تنسوا — اليوم الرياضي المدرسي هذا الشهر. استمروا في كسب نقاط الخبرة لتكونوا جاهزين للاحتفال في لوحة المتصدرين أيضًا!',
    '⚽',
    daysAgo(2)
  );

  insertNews.run(
    null,
    'Shoutout to This Month\'s Top Students! 🏆',
    'تحية لأبرز طلاب هذا الشهر! 🏆',
    'Keep an eye on the Leaderboard page to see who is topping the charts this month. Could it be you next?',
    'راقب صفحة لوحة المتصدرين لمعرفة من يتصدر القائمة هذا الشهر. ربما تكون أنت التالي؟',
    '🏆',
    daysAgo(1)
  );

  // ---------------------------------------------------------------------
  // Dev bypass account (real seeded account backing frontend dev-config.ts)
  // ---------------------------------------------------------------------
  const insertUser = db.prepare(
    `INSERT INTO users (username, email, password_hash, display_name, avatar_key, total_xp, is_seed) VALUES (?,?,?,?,?,?,?)`
  );
  const insertProgress = db.prepare(
    `INSERT INTO user_level_progress (user_id, map_level_id, status) VALUES (?,?,?)`
  );
  const insertXpEvent = db.prepare(`INSERT INTO xp_events (user_id, amount, reason, created_at) VALUES (?,?,?,?)`);

  const devPasswordHash = bcrypt.hashSync('devpass123', 10);
  const devUserId = Number(
    insertUser.run('dev_student', 'dev_student@anees.local', devPasswordHash, 'Dev Student', 'falcon', 0, 0).lastInsertRowid
  );
  insertProgress.run(devUserId, levelIds.get(1)!, 'available');

  // ---------------------------------------------------------------------
  // Demo seed students — populate leaderboard/friends so the app isn't
  // empty on first run. is_seed=1 flags them as non-real accounts.
  // ---------------------------------------------------------------------
  const demoStudents: { username: string; displayName: string; avatar: string; xp: number }[] = [
    { username: 'rashid_k', displayName: 'Rashid Al-Kuwari', avatar: 'falcon', xp: 2450 },
    { username: 'khalid_e', displayName: 'Khalid Al-Emadi', avatar: 'astronaut', xp: 2180 },
    { username: 'hamad_m', displayName: 'Hamad Al-Marri', avatar: 'knight', xp: 1920 },
    { username: 'abdulaziz_k', displayName: 'Abdulaziz Al-Kubaisi', avatar: 'athlete', xp: 1640 },
    { username: 'nasser_s', displayName: 'Nasser Al-Sulaiti', avatar: 'robot', xp: 1310 },
    { username: 'jassim_d', displayName: 'Jassim Al-Dosari', avatar: 'explorer', xp: 980 },
  ];

  for (const s of demoStudents) {
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hash = bcrypt.hashSync(randomPassword, 10);
    const userId = Number(
      insertUser.run(s.username, `${s.username}@anees.local`, hash, s.displayName, s.avatar, s.xp, 1).lastInsertRowid
    );
    insertXpEvent.run(userId, s.xp, 'seed_bootstrap', toSqlite(now));
  }

  console.log('[seed] Database seeded: subjects, 50 map levels, 10 boss fights, reels, worksheets, news, dev + demo accounts.');
}
