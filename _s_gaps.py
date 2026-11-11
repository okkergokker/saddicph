from PIL import Image

im = Image.open(r"c:\Users\CHRIST~1\AppData\Local\Temp\cursor\screenshots\s-over-photo.png").convert("RGB")
print("size", im.size)
px = im.load()
w, h = im.size
# Find burgundy-ish pixels in the top-left quarter
ink = []
for y in range(0, h // 3):
    for x in range(0, w // 2):
        r, g, b = px[x, y]
        if r > 70 and r < 160 and g < 70 and b < 80 and r > g + 30:
            ink.append((x, y, (r, g, b)))
print("burgundy pixels", len(ink))
if ink:
    xs = [p[0] for p in ink]
    ys = [p[1] for p in ink]
    print("bbox", min(xs), min(ys), max(xs), max(ys))
    # sample a few ink pixels and their neighbors
    for p in ink[:: max(1, len(ink) // 8)]:
        x, y, c = p
        print("ink", x, y, c)

# Look for near-white pixels near the ink bbox
if ink:
    x0, y0, x1, y1 = min(xs) - 30, min(ys) - 30, max(xs) + 40, max(ys) + 40
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w - 1, x1), min(h - 1, y1)
    white = soft = other = 0
    samples = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if r > 245 and g > 245 and b > 245:
                white += 1
            elif r > 220 and g > 220 and b > 220 and abs(r - g) < 12:
                soft += 1
                if len(samples) < 6:
                    samples.append((x, y, (r, g, b)))
            elif not (r > 70 and r < 160 and g < 70 and b < 80):
                other += 1
                if len(samples) < 12 and r < 230:
                    samples.append(("other", x, y, (r, g, b)))
    print("near white", white, "soft", soft, "other", other)
    print("samples", samples[:12])
    crop = im.crop((x0, y0, x1, y1))
    crop.save("_s_crop.png")
    print("crop", crop.size, x0, y0, x1, y1)
