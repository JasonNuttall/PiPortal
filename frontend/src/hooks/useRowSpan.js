import { useState, useLayoutEffect, useRef } from "react";

/** Must match --panel-row and the grid's column-gap in index.css. */
export const ROW_HEIGHT = 8;
export const ROW_GAP = 24;

/**
 * Rows carry no gap of their own, so the spacing between panels is bought as
 * extra rows. A panel therefore occupies its content plus one gap, rounded up
 * to the row grid.
 */
export const spanFor = (height, rowHeight = ROW_HEIGHT, gap = ROW_GAP) =>
  Math.max(1, Math.ceil((height + gap) / rowHeight));

/**
 * How many grid rows a panel needs to fit its own content.
 *
 * CSS Grid sizes a row to its tallest member, so one row per panel meant a
 * collapsed panel kept the height of whatever sat beside it. Measuring each
 * panel and spanning fine rows lets them pack to their real height, which is
 * what makes collapsing actually reclaim space.
 */
export function useRowSpan() {
  const ref = useRef(null);
  const [state, setState] = useState({ span: 1, measured: false });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) setState({ span: spanFor(height), measured: true });
    };

    measure();

    // jsdom has no ResizeObserver; the initial measure is enough there.
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...state };
}

export default useRowSpan;
