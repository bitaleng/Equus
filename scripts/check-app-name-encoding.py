import zipfile
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    expected = {
        "netlify-v1.zip": "LOCKER MANAGER",
        "netlify-v2.zip": "He's 입실관리매니저",
    }
    for zip_name, name in expected.items():
        with zipfile.ZipFile(root / zip_name) as z:
            js = next(
                n
                for n in z.namelist()
                if n.startswith("assets/index-") and n.endswith(".js")
            )
            data = z.read(js).decode("utf-8", errors="replace")
        ok = name in data
        print(f"{zip_name}: {'OK' if ok else 'FAIL'} contains {name!r}")
        if not ok:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
