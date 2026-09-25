# pelican-s3-backup

Ein [Pelican](https://getpelican.com/)-Plugin, das nach jedem Build der
Website automatisch ein Backup als `.tar.gz`-Archiv erstellt und in einen
S3 (oder S3-kompatiblen) Storage-Bucket hochlädt — z. B. AWS S3, MinIO,
Cloudflare R2, Backblaze B2, Wasabi usw.

## Installation

```bash
pip install boto3
```

Kopiere den Ordner `pelican_s3_backup/` in dein Pelican-Projekt (oder
installiere ihn als Paket, siehe `pyproject.toml`), und aktiviere das
Plugin in deiner `pelicanconf.py`:

```python
PLUGINS = [
    # ... deine anderen Plugins
    "pelican_s3_backup",
]
```

## Konfiguration

Alle Einstellungen kommen in die `pelicanconf.py`:

```python
# Pflicht
S3_BACKUP_BUCKET = "mein-backup-bucket"

# Optional (Standardwerte gezeigt)
S3_BACKUP_ENABLED = True            # Backup ein-/ausschalten
S3_BACKUP_PREFIX = "pelican-backups"  # "Ordner" (Key-Prefix) im Bucket
S3_BACKUP_SOURCE = "output"         # "output", "content" oder ein eigener Pfad
S3_BACKUP_KEEP = 10                 # Anzahl Backups, die im Bucket behalten werden (0/None = alle behalten)
S3_BACKUP_REGION = "eu-central-1"
S3_BACKUP_ENDPOINT_URL = None       # z. B. für MinIO/R2: "https://<account>.r2.cloudflarestorage.com"
S3_BACKUP_STORAGE_CLASS = "STANDARD"
S3_BACKUP_SSE = None                # z. B. "AES256" für Server-Side-Encryption

# Zugangsdaten (optional — sonst greift die Standard-AWS-Credential-Chain:
# Umgebungsvariablen, ~/.aws/credentials, IAM-Rolle, etc.)
S3_BACKUP_AWS_ACCESS_KEY_ID = None
S3_BACKUP_AWS_SECRET_ACCESS_KEY = None
```

**Empfehlung:** Zugangsdaten nicht in die `pelicanconf.py` schreiben,
sondern als Umgebungsvariablen setzen:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

## Funktionsweise

Das Plugin hängt sich an das Pelican-Signal `finalized`, das nach
Abschluss eines Builds ausgelöst wird:

1. Das konfigurierte Quellverzeichnis (standardmäßig `OUTPUT_PATH`) wird
   als `.tar.gz`-Archiv gepackt.
2. Das Archiv wird unter
   `s3://<S3_BACKUP_BUCKET>/<S3_BACKUP_PREFIX>/<YYYYMMDD-HHMMSS>.tar.gz`
   hochgeladen.
3. Falls `S3_BACKUP_KEEP` gesetzt ist, werden ältere Backups im gleichen
   Prefix gelöscht, sodass nur die letzten `N` Archive erhalten bleiben.

## Beispiel: Backup des Quellcodes (`content/`) statt des generierten Outputs

```python
S3_BACKUP_SOURCE = "content"
```

## Tests

```bash
pip install -e ".[test]"
pytest
```
