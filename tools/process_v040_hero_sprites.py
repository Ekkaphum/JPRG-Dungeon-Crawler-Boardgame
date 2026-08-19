"""Prepare the generated v0.4 hero art for the game's sprite renderer.

The image generator returned six-row review sheets on a light checkerboard.
This script removes that connected checkerboard and its light matte fringe,
normalizes every pose into a square cell, and writes the top five rows plus the
hit row to their production locations. It also rebuilds Kit's damaged hit row
from his clean idle frames; the CSS recoil supplies the impact motion.
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


def remove_light_matte(image: Image.Image, enclosed_area: int = 500) -> Image.Image:
    """Remove the baked light backdrop without hollowing pale character details.

    Large/edge-connected near-white regions are checkerboard remnants. A final
    single contour pass clears the remaining one-pixel gray fringe. The contour
    pass is intentionally not repeated: Chrono and Morvane both have pale hair
    that must stay intact once the outer matte pixel is gone.
    """

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    visited = bytearray(width * height)

    def is_bright_neutral(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        return alpha > 0 and min(red, green, blue) >= 210 and max(red, green, blue) - min(red, green, blue) <= 35

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index] or not is_bright_neutral(start_x, start_y):
                continue

            visited[start_index] = 1
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            component: list[tuple[int, int]] = []
            touches_transparency = False

            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        touches_transparency = True
                        continue
                    if pixels[next_x, next_y][3] == 0:
                        touches_transparency = True
                    next_index = next_y * width + next_x
                    if not visited[next_index] and is_bright_neutral(next_x, next_y):
                        visited[next_index] = 1
                        queue.append((next_x, next_y))

            if touches_transparency or len(component) >= enclosed_area:
                for x, y in component:
                    pixels[x, y] = (0, 0, 0, 0)

    original_alpha = rgba.getchannel("A")
    alpha_pixels = original_alpha.load()
    contour: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            touches_transparency = any(
                alpha_pixels[next_x, next_y] == 0
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                if 0 <= next_x < width and 0 <= next_y < height
            )
            if touches_transparency and min(red, green, blue) >= 170 and max(red, green, blue) - min(red, green, blue) <= 50:
                contour.append((x, y))

    for x, y in contour:
        pixels[x, y] = (0, 0, 0, 0)
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


def process(source_name: str, output_name: str) -> None:
    source = clear_connected_checkerboard(Image.open(SOURCE_DIR / f"{source_name}.png"))
    rows = split_into_square_cells(source)
    remove_light_matte(assemble(rows[:5])).save(SPRITE_DIR / f"{output_name}.png", optimize=True)
    # Keep the generated hit rows as PNG. Pillow's WebP encoder preserves stray
    # RGB values behind alpha here, which some browser decoders expose as bands.
    remove_light_matte(assemble(rows[5:])).save(HIT_DIR / f"{output_name}.png", optimize=True)


def rebuild_kit_hit() -> None:
    source = Image.open(SPRITE_DIR / "Kit.png").convert("RGBA")
    width, height = source.size
    x_edges = [round(index * width / 4) for index in range(5)]
    idle_height = round(height / 5)
    cell_size = max(idle_height, max(x_edges[index + 1] - x_edges[index] for index in range(4)))
    idle_cells: list[Image.Image] = []

    for column in range(4):
        cell = source.crop((x_edges[column], 0, x_edges[column + 1], idle_height))
        canvas = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
        canvas.alpha_composite(cell, ((cell_size - cell.width) // 2, (cell_size - cell.height) // 2))
        idle_cells.append(canvas)

    assemble([idle_cells]).save(HIT_DIR / "Kit.png", optimize=True)


if __name__ == "__main__":
    HIT_DIR.mkdir(parents=True, exist_ok=True)
    for source_character, output_character in (("Chronos", "Chrono"), ("Kage", "Kage"), ("Morvane", "Morvane")):
        process(source_character, output_character)
    rebuild_kit_hit()
