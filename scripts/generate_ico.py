import struct
import io
import os
import shutil
from PIL import Image

def make_dib_entry(img, size):
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    if resized.mode != 'RGBA':
        resized = resized.convert('RGBA')
    
    w, h = size, size
    xor_data = bytearray()
    pixels = resized.load()
    for y in reversed(range(h)):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            xor_data.extend([b, g, r, a])
            
    row_bytes = (w + 31) // 32 * 4
    and_mask = bytearray()
    for y in reversed(range(h)):
        row = bytearray(row_bytes)
        for x in range(w):
            a = pixels[x, y][3]
            if a == 0:
                row[x // 8] |= (1 << (7 - (x % 8)))
        and_mask.extend(row)
        
    bih = struct.pack(
        '<IIIHHIIIIII',
        40,          # biSize
        w,           # biWidth
        h * 2,       # biHeight (doubled for XOR + AND)
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression (BI_RGB)
        len(xor_data) + len(and_mask), # biSizeImage
        0,           # biXPelsPerMeter
        0,           # biYPelsPerMeter
        0,           # biClrUsed
        0            # biClrImportant
    )
    return bih + bytes(xor_data) + bytes(and_mask)

def make_png_entry(img, size):
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format='PNG')
    return buf.getvalue()

def generate_ico(src_path, dest_paths):
    src = Image.open(src_path)
    if src.mode != 'RGBA':
        src = src.convert('RGBA')
        
    sizes_config = [
        (16, False),
        (24, False),
        (32, False),
        (48, False),
        (64, False),
        (128, False),
        (256, True),
    ]

    entries = []
    for s, is_png in sizes_config:
        if is_png:
            data = make_png_entry(src, s)
        else:
            data = make_dib_entry(src, s)
        entries.append((s, data))

    ico_bytes = bytearray()
    ico_bytes.extend(struct.pack('<HHH', 0, 1, len(entries)))

    offset = 6 + len(entries) * 16
    for s, data in entries:
        w_byte = 0 if s == 256 else s
        h_byte = 0 if s == 256 else s
        ico_bytes.extend(struct.pack('<BBBBHHII', w_byte, h_byte, 0, 0, 1, 32, len(data), offset))
        offset += len(data)

    for s, data in entries:
        ico_bytes.extend(data)

    for dest in dest_paths:
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        with open(dest, 'wb') as f:
            f.write(ico_bytes)
        print(f'Wrote {dest} ({len(ico_bytes)} bytes)')

if __name__ == '__main__':
    targets = [
        'src-tauri/icons/icon.ico',
        'GSpaceOne_PhotoID.ico',
    ]
    generate_ico('app-icon.png', targets)

