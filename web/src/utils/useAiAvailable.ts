import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Whether a Gemini key is configured. The grocery sort needs one, and disappears without it
 * rather than offering a button that can only fail.
 */
export function useAiAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('GET', '/api/ai')
      .then((r) => setAvailable(r.enabled))
      .catch(() => setAvailable(false));
  }, []);

  return available;
}
