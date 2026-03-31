"""
Maestra TouchDesigner Extension
Integrates Maestra entity state with TouchDesigner

Usage (Parameter-driven — no code needed):
1. Use build_maestra_tox.py to create the Maestra COMP
2. Set 'Entity Slug' and 'API URL' in custom parameters
3. Click 'Connect' — state values appear automatically

Usage (Scripting):
1. Use build_maestra_tox.py to create the COMP, or add this file as a Text DAT
2. Access the extension via:
     m = op('maestra').op('maestra_ext').module
     ext = m.get_ext(op('maestra'))
3. ext.State, ext.UpdateState({'key': value}), etc.
"""

import json
from datetime import datetime

try:
    from MaestraDiscovery import discover_maestra, advertise_device, wait_for_provisioning
    _HAS_DISCOVERY = True
except ImportError:
    _HAS_DISCOVERY = False


class MaestraExt:
    """
    Maestra TouchDesigner Extension
    Provides entity state management via HTTP and OSC,
    with optional parameter-driven UI for no-code usage.
    """

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        self._state = {}
        self._entity_slug = ""
        self._entity_id = ""
        self._api_url = "http://localhost:8080"
        self._osc_port = 57120
        self._connected = False
        self._active_stream_id = None
        self._device_config = {}

    # =========================================================================
    # Properties
    # =========================================================================

    @property
    def State(self) -> dict:
        """Get current entity state"""
        return self._state.copy()

    @property
    def EntitySlug(self) -> str:
        """Get entity slug"""
        return self._entity_slug

    @property
    def EntityId(self) -> str:
        """Get resolved entity UUID"""
        return self._entity_id

    @property
    def Connected(self) -> bool:
        """Get connection status"""
        return self._connected

    @property
    def ActiveStreamId(self) -> str:
        """Get active advertised stream ID (if any)"""
        return self._active_stream_id or ""

    @property
    def DeviceConfig(self) -> dict:
        """Get pre-provisioned device configuration"""
        return self._device_config.copy()

    def FetchDeviceConfig(self, hardware_id: str) -> dict:
        """
        Fetch device configuration by hardware_id from the Fleet Manager.
        Stores the result in self.DeviceConfig.

        Args:
            hardware_id: MAC address or unique hardware identifier

        Returns:
            Configuration dict (empty dict if no config exists)
        """
        try:
            import urllib.request
            import urllib.parse
            url = f"{self._api_url}/configs/{urllib.parse.quote(hardware_id, safe='')}/resolve"
            with urllib.request.urlopen(url, timeout=5) as response:
                self._device_config = json.loads(response.read().decode())
                return self._device_config.copy()
        except Exception as e:
            self._set_status(f"Error fetching device config: {e}")
            return {}

    # =========================================================================
    # Parameter-driven interface (used by builder COMP)
    # =========================================================================

    def onParPulse(self, par):
        """Handle pulse parameter events from custom parameters"""
        name = par.name
        if name == 'Connect':
            self._par_connect()
        elif name == 'Disconnect':
            self._par_disconnect()
        elif name == 'Advertise':
            self._par_advertise_stream()
        elif name == 'Withdraw':
            self._par_withdraw_stream()

    def onParValueChange(self, par, prev):
        """Handle parameter value changes"""
        pass

    def onStart(self):
        """Called on project start — auto-connect if enabled"""
        if hasattr(self.ownerComp.par, 'Autoconnect') and self.ownerComp.par.Autoconnect.eval():
            self._par_connect()

    def _par_connect(self):
        """Connect using values from custom parameters"""
        p = self.ownerComp.par
        slug = p.Entityslug.eval() if hasattr(p, 'Entityslug') else ""
        if not slug:
            self._set_status("Set 'Entity Slug' before connecting")
            return

        use_discovery = hasattr(p, 'Usediscovery') and p.Usediscovery.eval()

        if use_discovery:
            timeout = p.Discoverytimeout.eval() if hasattr(p, 'Discoverytimeout') else 5.0
            self._set_status("Discovering Maestra server...")
            config = self.DiscoverAndInitialize(slug, timeout=timeout)
            if config:
                self._set_status(f"Connected via discovery to {config.get('api_url', '?')}")
            else:
                self._set_status("Discovery failed — check network or use manual URL")
        else:
            api_url = p.Apiurl.eval() if hasattr(p, 'Apiurl') else "http://localhost:8080"
            self._set_status(f"Connecting to {api_url}...")
            self.Initialize(slug, api_url=api_url)

    def _par_disconnect(self):
        """Disconnect and clear state"""
        if self._active_stream_id:
            self.WithdrawStream(self._active_stream_id)
            self._active_stream_id = None

        self._state = {}
        self._entity_slug = ""
        self._entity_id = ""
        self._connected = False
        self._notify_state_change()
        self._update_status_pars()
        self._set_status("Disconnected")

    def _par_advertise_stream(self):
        """Advertise a stream using values from custom parameters"""
        if not self._connected:
            self._set_status("Connect to an entity before advertising a stream")
            return

        p = self.ownerComp.par
        name = p.Streamname.eval() if hasattr(p, 'Streamname') else ""
        if not name:
            self._set_status("Set 'Stream Name' before advertising")
            return

        stream_type = p.Streamtype.eval() if hasattr(p, 'Streamtype') else "ndi"
        protocol = p.Streamprotocol.eval() if hasattr(p, 'Streamprotocol') else stream_type
        address = p.Streamaddress.eval() if hasattr(p, 'Streamaddress') else "127.0.0.1"
        port = int(p.Streamport.eval()) if hasattr(p, 'Streamport') else 0

        result = self.AdvertiseStream(
            name=name,
            stream_type=stream_type,
            protocol=protocol,
            address=address,
            port=port,
            publisher_id=self._entity_slug or "touchdesigner",
        )

        if result and result.get('id'):
            self._active_stream_id = result['id']
            self._set_status(f"Stream advertised: {result['id']}")
        else:
            self._set_status("Failed to advertise stream")

    def _par_withdraw_stream(self):
        """Withdraw the active stream"""
        if not self._active_stream_id:
            self._set_status("No active stream to withdraw")
            return

        if self.WithdrawStream(self._active_stream_id):
            self._set_status(f"Stream withdrawn: {self._active_stream_id}")
            self._active_stream_id = None
        else:
            self._set_status("Failed to withdraw stream")

    def _update_status_pars(self):
        """Push internal state to read-only status parameters"""
        p = self.ownerComp.par
        if hasattr(p, 'Connected'):
            p.Connected.val = self._connected
        if hasattr(p, 'Entityid'):
            p.Entityid.val = self._entity_id
        if hasattr(p, 'Lastupdate'):
            p.Lastupdate.val = datetime.now().strftime('%H:%M:%S')

    def _set_status(self, message: str):
        """Update status message parameter and print to textport"""
        print(f"Maestra: {message}")
        p = self.ownerComp.par
        if hasattr(p, 'Statusmessage'):
            p.Statusmessage.val = message
        # Also append to info DAT if it exists
        info = self.ownerComp.op('info')
        if info:
            timestamp = datetime.now().strftime('%H:%M:%S')
            info.appendRow([f"[{timestamp}] {message}"])
            # Keep last 100 lines
            while info.numRows > 100:
                info.deleteRow(0)

    # =========================================================================
    # Heartbeat (called by Timer CHOP callback)
    # =========================================================================

    def onHeartbeat(self):
        """Called by timer callback — sends stream heartbeat if active"""
        if self._active_stream_id:
            self.StreamHeartbeat(self._active_stream_id)

    # =========================================================================
    # Core API (scripting interface — unchanged from original)
    # =========================================================================

    def Initialize(self, entity_slug: str, api_url: str = "http://localhost:8080"):
        """Initialize connection to Maestra entity"""
        self._entity_slug = entity_slug
        self._api_url = api_url
        self._fetch_initial_state()

    def DiscoverAndInitialize(self, entity_slug: str, timeout: float = 5.0,
                              hardware_id: str = None):
        """
        Discover a Maestra server on the local network via mDNS,
        then initialize the connection using the discovered API URL.
        If hardware_id is provided, also fetches the pre-provisioned device config.

        Requires the 'zeroconf' package: pip install zeroconf

        Args:
            entity_slug: Entity slug to bind to
            timeout: How long to wait for mDNS discovery (seconds)
            hardware_id: Optional MAC address to fetch pre-provisioned config

        Returns:
            dict with discovered connection config (api_url, nats_url, etc.)
        """
        if not _HAS_DISCOVERY:
            self._set_status(
                "MaestraDiscovery module not available. "
                "Ensure MaestraDiscovery.py is in the same directory and "
                "'zeroconf' is installed (pip install zeroconf)."
            )
            return None

        try:
            config = discover_maestra(timeout=timeout)
            api_url = config.get("api_url", "http://localhost:8080")
            self.Initialize(entity_slug, api_url=api_url)

            # Fetch device config if hardware_id provided
            if hardware_id:
                self.FetchDeviceConfig(hardware_id)

            return config
        except TimeoutError as e:
            self._set_status(f"Discovery timed out: {e}")
            return None
        except Exception as e:
            self._set_status(f"Discovery failed: {e}")
            return None

    def _fetch_initial_state(self):
        """Fetch initial state from API"""
        try:
            import urllib.request
            url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                self._state = data.get('state', {})
                self._entity_id = data.get('id', '')
                self._connected = True
                self._notify_state_change()
                self._update_status_pars()
                self._set_status(f"Connected to entity '{self._entity_slug}'")
        except Exception as e:
            self._connected = False
            self._update_status_pars()
            self._set_status(f"Error fetching state: {e}")

    def UpdateState(self, updates: dict, source: str = "touchdesigner"):
        """Update entity state (merge with existing)"""
        try:
            import urllib.request

            entity_id = self._entity_id
            if not entity_id:
                url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"
                with urllib.request.urlopen(url) as response:
                    data = json.loads(response.read().decode())
                    entity_id = data['id']
                    self._entity_id = entity_id

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
                self._update_status_pars()

        except Exception as e:
            self._set_status(f"Error updating state: {e}")

    def SetState(self, new_state: dict, source: str = "touchdesigner"):
        """Replace entire entity state"""
        try:
            import urllib.request

            entity_id = self._entity_id
            if not entity_id:
                url = f"{self._api_url}/entities/by-slug/{self._entity_slug}"
                with urllib.request.urlopen(url) as response:
                    data = json.loads(response.read().decode())
                    entity_id = data['id']
                    self._entity_id = entity_id

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
                self._update_status_pars()

        except Exception as e:
            self._set_status(f"Error setting state: {e}")

    def OnOscMessage(self, address: str, *args):
        """Handle incoming OSC message (state change event)"""
        parts = address.split('/')
        if len(parts) >= 5 and parts[1] == 'maestra' and parts[4] == self._entity_slug:
            try:
                if args and isinstance(args[0], str):
                    data = json.loads(args[0])
                    if data.get('type') == 'state_changed':
                        self._state = data.get('current_state', {})
                        self._notify_state_change()
                        self._update_status_pars()
            except Exception as e:
                self._set_status(f"Error parsing OSC: {e}")

    def _notify_state_change(self):
        """Notify TouchDesigner of state change"""
        # Update output table DAT if exists
        table = self.ownerComp.op('state_table')
        if table:
            table.clear()
            table.appendRow(['key', 'value', 'type'])
            for key, value in self._state.items():
                val_type = type(value).__name__
                if isinstance(value, (dict, list)):
                    table.appendRow([key, json.dumps(value), val_type])
                else:
                    table.appendRow([key, str(value), val_type])

        # Update CHOP channels for numeric values
        chop = self.ownerComp.op('state_chop')
        if chop and hasattr(chop, 'clear'):
            try:
                chop.clear()
                for key, value in self._state.items():
                    if isinstance(value, (int, float)):
                        chop.appendChan(key)[0] = value
                    elif isinstance(value, bool):
                        chop.appendChan(key)[0] = 1 if value else 0
            except Exception:
                pass  # Script CHOP may not support appendChan directly

        # Run callback if exists
        callback = self.ownerComp.op('callbacks')
        if callback:
            try:
                callback.run(self._state)
            except Exception:
                pass

    def Get(self, key: str, default=None):
        """Get a state value"""
        return self._state.get(key, default)

    def __getitem__(self, key: str):
        """Dictionary-style access to state"""
        return self._state.get(key)

    # =========================================================================
    # Streams
    # =========================================================================

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
            self._set_status(f"Error listing streams: {e}")
            return []

    def GetStream(self, stream_id: str) -> dict:
        """Get a single stream by ID"""
        try:
            import urllib.request
            url = f"{self._api_url}/streams/{stream_id}"
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            self._set_status(f"Error getting stream: {e}")
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
            self._set_status(f"Error advertising stream: {e}")
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
            self._set_status(f"Error withdrawing stream: {e}")
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
            self._set_status(f"Error sending heartbeat: {e}")
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
            self._set_status(f"Error requesting stream: {e}")
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
            self._set_status(f"Error stopping session: {e}")
            return False

    # =========================================================================
    # Show Control
    # =========================================================================

    @property
    def ShowPhase(self) -> str:
        """
        Get current show phase (read-only).
        Returns one of: idle, pre_show, active, paused, post_show, shutdown, or empty string if unknown.
        Updated automatically when receiving MQTT state broadcasts on
        maestra/entity/state/show_control/show, or manually via GetShowState().
        """
        return self._show_phase if hasattr(self, '_show_phase') else ""

    def _ensure_show_state(self):
        """Lazy-init show control state fields"""
        if not hasattr(self, '_show_phase'):
            self._show_phase = ""
        if not hasattr(self, '_show_previous_phase'):
            self._show_previous_phase = ""

    def GetShowState(self) -> dict:
        """
        Fetch current show state from the REST API.
        Returns dict with: phase, previous_phase, transition_time, source, context
        """
        self._ensure_show_state()
        try:
            import urllib.request
            url = f"{self._api_url}/show/state"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                new_phase = data.get('phase', '')
                previous_phase = data.get('previous_phase', '')
                if new_phase != self._show_phase:
                    old_phase = self._show_phase
                    self._show_phase = new_phase
                    self._show_previous_phase = previous_phase
                    self.onShowChange(new_phase, old_phase)
                return data
        except Exception as e:
            self._set_status(f"Error getting show state: {e}")
            return {}

    def onShowChange(self, phase: str, previousPhase: str):
        """
        Called when the show phase changes.
        Override this method or use the callbacks DAT to respond to phase changes.

        Args:
            phase: The new show phase (idle, pre_show, active, paused, post_show, shutdown)
            previousPhase: The previous show phase
        """
        self._set_status(f"Show phase changed: {previousPhase} -> {phase}")

        # Update show phase parameter if it exists
        p = self.ownerComp.par
        if hasattr(p, 'Showphase'):
            p.Showphase.val = phase

        # Run callback DAT if exists
        callback = self.ownerComp.op('callbacks')
        if callback:
            try:
                callback.run(phase, previousPhase)
            except Exception:
                pass

    def onShowMqttMessage(self, topic: str, payload: str):
        """
        Handle incoming MQTT message for show state changes.
        Call this from an MQTT subscriber DAT callback when receiving messages
        on topic: maestra/entity/state/show_control/show

        Args:
            topic: The MQTT topic
            payload: The raw MQTT payload string (JSON)
        """
        self._ensure_show_state()
        try:
            data = json.loads(payload)
            state = data if isinstance(data, dict) else {}
            new_phase = state.get('phase', '')
            if new_phase and new_phase != self._show_phase:
                old_phase = self._show_phase
                self._show_phase = new_phase
                self._show_previous_phase = state.get('previous_phase', old_phase)
                self.onShowChange(new_phase, old_phase)
        except Exception as e:
            self._set_status(f"Error parsing show MQTT message: {e}")

    def _send_show_command(self, endpoint: str) -> dict:
        """Internal helper to send a POST command to a show endpoint"""
        self._ensure_show_state()
        try:
            import urllib.request
            url = f"{self._api_url}{endpoint}"
            req = urllib.request.Request(
                url,
                data=b'{}',
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                new_phase = data.get('phase', '')
                if new_phase and new_phase != self._show_phase:
                    old_phase = self._show_phase
                    self._show_phase = new_phase
                    self._show_previous_phase = data.get('previous_phase', old_phase)
                    self.onShowChange(new_phase, old_phase)
                return data
        except Exception as e:
            self._set_status(f"Error sending show command ({endpoint}): {e}")
            return {}

    def ShowWarmup(self) -> dict:
        """Transition to warmup / pre-show phase"""
        return self._send_show_command('/show/warmup')

    def ShowGo(self) -> dict:
        """Start the show (transition to active phase)"""
        return self._send_show_command('/show/go')

    def ShowPause(self) -> dict:
        """Pause the show"""
        return self._send_show_command('/show/pause')

    def ShowResume(self) -> dict:
        """Resume the show from paused state"""
        return self._send_show_command('/show/resume')

    def ShowStop(self) -> dict:
        """Stop the show (transition to post-show phase)"""
        return self._send_show_command('/show/stop')

    def ShowShutdown(self) -> dict:
        """Shutdown the show"""
        return self._send_show_command('/show/shutdown')

    def ShowReset(self) -> dict:
        """Reset the show back to idle"""
        return self._send_show_command('/show/reset')

    def ShowTransition(self, to_phase: str, source: str = "touchdesigner") -> dict:
        """
        Transition to an arbitrary show phase.

        Args:
            to_phase: Target phase (idle, pre_show, active, paused, post_show, shutdown)
            source: Optional source identifier
        """
        self._ensure_show_state()
        try:
            import urllib.request
            url = f"{self._api_url}/show/transition"
            payload = json.dumps({
                'to': to_phase,
                'source': source
            }).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                new_phase = data.get('phase', '')
                if new_phase and new_phase != self._show_phase:
                    old_phase = self._show_phase
                    self._show_phase = new_phase
                    self._show_previous_phase = data.get('previous_phase', old_phase)
                    self.onShowChange(new_phase, old_phase)
                return data
        except Exception as e:
            self._set_status(f"Error sending show transition: {e}")
            return {}


# Module-level cached factory — prevents re-instantiation every frame
_cached_ext = None
_cached_owner = None

def get_ext(owner):
    global _cached_ext, _cached_owner
    if _cached_ext is None or _cached_owner is not owner:
        _cached_ext = MaestraExt(owner)
        _cached_owner = owner
    return _cached_ext
