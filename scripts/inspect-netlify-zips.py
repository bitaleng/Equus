import json
import re
import sys
import zipfile
from pathlib import Path


def inspect_zip(zip_path: Path) -> dict:
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        sw = z.read("sw.js").decode("utf-8", errors="replace")
        toml = z.read("netlify.toml").decode("utf-8", errors="replace")
        manifest = json.loads(z.read("manifest.json"))
        precache = json.loads(z.read("sw-precache.json"))

    cache_match = re.search(r"CACHE_NAME = '([^']+)'", sw)
    expected_name = "He's 입실관리매니저" if "v2" in zip_path.name else "LOCKER MANAGER"
    return {
        "zip": zip_path.name,
        "files": len(names),
        "sw_cache": cache_match.group(1) if cache_match else "missing",
        "sw_cache_ok": bool(cache_match and cache_match.group(1) == "hugaetel-v18"),
        "cctv_routes": all(x in sw for x in ["/cctv/view", "/cctv/remote", "/admin/cctv"]),
        "functions": [n for n in names if n.startswith("netlify/functions/")],
        "demo_trial_fn": (
            "netlify/functions/demo-trial.js" in names
            or "netlify/functions/demo-trial.ts" in names
        ),
        "cctv_api_redirect": "/api/cctv/register" in toml,
        "demo_api_redirect": "/api/demo/trial" in toml,
        "functions_dir": 'directory = "netlify/functions"' in toml,
        "manifest_name": manifest.get("name"),
        "manifest_name_ok": manifest.get("name") == expected_name,
        "shortcuts": [s.get("url") for s in manifest.get("shortcuts", [])],
        "precache_entries": len(precache),
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    for name in ("netlify-v1.zip", "netlify-v2.zip"):
        info = inspect_zip(root / name)
        print(f"=== {info['zip']} ===")
        for key, value in info.items():
            if key != "zip":
                print(f"{key}: {value}")
        failed = [
            key for key in (
                "sw_cache_ok",
                "cctv_routes",
                "cctv_api_redirect",
                "demo_api_redirect",
                "demo_trial_fn",
                "functions_dir",
                "manifest_name_ok",
            )
            if not info.get(key)
        ]
        if failed:
            print("FAILED:", ", ".join(failed))
            return 1
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
