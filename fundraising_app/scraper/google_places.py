"""
Google Places (New) provider for local discovery with coordinates.

This module is intentionally server-side and uses HTTP requests to the
Places API (New) web service. It is designed to feed `scraper.discover`.
"""

from __future__ import annotations

import math
import os
import re
import time
from typing import Iterable

import requests

PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_PLACES_HTTP_TIMEOUT_SECONDS = float(os.environ.get("GOOGLE_PLACES_HTTP_TIMEOUT_SECONDS", "10"))
GOOGLE_PLACES_STAGE_MAX_SECONDS = float(os.environ.get("GOOGLE_PLACES_STAGE_MAX_SECONDS", "180"))
GOOGLE_PLACES_MAX_TILE_ERRORS = int(os.environ.get("GOOGLE_PLACES_MAX_TILE_ERRORS", "10"))


def get_google_maps_api_key() -> str:
    return (
        os.environ.get("GOOGLE_MAPS_API_KEY")
        or os.environ.get("GOOGLE_PLACES_API_KEY")
        or ""
    )


def google_places_configured() -> bool:
    return bool(get_google_maps_api_key())


def _headers(field_mask: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": get_google_maps_api_key(),
        "X-Goog-FieldMask": field_mask,
    }


def _meters_per_degree_lat() -> float:
    return 111_320.0


def _meters_per_degree_lon(lat_deg: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat_deg))


def generate_search_tiles(center_lat: float, center_lng: float, radius_m: float, tile_radius_m: float) -> list[dict]:
    """
    Generate a square grid of tile centers constrained to the search radius.
    """
    radius_m = float(radius_m)
    tile_radius_m = max(250.0, float(tile_radius_m))
    lat_step_deg = (tile_radius_m * 1.6) / _meters_per_degree_lat()
    lon_step_deg = (tile_radius_m * 1.6) / max(1.0, _meters_per_degree_lon(center_lat))
    lat_range = radius_m / _meters_per_degree_lat()
    lon_range = radius_m / max(1.0, _meters_per_degree_lon(center_lat))

    tiles: list[dict] = []
    lat = center_lat - lat_range
    while lat <= center_lat + lat_range:
        lng = center_lng - lon_range
        while lng <= center_lng + lon_range:
            if haversine_meters(center_lat, center_lng, lat, lng) <= (radius_m + tile_radius_m):
                tiles.append({"latitude": round(lat, 7), "longitude": round(lng, 7), "radius_m": tile_radius_m})
            lng += lon_step_deg
        lat += lat_step_deg

    # Ensure origin tile is first.
    origin = {"latitude": center_lat, "longitude": center_lng, "radius_m": tile_radius_m}
    deduped: list[dict] = [origin]
    seen = {(round(center_lat, 5), round(center_lng, 5))}
    for t in tiles:
        key = (round(t["latitude"], 5), round(t["longitude"], 5))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)
    return deduped


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r_m = 6_371_000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r_m * c


def search_nearby_places(
    center_lat: float,
    center_lng: float,
    radius_m: float,
    max_results: int = 20,
    included_types: Iterable[str] | None = None,
    rank_preference: str = "DISTANCE",
) -> list[dict]:
    if not google_places_configured():
        return []

    payload: dict = {
        "maxResultCount": max(1, min(int(max_results or 20), 20)),
        "locationRestriction": {
            "circle": {
                "center": {"latitude": float(center_lat), "longitude": float(center_lng)},
                "radius": max(1.0, float(radius_m)),
            }
        },
        "rankPreference": rank_preference,
    }
    if included_types:
        payload["includedTypes"] = [str(t) for t in included_types if t]

    field_mask = ",".join([
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.types",
        "places.primaryType",
        "places.businessStatus",
        "places.websiteUri",
        "places.nationalPhoneNumber",
    ])
    resp = requests.post(
        PLACES_NEARBY_URL,
        headers=_headers(field_mask),
        json=payload,
        timeout=(5, GOOGLE_PLACES_HTTP_TIMEOUT_SECONDS),
    )
    resp.raise_for_status()
    return (resp.json() or {}).get("places", []) or []


