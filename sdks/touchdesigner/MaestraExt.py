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
