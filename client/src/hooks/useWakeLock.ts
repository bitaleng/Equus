import { useState, useEffect, useCallback, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!enabled) return;
    
    if (!('wakeLock' in navigator)) return;

    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        return;
      }

      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setIsActive(true);

      sentinel.addEventListener('release', () => {
        setIsActive(false);
        wakeLockRef.current = null;
      });

      console.log('[WakeLock] Screen wake lock acquired');
    } catch (err) {
      console.error('[WakeLock] Failed to acquire wake lock:', err);
      setIsActive(false);
    }
  }, [enabled]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
        console.log('[WakeLock] Screen wake lock released');
      } catch (err) {
        console.error('[WakeLock] Failed to release wake lock:', err);
      }
      wakeLockRef.current = null;
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && isSupported) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [enabled, isSupported, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    if (!enabled || !isSupported) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isSupported, requestWakeLock]);

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock
  };
}
