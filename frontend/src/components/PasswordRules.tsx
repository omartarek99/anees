import { useLanguage } from '../lib/language-context';
import { passwordFlaw, passwordRules } from '../lib/password';

/** The checklist under a "new password" field: each rule turns green as the typed password meets it. */
export function PasswordRules({ value, id }: { value: string; id: string }) {
  const { t } = useLanguage();
  const flaw = passwordFlaw(value);
  return (
    <ul id={id} className="password-rules">
      {passwordRules.map((r) => (
        <li key={r.key} className={r.ok(value) ? 'met' : undefined}>
          {t(`auth.${r.key}`)}
        </li>
      ))}
      {flaw && <li className="flaw">{t(`auth.${flaw}`)}</li>}
    </ul>
  );
}
