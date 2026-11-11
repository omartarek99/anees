import { Component, type ReactNode } from 'react';

// Wraps the page area. The commonest failure here is a page's script file that could not be downloaded: the site was updated while the tab was open
// (the old file names are gone), or the connection dropped for a moment. A reload fixes it, so that is done once automatically instead of showing an
// error; only if the reload does not help (or it is some other error) is the message shown, with a Reload button.
const KEY = 'anees_chunk_reload_at';
const CHUNK_ERROR = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|failed to fetch dynamically/i;

/** Reloads the page once per minute at most (so a real, lasting problem cannot loop). Returns whether it reloaded. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export class PageBoundary extends Component<{ fallback: (reload: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (CHUNK_ERROR.test(message)) reloadOnceForNewVersion();
  }

  render() {
    return this.state.failed ? this.props.fallback(() => window.location.reload()) : this.props.children;
  }
}
