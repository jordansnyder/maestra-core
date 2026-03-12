"""
Art-Net UDP packet builder and sender.

Implements the ArtDMX packet format (OpCode 0x5000) directly without
an external Art-Net library. Sends unicast UDP to the configured node IP.
"""

import socket
import struct
import logging

logger = logging.getLogger(__name__)

ARTNET_HEADER = b'Art-Net\x00'
ARTNET_OPCODE_DMX = 0x5000
ARTNET_PROTOCOL_VERSION = 14


def build_artdmx(universe: int, dmx: bytes, sequence: int) -> bytes:
    """
    Build an Art-Net ArtDMX packet.

    Args:
        universe: Art-Net universe number (zero-indexed, already offset-adjusted)
        dmx: 512-byte DMX channel array
        sequence: Sequence number 1-255 (0 disables sequence checking on node)

    Returns:
        Raw packet bytes ready for UDP transmission
    """
    length = len(dmx)
    return (
        ARTNET_HEADER
        + struct.pack('<H', ARTNET_OPCODE_DMX)      # OpCode, little-endian
        + struct.pack('>H', ARTNET_PROTOCOL_VERSION) # ProtVer, big-endian
        + bytes([sequence & 0xFF, 0])                # Sequence, Physical
        + struct.pack('<H', universe)                 # Universe, little-endian
        + struct.pack('>H', length)                   # Length, big-endian
        + dmx
    )


class ArtNetSender:
    """
    Manages a UDP socket for sending Art-Net ArtDMX packets to a single node.
    """

    def __init__(self, node_ip: str, node_port: int = 6454, universe_offset: int = 0):
        """
        Args:
            node_ip: IP address of the Art-Net node
            node_port: UDP port (default: 6454, the standard Art-Net port)
            universe_offset: Subtracted from Maestra universe numbers to get Art-Net
                             universe numbers. 0 means Maestra universe 1 = Art-Net universe 1.
                             Set to 1 if your node uses zero-based universe numbering.
        """
        self.node_ip = node_ip
        self.node_port = node_port
        self.universe_offset = universe_offset
        self._sequences: dict[int, int] = {}
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        logger.info(f"ArtNetSender ready → {node_ip}:{node_port} (universe_offset={universe_offset})")

    def send(self, maestra_universe: int, dmx_array: list[int]) -> None:
        """
        Send a full 512-channel universe to the Art-Net node.

        Args:
            maestra_universe: Universe number as defined in patch.yaml (1-indexed by convention)
            dmx_array: List of 512 integers (0-255), one per DMX channel
        """
        artnet_universe = maestra_universe - self.universe_offset
        seq = self._next_sequence(artnet_universe)

        # Ensure exactly 512 bytes, pad with zeros if needed
        dmx_bytes = bytes(dmx_array[:512]).ljust(512, b'\x00')

        packet = build_artdmx(artnet_universe, dmx_bytes, seq)

        try:
            self._sock.sendto(packet, (self.node_ip, self.node_port))
            logger.debug(
                f"ArtDMX sent → universe {maestra_universe} (artnet {artnet_universe}) "
                f"seq={seq} len={len(packet)}"
            )
        except OSError as e:
            logger.error(f"UDP send failed for universe {maestra_universe}: {e}")

    def _next_sequence(self, artnet_universe: int) -> int:
        """Increment and return the sequence number for a universe (1-255, wraps)."""
        seq = self._sequences.get(artnet_universe, 0)
        seq = (seq % 255) + 1
        self._sequences[artnet_universe] = seq
        return seq

    def close(self) -> None:
        """Close the UDP socket."""
        self._sock.close()
        logger.info("ArtNetSender closed")
