import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'framer-motion';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { formatHms, useCountdown, type BattleStatus } from '../lib/battle';
import { MapRiddle } from './MapRiddle';
import { KeyChestReveal, KeyGiftArt, TreasureScene } from './StoryArt';
import { StoryArtView } from './StoryArtView';
import { KEY_COUNT, MILESTONES, guardiansBeaten, hasMilestone, keysEarned, nextMilestone, worldOf, type Milestone } from '../map3d/story';
import type { ApiLevel } from '../map3d/schema';

// The story over the adventure map ("The Treasure of the Pearl of Light", rules in map3d/story.ts): a bar with the keys
// won so far and the items in the bag, a welcome from Anees the first time, a gift box that opens on a golden key each time
// a guardian is beaten (levels 5, 10, ...), and, at every third key (levels 15, 30, 45), the three keys flying into the
// treasure chest, which opens on the next item; level 50 ends with the treasure scene. What the player has already seen
// is remembered in this browser.

type Tr = (key: string, vars?: Record<string, string | number>) => string;

type Seen = { intro: boolean; items: number[]; riddle?: boolean; /** guardian levels whose key gift was opened */ gifts?: number[] };
const storeKey = (userId: number) => `anees_story_${userId}`;
function readSeen(userId: number): Seen {
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (raw) return { intro: false, items: [], ...JSON.parse(raw) };
  } catch {
    // private mode: the windows just show again next time
  }
  return { intro: false, items: [] };
}
function writeSeen(userId: number, seen: Seen) {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(seen));
  } catch {
    // see readSeen
  }
}

function useStoryText(): Tr {
  const { t } = useLanguage();
  return (key, vars) => (t as unknown as Tr)(`story.${key}`, vars);
}

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const;

function Window({ art, title, body, button, onClose }: { art: ReactNode; title: string; body: string; button: string; onClose: () => void }) {
  return createPortal(
    <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <m.div
        className="modal-panel story-window"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ scale: 0.85, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={spring}
      >
        <div className="story-window-art">{art}</div>
        <h2>{title}</h2>
        <p>{body}</p>
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          {button}
        </button>
      </m.div>
    </m.div>,
    document.body
  );
}

/** The picture for each item (3D when the device can, else the flat drawing): the three keys open the chest and half of the map (twice) or the ring comes out; the last is the treasure scene. */
const ART: Record<Milestone['id'], ReactNode> = {
  mapA: <StoryArtView kind="chest" reward="mapA" fallback={<KeyChestReveal reward="mapA" />} />,
  mapB: <StoryArtView kind="chest" reward="mapB" fallback={<KeyChestReveal reward="mapB" />} />,
  ring: <StoryArtView kind="chest" reward="ring" fallback={<KeyChestReveal reward="ring" />} />,
  shield: <StoryArtView kind="final" fallback={<TreasureScene />} />,
};

export function StoryPanel({ levels, battle, onBattleOver }: { levels: readonly ApiLevel[]; battle: BattleStatus | null; onBattleOver: () => void }) {
  const { user } = useAuth();
  const s = useStoryText();
  const [seen, setSeen] = useState<Seen | null>(() => (user ? readSeen(user.id) : null));
  const [riddleLater, setRiddleLater] = useState(false);
  const waitLeft = useCountdown(battle?.lockedUntil ?? null, onBattleOver);
  if (!user || !seen) return null;

  const keys = keysEarned(levels);
  const next = nextMilestone(levels);
  const gifts = seen.gifts ?? [];
  // a guardian's key gift comes first; then, for levels 15, 30, 45 and 50, the chest / treasure window. A guardian whose item window
  // was already seen (an older save) does not give its gift again.
  const winning = !seen.intro ? null : MILESTONES.find((ms) => hasMilestone(levels, ms) && !seen.items.includes(ms.level) && gifts.includes(ms.level));
  const gift = !seen.intro || winning ? null : (guardiansBeaten(levels).find((g) => !gifts.includes(g) && !seen.items.includes(g)) ?? null);

  // right after the second half of the map is won and its window closed: the riddle that shows the way (not a level)
  const riddleDue = seen.intro && !winning && !gift && !seen.riddle && !riddleLater && seen.items.includes(30);

  function save(update: Seen) {
    setSeen(update);
    writeSeen(user!.id, update);
  }
  const more = (n: number) => (n === 1 ? s('more1') : n === 2 ? s('more2') : s('moreN', { n }));
  const itemName = (ms: Milestone) => s(ms.id);

  return (
    <>
      <section className="story-bar" aria-label={s('bag')}>
        <div className="story-keys">
          <b>
            <span aria-hidden="true">🔑</span> {s('keys')}
          </b>
          <span className="story-pips" role="img" aria-label={s('keysCount', { n: keys })}>
            {Array.from({ length: KEY_COUNT }, (_, i) => (
              <i key={i} className={i < keys ? 'is-on' : undefined} />
            ))}
          </span>
          <em>{s('keysCount', { n: keys })}</em>
        </div>
        <ul className="story-bag" aria-label={s('bag')}>
          {MILESTONES.map((ms) => (
            <li key={ms.id} className={hasMilestone(levels, ms) ? 'is-owned' : undefined} title={itemName(ms)}>
              <span aria-hidden="true">{ms.icon}</span>
              {itemName(ms)}
            </li>
          ))}
        </ul>
        {battle && (
          <p className={`story-tries${waitLeft !== null ? ' is-waiting' : ''}`}>
            <span aria-hidden="true">⚔️</span>{' '}
            {waitLeft !== null ? s('waitShort', { time: formatHms(waitLeft) }) : `${s('tries')}: ${s('triesLeft', { n: battle.triesLeft })}`}
          </p>
        )}
        <p className="story-next">{next ? s('nextItem', { more: more(next.keysLeft), item: itemName(next.milestone) }) : s('allDone')}</p>
      </section>

      {!seen.intro && <Window art={<span className="story-window-emoji">🦅</span>} title={s('introTitle')} body={s('introBody')} button={s('start')} onClose={() => save({ ...seen, intro: true })} />}
      {riddleDue && <MapRiddle onSolved={() => save({ ...seen, riddle: true })} onLater={() => setRiddleLater(true)} />}
      {gift !== null && (
        <Window
          key={`gift${gift}`}
          art={<StoryArtView kind="gift" fallback={<KeyGiftArt />} />}
          title={s('keyGiftTitle')}
          body={s('keyGiftBody', { world: s(`world${worldOf(gift)}`), n: gift / 5 })}
          button={s('takeKey')}
          onClose={() => save({ ...seen, gifts: [...gifts, gift] })}
        />
      )}
      {winning && (
        <Window
          key={`item${winning.level}`}
          art={ART[winning.id]}
          title={winning.id === 'shield' ? s('youGot', { item: itemName(winning) }) : s('chestTitle', { item: itemName(winning) })}
          body={s(`line${winning.level}`)}
          button={s('gotIt')}
          onClose={() => save({ ...seen, items: [...seen.items, winning.level] })}
        />
      )}
    </>
  );
}
