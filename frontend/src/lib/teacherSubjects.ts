// What a teacher teaches -- the signup dropdown's options (labels: auth.subject_<key> in
// i18n.ts). Must match TEACHER_SUBJECT_KEYS in backend/src/lib/schemas.ts.
export const TEACHER_SUBJECTS = ['math', 'science', 'islamic', 'english', 'arabic', 'ict', 'social'] as const;
export type TeacherSubject = (typeof TEACHER_SUBJECTS)[number];
