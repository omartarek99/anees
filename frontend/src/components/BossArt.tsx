import type { BossArtKey } from '../lib/boss-config';

export type BossArtProps = {
  primary: string;
  secondary: string;
  glow: string;
  enraged?: boolean;
};

/** A living, pulsing eye — glows and gently grows/shrinks on a loop, speeding up when enraged. */
function Eye({ cx, cy, r, color, enraged }: { cx: number; cy: number; r: number; color: string; enraged?: boolean }) {
  const dur = enraged ? '0.5s' : '2.2s';
  return (
    <circle cx={cx} cy={cy} r={r} fill={color}>
      <animate attributeName="r" values={`${r};${r * 1.3};${r}`} dur={dur} repeatCount="indefinite" />
      <animate attributeName="opacity" values="1;0.65;1" dur={dur} repeatCount="indefinite" />
    </circle>
  );
}

function Sandworm({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="sandwormGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#sandwormGlow)" />
      <ellipse cx="120" cy="205" rx="70" ry="14" fill="#00000030" />
      <path d="M70,210 Q60,150 90,120 Q60,100 75,60 Q90,20 130,15 Q170,10 185,45 Q150,45 140,70 Q175,75 180,110 Q145,105 135,130 Q165,140 160,170 Q125,160 110,185 Q95,205 70,210 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      {[
        [95, 185], [115, 150], [130, 105], [150, 65], [165, 40],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="12" ry="7" fill={secondary} opacity="0.6" />
      ))}
      <circle cx="150" cy="35" r="26" fill={secondary} />
      <path d="M126,30 Q150,10 178,25 Q168,40 150,42 Q135,42 126,30 Z" fill={primary} stroke={secondary} strokeWidth="3" />
      <Eye cx={140} cy={30} r={enraged ? 7 : 5} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <Eye cx={162} cy={28} r={enraged ? 7 : 5} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <path d="M118,42 L108,54 L124,52 Z M182,42 L192,54 L176,52 Z" fill="#f4f4f4" />
      <path d="M130,46 Q150,60 170,46 L166,52 Q150,64 134,52 Z" fill="#3a2419" opacity="0.8" />
    </svg>
  );
}

function ZubarahGuardian({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="zubarahGlow" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#zubarahGlow)" />
      <ellipse cx="120" cy="215" rx="75" ry="13" fill="#00000030" />
      <rect x="70" y="120" width="100" height="90" rx="14" fill={secondary} stroke="#2c0a15" strokeWidth="4" />
      <rect x="55" y="130" width="24" height="70" rx="8" fill={primary} stroke="#2c0a15" strokeWidth="3" />
      <rect x="161" y="130" width="24" height="70" rx="8" fill={primary} stroke="#2c0a15" strokeWidth="3" />
      <rect x="82" y="60" width="76" height="70" rx="10" fill={primary} stroke="#2c0a15" strokeWidth="4" />
      <path d="M78,60 Q120,25 162,60 L154,72 Q120,45 86,72 Z" fill={glow} stroke="#2c0a15" strokeWidth="3" />
      <Eye cx={105} cy={92} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <Eye cx={135} cy={92} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <path d="M100,112 Q120,124 140,112" stroke="#2c0a15" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="95" y="150" width="50" height="14" rx="4" fill={glow} opacity="0.85" />
      <rect x="95" y="172" width="50" height="10" rx="4" fill={glow} opacity="0.6" />
    </svg>
  );
}

function MarketDjinn({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="djinnGlow" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#djinnGlow)" />
      <path d="M120,215 Q60,190 70,140 Q78,105 60,80 Q90,90 100,120 Q95,80 115,55 Q108,90 122,115 Q135,75 165,65 Q145,95 148,125 Q170,100 190,105 Q165,120 160,150 Q175,150 180,140 Q175,190 120,215 Z" fill={primary} opacity="0.92" stroke={secondary} strokeWidth="3" />
      <circle cx="120" cy="70" r="34" fill={secondary} />
      <path d="M92,60 Q120,30 148,60 Q140,45 120,44 Q100,45 92,60 Z" fill={primary} stroke="#2c0a15" strokeWidth="3" />
      <Eye cx={110} cy={72} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <Eye cx={132} cy={72} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <path d="M105,90 Q120,98 135,90" stroke="#2c0a15" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="120" cy="42" r="7" fill={glow} />
      <ellipse cx="80" cy="150" rx="10" ry="20" fill={secondary} opacity="0.5" />
      <ellipse cx="160" cy="150" rx="10" ry="20" fill={secondary} opacity="0.5" />
    </svg>
  );
}

