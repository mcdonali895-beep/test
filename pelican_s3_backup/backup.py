import logging
import os
import tarfile
import tempfile
from datetime import datetime, timezone

from pelican import signals

logger = logging.getLogger(__name__)

DEFAULTS = {
    "S3_BACKUP_ENABLED": True,
    "S3_BACKUP_BUCKET": None,
    "S3_BACKUP_PREFIX": "pelican-backups",
    "S3_BACKUP_SOURCE": "output",
    "S3_BACKUP_KEEP": 10,
    "S3_BACKUP_REGION": None,
    "S3_BACKUP_ENDPOINT_URL": None,
    "S3_BACKUP_AWS_ACCESS_KEY_ID": None,
    "S3_BACKUP_AWS_SECRET_ACCESS_KEY": None,
    "S3_BACKUP_STORAGE_CLASS": "STANDARD",
    "S3_BACKUP_SSE": None,
}


def _setting(settings, key):
    return settings.get(key, DEFAULTS[key])


def _get_client(settings):
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "pelican_s3_backup requires the 'boto3' package. "
            "Install it with: pip install boto3"
        ) from exc

    session_kwargs = {}
    access_key = _setting(settings, "S3_BACKUP_AWS_ACCESS_KEY_ID")
    secret_key = _setting(settings, "S3_BACKUP_AWS_SECRET_ACCESS_KEY")
    if access_key and secret_key:
        session_kwargs["aws_access_key_id"] = access_key
        session_kwargs["aws_secret_access_key"] = secret_key

    region = _setting(settings, "S3_BACKUP_REGION")
    if region:
        session_kwargs["region_name"] = region

    client_kwargs = {}
    endpoint_url = _setting(settings, "S3_BACKUP_ENDPOINT_URL")
    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url

    session = boto3.session.Session(**session_kwargs)
    return session.client("s3", **client_kwargs)


def _resolve_source_dir(settings):
    source = _setting(settings, "S3_BACKUP_SOURCE")
    if source == "output":
        return settings.get("OUTPUT_PATH", "output")
    if source == "content":
        return settings.get("PATH", "content")
    # allow an explicit custom path
    return source


def _archive_name(prefix):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{prefix.rstrip('/')}/{timestamp}.tar.gz"


def _build_archive(source_dir, archive_path):
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(source_dir, arcname=os.path.basename(source_dir.rstrip("/")))


def _prune_old_backups(client, bucket, prefix, keep):
    if not keep or keep <= 0:
        return

    paginator = client.get_paginator("list_objects_v2")
    objects = []
    for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix.rstrip('/')}/"):
        objects.extend(page.get("Contents", []))

    if len(objects) <= keep:
        return

    objects.sort(key=lambda obj: obj["LastModified"])
    to_delete = objects[: len(objects) - keep]
    delete_keys = [{"Key": obj["Key"]} for obj in to_delete]

    for i in range(0, len(delete_keys), 1000):
        chunk = delete_keys[i : i + 1000]
        client.delete_objects(Bucket=bucket, Delete={"Objects": chunk})
        for obj in chunk:
            logger.info("pelican_s3_backup: removed old backup %s", obj["Key"])


def backup_to_s3(pelican_obj):
    settings = pelican_obj.settings if hasattr(pelican_obj, "settings") else pelican_obj

    if not _setting(settings, "S3_BACKUP_ENABLED"):
        return

    bucket = _setting(settings, "S3_BACKUP_BUCKET")
    if not bucket:
        logger.warning(
            "pelican_s3_backup: S3_BACKUP_BUCKET is not set, skipping backup."
        )
        return

    source_dir = _resolve_source_dir(settings)
    if not os.path.isdir(source_dir):
        logger.warning(
            "pelican_s3_backup: source directory '%s' does not exist, skipping backup.",
            source_dir,
        )
        return

    prefix = _setting(settings, "S3_BACKUP_PREFIX")
    key = _archive_name(prefix)

    try:
        client = _get_client(settings)
    except RuntimeError as exc:
        logger.error("pelican_s3_backup: %s", exc)
        return

    with tempfile.TemporaryDirectory() as tmp_dir:
        archive_path = os.path.join(tmp_dir, "backup.tar.gz")
        logger.info("pelican_s3_backup: archiving '%s'...", source_dir)
        _build_archive(source_dir, archive_path)

        extra_args = {"StorageClass": _setting(settings, "S3_BACKUP_STORAGE_CLASS")}
        sse = _setting(settings, "S3_BACKUP_SSE")
        if sse:
            extra_args["ServerSideEncryption"] = sse

        logger.info("pelican_s3_backup: uploading to s3://%s/%s", bucket, key)
        client.upload_file(archive_path, bucket, key, ExtraArgs=extra_args)
        logger.info("pelican_s3_backup: backup uploaded successfully.")

    _prune_old_backups(client, bucket, prefix, _setting(settings, "S3_BACKUP_KEEP"))


def register():
    signals.finalized.connect(backup_to_s3)
