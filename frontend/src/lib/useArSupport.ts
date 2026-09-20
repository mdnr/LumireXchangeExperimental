import { useEffect, useState } from 'react';

export function useArSupport(): [boolean, boolean] {
  const [supported, setSupported] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let mounted = true;
    const xr = (navigator as { xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } }).xr;
    if (xr?.isSessionSupported) {
      xr.isSessionSupported('immersive-ar')
        .then((ok) => {
          if (mounted) setSupported(ok);
        })
        .catch(() => {
          if (mounted) setSupported(false);
        })
        .finally(() => {
          if (mounted) setChecking(false);
        });
    } else {
      setChecking(false);
    }
    return () => {
      mounted = false;
    };
  }, []);
  return [supported, checking];
}