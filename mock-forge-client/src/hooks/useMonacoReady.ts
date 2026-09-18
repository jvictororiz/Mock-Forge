import { useEffect, useState } from 'react';
import { ensureMonacoSetup } from '../setupMonaco';

export function useMonacoReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    ensureMonacoSetup()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error) => {
        console.error('Failed to initialize Monaco', error);
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return ready;
}
