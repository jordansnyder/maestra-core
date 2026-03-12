"""
Entity state → DMX channel value translator.

Given an entity path and a state dict from a Maestra entity state change,
resolves which DMX channels need to be updated and to what values.
"""

import logging
from patch_loader import PatchMap, Fixture, ChannelMapping

logger = logging.getLogger(__name__)


def _convert_range(value: float) -> int:
    """Convert a 0.0-1.0 range value to DMX 0-255."""
    return max(0, min(255, round(float(value) * 255)))


def _convert_number(value: float) -> int:
    """Convert a 0-100 percentage to DMX 0-255."""
    return max(0, min(255, round((float(value) / 100.0) * 255)))


def _convert_boolean(value) -> int:
    """Convert a boolean to DMX 0 or 255."""
    return 255 if value else 0


def _convert_enum(value: str, mapping: ChannelMapping) -> int:
    """Look up an enum label in the fixture's enum_dmx_values table."""
    if mapping.enum_dmx_values is None:
        logger.warning("Enum channel has no enum_dmx_values, defaulting to 0")
        return 0
    result = mapping.enum_dmx_values.get(str(value))
    if result is None:
        logger.warning(
            f"Enum value '{value}' not found in enum_dmx_values "
            f"{list(mapping.enum_dmx_values.keys())}, defaulting to 0"
        )
        return 0
    return max(0, min(255, result))


def _resolve_channel_value(variable_value, mapping: ChannelMapping) -> int:
    """Convert a single entity variable value to a DMX byte (0-255)."""
    t = mapping.type

    if t == 'range':
        return _convert_range(variable_value)
    elif t == 'number':
        return _convert_number(variable_value)
    elif t == 'boolean':
        return _convert_boolean(variable_value)
    elif t == 'enum':
        return _convert_enum(variable_value, mapping)
    elif t == 'color':
        # color type uses separate per-channel variables (red/green/blue/etc.)
        # handled at the caller level; treat as range if used directly
        return _convert_range(variable_value)
    else:
        logger.warning(f"Unknown channel type '{t}', defaulting to 0")
        return 0


class ChannelMapper:
    """
    Translates entity state dicts into DMX channel update maps.

    Maintains a per-fixture index keyed by entity_path for O(1) lookups.
    """

    def __init__(self, patch: PatchMap):
        self._patch = patch
        # Build lookup index: entity_path → Fixture
        self._index: dict[str, Fixture] = {
            fixture.entity_path: fixture
            for fixture in patch.fixtures
        }
        logger.info(f"ChannelMapper initialized with {len(self._index)} fixtures")

    def resolve(
        self,
        entity_path: str,
        state: dict
    ) -> dict[int, dict[int, int]]:
        """
        Resolve entity state changes to DMX channel updates.

        Args:
            entity_path: Maestra entity path (e.g. 'venue.stage.par_l1')
            state: Dict of variable_name → value from the entity state message

        Returns:
            Nested dict: {universe_id: {channel_number: dmx_value}}
            Empty dict if entity_path is not in the patch map.
        """
        fixture = self._index.get(entity_path)
        if fixture is None:
            return {}

        updates: dict[int, dict[int, int]] = {}

        for var_name, value in state.items():
            mapping = fixture.channel_map.get(var_name)
            if mapping is None:
                continue

            absolute_channel = fixture.start_channel + mapping.offset - 1
            dmx_value = _resolve_channel_value(value, mapping)

            if fixture.universe not in updates:
                updates[fixture.universe] = {}
            updates[fixture.universe][absolute_channel] = dmx_value

            logger.debug(
                f"{entity_path}.{var_name}={value} "
                f"→ universe={fixture.universe} ch={absolute_channel} dmx={dmx_value}"
            )

        return updates

    def fixture_paths(self) -> list[str]:
        """Return all entity paths in the patch map."""
        return list(self._index.keys())
