import { useLanguage } from '../lib/language-context';

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;
  return (
    <div className="flex gap-sm" style={{ justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('admin.paginationPrev')}
      </button>
      <span className="muted" style={{ fontSize: 13 }}>
        {t('admin.paginationPage', { page: String(page), total: String(totalPages) })}
      </span>
      <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        {t('admin.paginationNext')}
      </button>
    </div>
  );
}
