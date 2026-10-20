import { FRONTEND_ORIGIN } from './config.js';
import { firebaseSendVerificationEmail } from './firebase.js';
import { getFirebaseAdminAuth } from './firebaseAdmin.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// e.g.  Anees <no-reply@your-domain.com>  -- the domain must be verified in Resend.
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;

export const resendConfigured = !!(RESEND_API_KEY && EMAIL_FROM);

if (!resendConfigured) {
  console.warn(
    '[mail] RESEND_API_KEY / EMAIL_FROM not set (see README) -- verification emails are sent by ' +
      "Firebase's default template (often lands in spam)."
  );
}

export type SendResult = { ok: true } | { ok: false; error: string };

function verificationContent(link: string, lang: 'ar' | 'en') {
  if (lang === 'ar') {
    return {
      subject: 'فعّل حسابك في أنيس',
      html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f6f1ea;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #eadfd2">
    <h1 style="color:#8a1538;margin:0 0 12px;font-size:24px">أنيس 🦅</h1>
    <p style="font-size:16px;color:#222">مرحبًا،</p>
    <p style="font-size:16px;color:#222;line-height:1.7">شكرًا لتسجيلك في منصة أنيس لتعلّم الرياضيات والعلوم. اضغط على الزر التالي لتفعيل حسابك:</p>
    <p style="text-align:center;margin:26px 0"><a href="${link}" style="display:inline-block;background:#8a1538;color:#ffffff;padding:13px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px">تفعيل الحساب</a></p>
    <p style="font-size:13px;color:#666;line-height:1.7">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:<br><span dir="ltr" style="word-break:break-all;color:#8a1538">${link}</span></p>
    <p style="font-size:13px;color:#666">إذا لم تطلب إنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>
  </div>
</div>`,
      text: `مرحبًا،\n\nشكرًا لتسجيلك في منصة أنيس. لتفعيل حسابك افتح هذا الرابط:\n${link}\n\nإذا لم تطلب إنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: 'Verify your Anees account',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f6f1ea;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #eadfd2">
    <h1 style="color:#8a1538;margin:0 0 12px;font-size:24px">Anees 🦅</h1>
    <p style="font-size:16px;color:#222">Hello,</p>
    <p style="font-size:16px;color:#222;line-height:1.6">Thanks for joining Anees, the Math &amp; Science learning platform. Click the button below to activate your account:</p>
    <p style="text-align:center;margin:26px 0"><a href="${link}" style="display:inline-block;background:#8a1538;color:#ffffff;padding:13px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px">Verify my account</a></p>
    <p style="font-size:13px;color:#666;line-height:1.6">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break:break-all;color:#8a1538">${link}</span></p>
    <p style="font-size:13px;color:#666">If you didn't create this account, you can ignore this email.</p>
  </div>
</div>`,
    text: `Hello,\n\nThanks for joining Anees. To activate your account open this link:\n${link}\n\nIf you didn't create this account, you can ignore this email.`,
  };
}

async function sendViaResend(to: string, link: string, lang: 'ar' | 'en'): Promise<SendResult> {
  const { subject, html, text } = verificationContent(link, lang);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: `RESEND_${res.status}: ${body?.message ?? 'unknown error'}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `RESEND_NETWORK: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Sends the account-verification email.
 *
 * With Resend configured (RESEND_API_KEY + EMAIL_FROM) and a Firebase service account available,
 * Firebase only creates the one-time code; WE email it from our own verified domain, with a link
 * straight to this site's /verify-email page (which confirms the code and logs the user in).
 * Otherwise it falls back to Firebase's own (non-customisable) email, exactly as before. */
export async function sendVerificationEmail(opts: {
  email: string;
  idToken: string;
  lang: 'ar' | 'en';
}): Promise<SendResult> {
  if (resendConfigured) {
    const auth = await getFirebaseAdminAuth();
    if (auth) {
      try {
        const firebaseLink = await auth.generateEmailVerificationLink(opts.email);
        const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
        if (!oobCode) return { ok: false, error: 'NO_OOB_CODE' };
        return sendViaResend(opts.email, `${FRONTEND_ORIGIN}/verify-email?oobCode=${encodeURIComponent(oobCode)}`, opts.lang);
      } catch (err) {
        return { ok: false, error: `LINK_GENERATION: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    console.warn("[mail] Resend is configured but there is no Firebase service account -- using Firebase's own email instead.");
  }
  return firebaseSendVerificationEmail(opts.idToken, `${FRONTEND_ORIGIN}/verify-email`, opts.lang);
}
