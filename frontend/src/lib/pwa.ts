import { useEffect, useState } from 'react';

// Installing the site to the home screen (a PWA). Android Chrome hands the page a "beforeinstallprompt" event it
// can trigger from its own button; iPhone has no such prompt, so there the app shows the Share -> Add to Home
// Screen steps instead.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Called once at startup (main.tsx): registers the service worker and starts listening for the install prompt. */
export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own "Install app" button instead of the browser's mini-bar
    deferredPrompt = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
  // Production only: the dev server's hot reload and a service worker don't mix.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // not installable-offline is not worth bothering anyone about
      });
    });
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

/** The Android app file (a Trusted Web Activity wrapper around the site, built with Bubblewrap and signed with
 * our own key). Served from /downloads/ with a download header (see vercel.json). */
export const APK_URL = '/downloads/anees.apk';

/** Starts the APK download straight away (no new tab, no page change). */
export function downloadApk() {
  const a = document.createElement('a');
  a.href = APK_URL;
  a.download = 'Anees.apk';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type InstallState = {
  /** Show an "Install app" entry at all: not already installed, and on a phone (or the browser offered a prompt). */
  available: boolean;
  /** iPhone/iPad: no install prompt exists, so show the manual steps. */
  ios: boolean;
  android: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** Opens the browser's own install dialog when it has offered one; resolves false if there is none (show the steps). */
  install: () => Promise<boolean>;
};

export function useInstallApp(): InstallState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const standalone = typeof window !== 'undefined' && isStandalone();
  const ios = typeof window !== 'undefined' && isIos();
  const phone = typeof window !== 'undefined' && (ios || isAndroid());

  return {
    available: !standalone && (phone || deferredPrompt !== null),
    ios,
    android: typeof window !== 'undefined' && isAndroid(),
    installed: standalone,
    install: async () => {
      if (!deferredPrompt) return false;
      const evt = deferredPrompt;
      deferredPrompt = null; // an event can only be used once
      await evt.prompt();
      await evt.userChoice.catch(() => undefined);
      notify();
      return true;
    },
  };
}
