"""生成 PWA 图标（纯 Pillow，无外部字体依赖时的回退链）。

输出：
  public/icons/icon-192.png         常规图标
  public/icons/icon-512.png         常规图标
  public/icons/icon-maskable-512.png  可遮罩图标（内容在安全区内）
  public/icons/apple-touch-icon.png  iOS 用
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

# 与 styles.css 的 --accent / --accent-deep 一致
TOP = (96, 160, 130)
BOTTOM = (59, 115, 89)
BG = (76, 140, 110)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10 不支持 size 参数
        return ImageFont.load_default()


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def gradient_bg(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(size):
            img.putpixel((x, y), color)
    return img


def draw_symbol(size: int, font: ImageFont.FreeTypeFont | ImageFont.ImageFont, symbol: str = "¥") -> Image.Image:
    """渐变背景 + 圆角 + 居中符号。"""
    img = gradient_bg(size)
    draw = ImageDraw.Draw(img)

    bbox = draw.textbbox((0, 0), symbol, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), symbol, font=font, fill=(255, 255, 255))

    mask = rounded_rect_mask(size, radius=int(size * 0.22))
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    return result


def draw_maskable(size: int, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> Image.Image:
    """maskable：纯色背景铺满，符号收缩到中心约 50% 安全区。"""
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)
    symbol = "¥"
    bbox = draw.textbbox((0, 0), symbol, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), symbol, font=font, fill=(255, 255, 255))
    return img


def main() -> None:
    font_512 = load_font(300)
    font_192 = load_font(120)
    font_180 = load_font(110)

    draw_symbol(512, font_512).save(OUT / "icon-512.png")
    draw_symbol(192, font_192).save(OUT / "icon-192.png")
    draw_symbol(180, font_180).save(OUT / "apple-touch-icon.png")
    draw_maskable(512, load_font(240)).save(OUT / "icon-maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
