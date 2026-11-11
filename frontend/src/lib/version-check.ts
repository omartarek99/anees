import { reloadOnceForNewVersion } from '../components/PageBoundary';

// Is this tab running the newest version of the site? Every build names its main script after its content (/assets/index-<hash>.js), and the server's
// front page always names the newest one. If they differ the tab is out of date (the site was updated since it was opened), and its next page would
// ask for files that no longer exist -- the "page could not load" error that went away on a refresh. So: ask for the front page without the cache, and
// if it names a different main script, reload once (at most one reload a minute, see reloadOnceForNewVersion). Checked when the site opens, right after
// sign-in, and when a tab that was in the background comes back to the front.
const MAIN = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

function runningMain(): string | null {
  for (const el of Array.from(document.getElementsByTagName('script'))) {
    const m = MAIN.exec(el.src);
    if (m) return m[0];
  }
  return null;
}

let checking = false;
export async function reloadIfOutdated(): Promise<void> {
  if (import.meta.env.DEV || checking) return;
  const mine = runningMain();
  if (!mine) return;
  checking = true;
  try {
    const res = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
    if (!res.ok) return;
    const latest = MAIN.exec(await res.text());
    if (latest && latest[0] !== mine) reloadOnceForNewVersion();
  } catch {
    // offline or a blip: nothing to do
  } finally {
    checking = false;
  }
}

/** Starts the checks that run by themselves: once when the site has opened, and whenever a hidden tab becomes visible again after a few minutes. */
export function startVersionChecks(): void {
  let hiddenAt = 0;
  window.addEventListener('load', () => window.setTimeout(() => void reloadIfOutdated(), 1500), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) void reloadIfOutdated();
  });
}
