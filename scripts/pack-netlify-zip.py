import os
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: pack-netlify-zip.py <source-dir> <zip-path>")
        return 1

    src = sys.argv[1]
    out = sys.argv[2]

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(src):
            for name in files:
                full = os.path.join(root, name)
                arc = os.path.relpath(full, src).replace("\\", "/")
                zf.write(full, arc)

    with zipfile.ZipFile(out) as zf:
        print(f"entries: {len(zf.namelist())}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
