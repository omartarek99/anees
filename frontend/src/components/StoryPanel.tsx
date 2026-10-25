import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'framer-motion';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { formatHms, useCountdown, type BattleStatus } from '../lib/battle';
import { MapRiddle } from './MapRiddle';
import { ChestReveal, RingArt, TreasureScene } from './StoryArt';
import { KEY_COUNT, MILESTONES, hasMilestone, keysEarned, nextMilestone, type Milestone } from '../map3d/story';
import type { ApiLevel } from '../map3d/schema';

// The story over the adventure map ("The Treasure of the Pearl of Light", rules in map3d/story.ts): a bar with the keys
// won so far and the items in the bag, a welcome from Anees the first time, and a window each time a big guardian
// (levels 15, 30, 45 and 50) is beaten and gives a new item. What the player has already seen is remembered in this browser.

type Tr = (key: string, vars?: Record<string, string | number>) => string;

type Seen = { intro: boolean; items: number[]; riddle?: boolean };
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

/** The picture for each item: a chest opens with half of the map (twice), the ring glows, and the final treasure scene. */
const ART: Record<Milestone['id'], ReactNode> = {
  mapA: <ChestReveal half="a" />,
  mapB: <ChestReveal half="b" />,
  ring: <RingArt />,
  shield: <TreasureScene />,
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
  const winning = !seen.intro ? null : MILESTONES.find((ms) => hasMilestone(levels, ms) && !seen.items.includes(ms.level));

  // right after the second half of the map is won and its window closed: the riddle that shows the way (not a level)
  const riddleDue = seen.intro && !winning && !seen.riddle && !riddleLater && seen.items.includes(30);

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
      {winning && (
        <Window
          art={ART[winning.id]}
          title={s('youGot', { item: itemName(winning) })}
          body={s(`line${winning.level}`)}
          button={s('gotIt')}
          onClose={() => save({ ...seen, items: [...seen.items, winning.level] })}
        />
      )}
    </>
  );
}
