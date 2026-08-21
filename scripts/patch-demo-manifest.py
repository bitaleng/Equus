"""Patch manifest.json for demo builds (UTF-8 safe)."""
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: patch-demo-manifest.py <manifest.json>")
        return 1

    path = Path(sys.argv[1])
    if not path.exists():
        print("WARN: manifest not found")
        return 0

    m = json.loads(path.read_text(encoding="utf-8"))
    m["display"] = "browser"
    m["description"] = "10일 체험판 — 홈 화면 설치 미지원"
    m["icons"] = []
    path.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
    print("demo manifest patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
