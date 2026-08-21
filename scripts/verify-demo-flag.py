"""Verify demo vs production markers inside a Netlify zip."""
import sys
import zipfile

DEMO_MARKER = "IVANSAUNA_DEMO_SITE"


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: verify-demo-flag.py <zip-path> <demo|prod>")
        return 1

    zip_path, mode = sys.argv[1], sys.argv[2]
    want_demo = mode == "demo"

    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        js = next(
            n for n in names if n.startswith("assets/index-") and n.endswith(".js")
        )
        data = z.read(js).decode("utf-8", errors="replace")
        has_license_gen = "license-generator.html" in names
        has_demo_file = "demo-build.txt" in names

    has_marker = DEMO_MARKER in data

    if want_demo and not has_marker:
        print(f"ERROR: demo build missing {DEMO_MARKER}")
        return 1
    if not want_demo and has_marker:
        print(f"ERROR: production build contains {DEMO_MARKER}")
        return 1
    if want_demo and has_license_gen:
        print("ERROR: demo zip should not include license-generator.html")
        return 1
    if want_demo and not has_demo_file:
        print("ERROR: demo zip missing demo-build.txt")
        return 1
    if not want_demo and has_demo_file:
        print("ERROR: production zip should not include demo-build.txt")
        return 1

    if 'get("demo")' in data or "get('demo')" in data:
        print("WARN: legacy URL demo param still referenced in bundle")

    print(
        f"OK mode={mode} marker={has_marker} "
        f"license_gen={has_license_gen} demo_file={has_demo_file}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