def discover_google_places_nearby(
    *,
    origin_lat: float,
    origin_lng: float,
    radius_miles: float,
    result_limit: int,
    deadline_ts: float | None = None,
    stage_max_seconds: float | None = None,
    progress_cb=None,
) -> list[dict]:
    """
    Collect local place candidates by tiling Nearby Search across the radius.
    Returns discover.py-compatible org dicts with coordinates.
    """
    if not google_places_configured():
        return []

    radius_m = max(100.0, float(radius_miles) * 1609.344)
    result_limit = max(1, min(int(result_limit or 100), 1000))

    if radius_m <= 3000:
        tile_radius_m = 700
    elif radius_m <= 8000:
        tile_radius_m = 1200
    elif radius_m <= 20000:
        tile_radius_m = 1800
    else:
        tile_radius_m = 2500

    tiles = generate_search_tiles(origin_lat, origin_lng, radius_m, tile_radius_m)
    target_candidates = min(max(result_limit * 4, 80), 4000)
    stage_deadline_ts = None
    if stage_max_seconds is None:
        stage_max_seconds = GOOGLE_PLACES_STAGE_MAX_SECONDS
    if stage_max_seconds and stage_max_seconds > 0:
        stage_deadline_ts = time.monotonic() + float(stage_max_seconds)

    seen_place_ids: set[str] = set()
    out: list[dict] = []
    tile_errors = 0
    stopped_reason: str | None = None

    if callable(progress_cb):
        progress_cb({
            "step": "google_places",
            "status": "running",
            "message": f"Google Places nearby search across {len(tiles)} tile(s)...",
            "progress": 14,
            "source": "google_places",
            "tiles_total": len(tiles),
        })

    for idx, tile in enumerate(tiles, 1):
        now = time.monotonic()
        if deadline_ts and now >= deadline_ts:
            stopped_reason = "global_deadline"
            break
        if stage_deadline_ts and now >= stage_deadline_ts:
            stopped_reason = "google_places_stage_deadline"
            break
        if len(out) >= target_candidates:
            stopped_reason = "target_candidates_reached"
            break
        if callable(progress_cb):
            pct = 14 + int((max(0, idx - 1) / max(1, len(tiles))) * 24)
            progress_cb({
                "step": "google_places",
                "status": "running",
                "message": f"Google Places scanning tile {idx}/{len(tiles)} ({len(out)} candidate(s) collected so far)...",
                "progress": pct,
                "source": "google_places",
                "tiles_total": len(tiles),
                "tiles_done": idx - 1,
                "candidates": len(out),
            })
        try:
            places = search_nearby_places(
                center_lat=tile["latitude"],
                center_lng=tile["longitude"],
                radius_m=tile["radius_m"],
                max_results=20,
                included_types=None,  # broad local coverage; scoring handles prioritization later
                rank_preference="DISTANCE",
            )
        except Exception as exc:
            tile_errors += 1
            if callable(progress_cb):
                progress_cb({
                    "step": "google_places",
                    "status": "warning",
                    "message": f"Google Places tile {idx}/{len(tiles)} issue: {exc}",
                    "source": "google_places",
                    "tile_index": idx,
                    "tile_errors": tile_errors,
                })
            if tile_errors >= max(1, GOOGLE_PLACES_MAX_TILE_ERRORS):
                stopped_reason = "too_many_tile_errors"
                break
            continue

        for place in places:
            place_id = str(place.get("id") or "").strip()
            if not place_id or place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
            out.append(map_google_place_to_org(place))
            if len(out) >= target_candidates:
                break

        if callable(progress_cb):
            pct = 14 + int((idx / max(1, len(tiles))) * 24)
            progress_cb({
                "step": "google_places",
                "status": "running",
                "message": f"Google Places collected {len(out)} candidate(s) from {idx}/{len(tiles)} tile(s).",
                "progress": pct,
                "source": "google_places",
                "tiles_total": len(tiles),
                "tiles_done": idx,
                "candidates": len(out),
            })

    if callable(progress_cb) and stopped_reason and stopped_reason != "target_candidates_reached":
        progress_cb({
            "step": "google_places",
            "status": "warning",
            "message": f"Google Places stopped early ({stopped_reason.replace('_', ' ')}). Continuing with collected candidates.",
            "source": "google_places",
            "tiles_total": len(tiles),
            "tiles_done": min(len(tiles), idx if 'idx' in locals() else 0),
            "candidates": len(out),
            "stopped_early": True,
            "stop_reason": stopped_reason,
        })

    return out


