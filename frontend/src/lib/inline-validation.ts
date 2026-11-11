// One rule for every form on the site: a field that is empty or wrong gets a red message right under it (and a red border), instead of the browser's own
// small pop-up bubble that points at one field at a time and then disappears. The browser still decides what is wrong (required, e-mail, length, pattern);
// this only changes how it is shown. The message goes away as soon as the person edits that field. The lesson form (components/ReelComposer.tsx) shows
// its own, more specific messages and is switched to noValidate, so it never reaches this.
type Lang = 'ar' | 'en';
const TEXT: Record<Lang, Record<string, string>> = {
  ar: {
    valueMissing: 'اكتب في هذا الحقل.',
    valueMissingSelect: 'اختر من القائمة.',
    valueMissingFile: 'اختر ملفًا.',
    valueMissingCheck: 'ضع علامة في هذا المربع للمتابعة.',
    typeMismatchEmail: 'اكتب بريدك الإلكتروني هكذا: name@example.com',
    typeMismatchUrl: 'اكتب رابطًا كاملًا يبدأ بـ https://',
    typeMismatch: 'هذا غير مكتوب بشكل صحيح. راجعه.',
    tooShort: 'قصير جدًا. اكتب {min} أحرف على الأقل.',
    tooLong: 'طويل جدًا. استخدم {max} حرفًا على الأكثر.',
    patternMismatch: 'الصيغة غير صحيحة. راجع المثال.',
    rangeUnderflow: 'الرقم صغير جدًا. أقل رقم مسموح هو {min}.',
    rangeOverflow: 'الرقم كبير جدًا. أكبر رقم مسموح هو {max}.',
    badInput: 'اكتب قيمة صحيحة.',
  },
  en: {
    valueMissing: 'Fill in this field.',
    valueMissingSelect: 'Choose one from the list.',
    valueMissingFile: 'Choose a file.',
    valueMissingCheck: 'Tick this box to continue.',
    typeMismatchEmail: 'Write your email like this: name@example.com',
    typeMismatchUrl: 'Write a full link, starting with https://',
    typeMismatch: 'This is not written correctly. Check it.',
    tooShort: 'Too short. Write at least {min} characters.',
    tooLong: 'Too long. Use at most {max} characters.',
    patternMismatch: 'This is not in the right format. Check the example.',
    rangeUnderflow: 'The number is too small. The lowest allowed is {min}.',
    rangeOverflow: 'The number is too big. The highest allowed is {max}.',
    badInput: 'Write a valid value.',
  },
};

function currentLang(): Lang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('anees_lang');
  } catch {
    // storage blocked: fall back to the page's language
  }
  return (stored ?? document.documentElement.lang).startsWith('en') ? 'en' : 'ar';
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function messageFor(el: Field): string {
  const T = TEXT[currentLang()];
  const v = el.validity;
  const fill = (s: string) => s.replace('{min}', String((el as HTMLInputElement).minLength > 0 ? (el as HTMLInputElement).minLength : (el as HTMLInputElement).min)).replace('{max}', String((el as HTMLInputElement).maxLength > 0 ? (el as HTMLInputElement).maxLength : (el as HTMLInputElement).max));
  if (v.valueMissing) {
    if (el instanceof HTMLSelectElement) return T.valueMissingSelect;
    if (el instanceof HTMLInputElement && el.type === 'file') return T.valueMissingFile;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return T.valueMissingCheck;
    return T.valueMissing;
  }
  if (v.typeMismatch) return el instanceof HTMLInputElement && el.type === 'email' ? T.typeMismatchEmail : el instanceof HTMLInputElement && el.type === 'url' ? T.typeMismatchUrl : T.typeMismatch;
  if (v.tooShort) return fill(T.tooShort);
  if (v.tooLong) return fill(T.tooLong);
  if (v.patternMismatch) return T.patternMismatch;
  if (v.rangeUnderflow) return fill(T.rangeUnderflow);
  if (v.rangeOverflow) return fill(T.rangeOverflow);
  if (v.badInput) return T.badInput;
  return el.validationMessage || T.valueMissing;
}

const ERROR_CLASS = 'field-error field-error--auto';

function clearError(el: Field) {
  const id = el.getAttribute('data-err-id');
  if (id) document.getElementById(id)?.remove();
  el.removeAttribute('data-err-id');
  el.removeAttribute('aria-invalid');
  el.removeAttribute('aria-describedby');
}

let counter = 0;
function showError(el: Field) {
  clearError(el);
  const id = `ferr-${++counter}`;
  const box = document.createElement('div');
  box.id = id;
  box.className = ERROR_CLASS;
  box.setAttribute('role', 'alert');
  box.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>';
  const text = document.createElement('span');
  text.textContent = messageFor(el);
  box.appendChild(text);
  // under the field's own box (label + input + hint), at its end; a lone control goes right after itself
  const holder = el.closest('.field') ?? el.parentElement;
  (holder ?? el).appendChild(box);
  el.setAttribute('data-err-id', id);
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', id);
  const gone = () => {
    clearError(el);
    el.removeEventListener('input', gone);
    el.removeEventListener('change', gone);
  };
  el.addEventListener('input', gone);
  el.addEventListener('change', gone);
}

/** Call once at start-up. */
export function startInlineValidation(): void {
  let pending: number | null = null;
  // 'invalid' does not bubble, so listen in the capture phase on the document: it fires once for every field that fails when a form is submitted.
  document.addEventListener(
    'invalid',
    (event) => {
      const el = event.target as Field;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      if (el.form?.noValidate) return;
      event.preventDefault(); // no browser bubble
      showError(el);
      // when the last failing field has been marked: bring the first one into view and put the cursor in it
      if (pending) window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        pending = null;
        const first = document.querySelector<HTMLElement>('[data-err-id]');
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        first?.focus({ preventScroll: true });
      }, 0);
    },
    true
  );
}
