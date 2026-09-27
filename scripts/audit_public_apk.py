"""Fail publication if a private preconfigured URL survives inside the APK."""
from pathlib import Path
from zipfile import ZipFile
import sys

root = Path(__file__).resolve().parents[1]
apk = Path(sys.argv[1])
private = root / "android-app/local.properties"
needles = []
if private.exists():
    for line in private.read_text(encoding="utf-8").splitlines():
        if line.startswith(("xiaolu.baseUrl=", "xiaolu.programmingUrl=")):
            value = line.split("=", 1)[1].strip()
            if value:
                needles.extend([value.encode(), value.replace("https://", "").encode()])
with ZipFile(apk) as archive:
    for entry in archive.infolist():
        contents = archive.read(entry)
        if any(needle in contents for needle in needles):
            raise SystemExit("Private preset found in APK; rebuild with publicBuild=true.")
print("Public APK audit passed: no local preset addresses embedded.")
