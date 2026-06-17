#!/usr/bin/env python3
"""
ShelterLuv → WCAHS website sync script.
Fetches publishable animals from ShelterLuv API and writes data/animals.json.
Downloads pet photos locally so the site doesn't depend on ShelterLuv CDN uptime.

Usage:
  SHELTERLUV_API_KEY=xxx python3 sync.py

Intended to run via cron every 30 minutes.
"""

import json
import os
import sys
import hashlib
import urllib.request
import urllib.error
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
PHOTOS_DIR = SCRIPT_DIR / "images" / "pets"
API_BASE = "https://www.shelterluv.com/api/v1"

def get_api_key():
    key = os.environ.get("SHELTERLUV_API_KEY", "").strip()
    if not key:
        # Fall back to .env file next to this script
        env_file = SCRIPT_DIR / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line.startswith("SHELTERLUV_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        print("Error: SHELTERLUV_API_KEY not set (env var or .env file)", file=sys.stderr)
        sys.exit(1)
    return key


def api_get(endpoint, api_key, params=None):
    url = f"{API_BASE}/{endpoint}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{qs}"
    req = urllib.request.Request(url, headers={"X-Api-Key": api_key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def download_photo(url, animal_id):
    """Download a photo and return the local relative path (from site root)."""
    ext = ".jpg"
    if ".png" in url.lower():
        ext = ".png"
    # Stable filename based on URL hash so we don't re-download unchanged photos
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    filename = f"{animal_id}_{url_hash}{ext}"
    local_path = PHOTOS_DIR / filename
    rel_path = f"images/pets/{filename}"

    if local_path.exists():
        return rel_path

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "WCAHS-Sync/1.0"
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            local_path.write_bytes(resp.read())
        print(f"  Downloaded: {filename}")
    except (urllib.error.URLError, OSError) as e:
        print(f"  Warning: failed to download {url}: {e}", file=sys.stderr)
        return url  # Fall back to remote URL

    return rel_path


def format_age(age_months):
    """Convert age in months to a readable string."""
    if age_months < 12:
        return f"{age_months} mo"
    years = age_months // 12
    months = age_months % 12
    if months == 0:
        return f"{years} yr" if years == 1 else f"{years} yrs"
    return f"{years} yr {months} mo"


def process_animal(raw, api_key):
    """Transform raw API animal data into our site's format."""
    animal_id = raw["Internal-ID"]

    # Download photos locally
    cover = raw.get("CoverPhoto", "")
    photos_raw = raw.get("Photos", [])
    cover_local = download_photo(cover, animal_id) if cover else ""
    photos_local = [download_photo(p, animal_id) for p in photos_raw] if photos_raw else []

    # If cover wasn't in photos array, prepend it
    if cover_local and cover_local not in photos_local:
        photos_local.insert(0, cover_local)

    # Extract attributes as simple list
    attributes = [a["AttributeName"] for a in raw.get("Attributes", []) if a.get("Publish") == "Yes"]

    # Adoption fee
    fee_group = raw.get("AdoptionFeeGroup") or {}

    # Foster info
    foster_person = raw.get("AssociatedPerson") or {}
    foster_name = ""
    if isinstance(foster_person, dict) and foster_person.get("RelationshipType") == "foster":
        first = foster_person.get("FirstName", "")
        last = foster_person.get("LastName", "")
        foster_name = f"{first} {last}".strip()

    # Microchipped?
    microchips = raw.get("Microchips") or []
    microchipped = len(microchips) > 0

    return {
        "id": animal_id,
        "shelterluv_id": raw.get("ID", ""),
        "name": raw.get("Name", ""),
        "type": raw.get("Type", ""),
        "breed": raw.get("Breed", ""),
        "sex": raw.get("Sex", ""),
        "age": raw.get("Age", 0),
        "age_display": format_age(raw.get("Age", 0)),
        "size": raw.get("Size", ""),
        "weight": raw.get("CurrentWeightPounds", ""),
        "color": raw.get("Color", ""),
        "altered": raw.get("Altered", ""),
        "microchipped": microchipped,
        "description": raw.get("Description", ""),
        "cover_photo": cover_local,
        "photos": photos_local,
        "attributes": attributes,
        "adoption_fee": fee_group.get("Price"),
        "adoption_fee_name": fee_group.get("Name", ""),
        "in_foster": raw.get("InFoster", False),
        "foster_name": foster_name,
        "status": raw.get("Status", ""),
        "location": (raw.get("CurrentLocation") or {}).get("Tier1", ""),
    }


def sync():
    api_key = get_api_key()
    print("Fetching publishable animals from ShelterLuv...")

    all_animals = []
    offset = 0
    limit = 100

    while True:
        data = api_get("animals", api_key, {
            "status_type": "publishable",
            "limit": str(limit),
            "offset": str(offset),
        })
        animals = data.get("animals", [])
        if not animals:
            break
        all_animals.extend(animals)
        if len(animals) < limit:
            break
        offset += limit

    print(f"Found {len(all_animals)} publishable animals")

    processed = []
    for raw in all_animals:
        print(f"  Processing: {raw.get('Name', 'Unknown')}")
        processed.append(process_animal(raw, api_key))

    # Write JSON
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "last_sync": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "count": len(processed),
        "animals": processed,
    }
    output_path = DATA_DIR / "animals.json"
    output_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {output_path} ({len(processed)} animals)")

    # Clean up orphaned photos
    if processed:
        active_photos = set()
        for a in processed:
            for p in a["photos"]:
                if p.startswith("images/pets/"):
                    active_photos.add(Path(p).name)
        for f in PHOTOS_DIR.iterdir():
            if f.is_file() and f.name not in active_photos:
                f.unlink()
                print(f"  Removed orphan: {f.name}")


if __name__ == "__main__":
    sync()
