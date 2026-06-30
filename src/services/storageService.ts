import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

// Helper to convert URI to Blob, now simplified and more robust
async function uriToBlob(uri: string): Promise<Blob> {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob;
}

export const generateUniqueFileName = (uri: string): string => {
  const cleanUri = uri.split('?')[0].split('#')[0];
  const rawExtension = cleanUri.split('.').pop()?.toLowerCase();
  const fileExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExtension || '') ? rawExtension : 'jpg';
  return `${uuidv4()}.${fileExtension}`;
};

const inferImageContentType = (fileName: string, blobType?: string): string => {
  const normalizedBlobType = (blobType || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].includes(normalizedBlobType)) {
    return normalizedBlobType;
  }

  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export const storageService = {
  // Deprecated: prefer storing storage paths and resolving via getDownloadURL at runtime
  buildPublicDownloadUrl(path: string, token: string): string {
    const bucket = env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const encodedPath = encodeURIComponent(path);
    // If bucket is a modern hostname (ends with .firebasestorage.app), still use the REST API host
    // The safer approach is to use getDownloadURL; callers should avoid relying on this method.
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
  },
  async uploadViaSignedUrl(localUri: string, signedUrl: string, contentType: string): Promise<void> {
    const response = await fetch(localUri);
    const blob = await response.blob();

    // Some environments require x-goog-content-length-range when the signed URL enforces max size
    // We avoid setting Content-Length. GCS validates size server-side.
    // Important: Avoid non-standard headers that can trigger CORS preflight failures.
    // Only send Content-Type which is included in the signed URL constraints.
    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };

    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'native';
    const redactUrl = (fullUrl: string) => {
      try {
        const u = new URL(fullUrl);
        return {
          hostPath: `${u.origin}${u.pathname}`,
          queryLength: u.search.length,
        };
      } catch {
        return { hostPath: fullUrl, queryLength: 0 };
      }
    };

    try {
      const res = await fetch(signedUrl, {
        method: 'PUT',
        body: blob,
        headers,
        // Ensure a clean cross-origin request for signed URLs
        mode: 'cors',
        credentials: 'omit',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const { hostPath, queryLength } = redactUrl(signedUrl);
        console.error('[SignedUploadError]', JSON.stringify({ type: 'http', status: res.status, origin, hostPath, queryLength, contentType }));
        console.error('[SignedUploadError] curl-preflight:', `curl -i -X OPTIONS "<SIGNED_URL>" -H "Origin: ${origin}" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type"`);
        console.error('[SignedUploadError] curl-put:', `curl -i -X PUT "<SIGNED_URL>" -H "Content-Type: ${contentType}" --data-binary @/path/to/file`);
        throw new Error(`Failed to upload file to signed URL: ${res.status} ${text}`);
      }
    } catch (err) {
      // Network-level failures (e.g., ERR_CONNECTION_CLOSED)
      const { hostPath, queryLength } = redactUrl(signedUrl);
      console.error('[SignedUploadError]', JSON.stringify({ type: 'network', origin, hostPath, queryLength, contentType, error: (err as Error)?.message || String(err) }));
      console.error('[SignedUploadError] curl-preflight:', `curl -i -X OPTIONS "<SIGNED_URL>" -H "Origin: ${origin}" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type"`);
      console.error('[SignedUploadError] curl-put:', `curl -i -X PUT "<SIGNED_URL>" -H "Content-Type: ${contentType}" --data-binary @/path/to/file`);
      throw err;
    }
  },
  async uploadViaBackendDirect(localUri: string, fileName: string, tripId?: string): Promise<{ image_path: string; download_token: string; resized_path?: string | null; thumbnail_path?: string | null }> {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const contentType = inferImageContentType(fileName, blob.type);
    const file = new File([blob], fileName, { type: contentType });
    const { tripsService } = await import('./trips');
    return await tripsService.uploadCoverDirect(file, tripId);
  },
  async uploadImageAndGetDownloadURL(
    localUri: string,
    path: string, // e.g., `trip_cover_images/{userId}/{tripId}/{imageName}`
    onProgress?: (progress: number) => void // Optional progress callback
  ): Promise<string> {
    try {
      const blob = await uriToBlob(localUri);

      const storageRef = ref(storage, path);

      // For web, uploadBytesResumable provides progress. For native, uploadBytes is simpler if progress isn't strictly needed here.
      // If progress is essential on native for large files with uploadBytesResumable, ensure blob is correctly handled.
      // The `blob` from `uriToBlob` should work with `uploadBytesResumable` on native too.

      const uploadTask = uploadBytesResumable(storageRef, blob);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            console.error("storageService: Image upload failed during transfer", error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (error) {
              console.error("storageService: Failed to get download URL after upload", error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error("storageService: Error in uploadImageAndGetDownloadURL wrapper function", error);
      // It's good to check the type of error before accessing properties like error.code or error.message
      if (error instanceof Error) {
        throw new Error(`Image upload failed: ${error.message}`);
      } else {
        throw new Error('Image upload failed due to an unknown error.');
      }
    }
  },

  async getDownloadUrlForPath(path: string | null | undefined): Promise<string | null> {
    if (!path) {
        return null;
    }

    // If it's a full URL to firebasestorage REST API, extract the object path and resolve via SDK
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        const url = new URL(path);
        if (url.host.includes('firebasestorage.googleapis.com')) {
          // Expect /v0/b/<bucket>/o/<encodedPath>
          const parts = url.pathname.split('/');
          const oIndex = parts.findIndex(p => p === 'o');
          if (oIndex !== -1 && parts.length > oIndex + 1) {
            const encodedObject = parts[oIndex + 1];
            const objectPath = decodeURIComponent(encodedObject);
            const storageRef = ref(storage, objectPath);
            return await getDownloadURL(storageRef);
          }
        }
      } catch {
        // fall through
      }
      return path;
    }

    // Otherwise, assume it's a path in Firebase Storage and get the URL
    try {
        const storageRef = ref(storage, path);
        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.error(`Error getting download URL for path "${path}":`, error.code);
        return null;
    }
  }
};
