from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: stitch_manual_pages.py PAGE_DIRECTORY OUTPUT_PNG")

    page_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    page_paths = sorted(page_dir.glob("page-*.png"), key=lambda path: int(path.stem.split("-")[-1]))
    if not page_paths:
        raise SystemExit(f"no rendered pages found in {page_dir}")

    pages = [Image.open(path).convert("RGB") for path in page_paths]
    width = max(page.width for page in pages)
    gap = 24
    height = sum(page.height for page in pages) + gap * (len(pages) - 1)
    canvas = Image.new("RGB", (width, height), "white")

    y = 0
    for page in pages:
        x = (width - page.width) // 2
        canvas.paste(page, (x, y))
        y += page.height + gap

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
