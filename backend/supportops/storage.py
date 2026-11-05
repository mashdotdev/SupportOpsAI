from functools import lru_cache

import boto3
from botocore.config import Config

from .config import settings


@lru_cache
def client():
    config = settings()
    config.require("aws_access_key_id", "aws_secret_access_key", "aws_endpoint_url_s3")
    return boto3.client("s3", endpoint_url=config.aws_endpoint_url_s3, region_name=config.aws_region,
                        aws_access_key_id=config.aws_access_key_id,
                        aws_secret_access_key=config.aws_secret_access_key,
                        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                                      connect_timeout=10, read_timeout=30, retries={"max_attempts": 2}))


def signed_upload(key, media_type, size):
    return client().generate_presigned_post(
        Bucket=settings().storage_bucket, Key=key,
        Fields={"Content-Type": media_type},
        Conditions=[{"Content-Type": media_type}, ["content-length-range", size, size]], ExpiresIn=300)


def head(key):
    return client().head_object(Bucket=settings().storage_bucket, Key=key)


def accept(staging_key, storage_key, etag):
    client().copy_object(Bucket=settings().storage_bucket, Key=storage_key,
                         CopySource={"Bucket": settings().storage_bucket, "Key": staging_key},
                         CopySourceIfMatch=etag)


def read(key):
    response = client().get_object(Bucket=settings().storage_bucket, Key=key)
    try:
        if response["ContentLength"] > settings().max_file_bytes:
            raise ValueError("File exceeds the upload limit.")
        body = response["Body"].read(settings().max_file_bytes + 1)
        if len(body) > settings().max_file_bytes:
            raise ValueError("File exceeds the upload limit.")
        return body
    finally:
        response["Body"].close()


def delete(key):
    client().delete_object(Bucket=settings().storage_bucket, Key=key)


def download(document):
    # Always download untrusted originals, rather than execute HTML disguised as text.
    filename = document["filename"].replace('"', "").replace("\r", "").replace("\n", "")
    return client().generate_presigned_url("get_object", Params={
        "Bucket": settings().storage_bucket, "Key": document["storage_key"],
        "ResponseContentDisposition": f'attachment; filename="{filename.encode("ascii", "replace").decode()}"',
        "ResponseContentType": "application/octet-stream"}, ExpiresIn=60)
