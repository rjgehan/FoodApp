import { useEffect, useRef, useState } from 'react';

/**
 * The camera, pointed at a barcode, until it reads one.
 *
 * Two ways to read it. Chrome and Android have `BarcodeDetector` built in — free, instant, and
 * using the phone's own hardware. Safari does not, and Safari is what this app is mostly opened
 * in, so there is a fallback: a WebAssembly build of ZXing, fetched only at the moment somebody
 * actually scans something. Nobody who never scans pays for it.
 *
 * Only the four formats groceries use. Letting it look for QR codes as well makes every frame
 * slower and finds nothing, because tins do not have QR codes on them.
 */

const GROCERY_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

/** Every quarter second. Faster wastes battery; slower feels like it is not trying. */
const BETWEEN_LOOKS_MS = 250;

type Reader = (bitmap: ImageData) => Promise<string | null>;

export default function BarcodeScanner({
  onFound,
  onError,
}: {
  onFound: (barcode: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [starting, setStarting] = useState(true);
  // Callbacks in a ref so that a parent re-rendering never restarts the camera.
  const found = useRef(onFound);
  const failed = useRef(onError);
  found.current = onFound;
  failed.current = onError;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let done = false;

    async function run() {
      try {
        // The back camera, as big as it will give us: a barcode read off a thumbnail is a
        // barcode misread.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        failed.current(cameraProblem(err));
        return;
      }
      if (done) {
        stop();
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        failed.current('The camera would not start. Close this and try again.');
        return;
      }
      setStarting(false);

      let read: Reader;
      try {
        read = await reader();
      } catch {
        failed.current('Could not load the barcode reader.');
        return;
      }

      const canvas = document.createElement('canvas');
      const paper = canvas.getContext('2d', { willReadFrequently: true });
      if (!paper) {
        failed.current('This browser cannot read from the camera.');
        return;
      }

      const look = async () => {
        if (done || !videoRef.current) return;
        const width = videoRef.current.videoWidth;
        const height = videoRef.current.videoHeight;
        if (width && height) {
          canvas.width = width;
          canvas.height = height;
          paper.drawImage(videoRef.current, 0, 0, width, height);
          try {
            const code = await read(paper.getImageData(0, 0, width, height));
            if (code && !done) {
              done = true;
              found.current(code);
              return;
            }
          } catch {
            // A frame that will not decode is the normal case, not an error.
          }
        }
        if (!done) timer = window.setTimeout(look, BETWEEN_LOOKS_MS);
      };
      look();
    }

    function stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    run();
    return () => {
      // Without this the camera light stays on after the sheet closes, which looks like spying.
      done = true;
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        className="aspect-[3/4] w-full object-cover"
        playsInline
        muted
        // iOS refuses to play an inline video that is not also muted and silent.
        aria-label="Camera"
      />
      {/* A window to aim through. Barcodes are wide and short, so the window is too. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-24 w-4/5 rounded-xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
      </div>
      <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4
                    text-center text-sm text-white">
        {starting ? 'Starting the camera…' : 'Point at the barcode'}
      </p>
    </div>
  );
}

/**
 * The built-in detector where there is one, ZXing where there is not. The import is inside the
 * function on purpose: it is a WebAssembly payload, and it should not be in the bundle that
 * loads when somebody opens the grocery list.
 */
async function reader(): Promise<Reader> {
  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorish }).BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats?.();
    const formats = GROCERY_FORMATS.filter((f) => !supported || supported.includes(f));
    if (formats.length > 0) {
      const detector = new Native({ formats });
      return async (bitmap) => {
        const hits = await detector.detect(bitmap);
        return hits[0]?.rawValue ?? null;
      };
    }
  }

  const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader');
  const { default: wasmUrl } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
  // Served from this server, not a CDN: the whole app is meant to work on a home network.
  prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
  return async (bitmap) => {
    const hits = await readBarcodes(bitmap, {
      formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'],
      tryHarder: true,
    });
    const good = hits.find((hit) => hit.isValid && hit.text);
    return good?.text ?? null;
  };
}

/** Camera failures are nearly always permission, and saying so saves a lot of confusion. */
function cameraProblem(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'This needs permission to use the camera. Allow it in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera on this device.';
  }
  if (!window.isSecureContext) {
    return 'Browsers only allow the camera over HTTPS.';
  }
  return 'Could not open the camera.';
}

/* The built-in detector is not in TypeScript's DOM library yet. */
interface BarcodeDetectorish {
  new (options?: { formats?: readonly string[] }): { detect(source: ImageData): Promise<{ rawValue: string }[]> };
  getSupportedFormats?(): Promise<string[]>;
}
