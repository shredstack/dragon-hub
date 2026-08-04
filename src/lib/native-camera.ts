/**
 * Native photo capture, behind a web fallback.
 *
 * The App Review notes claim DragonHub captures photos with the camera. Before
 * this module that claim was false — every upload went through a plain
 * `<input type="file">`, which on iOS opens Apple's own sheet but is not the
 * camera API and does not exercise the `NSCameraUsageDescription` string. A
 * reviewer checking the claim would have found nothing, and a review note that
 * doesn't survive checking is worse than one that never made the claim.
 *
 * So: in the native shell this opens the real action sheet ("Take Photo" /
 * "Choose From Library") via `@capacitor/camera`, which is what surfaces the
 * Info.plist usage strings. On the web `isNativeCameraAvailable()` is false and
 * callers keep their file input.
 */

export interface CapturedPhoto {
  /** A `File`, so callers can post it exactly as they post an input's file. */
  file: File;
}

export async function isNativeCameraAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Open the native photo picker and return the chosen image as a `File`.
 *
 * Returns null when the user backs out — a cancelled picker is a normal
 * outcome, not an error, and callers should not show a failure message for it.
 *
 * `resultType: Uri` plus a `fetch` of that URI, rather than `Base64`: a photo
 * from a modern phone camera is several megabytes, and base64 puts a 33%-larger
 * copy of it in a JavaScript string in the WebView's heap. Reading the file URI
 * as a blob keeps it out of JS memory entirely.
 */
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      // Photos here are message attachments and receipts, not avatars, so
      // cropping is the user's business rather than ours.
      allowEditing: false,
      resultType: CameraResultType.Uri,
      // `Prompt` is what produces the "Take Photo / Choose From Library"
      // action sheet — the thing a reviewer is looking for.
      source: CameraSource.Prompt,
      promptLabelHeader: "Add a photo",
      promptLabelPhoto: "Choose from library",
      promptLabelPicture: "Take photo",
      // Downscale on the device. A 12MP original is a slow upload on school
      // Wi-Fi and nothing in the app renders it larger than this.
      width: 2000,
      correctOrientation: true,
    });

    if (!photo.webPath) return null;

    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const ext = (photo.format || "jpeg").toLowerCase();
    const file = new File([blob], `photo-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    });

    return { file };
  } catch (error) {
    // The plugin throws on cancel, and on a denied permission. Neither is
    // worth an error dialog: cancel is intentional, and a denied permission is
    // better explained where the user can act on it.
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) return null;
    console.warn("Native camera unavailable:", message);
    return null;
  }
}