function SouqGuardian({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="souqGlow" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#souqGlow)" />
      <ellipse cx="120" cy="215" rx="78" ry="13" fill="#00000030" />
      <path d="M65,205 L75,110 Q120,80 165,110 L175,205 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      <circle cx="120" cy="80" r="38" fill={secondary} />
      <path d="M85,68 Q120,40 155,68 Q145,50 120,49 Q95,50 85,68 Z" fill={glow} stroke="#2c0a15" strokeWidth="3" />
      <Eye cx={107} cy={85} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#fff3c4'} enraged={enraged} />
      <Eye cx={133} cy={85} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#fff3c4'} enraged={enraged} />
      <path d="M60,150 L40,120 M180,150 L200,120" stroke={secondary} strokeWidth="8" strokeLinecap="round" />
      <circle cx="38" cy="112" r="10" fill={glow} />
      <circle cx="202" cy="112" r="10" fill={glow} />
      <path d="M40,112 Q120,95 200,112" stroke={secondary} strokeWidth="3" fill="none" opacity="0.7" />
      <rect x="100" y="140" width="40" height="55" rx="6" fill={secondary} opacity="0.8" />
    </svg>
  );
}

function ReefSerpent({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="reefGlow" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#reefGlow)" />
      <path d="M60,190 Q40,150 70,130 Q40,120 55,90 Q70,65 105,70 Q80,50 95,25 Q125,35 130,65 Q150,45 175,55 Q160,75 145,85 Q180,90 185,120 Q155,115 140,130 Q175,140 165,170 Q135,155 118,165 Q100,190 60,190 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      {[[100, 80], [130, 100], [150, 130], [130, 160]].map(([x, y], i) => (
        <path key={i} d={`M${x},${y} l16,-10 l-4,16 z`} fill={glow} opacity="0.55" />
      ))}
      <circle cx="95" cy="35" r="24" fill={secondary} />
      <path d="M75,25 Q95,5 118,22 Q108,32 95,33 Q83,33 75,25 Z" fill={primary} stroke="#123047" strokeWidth="2.5" />
      <Eye cx={86} cy={32} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : '#eaffff'} enraged={enraged} />
      <Eye cx={104} cy={32} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : '#eaffff'} enraged={enraged} />
      <path d="M78,45 Q95,52 112,45" stroke="#123047" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CornicheGuardian({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="cornicheBossGlow" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#cornicheBossGlow)" />
      <ellipse cx="120" cy="215" rx="80" ry="13" fill="#00000030" />
      <path d="M70,205 L60,120 Q120,85 180,120 L170,205 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      <path d="M60,120 Q45,110 55,95 Q70,105 72,122 Z M180,120 Q195,110 185,95 Q170,105 168,122 Z" fill={glow} opacity="0.7" />
      <circle cx="120" cy="75" r="36" fill={secondary} />
      <path d="M86,65 Q120,35 154,65 Q144,48 120,47 Q96,48 86,65 Z" fill={glow} stroke="#0d2333" strokeWidth="3" />
      <Eye cx={108} cy={80} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#eaffff'} enraged={enraged} />
      <Eye cx={132} cy={80} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#eaffff'} enraged={enraged} />
      <path d="M100,100 Q120,110 140,100" stroke="#0d2333" strokeWidth="4" fill="none" strokeLinecap="round" />
      <line x1="120" y1="130" x2="120" y2="195" stroke={secondary} strokeWidth="7" />
      <path d="M100,140 L140,140 L120,115 Z" fill={secondary} />
    </svg>
  );
}

