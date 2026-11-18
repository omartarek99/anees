/** The figure of a question taken from the school book (a file served by GET /worksheets/image/:name). */
export function QFigure({ image }: { image?: string | null }) {
  if (!image) return null;
  return <img className="q-figure" src={`/api/worksheets/image/${encodeURIComponent(image)}`} alt="" loading="lazy" />;
}
