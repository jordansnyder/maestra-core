import { useState, useCallback, useEffect, useRef } from "react";
import { checkServiceHealth, HealthReport } from "../lib/invoke";

export function useHealth(enabled: boolean) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const report = await checkServiceHealth();
      setHealth(report);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHealth(null);
      if (interval.current) {
        clearInterval(interval.current);
        interval.current = null;
      }
      return;
    }

    refresh();
    interval.current = setInterval(refresh, 5000);

    return () => {
      if (interval.current) {
        clearInterval(interval.current);
        interval.current = null;
      }
    };
  }, [enabled, refresh]);

  return { health, refresh };
}
