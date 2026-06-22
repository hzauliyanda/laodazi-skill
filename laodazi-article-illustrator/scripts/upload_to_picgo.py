#!/usr/bin/env python3
"""Upload local image(s) to the GitHub 图床 (hzauliyanda/picgo-images) and print raw URLs.

Usage:
    python3 upload_to_picgo.py <local.png> [remote-name.png]
    python3 upload_to_picgo.py <file1.png> <file2.png> ...   # auto remote names = basenames

Token: read from env GH_PICGO_TOKEN (set in ~/.zprofile).
Prints one line per file:  OK <remote> <raw_url>   or   ERR <remote> <reason>
Exit code 0 if all succeed, 1 otherwise.
"""
import base64, json, os, sys, urllib.request, urllib.error

OWNER, REPO, BRANCH, SUBDIR = "hzauliyanda", "picgo-images", "main", "img"
RAW = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/{SUBDIR}"

TOKEN = os.environ.get("GH_PICGO_TOKEN", "")
if not TOKEN:
    print("ERR - GH_PICGO_TOKEN not set in env (see ~/.zprofile)")
    sys.exit(1)


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.github.com{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {TOKEN}",
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "laodazi-illustrator"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {"message": str(e)}


def upload(local, remote):
    with open(local, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    gp = f"/repos/{OWNER}/{REPO}/contents/{SUBDIR}/{remote}"
    st, info = api("GET", gp + f"?ref={BRANCH}")
    body = {"message": f"add {remote}", "content": content, "branch": BRANCH}
    if st == 200 and isinstance(info, dict) and info.get("sha"):
        body["sha"] = info["sha"]  # overwrite existing
    st, resp = api("PUT", gp, body)
    if st in (200, 201):
        return True, f"{RAW}/{remote}"
    return False, (resp.get("message") if isinstance(resp, dict) else str(resp))


def main(argv):
    if not argv:
        print("ERR - no files given"); return 1
    # If exactly 2 args and 2nd ends with image ext-like name, treat as single rename
    pairs = []
    if len(argv) == 2 and not os.path.exists(argv[1]):
        pairs = [(argv[0], argv[1])]
    else:
        pairs = [(p, os.path.basename(p)) for p in argv]
    ok = True
    for local, remote in pairs:
        if not os.path.exists(local):
            print(f"ERR {remote} file-not-found:{local}"); ok = False; continue
        good, val = upload(local, remote)
        print(f"{'OK' if good else 'ERR'} {remote} {val}")
        ok = ok and good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
