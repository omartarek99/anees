import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { RANK_LADDER, rankName, type RankKey } from '../lib/medalLevels';
import { RANK_FRAMES } from '../lib/frames';
import { perksOf } from '../lib/rankPerks';
import { setRankPerksReleased } from '../lib/popupGate';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';

// When a student's points fall below the minimum of their rank, this takes over the page and plays it out: the old badge shakes and drops away, the new
// rank's colours sweep in and its badge rises, then the words and the perks that moved down with the rank (the picture frame, the page colour) change
// where the student can see them. The scene is a handful of phases (data-phase 1-5, 6 on the way out) flipped by timers; every movement is a CSS
// transform or opacity on the compositor (theme.css, "Rank lowered"), so there is no animation loop in JS and nothing blurs or re-lays-out the page.
// Opened from App.tsx while the signed-in user has a rankDrop (the server keeps it until it is dismissed here).
const STEPS = [60, 650, 1250, 2100, 2900]; // ms after the pictures are ready: phases 1..5
const SETTLE = 40; // ms between phases for someone who asked for reduced motion: straight to the end
const LEAVE_MS = 350;

const dark = (c: string) => `color-mix(in srgb, ${c} 42%, #07040f)`;
const ball = (key: RankKey | null) => {
  const r = RANK_LADDER.find((x) => x.key === key);
  // null = the site's own colours (maroon, gold and violet orbs, as the Page colours picker draws "Normal")
  return r ? `radial-gradient(circle at 30% 24%, color-mix(in srgb, ${r.color} 55%, #fff), ${r.color} 52%, ${r.colorDark})` : 'radial-gradient(circle at 30% 24%, #f0a83a, #d43e6b 52%, #645ceb)';
};