def map_google_place_to_org(place: dict) -> dict:
    display_name = ((place.get("displayName") or {}).get("text") or "").strip()
    address = str(place.get("formattedAddress") or "").strip()
    website = str(place.get("websiteUri") or "").strip()
    phone = str(place.get("nationalPhoneNumber") or "").strip()
    location = place.get("location") or {}
    lat = location.get("latitude")
    lng = location.get("longitude")
    types = [str(t) for t in (place.get("types") or [])]
    primary_type = str(place.get("primaryType") or "").strip()
    city, state, postal = parse_city_state_zip(address)

    score = score_google_place(place)

    notes_bits = []
    if primary_type:
        notes_bits.append(f"Google Places primary type: {primary_type}")
    if types:
        notes_bits.append("Types: " + ", ".join(types[:8]))
    if place.get("businessStatus"):
        notes_bits.append(f"Business status: {place.get('businessStatus')}")
    notes_bits.append("Discovered via Google Places Nearby Search.")

    return {
        "name": display_name or "Unknown Place",
        "website": website or None,
        "category": map_place_category(primary_type, types),
        "donation_potential_score": score,
        "address": address or None,
        "city": city or None,
        "state": state or None,
        "postal_code": postal or None,
        "latitude": lat,
        "longitude": lng,
        "phone": phone or None,
        "notes": " ".join(notes_bits)[:1200],
        "_source": "google_places_nearby",
        "_google_place_id": place.get("id"),
        "_google_primary_type": primary_type.lower() if primary_type else "",
        "_google_types": [t.lower() for t in types],
        "_location_hint_applied": True,
    }


def parse_city_state_zip(address: str) -> tuple[str, str, str]:
    if not address:
        return "", "", ""
    # Common US formattedAddress ending: "City, ST 12345, USA"
    m = re.search(r"([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:,\s*USA)?$", address)
    if m:
        return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    m2 = re.search(r"([A-Za-z .'-]+),\s*([A-Z]{2})(?:,\s*USA)?$", address)
    if m2:
        return m2.group(1).strip(), m2.group(2).strip(), ""
    return "", "", ""


def map_place_category(primary_type: str, types: list[str]) -> str:
    t = (primary_type or "").lower()
    all_types = {x.lower() for x in types}
    if t in {"animal_shelter", "veterinary_care", "pet_store"} or {"animal_shelter", "veterinary_care", "pet_store"} & all_types:
        return "pet_industry"
    if "nonprofit_organization" in all_types:
        return "nonprofit"
    if "corporate_office" in all_types:
        return "corporate_csr"
    if "bank" in all_types or "investment_service" in all_types:
        return "financial"
    return "local_business"


def score_google_place(place: dict) -> int:
    """
    Heuristic donor-potential score on the existing 1-10 scale.
    """
    types = {str(t).lower() for t in (place.get("types") or [])}
    primary = str(place.get("primaryType") or "").lower()
    name = str(((place.get("displayName") or {}).get("text")) or "").lower()
    website = str(place.get("websiteUri") or "")

    score = 3

    # Strong mission alignment / animal-centric orgs.
    if {"animal_shelter", "veterinary_care", "pet_store"} & types:
        score += 2
    if "nonprofit_organization" in types:
        score += 2

    # Capacity / institutional signals.
    if "corporate_office" in types:
        score += 2
    if website:
        score += 1

    # Philanthropy or foundation indicators in the name.
    if any(k in name for k in ["foundation", "charities", "charity", "philanthrop", "trust"]):
        score += 3
    elif any(k in name for k in ["group", "partners", "capital", "holdings"]):
        score += 1

    # Wealth-adjacent business categories (very rough heuristic; tuned later).
    if {"bank", "finance", "financial_planner", "real_estate_agency", "lawyer", "accounting", "insurance_agency"} & types:
        score += 2

    # Down-rank obvious low-fit and low-philanthropy-intent local services.
    strong_low_fit = {
        "parking", "parking_lot", "gas_station", "car_wash", "storage",
        "transit_station", "bus_station", "train_station", "airport",
        "rv_park", "campground", "electric_vehicle_charging_station",
    }
    moderate_low_fit = {
        "plumber", "electrician", "roofing_contractor", "locksmith",
        "car_repair", "auto_parts_store", "towing", "laundry",
        "convenience_store", "atm",
    }
    if strong_low_fit & types:
        score -= 3
    if moderate_low_fit & types:
        score -= 2
    if primary in strong_low_fit:
        score -= 2
    if primary in moderate_low_fit:
        score -= 1

    # Small uplift for signals that indicate larger/organized entities.
    if {"university", "hospital", "school"} & types:
        score += 1
    if any(k in name for k in ["foundation", "capital", "wealth", "advisors", "holdings", "philanth"]):
        score += 1

    return max(1, min(10, score))
