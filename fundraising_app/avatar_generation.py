from __future__ import annotations

import os
import random
from urllib.parse import quote
from pathlib import Path
from typing import Any

import requests

_DEFAULT_PROMPT = (
    "A high-resolution, detailed portrait of a random domesticated or farm animal viewed head-on "
    "with a calm, curious expression. The image focuses sharply on the face, showcasing detailed, "
    "dense fur textures and fine whiskers. The lighting is soft and natural, emphasizing individual hairs. "
    "It is in a softly-lit domestic environment with a blurred background or simple background. "
    "The overall tone is photorealistic yet inviting, set against a clean, colorful background panel with rounded corners."
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_avatar_prompt() -> str:
    configured = str(os.environ.get("AVATAR_PROMPT_FILE") or "").strip()
    candidates = []
    if configured:
        candidates.append(Path(configured))
    candidates.append(_project_root() / "AvatarGenerationPrompt.txt")
    for path in candidates:
        try:
            if path.exists():
                text = path.read_text(encoding="utf-8").strip()
                if text:
                    return text
        except Exception:
            continue
    return _DEFAULT_PROMPT


def _fallback_svg_data_url(seed: str = "") -> str:
    animals = ["🐶", "🐱", "🐰", "🦊", "🐼", "🐨", "🦝", "🐹", "🦉", "🐢"]
    palettes = [
        ("#10B981", "#059669"),
        ("#3B82F6", "#1D4ED8"),
        ("#F59E0B", "#D97706"),
        ("#EC4899", "#BE185D"),
        ("#8B5CF6", "#6D28D9"),
        ("#14B8A6", "#0F766E"),
    ]
    rnd = random.Random(hash(seed or "animal-avatar"))
    animal = animals[rnd.randrange(0, len(animals))]
    c1, c2 = palettes[rnd.randrange(0, len(palettes))]
    svg = f"""
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#g)"/>
  <circle cx="64" cy="64" r="36" fill="rgba(255,255,255,0.15)"/>
  <text x="64" y="75" text-anchor="middle" font-size="40">{animal}</text>
</svg>
""".strip()
    return f"data:image/svg+xml;utf8,{quote(svg)}"


def _build_prompt(seed: str, role: str) -> str:
    base = load_avatar_prompt()
    role_hint = str(role or "profile").strip().lower()
    return (
        f"{base}\n\n"
        f"Profile use case: {role_hint} avatar.\n"
        f"Uniqueness seed: {seed or 'random'}.\n"
        "Framing constraints: single subject centered, no text, no logos, no watermarks, no humans."
    )


def generate_avatar_data_url(seed: str, role: str = "profile") -> dict[str, Any]:
    api_key = str(os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return {"avatar_url": _fallback_svg_data_url(seed), "provider": "fallback-svg"}

    model = str(os.environ.get("AVATAR_OPENAI_MODEL") or "gpt-image-1").strip()
    api_base = str(os.environ.get("OPENAI_API_BASE") or "https://api.openai.com/v1").rstrip("/")
    timeout_seconds = float(os.environ.get("AVATAR_OPENAI_TIMEOUT_SECONDS") or "45")

    payload = {
        "model": model,
        "prompt": _build_prompt(seed, role),
        "size": "512x512",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(
            f"{api_base}/images/generations",
            headers=headers,
            json=payload,
            timeout=(5, timeout_seconds),
        )
        resp.raise_for_status()
        data = resp.json() or {}
        item = (data.get("data") or [{}])[0] or {}
        b64 = str(item.get("b64_json") or "").strip()
        if b64:
            return {
                "avatar_url": f"data:image/png;base64,{b64}",
                "provider": "openai",
                "model": model,
            }
    except Exception:
        pass

    return {"avatar_url": _fallback_svg_data_url(seed), "provider": "fallback-svg"}


def regenerate_existing_avatars() -> dict[str, Any]:
    try:
        from db import crm  # type: ignore
    except Exception:
        from .db import crm  # type: ignore

    donor_rows = (crm.get_donors(limit=2000) or {}).get("donors") or []
    team_rows = (crm.get_team(limit=2000) or {}).get("team") or []

    donors_updated = 0
    members_updated = 0
    failures: list[str] = []

    for donor in donor_rows:
        donor_id = donor.get("id")
        if not donor_id:
            continue
        seed = f"{donor.get('email') or ''}|{donor.get('name') or ''}|donor|{donor_id}"
        avatar = generate_avatar_data_url(seed=seed, role="donor").get("avatar_url")
        try:
            updated = crm.update_donor(donor_id, {"avatar_url": avatar})
            if updated:
                donors_updated += 1
        except Exception as exc:
            failures.append(f"donor:{donor_id}:{exc}")

    for member in team_rows:
        member_id = member.get("id")
        if not member_id:
            continue
        seed = f"{member.get('email') or ''}|{member.get('full_name') or member.get('name') or ''}|member|{member_id}"
        avatar = generate_avatar_data_url(seed=seed, role="member").get("avatar_url")
        try:
            updated = crm.update_team_member(member_id, {"avatar_url": avatar})
            if updated:
                members_updated += 1
        except Exception as exc:
            failures.append(f"team:{member_id}:{exc}")

    return {
        "donors_scanned": len(donor_rows),
        "members_scanned": len(team_rows),
        "donors_updated": donors_updated,
        "members_updated": members_updated,
        "failures": failures,
    }
