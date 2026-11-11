/** The small 3D pictures (made in Figma, public/icons/ui) that stand where an emoji used to be. */
export type IcoName = 'school' | 'tools' | 'reset' | 'signout' | 'trophy' | 'worksheet' | 'addvideo';

export function Ico({ name, size = 18 }: { name: IcoName; size?: number }) {
  return (
    <img
      src={`/icons/ui/${name}.webp`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: '0 0 auto' }}
    />
  );
}
