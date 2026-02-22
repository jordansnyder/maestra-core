"""
Maestra TouchDesigner Extension
Integrates Maestra entity state with TouchDesigner

Usage:
1. Add this extension to a Base COMP
2. Set the 'Entity_Slug' parameter
3. Use op('maestra').State to access state values
4. Use op('maestra').UpdateState({'key': value}) to update
"""

import json
import asyncio
from datetime import datetime

class MaestraExt:
    """
    Maestra TouchDesigner Extension
    Provides entity state management via OSC and HTTP
    """

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._state = {}
        self._entity_slug = ""
        self._api_url = "http://localhost:8080"
        self._osc_port = 57120

    @property
    def State(self) -> dict:
        """Get current entity state"""
        return self._state.copy()

    @property
    def EntitySlug(self) -> str:
        """Get entity slug"""
        return self._entity_slug

    def Initialize(self, entity_slug: str, api_url: str = "http://localhost:8080"):
        """Initialize connection to Maestra entity"""
        self._entity_slug = entity_slug
        self._api_url = api_url
        self._fetch_initial_state()

    def _fetch_initial_state(self):
        """Fetch initial state from API"""
        try:
            import urllib.request
            url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                self._state = data.get('state', {})
                self._notify_state_change()
        except Exception as e:
            print(f"Maestra: Error fetching state: {e}")

    def UpdateState(self, updates: dict, source: str = "touchdesigner"):
        """Update entity state (merge with existing)"""
        try:
            import urllib.request
            url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"

            # First get entity ID
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                entity_id = data['id']

            # Send state update
            update_url = f"{self._api_url}/entities/{entity_id}/state"
            payload = json.dumps({
                'state': updates,
                'source': source
            }).encode()

            req = urllib.request.Request(
                update_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='PATCH'
            )

            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode())
                self._state = result.get('state', {})
                self._notify_state_change()

        except Exception as e:
            print(f"Maestra: Error updating state: {e}")

    def SetState(self, new_state: dict, source: str = "touchdesigner"):
        """Replace entire entity state"""
        try:
            import urllib.request
            url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"

            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                entity_id = data['id']

            update_url = f"{self._api_url}/entities/{entity_id}/state"
            payload = json.dumps({
                'state': new_state,
                'source': source
            }).encode()

            req = urllib.request.Request(
                update_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='PUT'
            )

            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode())
                self._state = result.get('state', {})
                self._notify_state_change()

        except Exception as e:
            print(f"Maestra: Error setting state: {e}")

    def OnOscMessage(self, address: str, *args):
        """Handle incoming OSC message (state change event)"""
        # Expected format: /maestra/entity/state/<type>/<slug>
        parts = address.split('/')
        if len(parts) >= 5 and parts[1] == 'maestra' and parts[4] == self._entity_slug:
            try:
                # Parse JSON from first argument
                if args and isinstance(args[0], str):
                    data = json.loads(args[0])
                    if data.get('type') == 'state_changed':
                        self._state = data.get('current_state', {})
                        self._notify_state_change()
            except Exception as e:
                print(f"Maestra: Error parsing OSC: {e}")

    def _notify_state_change(self):
        """Notify TouchDesigner of state change"""
        # Update output table DAT if exists
        table = self.ownerComp.op('state_table')
        if table:
            table.clear()
            table.appendRow(['key', 'value'])
            for key, value in self._state.items():
                table.appendRow([key, json.dumps(value) if isinstance(value, (dict, list)) else str(value)])

        # Run callback if exists
        callback = self.ownerComp.op('on_state_change')
        if callback:
            callback.run(self._state)

    def Get(self, key: str, default=None):
        """Get a state value"""
        return self._state.get(key, default)

    def __getitem__(self, key: str):
        """Dictionary-style access to state"""
        return self._state.get(key)

    # ===== Streams =====

    def ListStreams(self, stream_type: str = None) -> list:
        """List active streams from the registry"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams"
            if stream_type:
                url += f"?stream_type={stream_type}"
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            print(f"Maestra: Error listing streams: {e}")
            return []

    def GetStream(self, stream_id: str) -> dict:
        """Get a single stream by ID"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/{stream_id}"
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            print(f"Maestra: Error getting stream: {e}")
            return {}

    def AdvertiseStream(
        self,
        name: str,
        stream_type: str,
        protocol: str,
        address: str,
        port: int,
        publisher_id: str = "touchdesigner",
        config: dict = None,
        metadata: dict = None,
    ) -> dict:
        """Advertise a new stream to the registry"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/advertise"
            body = {
                "name": name,
                "stream_type": stream_type,
                "publisher_id": publisher_id,
                "protocol": protocol,
                "address": address,
                "port": port,
            }
            if config:
                body["config"] = config
            if metadata:
                body["metadata"] = metadata

            payload = json.dumps(body).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            print(f"Maestra: Error advertising stream: {e}")
            return {}

    def WithdrawStream(self, stream_id: str) -> bool:
        """Withdraw a stream from the registry"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/{stream_id}"
            req = urllib.request.Request(url, method='DELETE')
            with urllib.request.urlopen(req) as response:
                return True
        except Exception as e:
            print(f"Maestra: Error withdrawing stream: {e}")
            return False

    def StreamHeartbeat(self, stream_id: str) -> bool:
        """Refresh a stream's TTL (call every ~10s from a Timer CHOP)"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/{stream_id}/heartbeat"
            req = urllib.request.Request(
                url,
                data=b'{}',
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req) as response:
                return True
        except Exception as e:
            print(f"Maestra: Error sending heartbeat: {e}")
            return False

    def RequestStream(
        self,
        stream_id: str,
        consumer_id: str = "touchdesigner",
        consumer_address: str = "127.0.0.1",
        consumer_port: int = None,
        config: dict = None,
    ) -> dict:
        """Request to consume a stream. Returns connection details from the publisher."""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/{stream_id}/request"
            body = {
                "consumer_id": consumer_id,
                "consumer_address": consumer_address,
            }
            if consumer_port is not None:
                body["consumer_port"] = consumer_port
            if config:
                body["config"] = config

            payload = json.dumps(body).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            print(f"Maestra: Error requesting stream: {e}")
            return {}

    def StopSession(self, session_id: str) -> bool:
        """Stop an active streaming session"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/sessions/{session_id}"
            req = urllib.request.Request(url, method='DELETE')
            with urllib.request.urlopen(req) as response:
                return True
        except Exception as e:
            print(f"Maestra: Error stopping session: {e}")
            return False
