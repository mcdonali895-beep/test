"""Pelican plugin that backs up the generated site (and optionally the
content/ source) to an S3-compatible object storage bucket.

Enable it by adding ``pelican_s3_backup`` to ``PLUGINS`` in your
``pelicanconf.py`` and configuring the ``S3_BACKUP_*`` settings documented
in the README.
"""

from .backup import register

__all__ = ["register"]
