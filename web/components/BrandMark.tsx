"use client";

import { useEffect, useRef, useState } from "react";

/* The mark to the left of the wordmark.
 *
 * Shows /images/logo.png once that file exists, and the drawn rail glyph
 * until it does. That way the page is never broken and never shows a torn
 * image icon: dropping the file in is the whole of the change, no code edit
 * and no deploy-order dance.
 *
 * The fallback is the same three-line glyph the page used before, so if the
 * logo is ever missing in production the header still reads as finished
 * rather than as a gap.
 */

const RAIL_GLYPH = "M4 6h16M4 12h16M4 18h10";

export function BrandMark({ src = "/images/logo.png", alt = "" }: {
  src?: string; alt?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  /* onError alone is not enough.
   *
   * The browser starts fetching this image while parsing the server HTML,
   * which is before React has hydrated and attached a handler — so a 404
   * fires its error event into nothing and the fallback never runs. On mount,
   * an image that has finished loading with no intrinsic width has already
   * failed, and that is the case the event missed. */
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <span className="lp-mark" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d={RAIL_GLYPH} />
        </svg>
      </span>
    );
  }

  return (
    <span className="lp-mark lp-mark-img">
      {/* Plain <img>: the static export runs with images unoptimized, so
          next/image would add a component and a wrapper here and optimise
          nothing. Dimensions are stated to reserve the space and keep the
          header from shifting as it loads. */}
      <img ref={ref} src={src} alt={alt} width={30} height={30}
        onError={() => setFailed(true)} />
    </span>
  );
}
