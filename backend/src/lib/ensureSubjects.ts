import { db } from '../db/db.js';

// The subjects a lesson can be about. Math and Science come with the first-run seeding (db/seed.ts) and own the adventure map; the rest are for teachers'
// lessons (routes/teacherReels.ts). Added when missing, on every start, so a database that already exists gets them too. The keys match the subject list
// a teacher picks at signup (frontend lib/teacherSubjects.ts).
const EXTRA_SUBJECTS: { key: string; name: string; nameAr: string; icon: string }[] = [
  { key: 'islamic', name: 'Islamic Education', nameAr: 'التربية الإسلامية', icon: '\u{1F54C}' },
  { key: 'arabic', name: 'Arabic Language', nameAr: 'اللغة العربية', icon: '\u{1F4D6}' },
  { key: 'english', name: 'English Language', nameAr: 'اللغة الإنجليزية', icon: '\u{1F524}' },
  { key: 'ict', name: 'Computing & Information Technology', nameAr: 'الحوسبة وتكنولوجيا المعلومات', icon: '\u{1F4BB}' },
  { key: 'social', name: 'Social Studies', nameAr: 'الاجتماعيات', icon: '\u{1F30D}' },
];

export function ensureSubjects() {
  // not on an empty database: db/seed.ts treats "any subject exists" as "already seeded" and would then skip Math, Science and the map
  const count = (db.prepare('SELECT COUNT(*) AS c FROM subjects').get() as { c: number }).c;
  if (count === 0) return;
  const insert = db.prepare('INSERT OR IGNORE INTO subjects (key, name, name_ar, icon) VALUES (?,?,?,?)');
  for (const s of EXTRA_SUBJECTS) insert.run(s.key, s.name, s.nameAr, s.icon);
}
