#!/usr/bin/env python3
"""
Maestra Venue Bootstrap Script

Reads a DMX gateway patch.yaml and creates the corresponding entity types
and entities in Maestra via the Fleet Manager API. Run this once per venue
before starting the DMX gateway.

Usage:
    python scripts/bootstrap_venue.py [--patch config/dmx/patch.yaml] [--api http://localhost:8080]

    # Dry run (show what would be created, don't write anything)
    python scripts/bootstrap_venue.py --dry-run

    # Point at a different Maestra instance
    python scripts/bootstrap_venue.py --api http://192.168.1.10:8080
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import yaml
from pathlib import Path

# ─── Entity Type Definitions ─────────────────────────────────────────────────
# These are the canonical DMX entity types for Maestra. Each maps to a fixture
# class in the patch map. Variable direction is always 'input' for DMX fixtures
# (values flow in from Maestra → out to DMX).

DMX_ENTITY_TYPES = [
    {
        "name": "dmx_moving_spot",
        "display_name": "DMX Moving Spot",
        "description": "Moving head spotlight with pan/tilt, color wheel, gobo wheel, and shutter",
        "icon": "spotlight",
        "default_state": {
            "intensity": 0.0,
            "shutter": 1.0,
            "color": "white",
            "gobo": "open",
            "pan": 0.5,
            "pan_fine": 0.0,
            "tilt": 0.5,
            "tilt_fine": 0.0,
            "speed": 0.5,
            "lamp": False,
        },
        "variables": [
            {"name": "intensity",  "type": "range",   "direction": "input", "default_value": 0.0,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "shutter",    "type": "range",   "direction": "input", "default_value": 1.0,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "color",      "type": "enum",    "direction": "input", "default_value": "white","config": {"options": ["white", "red", "blue", "green", "amber", "uv"]}},
            {"name": "gobo",       "type": "enum",    "direction": "input", "default_value": "open", "config": {"options": ["open", "gobo1", "gobo2", "gobo3"]}},
            {"name": "pan",        "type": "range",   "direction": "input", "default_value": 0.5,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "pan_fine",   "type": "range",   "direction": "input", "default_value": 0.0,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "tilt",       "type": "range",   "direction": "input", "default_value": 0.5,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "tilt_fine",  "type": "range",   "direction": "input", "default_value": 0.0,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "speed",      "type": "range",   "direction": "input", "default_value": 0.5,    "config": {"min": 0.0, "max": 1.0}},
            {"name": "lamp",       "type": "boolean", "direction": "input", "default_value": False},
        ],
    },
    {
        "name": "dmx_moving_wash",
        "display_name": "DMX Moving Wash",
        "description": "Moving head wash light with RGBW color mixing, zoom, and pan/tilt",
        "icon": "wash",
        "default_state": {
            "intensity": 0.0,
            "red": 0.0, "green": 0.0, "blue": 0.0, "white": 0.0,
            "color": 0.0, "zoom": 0.5,
            "pan": 0.5, "pan_fine": 0.0,
            "tilt": 0.5, "tilt_fine": 0.0,
            "speed": 0.5,
        },
        "variables": [
            {"name": "intensity",  "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "red",        "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "green",      "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "blue",       "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "white",      "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "color",      "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "zoom",       "type": "range", "direction": "input", "default_value": 0.5, "config": {"min": 0.0, "max": 1.0}},
            {"name": "pan",        "type": "range", "direction": "input", "default_value": 0.5, "config": {"min": 0.0, "max": 1.0}},
            {"name": "pan_fine",   "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "tilt",       "type": "range", "direction": "input", "default_value": 0.5, "config": {"min": 0.0, "max": 1.0}},
            {"name": "tilt_fine",  "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "speed",      "type": "range", "direction": "input", "default_value": 0.5, "config": {"min": 0.0, "max": 1.0}},
        ],
    },
    {
        "name": "dmx_par",
        "display_name": "DMX PAR",
        "description": "Static PAR fixture with RGBAWUV color mixing",
        "icon": "par",
        "default_state": {
            "intensity": 0.0,
            "red": 0.0, "green": 0.0, "blue": 0.0,
            "amber": 0.0, "white": 0.0, "uv": 0.0,
        },
        "variables": [
            {"name": "intensity", "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "red",       "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "green",     "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "blue",      "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "amber",     "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "white",     "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
            {"name": "uv",        "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
        ],
    },
    {
        "name": "dmx_dimmer_channel",
        "display_name": "DMX Dimmer Channel",
        "description": "Single dimmer output channel (0 = off, 1.0 = full)",
        "icon": "dimmer",
        "default_state": {"intensity": 0.0},
        "variables": [
            {"name": "intensity", "type": "range", "direction": "input", "default_value": 0.0, "config": {"min": 0.0, "max": 1.0}},
        ],
    },
]

# ─── Fixture type → entity type mapping ──────────────────────────────────────

MODEL_TO_ENTITY_TYPE = {
    "Eliminator Stealth Spot":      "dmx_moving_spot",
    "Eliminator Stealth Zoom Wash": "dmx_moving_wash",
    "Chauvet SlimPAR T12BT":        "dmx_par",
    "Chauvet DMX-4 Dimmer":         "dmx_dimmer_channel",
}

# ─── API Helpers ─────────────────────────────────────────────────────────────

def api_request(api_url: str, method: str, path: str, body: dict = None) -> dict:
    """Make a JSON API request to the Fleet Manager."""
    url = f"{api_url.rstrip('/')}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f"HTTP {e.code} {method} {url}: {body_text}")


def get_existing_entity_types(api_url: str) -> dict[str, dict]:
    """Return existing entity types keyed by name."""
    try:
        result = api_request(api_url, 'GET', '/entities/types')
        items = result if isinstance(result, list) else result.get('items', [])
        return {et['name']: et for et in items}
    except Exception:
        return {}


def get_existing_entities(api_url: str) -> dict[str, dict]:
    """Return existing entities keyed by slug."""
    try:
        result = api_request(api_url, 'GET', '/entities?limit=1000')
        items = result if isinstance(result, list) else result.get('items', [])
        return {e['slug']: e for e in items}
    except Exception:
        return {}


# ─── Bootstrap Logic ─────────────────────────────────────────────────────────

def load_patch(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def entity_type_for_model(model: str) -> str:
    et = MODEL_TO_ENTITY_TYPE.get(model)
    if et is None:
        # Fallback: derive from model name
        name = model.lower().replace(' ', '_').replace('-', '_')
        print(f"  [WARN] No entity type mapping for model '{model}', using 'dmx_{name}'")
        return f"dmx_{name}"
    return et


def path_to_slug(entity_path: str) -> str:
    """Convert 'venue.stage.par_l1' to 'venue-stage-par-l1'."""
    return entity_path.replace('.', '-').replace('_', '-')


def path_to_name(entity_path: str) -> str:
    """Return the last segment of a dotted path as the entity name."""
    return entity_path.split('.')[-1]


def build_entity_hierarchy(patch: dict) -> list[dict]:
    """
    Derive all entities (containers + fixtures) from the patch map.

    Returns a list of entity dicts ordered parent-first so containers
    are created before their children.
    """
    entities = []
    seen_paths = set()

    def ensure_path(path: str, entity_type: str, label: str = None):
        if path in seen_paths:
            return
        seen_paths.add(path)

        parts = path.split('.')
        if len(parts) > 1:
            ensure_path('.'.join(parts[:-1]), 'zone')

        entities.append({
            'path': path,
            'name': label or parts[-1],
            'slug': path_to_slug(path),
            'entity_type': entity_type,
        })

    # Ensure venue and stage containers
    venue_name = patch.get('venue', 'venue').replace('-', '_')
    ensure_path(venue_name, 'venue', patch.get('venue'))

    for fixture in patch.get('fixtures', []):
        entity_path = fixture['entity_path']
        et = entity_type_for_model(fixture['model'])
        ensure_path(entity_path, et, fixture['label'])

    return entities


def run_bootstrap(api_url: str, patch: dict, dry_run: bool) -> None:
    venue = patch.get('venue', 'unknown')
    print(f"\nBootstrapping venue: {venue}")
    print(f"Fleet Manager: {api_url}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print()

    # ── Step 1: Create entity types ──────────────────────────────────────────
    print("Step 1: Entity types")
    print("─" * 40)

    existing_types = {} if dry_run else get_existing_entity_types(api_url)

    for et in DMX_ENTITY_TYPES:
        name = et['name']
        if name in existing_types:
            print(f"  SKIP  {name} (already exists)")
            continue

        body = {
            "name": et["name"],
            "display_name": et["display_name"],
            "description": et["description"],
            "icon": et.get("icon", "device"),
            "default_state": et.get("default_state", {}),
        }

        if dry_run:
            print(f"  WOULD CREATE  entity_type: {name}")
        else:
            try:
                result = api_request(api_url, 'POST', '/entities/types', body)
                type_id = result.get('id', '?')
                print(f"  CREATED  {name}  (id={type_id})")

                # Create variables for this entity type
                for var in et.get('variables', []):
                    var_body = {
                        "name": var["name"],
                        "type": var["type"],
                        "direction": var.get("direction", "input"),
                        "default_value": var.get("default_value"),
                        "config": var.get("config", {}),
                    }
                    try:
                        api_request(api_url, 'POST', f'/entities/types/{type_id}/variables', var_body)
                        print(f"    + variable: {var['name']} ({var['type']})")
                    except Exception as e:
                        print(f"    ! variable {var['name']} failed: {e}")

            except Exception as e:
                print(f"  ERROR  {name}: {e}")

    # ── Step 2: Create entities ───────────────────────────────────────────────
    print()
    print("Step 2: Entities")
    print("─" * 40)

    existing_entities = {} if dry_run else get_existing_entities(api_url)

    # Resolve entity type IDs (skip on dry run)
    type_id_map = {}
    if not dry_run:
        current_types = get_existing_entity_types(api_url)
        type_id_map = {name: et['id'] for name, et in current_types.items()}

    entity_hierarchy = build_entity_hierarchy(patch)
    created_id_map: dict[str, str] = {}  # path → id

    for entity in entity_hierarchy:
        slug = entity['slug']
        path = entity['path']
        et_name = entity['entity_type']
        name = entity['name']

        if slug in existing_entities:
            print(f"  SKIP  {path} (already exists)")
            created_id_map[path] = existing_entities[slug]['id']
            continue

        # Resolve parent id
        parts = path.split('.')
        parent_id = None
        if len(parts) > 1:
            parent_path = '.'.join(parts[:-1])
            parent_id = created_id_map.get(parent_path)

        if dry_run:
            print(f"  WOULD CREATE  {path}  type={et_name}")
            continue

        type_id = type_id_map.get(et_name)
        if type_id is None:
            print(f"  SKIP  {path}: entity type '{et_name}' not found in Maestra")
            continue

        body = {
            "name": name,
            "slug": slug,
            "entity_type_id": type_id,
            "parent_id": parent_id,
            "status": "active",
            "metadata": {"source": "bootstrap_venue", "entity_path": path},
        }

        try:
            result = api_request(api_url, 'POST', '/entities', body)
            entity_id = result.get('id', '?')
            created_id_map[path] = entity_id
            print(f"  CREATED  {path}  type={et_name}  id={entity_id}")
        except Exception as e:
            print(f"  ERROR  {path}: {e}")

    print()
    if dry_run:
        print("Dry run complete — no changes were made.")
    else:
        print("Bootstrap complete.")
        print(f"  Created {len([e for e in entity_hierarchy if e['slug'] not in existing_entities])} entities")
        print(f"\nVerify in the Dashboard: http://localhost:3001")
        print(f"Or via API: GET {api_url}/entities")


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Bootstrap Maestra entity types and entities from a DMX patch map"
    )
    parser.add_argument(
        '--patch', '-p',
        default='config/dmx/patch.yaml',
        help='Path to patch.yaml (default: config/dmx/patch.yaml)'
    )
    parser.add_argument(
        '--api', '-a',
        default='http://localhost:8080',
        help='Fleet Manager API base URL (default: http://localhost:8080)'
    )
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Print what would be created without making any API calls'
    )
    args = parser.parse_args()

    patch_path = Path(args.patch)
    if not patch_path.exists():
        print(f"Error: patch file not found: {patch_path}", file=sys.stderr)
        sys.exit(1)

    patch = load_patch(str(patch_path))
    run_bootstrap(args.api, patch, args.dry_run)


if __name__ == '__main__':
    main()
