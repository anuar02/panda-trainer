import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export const activeExerciseSpacing = 18;

export function getActiveExerciseFit(
  viewportHeight: number,
  metadataHeight: number,
  composerHeight: number,
) {
  const available = Math.max(0, viewportHeight - activeExerciseSpacing);
  const metadata = Math.max(
    0,
    Math.min(metadataHeight, available - composerHeight),
  );
  return {
    fits: metadataHeight + composerHeight <= available,
    metadataHeight: metadata,
    cardHeight: metadata + composerHeight + activeExerciseSpacing,
  };
}

export function getActiveComposerLayout(
  fontScale: number,
  viewportHeight: number,
) {
  const buttonHeight = Math.max(56, 23.925 * fontScale + 24);
  const normalHeight = 66.85 * fontScale + 54 + buttonHeight;
  const compact =
    viewportHeight > 0 &&
    normalHeight + 44 + activeExerciseSpacing > viewportHeight;
  const estimatedHeight = compact
    ? 48 * fontScale + 32 + buttonHeight
    : normalHeight;
  return { compact, estimatedHeight: Math.round(estimatedHeight * 100) / 100 };
}

type ScrollTo = (options: { y: number; animated: boolean }) => void;

export function useActiveExerciseAlignment(
  event: string | null,
  reduced: boolean,
  scrollTo: ScrollTo,
) {
  const state = useRef({
    event: null as string | null,
    pending: false,
    scrolling: false,
    position: null as number | null,
    reduced,
    scrollTo,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    state.current.reduced = reduced;
    state.current.scrollTo = scrollTo;
  }, [reduced, scrollTo]);
  const align = useCallback(() => {
    const current = state.current;
    if (!current.pending || current.scrolling || current.position === null)
      return;
    current.pending = false;
    current.scrollTo({ y: current.position, animated: !current.reduced });
  }, []);
  useEffect(() => {
    if (state.current.event === event) return;
    state.current.event = event;
    state.current.pending = event !== null;
    align();
  }, [event, align]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const begin = () => {
    if (timer.current) clearTimeout(timer.current);
    state.current.scrolling = true;
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    state.current.scrolling = false;
    align();
  };
  return {
    onPosition: (position: number) => {
      state.current.position = position;
      align();
    },
    onScrollBeginDrag: begin,
    onMomentumScrollBegin: begin,
    onScrollEndDrag: () => {
      timer.current = setTimeout(end, 120);
    },
    onMomentumScrollEnd: end,
  };
}
