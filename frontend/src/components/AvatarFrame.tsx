import type { ReactNode } from 'react';
import { CERT_PALETTES, type CertificateType } from '../lib/certificateTiers';

// Gear teeth for bronze -- echoes the mechanical/gear seal used for bronze student
// certificates, spinning slowly around the frame.
function BronzeRing({ light, dark }: { light: string; dark: string }) {
  const teeth = Array.from({ length: 12 }, (_, i) => (
    <rect key={i} x="47" y="1.5" width="6" height="10" rx="1.5" fill={dark} transform={`rotate(${(360 / 12) * i} 50 50)`} />
  ));
  return (
    <g className="avatar-frame-spin">
      <circle cx="50" cy="50" r="45" fill="none" stroke={light} strokeWidth="2" opacity="0.55" />
      {teeth}
    </g>
  );
}

// Sunburst rays for gold -- echoes the orrery/sun seal used for gold student
// certificates, spinning with a gentle pulsing glow.
function GoldRing({ light, dark }: { light: string; dark: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => (
    <rect key={i} x="48.5" y="0.5" width="3" height="11" rx="1.5" fill={light} transform={`rotate(${(360 / 16) * i} 50 50)`} />
  ));
  return (
    <>
      <circle className="avatar-frame-pulse" cx="50" cy="50" r="47" fill="none" stroke={light} strokeWidth="1.5" opacity="0.5" />
      <g className="avatar-frame-spin">
        <circle cx="50" cy="50" r="44" fill="none" stroke={dark} strokeWidth="1.5" strokeDasharray="2 5" opacity="0.7" />
        {rays}
      </g>
    </>
  );
}

// Three orbit rings for platinum -- echoes the atom seal used for platinum student
// certificates, each ring spinning at its own speed/direction for a restless, sci-fi feel.
function PlatinumRing({ light, dark }: { light: string; dark: string }) {
  return (
    <>
      <g transform="rotate(0 50 50)">
        <ellipse className="avatar-frame-orbit-a" cx="50" cy="50" rx="46" ry="17" fill="none" stroke={light} strokeWidth="2" />
      </g>
      <g transform="rotate(60 50 50)">
        <ellipse className="avatar-frame-orbit-b" cx="50" cy="50" rx="46" ry="17" fill="none" stroke={dark} strokeWidth="2" />
      </g>
      <g transform="rotate(120 50 50)">
        <ellipse className="avatar-frame-orbit-c" cx="50" cy="50" rx="46" ry="17" fill="none" stroke={light} strokeWidth="2" />
      </g>
    </>
  );
}

/** Wraps an <Avatar> with an animated, tier-colored ring -- awarded the moment a student
 * or teacher has at least one certificate of that tier (see ProfilePage.tsx's `highestTier`
 * pick). The pattern itself echoes that tier's certificate seal (gear / sunburst / atom
 * orbits, see AdminCertificatesPanel's CERT_PALETTES) so earning a certificate visibly
 * "unlocks" a matching decoration on the profile photo everyone sees. */
export function AvatarFrame({ tier, size, children }: { tier: CertificateType; size: number; children: ReactNode }) {
  const palette = CERT_PALETTES[tier];
  const frameSize = Math.round(size * 1.38);
  return (
    <div
      className="avatar-frame"
      style={{ width: frameSize, height: frameSize, flexShrink: 0 }}
    >
      <svg viewBox="0 0 100 100" width={frameSize} height={frameSize} className="avatar-frame-svg" aria-hidden>
        {tier === 'bronze' && <BronzeRing light={palette.light} dark={palette.dark} />}
        {tier === 'gold' && <GoldRing light={palette.light} dark={palette.dark} />}
        {tier === 'platinum' && <PlatinumRing light={palette.light} dark={palette.dark} />}
      </svg>
      <div className="avatar-frame-content">{children}</div>
    </div>
  );
}
