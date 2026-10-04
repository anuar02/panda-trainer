import { useLayoutEffect, useRef, useState } from 'react';

export function useFinancialFormLifecycle(
  isCallerCurrent?: () => boolean,
  scope?: string,
) {
  const [version, setVersion] = useState(0);
  const epoch = useRef(0);
  const active = useRef(true);
  const selected = useRef(scope);
  useLayoutEffect(() => {
    active.current = true;
    selected.current = scope;
    return () => {
      active.current = false;
    };
  }, [scope]);
  const isCurrent = () =>
    active.current &&
    selected.current === scope &&
    epoch.current === version &&
    (isCallerCurrent?.() ?? true);
  const close = (onClose: () => void) => {
    if (!isCurrent()) return;
    epoch.current += 1;
    setVersion(epoch.current);
    onClose();
  };
  return { version, isCurrent, close };
}
