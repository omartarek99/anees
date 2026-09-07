import { useLanguage } from '../lib/language-context';
import { LegalPageShell, LegalSection } from '../components/LegalPageShell';

const EFFECTIVE_DATE = '6 September 2026';
const EFFECTIVE_DATE_AR = '٦ سبتمبر ٢٠٢٦';

const TABLE_HEAD = { en: ['Name', 'Purpose', 'Type', 'Duration'], ar: ['الاسم', 'الغرض', 'النوع', 'المدة'] };
const TABLE_ROW = {
  en: ['anees_session (session cookie)', 'Keeps you signed in', 'Strictly necessary', 'Until you log out or it expires'],
  ar: ['anees_session (ملف الجلسة)', 'يبقيك مسجّلاً للدخول', 'ضروري تمامًا', 'حتى تسجّل الخروج أو تنتهي صلاحيته'],
};

function CookieTable({ lang }: { lang: 'en' | 'ar' }) {
  const head = TABLE_HEAD[lang];
  const row = TABLE_ROW[lang];
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={{ textAlign: 'start', padding: '8px 10px', borderBottom: '2px solid var(--sand-dark)', color: 'var(--ink)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {row.map((cell, i) => (
              <td key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--sand-dark)', color: 'var(--ink-soft)' }}>
                {cell}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const CONTENT = {
  en: [
    {
      heading: '1. The Cookie We Use',
      body: ['Anees sets exactly one cookie:'],
    },
    {
      heading: '2. Do You Need to Consent?',
      body: [
        'No. Under GDPR/ePrivacy-style rules, a cookie that is "strictly necessary" for a service you asked for — like staying logged in — does not require a consent banner, only disclosure, which this page provides. Anees has no analytics, advertising, or tracking cookies, which are the kinds that would need consent.',
        'If analytics or third-party embeds are ever added to Anees in the future, this policy (and a consent banner) will need to be updated first.',
      ],
    },
    {
      heading: '3. Local Storage (Not a Cookie, but Similar)',
      body: [
        'Your chosen display language (Arabic/English) is saved with your browser\'s local storage, on your device only. It is never sent to the server and does not identify you.',
      ],
    },
    {
      heading: '4. Controlling Cookies',
      body: [
        'You can block or delete cookies in your browser settings, but blocking the session cookie will sign you out, since it is what keeps you logged in.',
      ],
    },
  ],
  ar: [
    {
      heading: '١. ملف تعريف الارتباط الذي نستخدمه',
      body: ['يستخدم أنيس ملف تعريف ارتباط واحدًا فقط:'],
    },
    {
      heading: '٢. هل تحتاج للموافقة؟',
      body: [
        'لا. بموجب قواعد مثل GDPR/ePrivacy، فإن ملف تعريف الارتباط "الضروري تمامًا" لخدمة طلبتها بنفسك — مثل البقاء مسجّلاً للدخول — لا يتطلب شريط موافقة، بل الإفصاح فقط، وهو ما توفره هذه الصفحة. لا يحتوي أنيس على ملفات تعريف ارتباط للتحليلات أو الإعلانات أو التتبّع، وهي الأنواع التي تتطلب الموافقة.',
        'إذا أُضيفت أدوات تحليلات أو عناصر من أطراف ثالثة إلى أنيس مستقبلاً، فيجب تحديث هذه السياسة (وإضافة شريط موافقة) أولاً.',
      ],
    },
    {
      heading: '٣. التخزين المحلي (ليس ملف تعريف ارتباط، لكنه مشابه)',
      body: ['يُحفظ تفضيل اللغة الذي تختاره (عربي/إنجليزي) في التخزين المحلي لمتصفحك، على جهازك فقط. لا يُرسل أبدًا إلى الخادم ولا يحدّد هويتك.'],
    },
    {
      heading: '٤. التحكم في ملفات تعريف الارتباط',
      body: ['يمكنك حظر أو حذف ملفات تعريف الارتباط من إعدادات متصفحك، لكن حظر ملف الجلسة سيؤدي لتسجيل خروجك تلقائيًا، لأنه ما يبقيك مسجّلاً للدخول.'],
    },
  ],
};

export function CookiePolicyPage() {
  const { t, lang } = useLanguage();
  return (
    <LegalPageShell title={t('legal.cookies')} lastUpdated={lang === 'ar' ? EFFECTIVE_DATE_AR : EFFECTIVE_DATE}>
      <LegalSection heading={CONTENT[lang][0].heading} body={CONTENT[lang][0].body} />
      <CookieTable lang={lang} />
      {CONTENT[lang].slice(1).map((s) => (
        <LegalSection key={s.heading} heading={s.heading} body={s.body} />
      ))}
    </LegalPageShell>
  );
}
