import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Whether a Gemini key is configured. The recipe writer and the grocery sort both need one, and
 * both disappear without it rather than offering a button that can only fail.
 */
export function useAiAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('GET', '/api/recipe-writer')
      .then((r) => setAvailable(r.enabled))
      .catch(() => setAvailable(false));
  }, []);

  return available;
}
