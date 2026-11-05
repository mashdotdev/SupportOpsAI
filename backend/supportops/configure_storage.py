"""Configure browser CORS on the already-provisioned private Neon bucket."""
from urllib.parse import urlparse

from .config import settings
from .storage import client


def main():
    config = settings()
    origin = config.frontend_origin.rstrip("/")
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
        raise ValueError("FRONTEND_ORIGIN must be an exact HTTP(S) origin without a path.")
    client().put_bucket_cors(Bucket=config.storage_bucket, CORSConfiguration={"CORSRules": [{
        "AllowedOrigins": [origin], "AllowedMethods": ["POST", "PUT", "GET", "HEAD"],
        "AllowedHeaders": ["content-type", "x-amz-*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 300,
    }]})
    print("Browser CORS configured for the selected frontend origin.")


if __name__ == "__main__":
    main()
