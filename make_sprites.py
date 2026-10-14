"""
Generates the pixel art for Pixel Box Party.

Run:  python make_sprites.py      (needs: pip install pillow)

Outputs:
  public/sprites.png  - 32x32 cells, 8 columns x 3 rows (used by the game)
  public/box.png      - 16x16 crate
  preview.png         - big labelled preview of every frame (open this to look at them)

Sprite sheet layout (all frames face RIGHT, the game flips them for left):
  row 0 (empty hands): idle0 idle1 walk0 walk1 walk2 walk3 jump
  row 1 (holding box): idle0 idle1 walk0 walk1 walk2 walk3 jump
  row 2 (grabbing):    reach0 reach1
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "public")
os.makedirs(PUB, exist_ok=True)

CELL = 32
COLS = 8

BLACK = (22, 22, 28, 255)
CAP = (236, 232, 242, 255)
CAP_SH = (172, 162, 190, 255)
TEAL = (84, 140, 160, 255)
TEAL_D = (46, 98, 118, 255)
WHITE = (252, 252, 254, 255)
SOLE = (188, 178, 204, 255)
DIGIT = (30, 30, 40, 255)


def shoe(d, fx, fy):
    fx += 1  # shoes point forward
    d.ellipse([fx - 3, fy - 1, fx + 3, fy + 1], fill=WHITE)
    d.line([fx - 3, fy + 2, fx + 3, fy + 2], fill=SOLE)
    d.point((fx - 3, fy + 1), fill=SOLE)


def leg(d, hip, knee, foot):
    d.line([hip, knee, foot], fill=BLACK, width=1)
    # make the legs a touch thicker so they read at small size
    d.line([(hip[0] + 1, hip[1]), (knee[0] + 1, knee[1])], fill=BLACK, width=1)
    d.line([(knee[0] + 1, knee[1]), (foot[0], foot[1] - 1)], fill=BLACK, width=1)


ARMS = {
    "down": [(12, 13), (9, 16), (10, 20)],
    "up": [(12, 13), (9, 9), (8, 5)],
    "hold": [(13, 14), (17, 17), (22, 15)],
    "reach0": [(13, 14), (17, 15), (21, 15)],
    "reach1": [(13, 14), (19, 14), (25, 14)],
}


def guy(bob, back, front, arms):
    """back / front = (knee, foot). bob = body vertical offset."""
    im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    b = bob

    # back leg
    leg(d, (12, 22 + b), back[0], back[1])
    shoe(d, *back[1])

    # head / torso blob
    d.ellipse([8, 8 + b, 18, 17 + b], fill=BLACK)

    # scarf tail
    d.line([(17, 12 + b), (22, 13 + b), (24, 12 + b)], fill=TEAL_D, width=1)

    # shorts with "00"
    d.rectangle([9, 17 + b, 17, 22 + b], fill=WHITE)
    d.line([(9, 22 + b), (17, 22 + b)], fill=SOLE)
    d.rectangle([10, 18 + b, 12, 21 + b], outline=DIGIT)
    d.rectangle([14, 18 + b, 16, 21 + b], outline=DIGIT)

    # front leg
    leg(d, (14, 22 + b), front[0], front[1])
    shoe(d, *front[1])

    # long cap
    d.polygon([(9, 6 + b), (16, 3 + b), (26, 5 + b), (30, 9 + b),
               (24, 10 + b), (14, 10 + b), (9, 9 + b)], fill=CAP)
    d.line([(11, 9 + b), (25, 10 + b)], fill=CAP_SH)
    d.point((29, 9 + b), fill=CAP_SH)

    # arm (teal) + fist
    pts = [(x, y + b) for x, y in ARMS[arms]]
    d.line(pts, fill=TEAL, width=2)
    hx, hy = pts[-1]
    d.rectangle([hx - 1, hy - 1, hx + 1, hy + 1], fill=TEAL_D)
    return outline(im)


OUTLINE = (52, 46, 74, 255)


def outline(im):
    """Shift up 1px (room for the outline under the shoes) and add a 1px outline."""
    shifted = Image.new("RGBA", im.size, (0, 0, 0, 0))
    shifted.paste(im, (0, -1))
    src = shifted.load()
    out = shifted.copy()
    o = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 0:
                        o[x, y] = OUTLINE
                        break
    return out


# (bob, back(knee,foot), front(knee,foot))
POSES = {
    "idle0": (0, ((12, 26), (11, 29)), ((14, 26), (16, 29))),
    "idle1": (1, ((12, 26), (11, 29)), ((14, 26), (16, 29))),
    "walk0": (1, ((10, 26), (8, 29)), ((17, 26), (19, 29))),
    "walk1": (0, ((14, 24), (13, 27)), ((13, 26), (13, 29))),
    "walk2": (1, ((17, 26), (19, 29)), ((10, 26), (8, 29))),
    "walk3": (0, ((13, 26), (13, 29)), ((14, 24), (13, 27))),
    "jump": (0, ((10, 25), (6, 26)), ((17, 24), (19, 27))),
}
ORDER = ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3", "jump"]


def make_box():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    brown, dark, light = (186, 128, 70, 255), (104, 64, 32, 255), (222, 172, 108, 255)
    d.rectangle([0, 0, 15, 15], fill=dark)
    d.rectangle([1, 1, 14, 14], fill=brown)
    d.rectangle([1, 1, 14, 2], fill=light)
    d.line([(2, 2), (13, 13)], fill=dark)
    d.line([(13, 2), (2, 13)], fill=dark)
    d.rectangle([4, 4, 11, 11], outline=dark)
    return im


def main():
    frames = []  # (label, image)
    sheet = Image.new("RGBA", (CELL * COLS, CELL * 3), (0, 0, 0, 0))

    for row, arms in enumerate(["down", "hold"]):
        for col, name in enumerate(ORDER):
            arm = "up" if (name == "jump" and arms == "down") else arms
            bob, back, front = POSES[name]
            im = guy(bob, back, front, arm)
            sheet.paste(im, (col * CELL, row * CELL))
            frames.append((("hold " if row else "") + name, im))

    for col, arm in enumerate(["reach0", "reach1"]):
        bob, back, front = POSES["idle0"]
        im = guy(bob, back, front, arm)
        sheet.paste(im, (col * CELL, 2 * CELL))
        frames.append((arm, im))

    sheet.save(os.path.join(PUB, "sprites.png"))
    box = make_box()
    box.save(os.path.join(PUB, "box.png"))

    # ---- preview ----
    S = 5
    cols = 8
    rows = 3
    pw, ph = cols * CELL * S + 20, rows * (CELL * S + 18) + 20 + 16 * S + 30
    pv = Image.new("RGBA", (pw, ph), (255, 255, 255, 255))
    d = ImageDraw.Draw(pv)
    font = ImageFont.load_default()
    for i, (label, im) in enumerate(frames):
        r, c = divmod(i, cols)
        if i >= 14:
            r, c = 2, i - 14
        x, y = 10 + c * CELL * S, 10 + r * (CELL * S + 18)
        d.rectangle([x, y, x + CELL * S - 1, y + CELL * S - 1], outline=(225, 225, 225, 255))
        pv.alpha_composite(im.resize((CELL * S, CELL * S), Image.NEAREST), (x, y))
        d.text((x + 2, y + CELL * S + 2), label, fill=(90, 90, 90, 255), font=font)
    # box + holding demo
    by = 10 + 3 * (CELL * S + 18) - 18 + 24
    pv.alpha_composite(box.resize((16 * S, 16 * S), Image.NEAREST), (10 + 2 * CELL * S + 20, 10 + 2 * (CELL * S + 18)))
    d.text((10 + 2 * CELL * S + 20, 10 + 2 * (CELL * S + 18) + 16 * S + 2), "box", fill=(90, 90, 90, 255), font=font)
    pv.convert("RGB").save(os.path.join(HERE, "preview.png"))
    print("Wrote public/sprites.png, public/box.png and preview.png")


if __name__ == "__main__":
    main()
