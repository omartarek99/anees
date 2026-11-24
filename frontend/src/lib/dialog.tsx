import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from './language-context';

// The site's own "Are you sure?" and "Why?" dialogs, in place of the browser's window.confirm / window.prompt (which ignore the site's
// language and look). `await confirm(...)` is true for yes; `await ask(...)` is the text typed, or null when cancelled.
type ConfirmOpts = { message: string; confirmLabel?: string; danger?: boolean };
type AskOpts = { message: string; placeholder?: string; confirmLabel?: string; required?: boolean };
type Open = (ConfirmOpts & { kind: 'confirm' }) | (AskOpts & { kind: 'ask' });

const Ctx = createContext<{ confirm: (o: ConfirmOpts) => Promise<boolean>; ask: (o: AskOpts) => Promise<string | null> } | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<Open | null>(null);
  const [text, setText] = useState('');
  const settle = useRef<(v: unknown) => void>(() => {});
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const show = useCallback(<T,>(o: Open) => {
    setText('');
    setOpen(o);
    return new Promise<T>((resolve) => (settle.current = resolve as (v: unknown) => void));
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => show<boolean>({ ...o, kind: 'confirm' }), [show]);
  const ask = useCallback((o: AskOpts) => show<string | null>({ ...o, kind: 'ask' }), [show]);

  const close = (value: unknown) => {
    setOpen(null);
    settle.current(value);
  };
  const cancel = () => close(open?.kind === 'ask' ? null : false);
  const accept = () => close(open?.kind === 'ask' ? text.trim() : true);

  useEffect(() => {
    if (!open) return;
    (open.kind === 'ask' ? inputRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const blocked = open?.kind === 'ask' && open.required !== false && !text.trim();
  return (
    <Ctx.Provider value={{ confirm, ask }}>
      {children}
      {open &&
        createPortal(
          <div className="modal-overlay" onClick={cancel}>
            <div className="modal-panel stack site-dialog" role="alertdialog" aria-modal="true" aria-labelledby="site-dialog-msg" onClick={(e) => e.stopPropagation()}>
              <p id="site-dialog-msg" style={{ margin: 0, fontWeight: 700 }}>
                {open.message}
              </p>
              {open.kind === 'ask' && (
                <textarea ref={inputRef} rows={3} maxLength={300} value={text} placeholder={open.placeholder} onChange={(e) => setText(e.target.value)} aria-labelledby="site-dialog-msg" />
              )}
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={cancel}>
                  {t('common.cancel')}
                </button>
                <button
                  ref={okRef}
                  type="button"
                  className={`btn ${open.kind === 'confirm' && open.danger ? 'btn-danger' : 'btn-primary'}`}
                  disabled={blocked}
                  onClick={accept}
                >
                  {open.confirmLabel ?? t('common.confirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}

export function useDialog() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDialog outside DialogProvider');
  return c;
}
