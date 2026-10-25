import { useEffect, useState } from 'react';

// Installing the site to the home screen (a PWA) -- Android only. Android Chrome hands the page a
// "beforeinstallprompt" event that a button can trigger to open the browser's own install window. (iPhone offers
// websites no equivalent, so the install buttons are not shown there.)

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

export type InstallState = {
  /** Show the install entry in the app's menu: on Android (or when the browser offered a prompt), not yet installed. */
  available: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** iPhone/iPad: websites cannot offer an install there, so no install button is shown. */
  unsupported: boolean;
  /** Opens the browser's own install window when it has offered one; resolves false if there is none (show the steps). */
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
  const android = typeof window !== 'undefined' && isAndroid();

  return {
    available: !standalone && !ios && (android || deferredPrompt !== null),
    installed: standalone,
    unsupported: ios,
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
