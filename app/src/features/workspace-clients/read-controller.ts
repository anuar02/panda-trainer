export type ClientReadState<T> =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: T }
  | { status: 'failed'; data: null };

export function createClientReadController<T>(
  load: (signal: AbortSignal) => Promise<T>,
  publish: (state: ClientReadState<T>) => void,
  isCurrent: () => boolean = () => true,
) {
  let active = true;
  let generation = 0;
  let abort: AbortController | null = null;
  const cancel = () => {
    generation += 1;
    abort?.abort();
    abort = null;
  };
  const run = async () => {
    if (!active || !isCurrent()) return;
    cancel();
    const ticket = generation;
    const request = new AbortController();
    abort = request;
    publish({ status: 'loading', data: null });
    const current = () => active && isCurrent() && generation === ticket;
    try {
      const data = await load(request.signal);
      if (current()) publish({ status: 'ready', data });
    } catch {
      if (current()) publish({ status: 'failed', data: null });
    }
  };
  return {
    run,
    invalidate: () => {
      cancel();
      if (active && isCurrent()) publish({ status: 'failed', data: null });
    },
    stop: () => {
      active = false;
      cancel();
    },
  };
}
