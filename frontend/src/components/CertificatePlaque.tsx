import { useRef, type CSSProperties, type PointerEvent } from 'react';
import type { CertificateType } from '../lib/certificateTiers';

// The three certificate award plaques: Bronze (the copper clockwork owl), Gold (the armillary sphere around a golden sun) and Platinum
// (the atom over silver crystals). A real framed plaque that leans toward the pointer: it tilts in 3D, a sheen of light follows the
// finger, and it floats gently when left alone. `static` gives the plain picture for small spots.

export const PLAQUE_IMAGE: Record<CertificateType, string> = {
  bronze: '/images/certificates/bronze.webp',
  silver: '/images/certificates/platinum.webp',
  gold: '/images/certificates/gold.webp',
  platinum: '/images/certificates/platinum.webp',
};

// The pictures are 574 x 786.
const RATIO = 786 / 574;

export function CertificatePlaque({ tier, label, width = 220, interactive = true }: { tier: CertificateType; label: string; width?: number; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  function move(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; // 0..1
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - y) * 22).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  }
  function leave() {
    const el = ref.current;
    if (!el) return;
    for (const v of ['--rx', '--ry']) el.style.setProperty(v, '0deg');
    el.style.setProperty('--gx', '50%');
    el.style.setProperty('--gy', '30%');
  }

  const style = { width, height: Math.round(width * RATIO) } as CSSProperties;
  if (!interactive) {
    return <img src={PLAQUE_IMAGE[tier]} alt={label} width={width} height={style.height as number} className="cert-plaque-flat" loading="lazy" decoding="async" />;
  }
  return (
    <div className="cert-plaque-stage" style={{ width, height: style.height }}>
      <div ref={ref} className="cert-plaque" onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave} role="img" aria-label={label}>
        <img src={PLAQUE_IMAGE[tier]} alt="" draggable={false} />
        <span className="cert-plaque-glare" aria-hidden />
      </div>
    </div>
  );
}
