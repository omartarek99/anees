import { useLanguage } from '../lib/language-context';
import { LegalPageShell, LegalSection } from '../components/LegalPageShell';

const EFFECTIVE_DATE = '20 October 2026';
const EFFECTIVE_DATE_AR = '٢٠ أكتوبر ٢٠٢٦';

const CONTENT = {
  en: [
    {
      heading: '1. Overview',
      body: [
        'Anees is an educational app for students. This page explains what information the app collects, why, and how it is handled. Anees is currently a local development project, not a publicly hosted service — this policy describes how the app behaves and is the template to keep in place (and review with a lawyer) before any real public launch.',
      ],
    },
    {
      heading: '2. Information We Collect',
      body: [
        'Account information you provide at signup: username, email address, password (never stored in plain text — it is handled by our sign-in provider, Google Firebase Authentication, or kept only as a one-way hash), display name (which starts as your username), chosen avatar, role (student/teacher), your school name, grade level (students), and the subject you teach (teachers). Teachers also upload a photo of their Qatar ID so we can verify their age and occupation; it is stored privately and is not shown to other users.',
        'Activity you generate while using the app: lesson and quiz progress, XP and level, worksheet attempts, friend connections, your customised 3D character, and — for teachers — news posts and lesson videos you author. This is the data the core features (progress tracking, leaderboard, friends) exist to use.',
        'When you build a worksheet from a lesson or video name, that name (or the video\'s description), together with the subject and grade, is sent to Google\'s Gemini AI service, which writes the practice questions. Nothing that identifies you is sent with it.',
        'We do not collect payment information, precise location, or contacts, and nothing beyond what is listed above.',
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
        'If you accept the cookie notice, the app also counts which pages are visited (for example "/map") in a first-party, anonymous tally — it never records who you are and sets no cookie. If you decline, nothing is counted.',
        'Anees has no advertising or tracking scripts. To work, it relies on a few service providers: Google Firebase Authentication (sign-up, sign-in and verification emails), Supabase (private storage of teacher ID photos and lesson videos), Google Gemini (the AI that writes practice questions) and Google Fonts (the fonts your browser downloads when a page loads). Your language, theme and cookie-notice choices are remembered on your own device only (browser local storage).',
      ],
    },
    {
      heading: "5. Children's Privacy",
      body: [
        'Anees is built for students, most of whom are children. We deliberately collect the minimum needed to run the app and do not show ads or allow public messaging between students.',
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
        'أنيس هو تطبيق تعليمي للطلاب. توضح هذه الصفحة ما هي المعلومات التي يجمعها التطبيق، ولماذا، وكيف يتم التعامل معها. أنيس حاليًا مشروع تطوير محلي وليس خدمة عامة مستضافة — تصف هذه السياسة سلوك التطبيق الحالي، وهي نموذج ينبغي مراجعته مع محامٍ قبل أي إطلاق عام حقيقي.',
      ],
    },
    {
      heading: '٢. المعلومات التي نجمعها',
      body: [
        'معلومات الحساب التي تُدخلها عند التسجيل: اسم المستخدم، البريد الإلكتروني، كلمة المرور (لا تُخزَّن أبدًا كنص صريح — تتولاها جهة تسجيل الدخول لدينا، وهي Google Firebase Authentication، أو تُحفظ كبصمة تشفير أحادية الاتجاه فقط)، الاسم الظاهر (ويبدأ باسم المستخدم)، الصورة الرمزية المختارة، الدور (طالب/معلم)، اسم مدرستك، الصف الدراسي (للطلاب)، والمادة التي تدرّسها (للمعلمين). كما يرفع المعلمون صورة هويتهم القطرية للتحقق من العمر والمهنة؛ وتُحفظ بشكل خاص ولا تُعرض لأي مستخدم آخر.',
        'النشاط الذي تولّده أثناء استخدام التطبيق: تقدّم الدروس والاختبارات، نقاط الخبرة والمستوى، محاولات أوراق العمل، روابط الصداقة، شخصيتك ثلاثية الأبعاد المخصّصة، ومنشورات الأخبار ومقاطع الدروس التي ينشئها المعلمون. هذه هي البيانات التي توجد الميزات الأساسية (تتبع التقدّم، لوحة المتصدرين، الأصدقاء) لاستخدامها.',
        'عند إنشاء ورقة عمل من اسم درس أو فيديو، يُرسل ذلك الاسم (أو وصف الفيديو) مع المادة والصف إلى خدمة الذكاء الاصطناعي Gemini من Google لكتابة الأسئلة التدريبية. ولا يُرسل معه أي شيء يحدّد هويتك.',
        'نحن لا نجمع معلومات الدفع أو الموقع الدقيق أو جهات الاتصال، ولا أي بيانات غير المذكورة أعلاه.',
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
        'إذا وافقت على إشعار ملفات تعريف الارتباط، يُحصي التطبيق أيضًا الصفحات التي تُزار (مثل "/map") في عدّاد من طرفنا ومجهول الهوية — ولا يسجّل هويتك أبدًا ولا يضع أي ملف تعريف ارتباط. وإذا رفضت فلن يُحصى شيء.',
        'لا يحتوي أنيس على أي إعلانات أو أدوات تتبّع. ولكي يعمل يعتمد على بعض مزوّدي الخدمات: Google Firebase Authentication (التسجيل وتسجيل الدخول ورسائل التحقق)، وSupabase (التخزين الخاص لصور هويات المعلمين ومقاطع الدروس)، وGoogle Gemini (الذكاء الاصطناعي الذي يكتب الأسئلة التدريبية)، وGoogle Fonts (الخطوط التي يحمّلها متصفحك عند فتح الصفحة). ويُحفظ اختيارك للغة والمظهر وإشعار ملفات تعريف الارتباط على جهازك فقط (التخزين المحلي للمتصفح).',
      ],
    },
    {
      heading: '٥. خصوصية الأطفال',
      body: [
        'صُمم أنيس للطلاب، ومعظمهم أطفال. نجمع عمدًا الحد الأدنى اللازم لتشغيل التطبيق، ولا نعرض إعلانات ولا نسمح بمراسلة عامة بين الطلاب.',
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
