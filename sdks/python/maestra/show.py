"""
Show Control convenience methods for Maestra SDK.
Provides ShowControl class for managing show lifecycle phases.

Phases: idle, pre_show, active, paused, post_show, shutdown
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .client import HttpTransport


class ShowControl:
    """
    Show control convenience class for managing show lifecycle.

    Usage:
        from maestra import MaestraClient

        client = MaestraClient()
        await client.connect()

        show = ShowControl(client._http)

        # Check current state
        state = await show.get_state()
        print(f"Phase: {state['phase']}")

        # Run through show lifecycle
        await show.warmup()   # idle -> pre_show
        await show.go()       # pre_show -> active
        await show.pause()    # active -> paused
        await show.resume()   # paused -> active
        await show.stop()     # active -> post_show
        await show.reset()    # any -> idle

        # Or transition directly
        await show.transition("active", source="stage-manager")

        # View history
        history = await show.get_history(limit=10)
    """

    def __init__(self, transport: "HttpTransport"):
        self._transport = transport

    async def get_state(self) -> Dict[str, Any]:
        """Get current show state.

        Returns:
            dict with keys: phase, previous_phase, transition_time, source, context
        """
        return await self._transport._request("GET", "/show/state")

    async def warmup(self) -> Dict[str, Any]:
        """Transition to pre_show phase (warmup).

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/warmup")

    async def go(self) -> Dict[str, Any]:
        """Transition to active phase (go live).

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/go")

    async def pause(self) -> Dict[str, Any]:
        """Pause the active show.

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/pause")

    async def resume(self) -> Dict[str, Any]:
        """Resume a paused show.

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/resume")

    async def stop(self) -> Dict[str, Any]:
        """Stop the show (transition to post_show).

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/stop")

    async def shutdown(self) -> Dict[str, Any]:
        """Shutdown the show (transition to shutdown phase).

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/shutdown")

    async def reset(self) -> Dict[str, Any]:
        """Reset the show back to idle.

        Returns:
            dict with updated show state
        """
        return await self._transport._request("POST", "/show/reset")

    async def transition(self, to: str, source: str = "python-sdk") -> Dict[str, Any]:
        """Transition to an arbitrary phase.

        Args:
            to: Target phase (idle, pre_show, active, paused, post_show, shutdown)
            source: Identifier for the source of this transition

        Returns:
            dict with updated show state
        """
        return await self._transport._request(
            "POST", "/show/transition", json={"to": to, "source": source}
        )

    async def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get show transition history.

        Args:
            limit: Maximum number of history entries to return

        Returns:
            List of transition history entries
        """
        return await self._transport._request(
            "GET", "/show/history", params={"limit": limit}
        )
