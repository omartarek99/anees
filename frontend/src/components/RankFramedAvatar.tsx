import { Avatar } from './Avatar';
import { RANK_FRAMES } from '../lib/frames';

// A person's picture inside the frame of their rank (public/images/frames/<rank>.png, sizes in lib/frames.ts): the same frames as on the home
// page, drawn small -- used where someone is credited next to their work (the reel's uploader). `frame` is the whole frame's width in css px;
// the picture is sized to the frame's round hole. Without a known rank it is just the picture.
export function RankFramedAvatar({ rankKey, avatarKey, photoUrl, frame = 76 }: { rankKey?: string | null; avatarKey: string; photoUrl?: string | null; frame?: number }) {
  const fr = rankKey ? RANK_FRAMES[rankKey as keyof typeof RANK_FRAMES] : undefined;
  if (!rankKey || !fr) return <Avatar avatarKey={avatarKey} photoUrl={photoUrl} size={Math.round(frame * 0.62)} />;
  const hole = Math.min(Math.round(frame * 0.62), Math.round(frame * fr.ratio));
  const pic = Math.round(hole * 1.06); // drawn a little larger than the hole and tucked under the frame, as on the home page
  return (
    <span style={{ position: 'relative', display: 'grid', placeItems: 'center', inlineSize: frame, blockSize: frame, flexShrink: 0 }}>
      <span style={{ position: 'absolute', display: 'grid', placeItems: 'center', inlineSize: hole, blockSize: hole, borderRadius: '50%', overflow: 'hidden' }}>
        <Avatar avatarKey={avatarKey} photoUrl={photoUrl} size={pic} />
      </span>
      <img
        src={`/images/frames/${rankKey}.png`}
        alt=""
        decoding="async"
        style={{ position: 'absolute', inset: 0, inlineSize: frame, blockSize: frame, maxInlineSize: 'none', pointerEvents: 'none', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }}
      />
    </span>
  );
}
