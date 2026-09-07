import { useLanguage } from '../lib/language-context';
import { LegalPageShell, LegalSection } from '../components/LegalPageShell';

const EFFECTIVE_DATE = '6 September 2026';
const EFFECTIVE_DATE_AR = '٦ سبتمبر ٢٠٢٦';

const CONTENT = {
  en: [
    {
      heading: '1. Acceptance of Terms',
      body: ['By creating an account or using Anees, you (or, if you are a child, your parent/guardian or teacher on your behalf) agree to these Terms and to our Privacy Policy.'],
    },
    {
      heading: '2. Who Can Use Anees',
      body: [
        'Anees is designed for 5th-grade students and their teachers. Signup requires choosing an account type (student or teacher); students also select a grade.',
        'A parent, guardian, or teacher should be involved in setting up a child\'s account.',
      ],
    },
    {
      heading: '3. Your Account',
      body: [
        'You are responsible for keeping your password private. Use a real, appropriate username and display name — both are checked by an automatic content filter and inappropriate ones will be rejected.',
        'Accounts are for individual use — do not share your login with others.',
      ],
    },
    {
      heading: '4. Acceptable Use',
      body: [
        'Do not attempt to bypass the content filter, impersonate another person, share personal contact information through the app, or attempt to access another student\'s account or a teacher-only feature.',
        'Teachers posting news/announcements are responsible for content being appropriate for the intended student audience; posts are still checked by the same automatic filter before publishing.',
      ],
    },
    {
      heading: '5. Educational Content',
      body: [
        'Lesson and quiz content is written to be factually accurate for a 5th-grade Math & Science curriculum, but Anees is a learning tool, not a substitute for a teacher or an official curriculum. Map levels beyond the first 10 are shown as "Coming Soon" and are not yet real lesson content.',
      ],
    },
    {
      heading: '6. Intellectual Property',
      body: ['The Anees name, design, and original lesson/quiz content belong to its developer. You may use the app for your own learning; you may not copy or redistribute its content commercially.'],
    },
    {
      heading: '7. No Warranty',
      body: [
        'Anees is currently a local development project provided "as is," with no guarantee of uptime, accuracy, or fitness for a particular purpose, and without any formal support commitment. Use it accordingly, especially if evaluating it for real classroom use.',
      ],
    },
    {
      heading: '8. Changes',
      body: ['These Terms may change as the app changes; the "last updated" date above will reflect that.'],
    },
    {
      heading: '9. Contact',
      body: ['Questions about these Terms? Contact the person or school administering your installation of Anees.'],
    },
  ],
  ar: [
    {
      heading: '١. الموافقة على الشروط',
      body: ['بإنشاء حساب أو استخدام أنيس، فإنك (أو ولي أمرك أو معلمك نيابةً عنك إن كنت طفلاً) توافق على هذه الشروط وعلى سياسة الخصوصية الخاصة بنا.'],
    },
    {
      heading: '٢. من يمكنه استخدام أنيس',
      body: [
        'صُمم أنيس لطلاب الصف الخامس ومعلميهم. يتطلب التسجيل اختيار نوع الحساب (طالب أو معلم)؛ ويختار الطلاب أيضًا صفهم الدراسي.',
        'ينبغي أن يشارك أحد الوالدين أو ولي الأمر أو المعلم في إعداد حساب الطفل.',
      ],
    },
    {
      heading: '٣. حسابك',
      body: [
        'أنت مسؤول عن الحفاظ على سرية كلمة مرورك. استخدم اسم مستخدم واسمًا ظاهرًا حقيقيين ومناسبين — يتم فحص كليهما تلقائيًا وسيُرفض أي منهما غير لائق.',
        'الحسابات للاستخدام الفردي — لا تشارك بيانات دخولك مع أحد.',
      ],
    },
    {
      heading: '٤. الاستخدام المقبول',
      body: [
        'لا تحاول تجاوز فلتر المحتوى، أو انتحال شخصية شخص آخر، أو مشاركة معلومات تواصل شخصية عبر التطبيق، أو محاولة الوصول لحساب طالب آخر أو ميزة مخصصة للمعلمين فقط.',
        'المعلمون الذين ينشرون أخبارًا/إعلانات مسؤولون عن ملاءمة المحتوى للطلاب المستهدفين؛ وتخضع المنشورات أيضًا لنفس الفلتر التلقائي قبل النشر.',
      ],
    },
    {
      heading: '٥. المحتوى التعليمي',
      body: [
        'محتوى الدروس والاختبارات مكتوب ليكون دقيقًا لمنهج الرياضيات والعلوم للصف الخامس، لكن أنيس أداة تعليمية وليس بديلاً عن معلم أو منهج رسمي. مستويات الخريطة بعد أول ١٠ مستويات معروضة كـ"قريبًا" وليست محتوى دروس فعلي بعد.',
      ],
    },
    {
      heading: '٦. الملكية الفكرية',
      body: ['اسم أنيس وتصميمه ومحتوى الدروس والاختبارات الأصلي مملوكة لمطوّره. يمكنك استخدام التطبيق لتعلّمك الخاص؛ ولا يجوز نسخ محتواه أو إعادة توزيعه تجاريًا.'],
    },
    {
      heading: '٧. عدم وجود ضمان',
      body: [
        'أنيس حاليًا مشروع تطوير محلي يُقدَّم "كما هو"، دون أي ضمان لاستمرارية التشغيل أو الدقة أو الملاءمة لغرض معين، ودون أي التزام رسمي بالدعم. استخدمه على هذا الأساس، خصوصًا عند تقييمه للاستخدام الفعلي داخل الصف.',
      ],
    },
    {
      heading: '٨. التغييرات',
      body: ['قد تتغير هذه الشروط مع تطوّر التطبيق؛ وسيعكس تاريخ "آخر تحديث" أعلاه ذلك.'],
    },
    {
      heading: '٩. التواصل',
      body: ['لديك أسئلة حول هذه الشروط؟ تواصل مع الشخص أو المدرسة المسؤولة عن تشغيل نسخة أنيس لديك.'],
    },
  ],
};

export function TermsPage() {
  const { t, lang } = useLanguage();
  return (
    <LegalPageShell title={t('legal.terms')} lastUpdated={lang === 'ar' ? EFFECTIVE_DATE_AR : EFFECTIVE_DATE}>
      {CONTENT[lang].map((s) => (
        <LegalSection key={s.heading} heading={s.heading} body={s.body} />
      ))}
    </LegalPageShell>
  );
}
