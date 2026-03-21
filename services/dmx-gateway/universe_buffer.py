"""
Per-universe 512-byte DMX channel buffers.

Maintains the current state of each DMX universe as a 512-element integer
array (values 0-255). Tracks which universes have changed since the last
send so callers can decide whether to transmit on-change or keep-alive.
"""

import logging

logger = logging.getLogger(__name__)

DMX_UNIVERSE_SIZE = 512


class UniverseBuffer:
    """A single 512-channel DMX universe buffer with dirty tracking."""

    def __init__(self, universe_id: int):
        self.universe_id = universe_id
        self._channels: list[int] = [0] * DMX_UNIVERSE_SIZE
        self._dirty = False

    def apply(self, channel_updates: dict[int, int]) -> bool:
        """
        Apply a set of channel updates (1-indexed channel numbers).

        Args:
            channel_updates: {channel_number: value} where channel is 1-512

        Returns:
            True if any channel value changed
        """
        changed = False
        for channel, value in channel_updates.items():
            idx = channel - 1  # convert 1-indexed to 0-indexed
            if not (1 <= channel <= DMX_UNIVERSE_SIZE):
                logger.warning(f"Universe {self.universe_id}: channel {channel} out of range, skipping")
                continue
            clamped = max(0, min(255, int(value)))
            if self._channels[idx] != clamped:
                self._channels[idx] = clamped
                changed = True

        if changed:
            self._dirty = True
        return changed

    def set_all(self, channels: list[int]) -> None:
        """Replace the entire universe buffer (used by raw bypass mode)."""
        self._channels = [max(0, min(255, int(v))) for v in (channels[:512] + [0] * 512)[:512]]
        self._dirty = True

    def get(self) -> list[int]:
        """Return a copy of the current 512-channel array."""
        return list(self._channels)

    @property
    def dirty(self) -> bool:
        return self._dirty

    def clear_dirty(self) -> None:
        self._dirty = False


class UniverseBufferSet:
    """Collection of universe buffers, one per configured DMX universe."""

    def __init__(self):
        self._universes: dict[int, UniverseBuffer] = {}

    def _get_or_create(self, universe_id: int) -> UniverseBuffer:
        if universe_id not in self._universes:
            self._universes[universe_id] = UniverseBuffer(universe_id)
            logger.info(f"Created universe buffer for universe {universe_id}")
        return self._universes[universe_id]

    def apply(self, universe_id: int, channel_updates: dict[int, int]) -> bool:
        """Apply channel updates to the specified universe. Returns True if changed."""
        return self._get_or_create(universe_id).apply(channel_updates)

    def set(self, universe_id: int, channels: list[int]) -> None:
        """Replace a universe buffer entirely (raw bypass mode)."""
        self._get_or_create(universe_id).set_all(channels)

    def get(self, universe_id: int) -> list[int]:
        """Return the current channel array for a universe."""
        return self._get_or_create(universe_id).get()

    def all_universe_ids(self) -> list[int]:
        """Return the list of all universe IDs that have been written."""
        return list(self._universes.keys())

    def dirty_universes(self) -> list[int]:
        """Return universe IDs that have unsent changes."""
        return [uid for uid, buf in self._universes.items() if buf.dirty]

    def clear_dirty(self, universe_id: int) -> None:
        if universe_id in self._universes:
            self._universes[universe_id].clear_dirty()