function CometGolem({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="cometGlow" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.6" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#cometGlow)" />
      <ellipse cx="120" cy="215" rx="76" ry="13" fill="#00000030" />
      <path d="M75,205 L65,130 L95,105 L80,80 L115,75 L110,50 L145,60 L150,90 L180,95 L165,130 L185,150 L150,165 L155,205 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      <circle cx="120" cy="120" r={enraged ? 26 : 22} fill={glow} opacity="0.9" />
      <circle cx="120" cy="120" r="12" fill="#ffffff" opacity="0.9" />
      <Eye cx={95} cy={70} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <Eye cx={140} cy={70} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <path d="M100,88 Q120,96 140,88" stroke={secondary} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ObservatoryGuardian({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="obsBossGlow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#obsBossGlow)" />
      <path d="M120,215 Q65,205 70,150 Q60,100 90,70 Q75,55 90,35 Q110,50 120,45 Q130,50 150,35 Q165,55 150,70 Q180,100 170,150 Q175,205 120,215 Z" fill={primary} stroke={secondary} strokeWidth="3" opacity="0.95" />
      <circle cx="120" cy="75" r="30" fill={secondary} />
      <Eye cx={109} cy={80} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : '#fff3c4'} enraged={enraged} />
      <Eye cx={131} cy={80} r={enraged ? 8 : 6} color={enraged ? '#ff5252' : '#fff3c4'} enraged={enraged} />
      <path d="M100,95 Q120,102 140,95" stroke="#12102b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {[[75, 120], [95, 160], [120, 175], [145, 160], [165, 120]].map(([x, y], i) => (
        <path
          key={i}
          d="M0,-6 L1.7,-1.8 L6,-1.8 L2.6,0.7 L3.9,5 L0,2.5 L-3.9,5 L-2.6,0.7 L-6,-1.8 L-1.7,-1.8 Z"
          fill={glow}
          opacity="0.85"
          transform={`translate(${x} ${y}) scale(1.3)`}
        />
      ))}
    </svg>
  );
}

function StoneColossus({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="colossusGlow" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.5" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="110" fill="url(#colossusGlow)" />
      <ellipse cx="120" cy="215" rx="85" ry="14" fill="#00000030" />
      <path d="M50,205 L45,140 L70,110 L60,90 L90,95 L95,60 L125,70 L120,50 L150,60 L155,95 L185,90 L175,115 L195,140 L190,205 Z" fill={primary} stroke={secondary} strokeWidth="4" />
      <rect x="95" y="150" width="50" height="55" rx="8" fill={secondary} opacity="0.7" />
      <Eye cx={100} cy={105} r={enraged ? 10 : 8} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <Eye cx={140} cy={105} r={enraged ? 10 : 8} color={enraged ? '#ff5252' : glow} enraged={enraged} />
      <path d="M92,125 Q120,135 148,125" stroke="#2b3324" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M40,140 L20,160 M200,140 L220,160" stroke={secondary} strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

function FalconGuardian({ primary, secondary, glow, enraged }: BossArtProps) {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%">
      <defs>
        <radialGradient id="falconBossGlow" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.6" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="112" fill="url(#falconBossGlow)" />
      <path d="M120,205 Q60,190 30,140 Q60,150 85,135 Q45,120 40,80 Q75,100 95,110 Q70,70 85,35 Q105,65 115,95 L120,60 L125,95 Q135,65 155,35 Q170,70 145,110 Q165,100 200,80 Q195,120 155,135 Q180,150 210,140 Q180,190 120,205 Z" fill={primary} stroke={secondary} strokeWidth="3" />
      <circle cx="120" cy="88" r="32" fill={secondary} />
      <path d="M120,60 L108,90 L132,90 Z" fill={glow} stroke="#5c0d20" strokeWidth="2" />
      <Eye cx={110} cy={90} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <Eye cx={130} cy={90} r={enraged ? 9 : 7} color={enraged ? '#ff5252' : '#ffe9a8'} enraged={enraged} />
      <path d="M100,60 Q120,50 140,60" stroke={glow} strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="98" y="155" width="44" height="14" rx="4" fill={glow} opacity="0.9" />
    </svg>
  );
}

const REGISTRY: Record<BossArtKey, (props: BossArtProps) => JSX.Element> = {
  sandworm: Sandworm,
  zubarahGuardian: ZubarahGuardian,
  marketDjinn: MarketDjinn,
  souqGuardian: SouqGuardian,
  reefSerpent: ReefSerpent,
  cornicheGuardian: CornicheGuardian,
  cometGolem: CometGolem,
  observatoryGuardian: ObservatoryGuardian,
  stoneColossus: StoneColossus,
  falconGuardian: FalconGuardian,
};

export function BossArt({ artKey, ...props }: { artKey: BossArtKey } & BossArtProps) {
  const Art = REGISTRY[artKey];
  return <Art {...props} />;
}
