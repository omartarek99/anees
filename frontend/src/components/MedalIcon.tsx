// The medal icon: a round medal with a star, hanging from its ribbon. Drawn in the current text colour, so it follows the label it sits next to.
// `size` is its height; it is a little more than half as wide.
export function MedalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 71.69 122.88" width={(size * 71.69) / 122.88} height={size} fill="currentColor" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.19,0.02h25.91l23.34,42.45c0.5,0.9,1.23,1.61,2.06,2.06H17.66L1.19,0V0.02L1.19,0.02z M35.85,51.19 c19.8,0,35.85,16.05,35.85,35.85s-16.05,35.85-35.85,35.85C16.05,122.88,0,106.83,0,87.03S16.05,51.19,35.85,51.19L35.85,51.19z M35.85,66.34l5.99,14.62l15.77,1.19L45.54,92.39l3.75,15.34L35.85,99.4l-13.44,8.33l3.75-15.34L14.08,82.14l15.77-1.19 L35.85,66.34L35.85,66.34L35.85,66.34z M39.03,0.02h30.32L57.15,33L39.03,0.02L39.03,0.02z"
      />
    </svg>
  );
}
