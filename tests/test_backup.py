import os
import tarfile

import boto3
import pytest
from moto import mock_aws

from pelican_s3_backup.backup import backup_to_s3


class FakePelican:
    def __init__(self, settings):
        self.settings = settings


@pytest.fixture
def site_dir(tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    (output / "index.html").write_text("<html>hi</html>")
    return output


@mock_aws
def test_backup_uploads_archive_to_s3(site_dir):
    bucket = "test-bucket"
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket=bucket)

    settings = {
        "OUTPUT_PATH": str(site_dir),
        "S3_BACKUP_BUCKET": bucket,
        "S3_BACKUP_PREFIX": "backups",
        "S3_BACKUP_REGION": "us-east-1",
    }

    backup_to_s3(FakePelican(settings))

    objects = client.list_objects_v2(Bucket=bucket).get("Contents", [])
    assert len(objects) == 1
    key = objects[0]["Key"]
    assert key.startswith("backups/")
    assert key.endswith(".tar.gz")


@mock_aws
def test_backup_skipped_when_disabled(site_dir):
    bucket = "test-bucket"
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket=bucket)

    settings = {
        "OUTPUT_PATH": str(site_dir),
        "S3_BACKUP_BUCKET": bucket,
        "S3_BACKUP_ENABLED": False,
    }

    backup_to_s3(FakePelican(settings))

    objects = client.list_objects_v2(Bucket=bucket).get("Contents", [])
    assert objects == []


@mock_aws
def test_backup_skipped_without_bucket(site_dir):
    settings = {"OUTPUT_PATH": str(site_dir)}
    # Should not raise even though no bucket is configured.
    backup_to_s3(FakePelican(settings))


@mock_aws
def test_prune_keeps_only_latest_n(site_dir, monkeypatch):
    bucket = "test-bucket"
    client = boto3.client("s3", region_name="us-east-1")
    client.create_bucket(Bucket=bucket)

    settings = {
        "OUTPUT_PATH": str(site_dir),
        "S3_BACKUP_BUCKET": bucket,
        "S3_BACKUP_PREFIX": "backups",
        "S3_BACKUP_KEEP": 2,
    }

    import time

    for _ in range(3):
        backup_to_s3(FakePelican(settings))
        time.sleep(1.1)  # ensure distinct timestamp-based keys

    objects = client.list_objects_v2(Bucket=bucket).get("Contents", [])
    assert len(objects) == 2
