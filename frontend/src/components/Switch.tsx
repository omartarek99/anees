import type { ReactNode } from 'react';
import { useLanguage } from '../lib/language-context';
import { useTheme } from '../lib/theme-context';
import '../styles/switch.css';

// The switches from the "Toggle Buttons" Figma file: the Sky switch (moon <-> sun) for light/dark
// and the 3D switch for the language. Graphic only (aria-hidden) so it can sit inside any button.
const DIR = '/images/switch';

// Stars in the dark sky, as Figma exports them: [inset, rotated box width, height, rotation, file].
const STARS = [
  ['26.99% 39.32% 56.06% 52.82%', 'hypot(85.5504cqw, 15.5364cqh)', 'hypot(-14.4496cqw, 84.4636cqh)', 10, 'star-1'],
  ['13.33% 53.58% 82.54% 44.5%', 'hypot(85.5504cqw, 15.5364cqh)', 'hypot(-14.4496cqw, 84.4636cqh)', 10, 'star-5'],
  ['35.44% 25.74% 54.13% 69.43%', 'hypot(84.1257cqw, -17.047cqh)', 'hypot(15.8743cqw, 82.953cqh)', -11.14, 'star-2'],
  ['23% 16.8% 71.16% 80.5%', 'hypot(84.1257cqw, -17.047cqh)', 'hypot(15.8743cqw, 82.953cqh)', -11.14, 'star-3'],
  ['8.89% 32.49% 82.21% 63.5%', 'hypot(53.7704cqw, 48.3557cqh)', 'hypot(-46.2296cqw, 51.6443cqh)', 41.9, 'star-4'],
] as const;

// Clouds in the light sky: [inset, file].
const CLOUDS = [
  ['20% 71.5% 56.67% 11.5%', 'cloud-1'],
  ['13.33% 48% 74.31% 43%', 'cloud-2'],
  ['33.33% 48.5% 47.45% 37.5%', 'cloud-3'],
] as const;

/** `on` = knob at the right: the sun (light) for `sky`, the green state for `flat`. */
export function Switch({ kind, on, children }: { kind: 'sky' | 'flat'; on: boolean; children?: ReactNode }) {
  const [offKnob, onKnob] = kind === 'sky' ? ['moon-knob', 'sun'] : ['knob-off', 'knob-on'];
  return (
    <span className={`switch switch--${kind}${on ? ' is-on' : ''}`} aria-hidden="true">
      <span className="switch-body" />
      {kind === 'sky' && (
        <>
          {STARS.map(([inset, w, h, rot, file]) => (
            <span key={file} className="sw-deco sw-star" style={{ inset }}>
              <span style={{ width: w, height: h, transform: `rotate(${rot}deg)` }}>
                <img src={`${DIR}/${file}.svg`} alt="" />
              </span>
            </span>
          ))}
          {CLOUDS.map(([inset, file]) => (
            <span key={file} className="sw-deco sw-cloud" style={{ inset }}>
              <img src={`${DIR}/${file}.svg`} alt="" />
            </span>
          ))}
        </>
      )}
      <span className="switch-knob">
        <img className="k-off" src={`${DIR}/${offKnob}.svg`} alt="" />
        <img className="k-on" src={`${DIR}/${onKnob}.svg`} alt="" />
        {children && <span className="switch-knob-text">{children}</span>}
      </span>
    </span>
  );
}

export function ThemeSwitch() {
  const { theme } = useTheme();
  return <Switch kind="sky" on={theme === 'light'} />;
}

export function LanguageSwitch() {
  const { lang } = useLanguage();
  return (
    <Switch kind="flat" on={lang === 'ar'}>
      {lang === 'ar' ? 'ع' : 'EN'}
    </Switch>
  );
}
