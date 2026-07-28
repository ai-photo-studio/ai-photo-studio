#!/usr/bin/env python3
"""
OPS-73 Benchmark Dataset Generator
Creates 30+ test images covering 10 damage/quality categories.
"""
import io
import os
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUTPUT_DIR = "D:\\models\\benchmark-dataset"
os.makedirs(OUTPUT_DIR, exist_ok=True)

random.seed(42)
np.random.seed(42)

def add_scratch(draw, w, h, count=5):
    for _ in range(count):
        x1 = random.randint(0, w-1)
        y1 = random.randint(0, h-1)
        x2 = x1 + random.randint(-50, 50)
        y2 = y1 + random.randint(-50, 50)
        draw.line([(x1,y1), (x2,y2)], fill=(255,255,255), width=random.randint(1, 3))

def add_dust(draw, w, h, density=0.02):
    for _ in range(int(w*h*density)):
        x = random.randint(0, w-1)
        y = random.randint(0, h-1)
        r = random.randint(1, 3)
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(random.randint(30,80),)*3)

def add_tear(draw, w, h):
    x = random.randint(w//4, 3*w//4)
    y1 = random.randint(0, h//4)
    y2 = random.randint(3*h//4, h-1)
    for i in range(10):
        ox = random.randint(-5, 5)
        draw.line([(x+ox, y1), (x+ox+random.randint(-10,10), y2)], 
                  fill=(random.randint(200,255),)*3, width=random.randint(1, 3))

def add_fading(img, factor=0.3):
    arr = np.array(img, dtype=np.float32)
    arr = arr * factor + 255 * (1 - factor)
    return Image.fromarray(arr.astype(np.uint8))

def add_yellowing(img, amount=40):
    arr = np.array(img, dtype=np.float32)
    arr[:,:,0] = np.clip(arr[:,:,0] + amount * 0.5, 0, 255)  # R+
    arr[:,:,2] = np.clip(arr[:,:,2] - amount * 0.3, 0, 255)  # B-
    return Image.fromarray(arr.astype(np.uint8))

def add_noise(img, std=15):
    arr = np.array(img, dtype=np.float32)
    noise = np.random.normal(0, std, arr.shape)
    return Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))

def create_face(w=512, h=512):
    """Generate a simple face-like image."""
    arr = np.ones((h, w, 3), dtype=np.uint8) * 200  # Skin base
    cy, cx = h//2, w//2
    
    # Face oval
    face = np.zeros((h, w), dtype=np.float32)
    for y in range(h):
        for x in range(w):
            dx = (x-cx)/(w*0.35)
            dy = (y-cy)/(h*0.45)
            if dx*dx + dy*dy <= 1:
                face[y,x] = 1
    mask = face > 0
    arr[mask] = [220, 180, 150]
    
    # Eyes
    draw = ImageDraw.Draw(Image.fromarray(arr))
    for ex in [cx-60, cx+60]:
        draw.ellipse([ex-15, cy-35, ex+15, cy-5], fill=(50,50,50))
        draw.ellipse([ex-7, cy-30, ex+7, cy-10], fill=(255,255,255))
    
    # Mouth
    draw.arc([cx-40, cy+30, cx+40, cy+70], 0, 180, fill=(180,100,100), width=4)
    
    # Hair (top)
    draw.rectangle([cx-120, cy-140, cx+120, cy-70], fill=(80,60,40))
    
    return Image.fromarray(arr)

def create_landscape(w=800, h=600):
    """Generate a simple landscape."""
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    # Sky
    arr[:h//2] = [135, 185, 235]
    # Ground
    arr[h//2:] = [100, 150, 80]
    # Mountains
    for i in range(3):
        mx = w * (i+1) // 4
        mh = h // 3 + random.randint(-50, 50)
        for y in range(h//2, h):
            for x in range(max(0, mx-100), min(w, mx+100)):
                dh = abs(x - mx) * 1.5
                if y > h//2 + mh - dh:
                    arr[y, x] = [120, 130, 140]
    return Image.fromarray(arr)

def create_document(w=600, h=800):
    """Generate a document image."""
    arr = np.ones((h, w, 3), dtype=np.uint8) * 240
    draw = ImageDraw.Draw(Image.fromarray(arr))
    # Text lines
    for i in range(20):
        y = 50 + i * 35
        line_len = random.randint(w//3, 2*w//3)
        draw.rectangle([50, y, 50+line_len, y+15], fill=(50,50,50))
    return Image.fromarray(arr)

def create_architecture(w=600, h=450):
    """Generate a building-like image."""
    arr = np.ones((h, w, 3), dtype=np.uint8) * 200
    draw = ImageDraw.Draw(Image.fromarray(arr))
    # Building
    draw.rectangle([100, 150, 500, 400], fill=(180, 170, 160))
    # Windows
    for y in range(180, 380, 50):
        for x in range(130, 480, 60):
            draw.rectangle([x, y, x+25, y+30], fill=(150, 200, 220))
    # Door
    draw.rectangle([250, 310, 350, 400], fill=(120, 80, 50))
    # Roof
    draw.polygon([(80, 150), (300, 50), (520, 150)], fill=(160, 80, 40))
    # Sky
    for x in range(w):
        for y in range(min(150, h)):
            if y < 150 and (x < 80 or x > 520):
                arr[y, x] = [135, 185, 235]
    return Image.fromarray(arr)

def create_group_photo(w=800, h=600):
    """Generate a group photo with multiple small faces."""
    arr = np.ones((h, w, 3), dtype=np.uint8) * 220
    draw = ImageDraw.Draw(Image.fromarray(arr))
    # Multiple small faces
    positions = [(150, 250), (350, 230), (550, 260), (250, 350), (500, 340)]
    for cx, cy in positions:
        # Head
        draw.ellipse([cx-30, cy-40, cx+30, cy+30], fill=(210, 180, 150))
        # Eyes
        draw.ellipse([cx-12, cy-20, cx-4, cy-10], fill=(50,50,50))
        draw.ellipse([cx+4, cy-20, cx+12, cy-10], fill=(50,50,50))
        # Mouth
        draw.arc([cx-15, cy+5, cx+15, cy+20], 0, 180, fill=(150,100,100), width=2)
    # Background
    draw.rectangle([0, 0, w, 180], fill=(180, 210, 240))
    return Image.fromarray(arr)

def save_with_damage(name, img, damages=None):
    """Save an image with optional damage overlay."""
    draw = ImageDraw.Draw(img)
    w, h = img.size
    
    if damages:
        if "scratch" in damages:
            add_scratch(draw, w, h, count=15)
        if "dust" in damages:
            add_dust(draw, w, h, density=0.03)
        if "tear" in damages:
            add_tear(draw, w, h)
    
    if "fade" in damages:
        img = add_fading(img, factor=0.35)
    
    if "yellow" in damages:
        img = add_yellowing(img, amount=50)
    
    if "noise" in damages:
        img = add_noise(img, std=20)
    
    jpeg_path = os.path.join(OUTPUT_DIR, f"{name}.jpg")
    png_path = os.path.join(OUTPUT_DIR, f"{name}.png")
    img.save(jpeg_path, "JPEG", quality=92)
    img.save(png_path, "PNG")
    size_kb = os.path.getsize(jpeg_path) / 1024
    print(f"  Created {name}.jpg ({w}x{h}, {size_kb:.0f}KB)")
    return jpeg_path, png_path

print("=== OPS-73 Benchmark Dataset Generator ===")
print(f"Output: {OUTPUT_DIR}")
print()

# Category 1: B&W portraits (4 images)
print("1. Black & White Portraits")
for i in range(4):
    img = create_face(600, 700).convert("L").convert("RGB")
    damages = ["scratch", "dust"] if i > 1 else []
    if i == 3: damages += ["tear", "fade"]
    save_with_damage(f"01_bw_portrait_{i+1}", img, damages)

# Category 2: Scratched photos (4 images)
print("2. Heavy Scratches")
for i in range(4):
    img = create_face(600, 700)
    save_with_damage(f"02_heavy_scratch_{i+1}", img, ["scratch", "scratch"])

# Category 3: Dusty photos (3 images)
print("3. Dust/Dirt")
for i in range(3):
    img = create_landscape()
    save_with_damage(f"03_dusty_{i+1}", img, ["dust", "dust"])

# Category 4: Faded photos (3 images)
print("4. Faded")
for i in range(3):
    img = create_face(600, 700)
    save_with_damage(f"04_faded_{i+1}", img, ["fade", "yellow"])

# Category 5: Low resolution (3 images)
print("5. Low Resolution")
for i in range(3):
    img = create_face(300, 350)
    damages = ["noise", "scratch"] if i > 0 else []
    save_with_damage(f"05_lowres_{i+1}", img, damages)

# Category 6: Faces (3 images)  
print("6. Faces")
for i in range(3):
    img = create_face(600, 700)
    damages = ["scratch", "dust"] if i > 1 else []
    save_with_damage(f"06_face_{i+1}", img, damages)

# Category 7: Architecture (3 images)
print("7. Architecture")
for i in range(3):
    img = create_architecture()
    damages = ["scratch", "dust", "fade"] if i > 1 else ["dust"]
    save_with_damage(f"07_architecture_{i+1}", img, damages)

# Category 8: Landscape (3 images)
print("8. Landscape")
for i in range(3):
    img = create_landscape()
    damages = ["fade", "yellow"] if i > 1 else ["dust"]
    save_with_damage(f"08_landscape_{i+1}", img, damages)

# Category 9: Documents (3 images)
print("9. Documents")
for i in range(3):
    img = create_document()
    damages = ["noise", "fade"] if i > 1 else ["dust"]
    save_with_damage(f"09_document_{i+1}", img, damages)

# Category 10: Group photos (3 images)
print("10. Group Photos")
for i in range(3):
    img = create_group_photo()
    damages = ["scratch", "dust", "fade"] if i > 1 else ["dust"]
    save_with_damage(f"10_group_{i+1}", img, damages)

print(f"\n{'='*50}")
print(f"Total: {len(os.listdir(OUTPUT_DIR))} files in {OUTPUT_DIR}")

# List all files
import glob
for f in sorted(os.listdir(OUTPUT_DIR)):
    size = os.path.getsize(os.path.join(OUTPUT_DIR, f)) / 1024
    print(f"  {f}: {size:.0f}KB")
