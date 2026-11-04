import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { setRankPerksReleased, useRankPerksReleased } from '../lib/popupGate';

// A student's whole site takes the colour of their rank -- the glow behind the glass and the brand colour of buttons, links and
// highlights: this puts the rank on <html data-rank> (theme.css, "Rank aura" does the rest), plus how far through the division they
// are (--rank-progress), and tints the phone's browser bar to match. A new student starts with the site's own colours ("Normal", as on
// the sign-in page) and the site changes to a rank's colour by itself the moment they reach it -- Iron is the rank they start in, so it
// is a colour they can pick but is not applied for them. Teachers, admins and visitors keep the site's own colours. The last rank is remembered, so a returning student never sees the default colours flash before the profile loads.
const KEY = 'anees_rank';
const root = document.documentElement;
const paintBar = () => {
  const c = getComputedStyle(root).getPropertyValue('--rk-btn-b').trim();
  if (c) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
};
try { const r = localStorage.getItem(KEY); if (r) { root.dataset.rank = r; paintBar(); } } catch { /* storage blocked: the colours just wait for the profile */ }

export function RankAura() {
  const { user, loading } = useAuth();
  const released = useRankPerksReleased();
  const student = user?.role === 'student' ? user : null;
  // After a rank drop the page keeps the colour of the rank the student fell from until the demotion pop-up (RankDemotionPopup) lets go of it, so the
  // colour changes under the pop-up's own sweep and not before it opens. Should the pop-up never get to open, it lets go on its own after a while.
  const drop = student?.rankDrop ?? null;
  const held = drop !== null && !released;
  const tier = held ? drop.from : student?.rankTier ?? null;
  const aura = held ? drop.auraBefore : student?.auraRank;
  // A student can pick the colour of any rank they have reached (profile > Page colours); a lower rank than their own counts as done.
  const picked = aura && aura !== tier?.key ? aura : null;
  const auto = tier && tier.key !== 'iron' ? tier.key : null; // still Iron: the site's own colours until the first new rank
  const chosen = tier && aura === tier.key ? tier.key : picked;
  const key = chosen === 'normal' ? null : chosen ?? auto;
  const progress = picked ? 1 : tier?.progress ?? 0;

  useEffect(() => {
    if (loading) return;
    if (key) { root.dataset.rank = key; root.style.setProperty('--rank-progress', progress.toFixed(2)); }
    else { delete root.dataset.rank; root.style.removeProperty('--rank-progress'); }
    paintBar();
    try { if (key) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  }, [key, progress, loading]);

  useEffect(() => {
    if (!held) return;
    const id = setTimeout(() => setRankPerksReleased(true), 8000);
    return () => clearTimeout(id);
  }, [held]);
  useEffect(() => {
    if (!drop) setRankPerksReleased(false); // ready for the next drop
  }, [drop]);

  return null;
}
