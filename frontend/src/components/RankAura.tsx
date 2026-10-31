import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';

// A student's whole site takes the colour of their rank -- the glow behind the glass and the brand colour of buttons, links and
// highlights: this puts the rank on <html data-rank> (theme.css, "Rank aura" does the rest), plus how far through the division they
// are (--rank-progress), and tints the phone's browser bar to match. Only students have one; teachers, admins and visitors keep the
// site's own colours. The last rank is remembered, so a returning student never sees the default colours flash before the profile loads.
const KEY = 'anees_rank';
const root = document.documentElement;
const paintBar = () => {
  const c = getComputedStyle(root).getPropertyValue('--rk-btn-b').trim();
  if (c) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
};
try { const r = localStorage.getItem(KEY); if (r) { root.dataset.rank = r; paintBar(); } } catch { /* storage blocked: the colours just wait for the profile */ }

export function RankAura() {
  const { user, loading } = useAuth();
  const tier = user?.role === 'student' ? user.rankTier : null;
  // A student can pick the colour of any rank they have reached (profile > Page colours); a lower rank than their own counts as done.
  const picked = user?.role === 'student' && user.auraRank && user.auraRank !== tier?.key ? user.auraRank : null;
  const key = picked ?? tier?.key ?? null;
  const progress = picked ? 1 : tier?.progress ?? 0;

  useEffect(() => {
    if (loading) return;
    if (key) { root.dataset.rank = key; root.style.setProperty('--rank-progress', progress.toFixed(2)); }
    else { delete root.dataset.rank; root.style.removeProperty('--rank-progress'); }
    paintBar();
    try { if (key) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  }, [key, progress, loading]);

  return null;
}
