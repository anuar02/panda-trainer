export function createScheduleReadController<T>(
  read: (isCurrent: () => boolean) => Promise<T>,
  publish: (value: T | null, failed: boolean) => void,
  isCurrent: () => boolean = () => true,
) {
  let active = true;
  let generation = 0;
  return {
    async run() {
      const ticket = ++generation;
      const current = () => active && ticket === generation && isCurrent();
      if (!current()) return;
      publish(null, false);
      try {
        const value = await read(current);
        if (current()) publish(value, false);
      } catch {
        if (current()) publish(null, true);
      }
    },
    stop() {
      active = false;
      generation += 1;
    },
  };
}
