import firebase_admin
from firebase_admin import storage
import datetime
import uuid
import io
from typing import Tuple, Dict

try:
    from PIL import Image, ImageOps
except Exception:
    Image = None  # Pillow optional at import; validate at runtime

_storage_service_instance = None

class StorageService:
    def __init__(self):
        self.bucket = None
        try:
            # This will only succeed if the app was initialized with a storageBucket
            self.bucket = storage.bucket()
        except Exception as e:
            print(f"Could not initialize StorageService bucket. This is expected if FIREBASE_STORAGE_BUCKET is not set. Error: {e}")

    def generate_signed_upload_url(self, file_path: str, content_type: str | None = None, max_upload_size_bytes: int | None = None) -> str:
        """
        Generates a v4 signed URL for uploading a file.
        This URL is valid for a short period (e.g., 15 minutes).
        """
        if not self.bucket:
            raise Exception("Storage bucket is not available. Ensure FIREBASE_STORAGE_BUCKET is configured.")

        blob = self.bucket.blob(file_path)

        # The URL will be valid for 15 minutes
        expiration = datetime.timedelta(minutes=15)

        # Generate the signed URL
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method="PUT",
            content_type=content_type,
        )
        return signed_url

    def generate_signed_download_url(self, file_path: str, expiration_minutes: int = 15) -> str:
        """
        Generates a v4 signed URL for downloading a file.
        """
        if not self.bucket:
            raise Exception("Storage bucket is not available.")

        blob = self.bucket.blob(file_path)
        expiration = datetime.timedelta(minutes=expiration_minutes)

        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method="GET",
        )
        return signed_url

    def ensure_download_token(self, file_path: str) -> str:
        """
        Ensures the blob has a firebaseStorageDownloadTokens metadata value.
        Returns the token (existing or newly created).
        """
        if not self.bucket:
            raise Exception("Storage bucket is not available.")

        blob = self.bucket.blob(file_path)
        if not blob.exists():
            raise FileNotFoundError(f"Blob not found at path: {file_path}")

        metadata = blob.metadata or {}
        token = metadata.get('firebaseStorageDownloadTokens')
        if not token:
            token = str(uuid.uuid4())
            metadata['firebaseStorageDownloadTokens'] = token
            blob.metadata = metadata
            blob.patch()
        return token

    # --- New image validation methods ---
    def _is_allowed_image_mime(self, content_type: str | None) -> bool:
        if not content_type:
            return False
        allowed = {"image/jpeg", "image/png", "image/webp"}
        return content_type.lower() in allowed

    def validate_uploaded_image(self, file_path: str, expected_content_type: str | None, max_size_bytes: int) -> None:
        """
        Server-side validation for uploaded images before finalizing:
        - Enforce allowed MIME types
        - Enforce maximum size
        Raises ValueError on validation errors.
        """
        if not self.bucket:
            raise Exception("Storage bucket is not available.")

        # We validate based on the blob's actual content_type; expected_content_type is informational only

        blob = self.bucket.blob(file_path)
        if not blob.exists():
            raise FileNotFoundError(f"Blob not found at path: {file_path}")

        # Fetch metadata to inspect size and content type
        blob.reload()  # ensures size and content_type are populated
        size = blob.size or 0
        actual_ct = (blob.content_type or "").lower()

        if size > max_size_bytes:
            raise ValueError("File is too large.")
        if not self._is_allowed_image_mime(actual_ct):
            raise ValueError("Invalid image type uploaded.")

        # Extra safeguard: attempt to open via Pillow to ensure it's a real image
        try:
            if Image is None:
                # Pillow not available; skip deep sniff, rely on content type
                return
            data = blob.download_as_bytes()
            with Image.open(io.BytesIO(data)) as im:
                im.verify()  # raises if not an image or corrupted
        except Exception:
            raise ValueError("Uploaded file is not a valid image.")

    # --- Derivative generation ---
    def _pick_pillow_format(self, content_type: str) -> Tuple[str, str]:
        """
        Map a MIME type to (Pillow format string, default file extension without dot)
        """
        ct = (content_type or "").lower()
        if ct.startswith("image/jpeg") or ct == "image/jpg":
            return ("JPEG", "jpg")
        if ct.startswith("image/png"):
            return ("PNG", "png")
        if ct.startswith("image/webp"):
            return ("WEBP", "webp")
        # Fallback to JPEG for unknown types
        return ("JPEG", "jpg")

    def _insert_suffix_before_extension(self, path: str, suffix: str) -> str:
        idx = path.rfind('.')
        if idx == -1:
            return f"{path}{suffix}"
        return f"{path[:idx]}{suffix}{path[idx:]}"

    def _resize_image_bytes(self, data: bytes, pillow_format: str, max_edge: int) -> bytes:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)
            # Convert mode for formats that don't support alpha
            if pillow_format in ("JPEG", "WEBP") and im.mode in ("RGBA", "P"):
                im = im.convert("RGB")
            # Calculate target size preserving aspect ratio
            width, height = im.size
            scale = min(max_edge / float(width), max_edge / float(height), 1.0)
            new_size = (int(width * scale), int(height * scale))
            if new_size != im.size:
                im = im.resize(new_size, Image.LANCZOS)

            out = io.BytesIO()
            save_kwargs = {}
            if pillow_format in ("JPEG", "WEBP"):
                # Balance quality vs size
                save_kwargs.update(dict(quality=85, optimize=True))
            if pillow_format == "PNG":
                save_kwargs.update(dict(optimize=True))
            im.save(out, format=pillow_format, **save_kwargs)
            return out.getvalue()

    def generate_derivatives(self, original_path: str) -> Dict[str, str]:
        """
        Generate 1024px max-edge and 256px thumbnail derivatives for an uploaded image.
        Returns a dict with keys: resized_path, thumbnail_path
        """
        if not self.bucket:
            raise Exception("Storage bucket is not available.")
        if Image is None:
            raise Exception("Pillow is not installed on the server; cannot generate image derivatives.")

        source_blob = self.bucket.blob(original_path)
        if not source_blob.exists():
            raise FileNotFoundError(f"Blob not found at path: {original_path}")
        source_blob.reload()

        content_type = (source_blob.content_type or "image/jpeg").lower()
        pillow_format, _ext = self._pick_pillow_format(content_type)

        data = source_blob.download_as_bytes()

        resized_bytes = self._resize_image_bytes(data, pillow_format, 1024)
        thumb_bytes = self._resize_image_bytes(data, pillow_format, 256)

        resized_path = self._insert_suffix_before_extension(original_path, "_1024")
        thumb_path = self._insert_suffix_before_extension(original_path, "_256")

        # Upload derivatives
        resized_blob = self.bucket.blob(resized_path)
        resized_blob.upload_from_string(resized_bytes, content_type=content_type)
        thumb_blob = self.bucket.blob(thumb_path)
        thumb_blob.upload_from_string(thumb_bytes, content_type=content_type)

        # Ensure download tokens for convenience
        self.ensure_download_token(resized_path)
        self.ensure_download_token(thumb_path)

        return {
            "resized_path": resized_path,
            "thumbnail_path": thumb_path,
        }

def get_storage_service():
    """
    Returns a singleton instance of the StorageService.
    """
    global _storage_service_instance
    if _storage_service_instance is None:
        _storage_service_instance = StorageService()
    return _storage_service_instance 