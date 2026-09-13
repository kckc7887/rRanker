import { useCallback, useMemo, useRef, useState } from 'react';

export function useOverviewOperation() {
  const activeRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const begin = useCallback(() => {
    if (activeRef.current) return false;
    activeRef.current = true;
    setBusy(true);
    return true;
  }, []);
  const finish = useCallback(() => { activeRef.current = false; setBusy(false); }, []);
  const operation = useMemo(() => ({ begin, finish }), [begin, finish]);
  return { busy, operation };
}