export function RankDemotionPopup() {
  const { user, dismissRankDrop } = useAuth();
  const { t, lang } = useLanguage();

  // Frozen when the pop-up opens: the drop flag goes away the moment it is dismissed, but the pop-up still fades out after that.
  const [info] = useState(() => {
    const drop = user!.rankDrop!;
    const before = perksOf(drop.from.key, drop.auraBefore);
    const after = perksOf(user!.rankTier.key, user!.auraRank);
    return {
      from: drop.from,
      to: user!.rankTier,
      before,
      after,
      need: Math.max(1, drop.from.minXp - user!.totalXp),
      avatarKey: user!.avatarKey,
      size: Math.round(Math.min(220, window.innerWidth * 0.55, window.innerHeight * 0.26)),
    };
  });
  const { from, to, before, after } = info;
  const [pic, setPic] = useState<{ key: string; url: string | null }>({ key: info.avatarKey, url: null });
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);

  // Wait for the pictures (badges, frames, the student's own) so the scene never pops in half drawn; a slow network only delays it by a moment.
  useEffect(() => {
    let alive = true;
    const decode = (src: string) => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => undefined);
    };
    const frames = [...new Set([before.frame, after.frame])].map((k) => decode(`/images/frames/${k}.png`));
    const badges = [from.key, to.key].map((k) => decode(`/images/ranks/${k}.webp?v=6`));
    const me = api
      .get<{ profile: { avatarKey?: string; avatarUrl?: string | null } }>('/users/me')
      .then(async (d) => {
        if (d.profile.avatarUrl) await decode(d.profile.avatarUrl);
        if (alive) setPic({ key: d.profile.avatarKey ?? info.avatarKey, url: d.profile.avatarUrl ?? null });
      })
      .catch(() => undefined);
    const go = () => alive && setReady(true);
    Promise.all([...frames, ...badges, me]).then(go);
    const slow = setTimeout(go, 1500);
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = STEPS.map((ms, i) =>
      setTimeout(() => {
        setPhase(i + 1);
        // the page behind changes colour now, under the pop-up's own sweep (RankAura keeps the old colour until then)
        if (i === 2) setRankPerksReleased(true);
      }, calm ? SETTLE * (i + 1) : ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  function leave() {
    if (leaving.current || phase < 4) return;
    leaving.current = true;
    setPhase(6);
    setTimeout(() => void dismissRankDrop(), LEAVE_MS);
  }
  useEscapeToClose(leave, phase >= 4);

  // "Silver 1" never breaks between the name and its number
  const fromName = pickText(lang, from.name, from.nameAr).replace(' ', ' ');
  const toName = pickText(lang, to.name, to.nameAr).replace(' ', ' ');
  const frameMoved = before.frame !== after.frame;
  const colourMoved = before.colour !== after.colour;
  const colourName = (k: RankKey | null) => (k ? rankName(k, lang) : t('profile.auraNormal'));
  const style = { '--rd-old': dark(from.colorDark), '--rd-new': dark(to.colorDark), '--rd-old-glow': from.color, '--rd-new-glow': to.color } as CSSProperties;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={`rank-drop${Array.from({ length: phase }, (_, i) => ` p${i + 1}`).join('')}`}
      style={style}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rank-drop-title"
      aria-describedby="rank-drop-body"
    >
      <div className="rank-drop-bg-new" aria-hidden />
      <div className="rank-drop-content">
        <div className="rank-drop-stage" style={{ inlineSize: info.size, blockSize: info.size }} aria-hidden>
          <span className="rank-drop-glow rd-glow-old" />
          <span className="rank-drop-glow rd-glow-new" />
          <span className="rank-drop-ring" />
          <span className="rank-drop-badge rd-old">
            <RankBadge tier={from} size={info.size} showName={false} />
          </span>
          <span className="rank-drop-badge rd-new">
            <RankBadge tier={to} size={info.size} showName={false} />
          </span>
        </div>

        <div className="rd-text">
          <h2 id="rank-drop-title">{t('rankDrop.title', { to: toName })}</h2>
          <p id="rank-drop-body">{t('rankDrop.body', { min: from.minXp, from: fromName })}</p>
        </div>

        <div className="rd-perks">
          {(frameMoved || colourMoved) && <p className="rd-perks-title">{t('rankDrop.perksTitle')}</p>}
          {frameMoved && (
            <div className="rd-perk">
              <FrameSwap from={before.frame} to={after.frame} swapped={phase >= 5} avatarKey={pic.key} photoUrl={pic.url} />
              <p>
                <strong>{t('rankDrop.perkFrame')}</strong>
                <span>
                  {rankName(before.frame, lang)} <i className="rd-arrow" aria-hidden>→</i> {rankName(after.frame, lang)}
                </span>
              </p>
            </div>
          )}
          {colourMoved && (
            <div className="rd-perk">
              <span className="rd-balls" aria-hidden>
                <span className="rd-ball rd-ball-old" style={{ background: ball(before.colour) }} />
                <span className="rd-ball rd-ball-new" style={{ background: ball(after.colour) }} />
              </span>
              <p>
                <strong>{t('rankDrop.perkColour')}</strong>
                <span>
                  {colourName(before.colour)} <i className="rd-arrow" aria-hidden>→</i> {colourName(after.colour)}
                </span>
              </p>
            </div>
          )}
          {!frameMoved && !colourMoved && <p className="rd-perks-same">{t('rankDrop.perksSame')}</p>}
        </div>

        <p className="rd-comeback">{t('rankDrop.comeback', { xp: info.need, from: fromName })}</p>
        <button type="button" className="btn btn-primary btn-block rd-btn" onClick={leave} disabled={phase < 4}>
          {t('rankDrop.button')}
        </button>
      </div>
    </div>
  );
}

/** The student's picture with the frame of the rank they fell from fading into the frame of the one they are in. The picture stays put: both frames are
 *  drawn at the size that puts their round window exactly on it. */
function FrameSwap({ from, to, swapped, avatarKey, photoUrl }: { from: string; to: string; swapped: boolean; avatarKey: string; photoUrl: string | null }) {
  const W = 124;
  const ratio = (k: string) => RANK_FRAMES[k as keyof typeof RANK_FRAMES]?.ratio ?? 0.6;
  const hole = Math.round(W * Math.min(ratio(from), ratio(to)));
  const frame = (k: string) => Math.round(hole / ratio(k));
  return (
    <span className="rd-frames" style={{ inlineSize: W, blockSize: W }} aria-hidden>
      <span className="rd-pic" style={{ inlineSize: hole, blockSize: hole }}>
        <Avatar avatarKey={avatarKey} photoUrl={photoUrl} size={Math.round(hole * 1.06)} />
      </span>
      <img className={`rd-frame rd-frame-old${swapped ? ' is-gone' : ''}`} src={`/images/frames/${from}.png`} width={frame(from)} height={frame(from)} alt="" decoding="async" />
      <img className={`rd-frame rd-frame-new${swapped ? ' is-here' : ''}`} src={`/images/frames/${to}.png`} width={frame(to)} height={frame(to)} alt="" decoding="async" />
    </span>
  );
}
