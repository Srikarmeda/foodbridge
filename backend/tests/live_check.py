#!/usr/bin/env python3
"""FoodBridge live-site verification (Task 11). Read-only: it never writes data.

Usage:
  python backend/tests/live_check.py --site https://dxxxx.cloudfront.net \
      --api https://abc123.execute-api.us-east-1.amazonaws.com \
      --images https://foodbridge-images-srikar.s3.us-east-1.amazonaws.com
"""
import argparse
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

PAGES = ["index.html", "login.html", "signup.html", "donor.html", "post.html", "browse.html",
         "listing.html", "claims.html", "impact.html", "admin.html", "styleguide.html"]
EVIL = "https://evil.example"
REDIRECTS = (301, 302, 307, 308)
IMPORT_RE = re.compile(r"""(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}/[^"']+)["']""")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(url, method="GET", headers=None, follow=True):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
    except urllib.error.URLError as e:
        return 0, {}, str(e.reason).encode()


def local_refs(html):
    out = []
    for ref in re.findall(r'(?:href|src)="([^"]+)"', html):
        if re.match(r"^(https?:|//|data:|mailto:|#)", ref):
            continue
        ref = ref.split("#")[0].split("?")[0]
        if ref:
            out.append(ref)
    return out


def crawl(base, pages):
    """Fetch every page, then every local CSS/JS file it (and its imports) references."""
    seen, problems, stack = set(), [], [urllib.parse.urljoin(base + "/", p) for p in pages]
    while stack:
        url = stack.pop()
        if url in seen:
            continue
        seen.add(url)
        status, _, body = fetch(url)
        if status != 200:
            problems.append(f"{status}  {url}")
            continue
        text = body.decode("utf-8", "replace") if url.endswith((".html", ".js")) else ""
        if url.endswith(".html"):
            stack += [urllib.parse.urljoin(url, r) for r in local_refs(text)]
        elif url.endswith(".js"):
            stack += [urllib.parse.urljoin(url, r) for r in IMPORT_RE.findall(text)]
    return len(seen), problems


def allow_origin(url, origin, method="GET"):
    _, h, _ = fetch(url, "OPTIONS", {"Origin": origin, "Access-Control-Request-Method": method,
                                     "Access-Control-Request-Headers": "authorization,content-type"})
    return h.get("Access-Control-Allow-Origin")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--api", required=True)
    ap.add_argument("--images", required=True)
    a = ap.parse_args()
    site, api, images = a.site.rstrip("/"), a.api.rstrip("/"), a.images.rstrip("/")
    results = []

    def check(name, ok, detail=None):
        print(("PASS  " if ok else "FAIL  ") + name)
        if not ok:
            print("      got:", detail)
        results.append(bool(ok))

    # 1. Site and assets
    s, h, _ = fetch(site + "/")
    check("01 home page loads", s == 200, s)
    if site.startswith("https://"):
        s2, h2, _ = fetch("http://" + site[len("https://"):] + "/", follow=False)
        check("02 HTTP redirects to HTTPS", s2 in REDIRECTS and (h2.get("Location") or "").startswith("https://"), (s2, h2.get("Location")))
        check("03 HSTS header present", bool(h.get("Strict-Transport-Security")), "missing")
        check("04 X-Content-Type-Options: nosniff", (h.get("X-Content-Type-Options") or "").lower() == "nosniff", h.get("X-Content-Type-Options"))
        check("05 clickjacking protection header", bool(h.get("X-Frame-Options") or h.get("Content-Security-Policy")), "missing")
    total, problems = crawl(site, PAGES)
    check(f"06 all {len(PAGES)} pages and {total - len(PAGES)} referenced CSS/JS files load", not problems, problems)

    # 2. CORS
    origin = urllib.parse.urlsplit(site)
    origin = f"{origin.scheme}://{origin.netloc}"
    check("07 API allows your site origin", allow_origin(api + "/listings", origin) == origin, allow_origin(api + "/listings", origin))
    bad = allow_origin(api + "/listings", EVIL)
    check("08 API refuses other origins", bad not in (EVIL, "*"), bad)
    good_s3 = allow_origin(images + "/listings/probe.jpg", origin, "POST")
    check("09 photo bucket allows uploads from your site", good_s3 == origin, good_s3)
    bad_s3 = allow_origin(images + "/listings/probe.jpg", EVIL, "POST")
    check("10 photo bucket refuses other origins", bad_s3 not in (EVIL, "*"), bad_s3)

    # 3. Exposure
    s, _, _ = fetch(api + "/listings")
    check("11 API rejects anonymous calls (401)", s == 401, s)
    s, _, _ = fetch(images + "/")
    check("12 photo bucket cannot be listed (403)", s == 403, s)

    print(f"\n{sum(results)}/{len(results)} checks passed.")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()