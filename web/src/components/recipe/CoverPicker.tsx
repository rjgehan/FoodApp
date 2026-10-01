import { useRef, useState } from 'react';
import { imageUrl, uploadImage } from '../../api/client';
import { downscaleImage } from '../../utils/imageResize';
import { Icon } from '../icons';
import { cx, Photo } from '../ui';

/**
 * The recipe form's picture (the mockup's 3.16): a 64px square beside the name — the cover, or
 * the recipe's colour with a picture mark — that you tap to choose a photo. The photo is made
 * smaller in the browser before it is sent, like every other upload.
 */
export default function CoverPicker({
  householdId,
  coverImageId,
  seed,
  onChange,
  onError,
}: {
  householdId: string;
  coverImageId: string | null;
  /** What picks the colour while there is no photo. */
  seed: string;
  onChange: (id: string) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { id } = await uploadImage(householdId, await downscaleImage(file));
      onChange(id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        aria-label={coverImageId ? 'Replace photo' : 'Add a photo'}
        title={coverImageId ? 'Replace photo' : 'Add a photo'}
        disabled={busy}
        onClick={() => input.current?.click()}
        className={cx('press relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px]', busy && 'opacity-60')}
      >
        {coverImageId ? (
          <>
            <img src={imageUrl(coverImageId)} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[#2B211A]">
              <Icon name="camera" size={12} />
            </span>
          </>
        ) : (
          <Photo seed={seed} hue={seed ? undefined : 'tomato'} icon={busy ? 'upload' : 'image'} className="h-full w-full" />
        )}
      </button>
    </>
  );
}
