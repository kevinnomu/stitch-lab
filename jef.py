"""Independent byte-level readback for the JEF records Stitch Lab exports."""
from struct import unpack_from

MAX_BYTES = 4 * 1024 * 1024


def inspect_jef(data: bytes) -> dict:
    if not 124 <= len(data) <= MAX_BYTES:
        raise ValueError('Expected a JEF file between 124 bytes and 4 MiB.')
    offset, marker = unpack_from('<II', data)
    colors, declared, hoop = unpack_from('<III', data, 24)
    if marker != 20 or not 1 <= colors <= 1000 or offset != 116 + 8 * colors or offset >= len(data):
        raise ValueError('Invalid JEF header or palette offset.')

    x = y = stitches = jumps = trim_markers = changes = count = 0
    bounds = None
    i = offset
    while i + 2 <= len(data):
        a, b = unpack_from('<Bb', data, i)
        i += 2
        count += 1
        if a == 128:
            if b == 16:
                break
            if b not in (1, 2) or i + 2 > len(data):
                raise ValueError('Invalid extended JEF record.')
            dx, dy = unpack_from('<bb', data, i)
            i += 2
            count += 1
            if b == 1:
                changes += 1
                continue
            if dx == dy == 0:
                trim_markers += 1
            else:
                jumps += 1
        else:
            dx, dy = a if a < 128 else a - 256, b
            stitches += 1
        x += dx
        y -= dy
        if bounds is None:
            bounds = [x, y, x, y]
        else:
            bounds[0] = min(bounds[0], x)
            bounds[1] = min(bounds[1], y)
            bounds[2] = max(bounds[2], x)
            bounds[3] = max(bounds[3], y)
    else:
        raise ValueError('Missing end record.')

    if count != declared:
        raise ValueError(f'Header declares {declared} command units but {count} were decoded.')
    if not stitches or bounds is None:
        raise ValueError('The file has no sewing stitches.')
    return {
        'width_mm': (bounds[2] - bounds[0]) / 10,
        'height_mm': (bounds[3] - bounds[1]) / 10,
        'stitches': stitches,
        'jumps': jumps,
        'trim_markers': trim_markers,
        'color_changes': changes,
        'thread_colors': colors,
        'command_units': count,
        'hoop_code': hoop,
    }
