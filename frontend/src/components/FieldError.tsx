/** The red message that sits right under a field that is empty or wrong (see also lib/inline-validation.ts, which does the same for every plain form). */
export function FieldError({ children, id }: { children: string; id?: string }) {
  return (
    <div className="field-error" role="alert" id={id}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
