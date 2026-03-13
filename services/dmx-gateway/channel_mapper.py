"""
Entity state → DMX channel value translator.

Updated to work with API-loaded config (DMXConfig, APIFixture, APINode)
instead of the YAML-based PatchMap.
"""

import logging
from api_loader import DMXConfig, APIFixture, APINode, ChannelMapping

logger = logging.getLogger(__name__)


# ─── Type Converters ──────────────────────────────────────────────────────────

def _convert_range(value: float) -> int:
    """Convert a 0.0–1.0 range value to DMX 0–255."""
    return max(0, min(255, round(float(value) * 255)))


def _convert_number(value: float) -> int:
    """Convert a 0–100 percentage to DMX 0–255."""
    return max(0, min(255, round((float(value) / 100.0) * 255)))


def _convert_boolean(value) -> int:
    return 255 if value else 0


def _convert_enum(value: str, mapping: ChannelMapping) -> int:
    if mapping.enum_dmx_values is None:
        logger.warning("Enum channel has no enum_dmx_values, defaulting to 0")
        return 0
    result = mapping.enum_dmx_values.get(str(value))
    if result is None:
        logger.warning(f"Enum value '{value}' not found, defaulting to 0")
        return 0
    return max(0, min(255, result))


def _resolve_channel_value(variable_value, mapping: ChannelMapping) -> int:
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
        # color channels are mapped per-component (r/g/b) as range values
        return _convert_range(variable_value)
    else:
        logger.warning(f"Unknown channel type '{t}', defaulting to 0")
        return 0


# ─── Mapper ───────────────────────────────────────────────────────────────────

class ChannelMapper:
    """
    Translates entity state dicts into per-node DMX channel update maps.

    Maintains an index of entity_path → [(fixture, node)] for O(1) lookups.
    Returns updates keyed by node_id so the caller can route to the correct
    Art-Net sender.
    """

    def __init__(self, config: DMXConfig):
        self._config = config
        # entity_path -> list of (fixture, node)
        self._index: dict[str, list[tuple[APIFixture, APINode]]] = {}

        for fixture in config.fixtures:
            if not fixture.entity_path:
                continue
            node = config.node_by_id.get(fixture.node_id)
            if not node:
                logger.warning(
                    f"Fixture '{fixture.name}' references unknown node {fixture.node_id}, skipping"
                )
                continue
            self._index.setdefault(fixture.entity_path, []).append((fixture, node))

        logger.info(f"ChannelMapper initialized with {len(self._index)} entity path(s)")

    def resolve(
        self,
        entity_path: str,
        state: dict,
    ) -> dict[str, dict[int, dict[int, int]]]:
        """
        Resolve entity state changes to DMX channel updates.

        Args:
            entity_path: Maestra entity path (e.g. 'venue.stage.par_l1')
            state: Dict of variable_name → value

        Returns:
            {node_id: {artnet_universe: {channel_number: dmx_value}}}
            Empty dict if entity_path has no mapped fixtures.
        """
        entries = self._index.get(entity_path)
        if not entries:
            return {}

        updates: dict[str, dict[int, dict[int, int]]] = {}

        for fixture, node in entries:
            for var_name, value in state.items():
                mapping = fixture.channel_map.get(var_name)
                if mapping is None:
                    continue

                absolute_channel = fixture.start_channel + mapping.offset - 1
                dmx_value = _resolve_channel_value(value, mapping)
                artnet_universe = node.artnet_universe_for(fixture.universe)

                node_updates = updates.setdefault(node.id, {})
                universe_updates = node_updates.setdefault(artnet_universe, {})
                universe_updates[absolute_channel] = dmx_value

                logger.debug(
                    f"{entity_path}.{var_name}={value} "
                    f"→ {node.ip_address} artnet_u={artnet_universe} "
                    f"ch={absolute_channel} dmx={dmx_value}"
                )

        return updates

    def fixture_paths(self) -> list[str]:
        return list(self._index.keys())
