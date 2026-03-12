"""
Patch map loader and validator.

Loads patch.yaml at startup and validates it with Pydantic models.
Fails loudly with a clear error if the patch map is invalid.
"""

import yaml
import logging
from typing import Any, Optional
from pydantic import BaseModel, field_validator, model_validator

logger = logging.getLogger(__name__)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class ChannelMapping(BaseModel):
    """Single fixture variable → DMX channel mapping."""
    offset: int              # 1-indexed offset from fixture start_channel
    type: str                # range, color, number, boolean, enum
    enum_dmx_values: Optional[dict[str, int]] = None

    @field_validator('type')
    @classmethod
    def valid_type(cls, v: str) -> str:
        allowed = {'range', 'color', 'number', 'boolean', 'enum'}
        if v not in allowed:
            raise ValueError(f"Channel type '{v}' is not valid. Must be one of: {allowed}")
        return v

    @field_validator('offset')
    @classmethod
    def valid_offset(cls, v: int) -> int:
        if v < 1:
            raise ValueError(f"Channel offset {v} must be >= 1")
        return v

    @model_validator(mode='after')
    def enum_requires_values(self) -> 'ChannelMapping':
        if self.type == 'enum' and not self.enum_dmx_values:
            raise ValueError("Channel type 'enum' requires 'enum_dmx_values' mapping")
        return self


class Fixture(BaseModel):
    """A single patched fixture."""
    id: str
    label: str
    model: str
    entity_path: str
    universe: int
    start_channel: int
    mode: str
    channel_map: dict[str, ChannelMapping]

    @field_validator('start_channel')
    @classmethod
    def valid_start_channel(cls, v: int) -> int:
        if not (1 <= v <= 512):
            raise ValueError(f"start_channel {v} must be between 1 and 512")
        return v

    @model_validator(mode='after')
    def channels_within_universe(self) -> 'Fixture':
        for var_name, mapping in self.channel_map.items():
            absolute = self.start_channel + mapping.offset - 1
            if absolute > 512:
                raise ValueError(
                    f"Fixture '{self.id}' variable '{var_name}': absolute channel "
                    f"{absolute} (start={self.start_channel} + offset={mapping.offset} - 1) "
                    f"exceeds DMX universe size of 512"
                )
        return self


class UniverseConfig(BaseModel):
    """Art-Net universe configuration."""
    id: int                  # Maestra universe number
    artnet_universe: int     # Corresponding Art-Net universe on the node
    port: int                # Physical DMX port on the node


class NodeConfig(BaseModel):
    """Art-Net node network configuration."""
    ip: str
    port: int = 6454
    universe_offset: int = 0
    keepalive_hz: float = 4.0
    mode: str = 'unicast'

    @field_validator('keepalive_hz')
    @classmethod
    def valid_hz(cls, v: float) -> float:
        if v <= 0 or v > 44:
            raise ValueError(f"keepalive_hz {v} must be between 0 and 44 (DMX refresh limit)")
        return v


class PatchMap(BaseModel):
    """Complete venue patch map."""
    venue: str
    node: NodeConfig
    universes: list[UniverseConfig]
    fixtures: list[Fixture]

    def fixture_by_path(self, entity_path: str) -> Optional[Fixture]:
        """Look up a fixture by its entity path."""
        for fixture in self.fixtures:
            if fixture.entity_path == entity_path:
                return fixture
        return None

    def universe_ids(self) -> list[int]:
        return [u.id for u in self.universes]


# ─── Loader ───────────────────────────────────────────────────────────────────

def load_patch(path: str) -> PatchMap:
    """
    Load and validate the patch map from a YAML file.

    Raises SystemExit with a clear error message if the file is missing,
    the YAML is malformed, or the patch data fails validation.
    """
    logger.info(f"Loading patch map from {path}")

    try:
        with open(path, 'r') as f:
            raw = yaml.safe_load(f)
    except FileNotFoundError:
        logger.error(f"Patch map not found at {path}")
        raise SystemExit(f"FATAL: Patch map file not found: {path}")
    except yaml.YAMLError as e:
        logger.error(f"YAML parse error in {path}: {e}")
        raise SystemExit(f"FATAL: Patch map YAML error: {e}")

    if raw is None:
        raise SystemExit(f"FATAL: Patch map {path} is empty")

    try:
        patch = PatchMap.model_validate(raw)
    except Exception as e:
        logger.error(f"Patch map validation failed: {e}")
        raise SystemExit(f"FATAL: Patch map validation error:\n{e}")

    # Log startup summary
    universe_ids = patch.universe_ids()
    logger.info(
        f"Patch map loaded: venue='{patch.venue}' "
        f"node={patch.node.ip}:{patch.node.port} "
        f"universes={universe_ids} "
        f"fixtures={len(patch.fixtures)}"
    )
    for fixture in patch.fixtures:
        channel_count = len(fixture.channel_map)
        logger.info(
            f"  Fixture '{fixture.id}' ({fixture.model}) "
            f"→ {fixture.entity_path} "
            f"universe={fixture.universe} start_ch={fixture.start_channel} "
            f"channels={channel_count}"
        )

    return patch
