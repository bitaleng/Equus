import json
import sys
import zipfile

EXPECTED = {
    "v1": {"id": "/equus", "short_name": "LOCKER", "name": "EQUUS LOCKER MANAGER"},
    "v2": {"id": "/hizz", "short_name": "He's", "name": "He's 입실관리매니저"},
    "v3": {"id": "/home24", "short_name": "home24시", "name": "home24시 입실관리매니저"},
    "demo": {"id": "/demo", "short_name": "체험", "name": "입실관리 체험판"},
}


def expected_manifest(skin: str, demo: bool) -> dict:
    base = EXPECTED.get(skin)
    if not base:
        return {}
    if skin == "demo" or demo:
        return base
    return base


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: verify-netlify-zip.py <zip-path> [v1|v2|v3]")
        return 1

    zip_path = sys.argv[1]
    skin = sys.argv[2] if len(sys.argv) == 3 else None
    demo = zip_path.endswith("-demo.zip") or skin == "demo"
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        sw = z.read("sw.js").decode("utf-8", errors="replace")
        manifest = json.loads(z.read("manifest.json").decode("utf-8"))
        html = z.read("index.html").decode("utf-8", errors="replace")

    js_assets = [n for n in names if n.startswith("assets/") and n.endswith(".js")]
    has_wasm = any(
        n.endswith(".wasm") and (n.startswith("assets/") or "/" not in n.rstrip("/"))
        for n in names
    )
    checks = [
        ("index.html" in names, "index.html not at zip root"),
        (bool(js_assets), "no JS files in assets/"),
        (has_wasm, "no wasm (assets/ or zip root)"),
        ("sw.js" in names, "sw.js missing"),
        ("hugaetel-v37" in sw, "sw.js is not v37"),
        ("/cctv/view" in sw and "/cctv/remote" in sw and "/screen/view" in sw, "cctv/screen routes missing in sw.js"),
        ("sw-precache.json" in names, "sw-precache.json missing"),
        (
            any(n.startswith("netlify/functions/") for n in names),
            "netlify/functions missing",
        ),
    ]

    if skin:
        expect = expected_manifest(skin, demo)
        if not expect:
            print(f"ERROR: unknown skin {skin}")
            return 1
        checks.extend(
            [
                (manifest.get("id") == expect["id"], f"manifest id is {manifest.get('id')}, expected {expect['id']}"),
                (
                    manifest.get("short_name") == expect["short_name"],
                    f"manifest short_name is {manifest.get('short_name')}, expected {expect['short_name']}",
                ),
                (
                    manifest.get("name") == expect["name"],
                    f"manifest name is {manifest.get('name')}, expected {expect['name']}",
                ),
            ]
        )
        if not demo:
            checks.append(
                (
                    expect["name"] in html,
                    f"index.html title missing {expect['name']}",
                )
            )

    for ok, msg in checks:
        if not ok:
            print(f"ERROR: {msg}")
            return 1

    print(f"OK: {len(names)} files, {len(js_assets)} JS bundles in assets/")
    if skin:
        print(f"OK skin={skin} id={manifest.get('id')} name={manifest.get('name')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
