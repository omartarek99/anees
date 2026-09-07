import { useLanguage } from '../lib/language-context';
import { LegalPageShell, LegalSection } from '../components/LegalPageShell';

const EFFECTIVE_DATE = '6 September 2026';
const EFFECTIVE_DATE_AR = '٦ سبتمبر ٢٠٢٦';

const CONTENT = {
  en: [
    {
      heading: '1. Overview',
      body: [
        'Anees is an educational Math & Science app for 5th-grade students. This page explains what information the app collects, why, and how it is handled. Anees is currently a local development project, not a publicly hosted service — this policy describes how the app behaves and is the template to keep in place (and review with a lawyer) before any real public launch.',
      ],
    },
    {
      heading: '2. Information We Collect',
      body: [
        'Account information you provide at signup: username, email address, password (never stored in plain text — only a one-way bcrypt hash), display name, chosen avatar, role (student/teacher), and grade level.',
        'Activity you generate while using the app: lesson and quiz progress, XP and level, worksheet attempts, friend connections, and — for teachers — news posts you author. This is the data the core features (progress tracking, leaderboard, friends) exist to use.',
        'We do not collect payment information, precise location, contacts, photos, or any data beyond what is listed above.',
      ],
    },
    {
      heading: '3. How We Use Information',
      body: [
        'Solely to run the app: authenticate you, save your progress, show your XP/level, power the leaderboard and friends list, and let teachers post class announcements.',
        'We do not use your information for advertising, do not build behavioral profiles, and do not sell or rent any information to anyone.',
      ],
    },
    {
      heading: '4. Cookies, Analytics & Third Parties',
      body: [
        'Anees uses exactly one cookie: a session cookie that keeps you logged in. It is httpOnly (not readable by page scripts) and strictly necessary for the app to function — see our Cookie Policy for details.',
        'The app has no analytics, advertising, or tracking scripts of any kind, and loads no third-party embeds, fonts, or content. Your language preference is remembered on your own device only (browser local storage), never sent anywhere.',
      ],
    },
    {
      heading: "5. Children's Privacy",
      body: [
        'Anees is built for 5th-grade students, most of whom are children. We deliberately collect the minimum needed to run the app and do not show ads or allow public messaging between students.',
        'This project has not gone through a formal children\'s-privacy compliance review (e.g. COPPA in the US, GDPR-K in the EU/UK). If this app is ever deployed for real students outside of local development/testing, get that review done first, including a real parental-consent flow before collecting any child\'s data.',
      ],
    },
    {
      heading: '6. Data Retention & Deletion',
      body: [
        'Your data is kept for as long as your account exists. There is currently no self-service "delete my account" button in the app — to request deletion or a copy of your data, contact your teacher or whoever administers your school\'s installation of Anees.',
      ],
    },
    {
      heading: '7. Security',
      body: [
        'Passwords are hashed (never stored or shown in plain text), sessions use httpOnly cookies, all inputs are validated server-side, and every username/display name/news post is filtered for profanity and attempts to share outside contact info before being saved.',
      ],
    },
    {
      heading: '8. Changes to This Policy',
      body: ['If this policy changes, the "last updated" date at the top of this page will change too.'],
    },
    {
      heading: '9. Contact',
      body: ['Questions about this policy? Contact the person or school administering your installation of Anees.'],
    },
  ],
  ar: [
    {
      heading: '١. نظرة عامة',
      body: [
        'أنيس هو تطبيق تعليمي في الرياضيات والعلوم لطلاب الصف الخامس. توضح هذه الصفحة ما هي المعلومات التي يجمعها التطبيق، ولماذا، وكيف يتم التعامل معها. أنيس حاليًا مشروع تطوير محلي وليس خدمة عامة مستضافة — تصف هذه السياسة سلوك التطبيق الحالي، وهي نموذج ينبغي مراجعته مع محامٍ قبل أي إطلاق عام حقيقي.',
      ],
    },
    {
      heading: '٢. المعلومات التي نجمعها',
      body: [
        'معلومات الحساب التي تُدخلها عند التسجيل: اسم المستخدم، البريد الإلكتروني، كلمة المرور (لا تُخزَّن أبدًا كنص صريح — فقط بصمة تشفير أحادية الاتجاه bcrypt)، الاسم الظاهر، الصورة الرمزية المختارة، الدور (طالب/معلم)، والصف الدراسي.',
        'النشاط الذي تولّده أثناء استخدام التطبيق: تقدّم الدروس والاختبارات، نقاط الخبرة والمستوى، محاولات أوراق العمل، روابط الصداقة، ومنشورات الأخبار التي ينشئها المعلمون. هذه هي البيانات التي توجد الميزات الأساسية (تتبع التقدّم، لوحة المتصدرين، الأصدقاء) لاستخدامها.',
        'نحن لا نجمع معلومات الدفع أو الموقع الدقيق أو جهات الاتصال أو الصور أو أي بيانات غير المذكورة أعلاه.',
      ],
    },
    {
      heading: '٣. كيف نستخدم المعلومات',
      body: [
        'فقط لتشغيل التطبيق: التحقق من هويتك، حفظ تقدّمك، عرض نقاط خبرتك ومستواك، تشغيل لوحة المتصدرين وقائمة الأصدقاء، والسماح للمعلمين بنشر إعلانات الصف.',
        'نحن لا نستخدم معلوماتك لأغراض إعلانية، ولا ننشئ ملفات سلوكية عنك، ولا نبيع أو نؤجّر أي معلومات لأي جهة.',
      ],
    },
    {
      heading: '٤. ملفات تعريف الارتباط والتحليلات وأطراف ثالثة',
      body: [
        'يستخدم أنيس ملف تعريف ارتباط واحد فقط: ملف جلسة يبقيك مسجّلاً للدخول. وهو من نوع httpOnly (لا يمكن لبرامج الصفحة قراءته) وضروري تمامًا لعمل التطبيق — راجع سياسة ملفات تعريف الارتباط الخاصة بنا للتفاصيل.',
        'لا يحتوي التطبيق على أي أدوات تحليلات أو إعلانات أو تتبّع من أي نوع، ولا يُحمّل أي محتوى أو خطوط أو عناصر من أطراف ثالثة. يُحفظ تفضيل اللغة على جهازك فقط (التخزين المحلي للمتصفح) ولا يُرسل إلى أي مكان.',
      ],
    },
    {
      heading: '٥. خصوصية الأطفال',
      body: [
        'صُمم أنيس لطلاب الصف الخامس، ومعظمهم أطفال. نجمع عمدًا الحد الأدنى اللازم لتشغيل التطبيق، ولا نعرض إعلانات ولا نسمح بمراسلة عامة بين الطلاب.',
        'لم يخضع هذا المشروع لمراجعة امتثال رسمية لخصوصية الأطفال (مثل قانون COPPA الأمريكي أو GDPR-K الأوروبي/البريطاني). إذا تم نشر هذا التطبيق يومًا لطلاب حقيقيين خارج نطاق التطوير المحلي، يجب إجراء تلك المراجعة أولاً، بما في ذلك آلية حقيقية لموافقة ولي الأمر قبل جمع أي بيانات لطفل.',
      ],
    },
    {
      heading: '٦. الاحتفاظ بالبيانات وحذفها',
      body: [
        'تُحفظ بياناتك طالما ظلّ حسابك موجودًا. لا يوجد حاليًا زر "حذف حسابي" ذاتي الخدمة داخل التطبيق — لطلب حذف بياناتك أو نسخة منها، تواصل مع معلمك أو الجهة المسؤولة عن تشغيل نسخة أنيس في مدرستك.',
      ],
    },
    {
      heading: '٧. الأمان',
      body: [
        'كلمات المرور مشفّرة (لا تُخزَّن أو تُعرض كنص صريح أبدًا)، وتستخدم الجلسات ملفات تعريف ارتباط httpOnly، ويتم التحقق من جميع المدخلات على الخادم، ويمر كل اسم مستخدم واسم ظاهر ومنشور إخباري عبر فلتر لمنع الألفاظ غير اللائقة ومحاولات مشاركة معلومات تواصل خارجية قبل حفظه.',
      ],
    },
    {
      heading: '٨. التغييرات على هذه السياسة',
      body: ['إذا تغيّرت هذه السياسة، سيتغيّر أيضًا تاريخ "آخر تحديث" أعلى هذه الصفحة.'],
    },
    {
      heading: '٩. التواصل',
      body: ['لديك أسئلة حول هذه السياسة؟ تواصل مع الشخص أو المدرسة المسؤولة عن تشغيل نسخة أنيس لديك.'],
    },
  ],
};

export function PrivacyPolicyPage() {
  const { t, lang } = useLanguage();
  return (
    <LegalPageShell title={t('legal.privacy')} lastUpdated={lang === 'ar' ? EFFECTIVE_DATE_AR : EFFECTIVE_DATE}>
      {CONTENT[lang].map((s) => (
        <LegalSection key={s.heading} heading={s.heading} body={s.body} />
      ))}
    </LegalPageShell>
  );
}
