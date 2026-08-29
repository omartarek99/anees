// Server-side content safety filter. Runs on every chat message and any
// user-editable text field (username, display name). Never trust the client.

const LEET_MAP: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
};

// Curated block list. Kept as whole-word matches (see normalize/tokenize below)
// so common words like "class" or "assassin" are never falsely flagged.
const ENGLISH_BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt', 'crap',
  'damn', 'hell', 'slut', 'whore', 'fag', 'faggot', 'retard', 'retarded', 'nigger',
  'nigga', 'rape', 'porn', 'sex', 'sexy', 'nude', 'naked', 'kill yourself', 'kys',
];

const ARABIC_BLOCKLIST = [
  'كلب', 'حمار', 'خرا', 'كسم', 'منيك', 'زبي', 'شرموطة', 'عرص', 'قحبة', 'خول',
  // common Arabic-chat (Franco-Arabic / Arabizi) transliterations
  'kalb', '7omar', 'kesmak', '3ars', '5wal',
];

const BLOCKLIST = new Set([...ENGLISH_BLOCKLIST, ...ARABIC_BLOCKLIST].map((w) => w.toLowerCase()));

// Multi-word phrases checked as substrings after normalization (spaces preserved).
const PHRASE_BLOCKLIST = ['kill yourself', 'kill your self'];

function collapseRepeats(input: string): string {
  // "shiiiit" -> "shiit" (repeated-letter evasion), rare false-positive risk.
  return input.replace(/(.)\1{2,}/g, '$1$1');
}

function applyLeetSpeak(input: string): string {
  return input
    .split('')
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join('');
}

function normalize(input: string): string {
  const lowered = input.toLowerCase();
  const leetNormalized = applyLeetSpeak(lowered);
  const collapsed = collapseRepeats(leetNormalized);
  // Strip punctuation but keep spaces/alphanumerics (incl. Arabic script range) for word-boundary checks.
  return collapsed.replace(/[^a-z0-9؀-ۿ\s]/g, ' ');
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\b\d[\d\-\s]{6,}\d\b/;
const CONTACT_SOLICIT_PATTERN =
  /\b(add|follow|dm|message)\s+me\s+on\b|\bmy\s+(whats\s?app|snap(chat)?|insta(gram)?|number|phone|discord|tiktok)\b|\bwhats\s?app\s+me\b/i;

export type ModerationResult = { allowed: true } | { allowed: false; reason: string };

export function moderateText(raw: string): ModerationResult {
  if (!raw || !raw.trim()) {
    return { allowed: false, reason: 'Message cannot be empty.' };
  }

  const normalized = normalize(raw);

  for (const phrase of PHRASE_BLOCKLIST) {
    if (normalized.includes(phrase)) {
      return { allowed: false, reason: "Let's keep our chat kind and safe! Try rephrasing your message. 🦅" };
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (BLOCKLIST.has(word)) {
      return { allowed: false, reason: "Let's keep our chat kind and safe! Try rephrasing your message. 🦅" };
    }
  }

  if (EMAIL_PATTERN.test(raw)) {
    return { allowed: false, reason: "For your safety, you can't share email addresses in chat. Let's keep it inside Anees! 🛡️" };
  }
  if (PHONE_PATTERN.test(raw)) {
    return { allowed: false, reason: "For your safety, you can't share phone numbers in chat. Let's keep it inside Anees! 🛡️" };
  }
  if (CONTACT_SOLICIT_PATTERN.test(raw)) {
    return { allowed: false, reason: "For your safety, let's keep chatting here on Anees instead of other apps! 🛡️" };
  }

  return { allowed: true };
}
