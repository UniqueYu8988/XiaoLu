from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"


def resize_set(source_name: str, prefix: str, sizes: list[int]) -> None:
    source = Image.open(ICON_DIR / source_name).convert("RGBA")
    for size in sizes:
        resized = source.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICON_DIR / f"{prefix}-{size}.png", optimize=True)


def main() -> None:
    app_sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512]
    tray_sizes = [16, 20, 24, 32, 48, 64]
    resize_set("app-icon-raw.png", "app-icon", app_sizes)
    resize_set("tray-icon-raw.png", "tray-icon", tray_sizes)
    app = Image.open(ICON_DIR / "app-icon-raw.png").convert("RGBA")
    app.save(ICON_DIR / "app-icon.ico", sizes=[(size, size) for size in [16, 24, 32, 48, 64, 128, 256]])
    app.resize((256, 256), Image.Resampling.LANCZOS).save(ICON_DIR / "app-icon.png", optimize=True)
    tray = Image.open(ICON_DIR / "tray-icon-raw.png").convert("RGBA")
    tray.resize((32, 32), Image.Resampling.LANCZOS).save(ICON_DIR / "tray-icon.png", optimize=True)


if __name__ == "__main__":
    main()
