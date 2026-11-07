"""S3 document storage adapter for company documents."""
from __future__ import annotations

import uuid
import boto3
from botocore.config import Config

from app.config import Settings


class S3DocumentStore:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.S3_BUCKET_DOCUMENTS
        self._client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )

    def upload(
        self,
        file_bytes: bytes,
        filename: str,
        company_id: str,
        content_type: str = "application/pdf",
    ) -> str:
        """Upload a file to S3 and return its object key."""
        # Sanitise filename — only ASCII, no path separators
        safe_name = "".join(
            c if c.isalnum() or c in "._- " else "_"
            for c in filename
        ).encode("ascii", "ignore").decode()

        key = f"companies/{company_id}/{uuid.uuid4()}/{safe_name}"
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return key

    def delete(self, s3_key: str) -> None:
        """Delete an object from S3 (best-effort)."""
        self._client.delete_object(Bucket=self._bucket, Key=s3_key)

    def get_presigned_url(self, s3_key: str, expires: int = 3600) -> str:
        """Return a presigned GET URL valid for *expires* seconds."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": s3_key},
            ExpiresIn=expires,
        )
