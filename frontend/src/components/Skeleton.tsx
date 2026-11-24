/** Grey outlines of the content that is loading, in place of a bare spinner: rows of a list, a profile card, or the reel frame. */
export function Skeleton({ kind = 'list', rows = 5 }: { kind?: 'list' | 'profile' | 'reel' | 'block'; rows?: number }) {
  if (kind === 'reel') return <span className="skeleton skeleton-reel" aria-hidden="true" style={{ blockSize: '100vh' }} />;
  return (
    <div className="skeleton-page" aria-busy="true" aria-live="polite">
      {kind === 'profile' && (
        <div className="card flex gap-md" style={{ alignItems: 'center' }}>
          <span className="skeleton" style={{ inlineSize: 84, blockSize: 84, borderRadius: '50%' }} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <span className="skeleton" style={{ inlineSize: '45%', blockSize: 20 }} />
            <span className="skeleton" style={{ inlineSize: '30%', blockSize: 14 }} />
          </div>
        </div>
      )}
      {kind === 'block' ? (
        <span className="skeleton" style={{ blockSize: 360 }} />
      ) : (
        <div className="card stack" style={{ gap: 12 }}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex gap-md" style={{ alignItems: 'center' }}>
              <span className="skeleton" style={{ inlineSize: 36, blockSize: 36, borderRadius: '50%', flexShrink: 0 }} />
              <span className="skeleton" style={{ inlineSize: `${70 - ((i * 13) % 30)}%`, blockSize: 14 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
