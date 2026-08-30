import { useRef, useState, type ReactNode } from 'react';
import { uploadImage } from '../api/client';
import { downscaleImage } from '../utils/imageResize';
import { Button, ErrorText } from './ui';

/**
 * Pick → downscale in the browser → upload → hand back the new image id. Multiple files are
 * processed one at a time so a stack of phone photos doesn't spike memory.
 */
export default function ImagePicker({
  householdId,
  onUploaded,
  multiple = false,
  children,
}: {
  householdId: string;
  onUploaded: (ids: string[]) => void;
  multiple?: boolean;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const blob = await downscaleImage(file);
        const { id } = await uploadImage(householdId, blob);
        ids.push(id);
      }
      onUploaded(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button type="button" variant="secondary" full disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Adding…' : children}
      </Button>
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}
