"""Prepare the generated v0.4 hero art for the game's sprite renderer.

The image generator returned six-row review sheets on a light checkerboard.
This script removes that connected checkerboard, normalizes every pose into a
square cell, and writes the top five rows plus the hit row to their production
locations.
"""

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs" / "concepts" / "hero-sprites-v040-raw"
SPRITE_DIR = ROOT / "public" / "assets" / "sprites"
HIT_DIR = SPRITE_DIR / "hit"


def is_checker_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, _ = pixel
    return min(red, green, blue) >= 232 and max(red, green, blue) - min(red, green, blue) <= 9


def clear_connected_checkerboard(image: Image.Image) -> Image.Image:
    """Clear only light neutral pixels connected to the canvas edge.

    Using connectivity preserves enclosed white details such as Chronos's
    hourglass glass and Morvane's hair while removing the generated backdrop.
    """

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    queue: deque[tuple[int, int]] = deque()
    visited = bytearray(width * height)

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not is_checker_pixel(pixels[x, y]):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    return rgba


def split_into_square_cells(image: Image.Image) -> list[list[Image.Image]]:
    width, height = image.size
    x_edges = [round(index * width / 4) for index in range(5)]
    y_edges = [round(index * height / 6) for index in range(7)]
    cell_size = max(
        max(x_edges[index + 1] - x_edges[index] for index in range(4)),
        max(y_edges[index + 1] - y_edges[index] for index in range(6)),
    )
    rows: list[list[Image.Image]] = []

    for row in range(6):
        cells: list[Image.Image] = []
        for column in range(4):
            cell = image.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
            canvas = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
            x = (cell_size - cell.width) // 2
            y = (cell_size - cell.height) // 2
            canvas.alpha_composite(cell, (x, y))
            cells.append(canvas)
        rows.append(cells)

    return rows


def assemble(rows: list[list[Image.Image]]) -> Image.Image:
    cell_size = rows[0][0].width
    sheet = Image.new("RGBA", (cell_size * 4, cell_size * len(rows)), (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for column_index, cell in enumerate(row):
            sheet.alpha_composite(cell, (column_index * cell_size, row_index * cell_size))
    return sheet


def process(character: str) -> None:
    source = clear_connected_checkerboard(Image.open(SOURCE_DIR / f"{character}.png"))
    rows = split_into_square_cells(source)
    assemble(rows[:5]).save(SPRITE_DIR / f"{character}.png", optimize=True)
    # Keep the generated hit rows as PNG. Pillow's WebP encoder preserves stray
    # RGB values behind alpha here, which some browser decoders expose as bands.
    assemble(rows[5:]).save(HIT_DIR / f"{character}.png", optimize=True)


if __name__ == "__main__":
    HIT_DIR.mkdir(parents=True, exist_ok=True)
    for character_name in ("Chronos", "Kage", "Morvane"):
        process(character_name)
