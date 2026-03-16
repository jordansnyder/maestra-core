"""
Maestra TouchDesigner COMP Builder
===================================
Creates a fully-configured Maestra COMP with custom parameters,
state table, CHOP output, OSC input, and stream management.

How to run (pick one):

  Option A — Textport one-liner:
    exec(open('/path/to/build_maestra_tox.py').read())

  Option B — Text DAT:
    1. Create a Text DAT, paste this script in
    2. Right-click the DAT > Run Script

  Option C — File DAT:
    1. Create a File DAT, set the file path to this .py file
    2. Right-click > Run Script

The COMP is created at /project1/maestra by default.
Change COMP_PATH below to place it elsewhere.

After running:
  1. Set 'Entity Slug' to your entity name
  2. Click 'Connect'
  3. State values appear in state_table and state_chop automatically
"""

# ── Configuration ────────────────────────────────────────────────────────────
COMP_PATH = '/project1/maestra'
# ─────────────────────────────────────────────────────────────────────────────


def build():
    # Remove existing comp if present
    parent_path = '/'.join(COMP_PATH.rstrip('/').split('/')[:-1])
    comp_name = COMP_PATH.rstrip('/').split('/')[-1]
    parent_op = op(parent_path)

    if parent_op.op(comp_name):
        parent_op.op(comp_name).destroy()

    # Create Base COMP
    comp = parent_op.create(baseCOMP, comp_name)
    comp.nodeX = 0
    comp.nodeY = 0
    comp.viewer = True
    comp.comment = 'Maestra — Entity State & Streams'

    # ── Custom Parameters ────────────────────────────────────────────────

    page_conn = comp.appendCustomPage('Connection')
    page_status = comp.appendCustomPage('Status')
    page_streams = comp.appendCustomPage('Streams')

    # -- Connection page --
    p = page_conn.appendStr('Apiurl', label='API URL')
    p[0].default = 'http://localhost:8080'
    p[0].val = 'http://localhost:8080'

    p = page_conn.appendStr('Entityslug', label='Entity Slug')
    p[0].default = ''

    p = page_conn.appendToggle('Autoconnect', label='Auto-Connect on Start')
    p[0].default = False

    page_conn.appendPulse('Connect', label='Connect')
    page_conn.appendPulse('Disconnect', label='Disconnect')

    p = page_conn.appendToggle('Usediscovery', label='Use mDNS Discovery')
    p[0].default = False

    p = page_conn.appendFloat('Discoverytimeout', label='Discovery Timeout (s)')
    p[0].default = 5.0
    p[0].val = 5.0
    p[0].min = 1.0
    p[0].max = 30.0
    p[0].clampMin = True
    p[0].clampMax = False

    # -- Status page (read-only) --
    p = page_status.appendToggle('Connected', label='Connected')
    p[0].default = False
    p[0].readOnly = True

    p = page_status.appendStr('Entityid', label='Entity ID')
    p[0].default = ''
    p[0].readOnly = True

    p = page_status.appendStr('Lastupdate', label='Last Update')
    p[0].default = ''
    p[0].readOnly = True

    p = page_status.appendStr('Statusmessage', label='Status')
    p[0].default = 'Not connected'
    p[0].val = 'Not connected'
    p[0].readOnly = True

    # -- Streams page --
    p = page_streams.appendStr('Streamname', label='Stream Name')
    p[0].default = ''

    p = page_streams.appendMenu('Streamtype', label='Stream Type')
    p[0].menuNames = [
        'ndi', 'syphon', 'spout', 'video', 'audio',
        'texture', 'sensor', 'osc', 'midi', 'data', 'srt',
    ]
    p[0].menuLabels = [
        'NDI', 'Syphon', 'Spout', 'Video', 'Audio',
        'Texture', 'Sensor', 'OSC', 'MIDI', 'Data', 'SRT',
    ]
    p[0].default = 'ndi'
    p[0].val = 'ndi'

    p = page_streams.appendStr('Streamprotocol', label='Protocol')
    p[0].default = 'ndi'
    p[0].val = 'ndi'

    p = page_streams.appendStr('Streamaddress', label='Address')
    p[0].default = '127.0.0.1'
    p[0].val = '127.0.0.1'

    p = page_streams.appendInt('Streamport', label='Port')
    p[0].default = 0
    p[0].min = 0
    p[0].max = 65535
    p[0].clampMin = True
    p[0].clampMax = True

    page_streams.appendPulse('Advertise', label='Advertise Stream')
    page_streams.appendPulse('Withdraw', label='Withdraw Stream')

    # ── Internal Operators ───────────────────────────────────────────────

    # -- Extension script (module, not using TD's extension system) --
    ext_dat = comp.create(textDAT, 'maestra_ext')
    ext_dat.nodeX = -400
    ext_dat.nodeY = 200
    ext_dat.viewer = False
    ext_dat.text = _MAESTRA_EXT_SOURCE

    # -- Parameter handler (responds to Connect/Disconnect/Advertise/Withdraw) --
    param_handler = comp.create(parameterexecuteDAT, 'param_handler')
    param_handler.nodeX = -200
    param_handler.nodeY = 200
    param_handler.viewer = False
    param_handler.par.active = True
    param_handler.par.op = comp.path
    param_handler.par.pars = '*'
    param_handler.par.onpulse = True
    param_handler.par.valuechange = True
    param_handler.par.custom = True
    param_handler.text = _PARAM_HANDLER_SOURCE

    # -- Discovery module --
    disc_dat = comp.create(textDAT, 'MaestraDiscovery')
    disc_dat.nodeX = -400
    disc_dat.nodeY = 100
    disc_dat.viewer = False
    disc_dat.text = _MAESTRA_DISCOVERY_SOURCE

    # -- State table --
    state_table = comp.create(tableDAT, 'state_table')
    state_table.nodeX = 0
    state_table.nodeY = 200
    state_table.viewer = True
    state_table.appendRow(['key', 'value', 'type'])

    # -- State CHOP callbacks (must be created before the Script CHOP) --
    state_chop_callbacks = comp.create(textDAT, 'state_chop_callbacks')
    state_chop_callbacks.nodeX = 0
    state_chop_callbacks.nodeY = -100
    state_chop_callbacks.viewer = False
    state_chop_callbacks.text = _STATE_CHOP_CALLBACKS_SOURCE

    # -- State CHOP (Script CHOP for numeric channels) --
    state_chop = comp.create(scriptCHOP, 'state_chop')
    state_chop.nodeX = 0
    state_chop.nodeY = 0
    state_chop.viewer = True
    state_chop.par.callbacks = 'state_chop_callbacks'

    # -- WebSocket DAT (real-time state subscription) --
    ws_dat = comp.create(websocketDAT, 'ws_in')
    ws_dat.nodeX = -400
    ws_dat.nodeY = -100
    ws_dat.viewer = False
    ws_dat.par.active = False  # Activated on Connect

    # -- WebSocket callback (DAT Execute) --
    ws_script = comp.create(datexecuteDAT, 'ws_script')
    ws_script.nodeX = -200
    ws_script.nodeY = -100
    ws_script.viewer = False
    ws_script.par.dat = 'ws_in'
    ws_script.par.tablechange = True
    ws_script.par.rowchange = True
    ws_script.text = _WS_CALLBACK_SOURCE

    # -- OSC In DAT --
    osc_in = comp.create(oscinDAT, 'osc_in')
    osc_in.nodeX = -400
    osc_in.nodeY = -200
    osc_in.viewer = False
    osc_in.par.port = 57121
    osc_in.par.active = False

    # -- OSC callback script (DAT Execute) --
    osc_script = comp.create(datexecuteDAT, 'osc_script')
    osc_script.nodeX = -200
    osc_script.nodeY = -200
    osc_script.viewer = False
    osc_script.par.dat = 'osc_in'
    osc_script.par.tablechange = True
    osc_script.text = _OSC_CALLBACK_SOURCE

    # -- Timer CHOP (10s heartbeat) --
    timer = comp.create(timerCHOP, 'timer')
    timer.nodeX = -400
    timer.nodeY = -350
    timer.viewer = False
    timer.par.length = 10
    timer.par.lengthunits = 'seconds'
    timer.par.play = True
    timer.par.cue = False
    timer.par.outseg = True
    timer.par.ondone = 'restart'

    # -- Timer callback (CHOP Execute) --
    timer_cb = comp.create(chopexecuteDAT, 'timer_callback')
    timer_cb.nodeX = -200
    timer_cb.nodeY = -350
    timer_cb.viewer = False
    timer_cb.par.chop = 'timer'
    timer_cb.par.offtoon = True
    timer_cb.text = _TIMER_CALLBACK_SOURCE

    # -- User callbacks DAT --
    callbacks = comp.create(textDAT, 'callbacks')
    callbacks.nodeX = 200
    callbacks.nodeY = 200
    callbacks.viewer = False
    callbacks.text = _USER_CALLBACKS_SOURCE

    # -- Info/log DAT --
    info = comp.create(textDAT, 'info')
    info.nodeX = 200
    info.nodeY = 0
    info.viewer = True
    info.text = ''

    # -- Project start callback (for auto-connect) --
    start_dat = comp.create(datexecuteDAT, 'project_start')
    start_dat.nodeX = -200
    start_dat.nodeY = 200
    start_dat.viewer = False
    start_dat.text = _PROJECT_START_SOURCE

    print('')
    print('=' * 60)
    print('  Maestra COMP created at ' + COMP_PATH)
    print('=' * 60)
    print('')
    print('  Quick start:')
    print('    1. Set "Entity Slug" in the Connection page')
    print('    2. Click "Connect"')
    print('    3. State appears in state_table and state_chop')
    print('')
    print('  Scripting:')
    print("    m = op('" + COMP_PATH + "').op('maestra_ext').module")
    print("    ext = m.get_ext(op('" + COMP_PATH + "'))")
    print("    ext.State")
    print("    ext.UpdateState({'brightness': 75})")
    print('')
    print('  To save as .tox:')
    print("    op('" + COMP_PATH + "').save('" + comp_name + ".tox')")
    print('')

    return comp


# =============================================================================
# Embedded source code for internal DATs
# =============================================================================

# Read MaestraExt.py source — embedded inline so the builder is self-contained.
# This is the parameter-driven extension class.
_MAESTRA_EXT_SOURCE = '''"""
Maestra TouchDesigner Extension
Integrates Maestra entity state with TouchDesigner

Usage (Parameter-driven — no code needed):
  Set 'Entity Slug' and 'API URL' in custom parameters, then click 'Connect'.

Usage (Scripting):
  op('maestra').ext.MaestraExt.Initialize('my-entity')
  op('maestra').ext.MaestraExt.State
  op('maestra').ext.MaestraExt.UpdateState({'key': value})
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

        # Activate WebSocket for real-time state updates
        if self._connected:
            self._start_websocket()

    def _par_disconnect(self):
        """Disconnect and clear state"""
        if self._active_stream_id:
            self.WithdrawStream(self._active_stream_id)
            self._active_stream_id = None

        # Stop WebSocket
        self._stop_websocket()

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
        info = self.ownerComp.op('info')
        if info:
            timestamp = datetime.now().strftime('%H:%M:%S')
            info.appendRow([f"[{timestamp}] {message}"])
            while info.numRows > 100:
                info.deleteRow(0)

    # =========================================================================
    # WebSocket (real-time state subscription)
    # =========================================================================

    def _start_websocket(self):
        """Activate WebSocket DAT for real-time state updates"""
        ws = self.ownerComp.op('ws_in')
        if not ws:
            return

        # Derive WebSocket URL from API URL
        # http://host:8080 → ws://host:8765
        api_url = self._api_url
        try:
            from urllib.parse import urlparse
            parsed = urlparse(api_url)
            ws_host = parsed.hostname or 'localhost'
            ws_url = f"ws://{ws_host}:8765"
        except Exception:
            ws_url = "ws://localhost:8765"

        ws.par.netaddress = ws_host
        ws.par.port = 8765
        ws.par.active = True
        self._set_status(f"WebSocket connecting to {ws_host}:8765...")

    def _stop_websocket(self):
        """Deactivate WebSocket DAT"""
        ws = self.ownerComp.op('ws_in')
        if ws:
            ws.par.active = False

    # =========================================================================
    # Heartbeat (called by Timer CHOP callback)
    # =========================================================================

    def onHeartbeat(self):
        """Called by timer callback — sends stream heartbeat if active"""
        if self._active_stream_id:
            self.StreamHeartbeat(self._active_stream_id)

    # =========================================================================
    # Core API (scripting interface)
    # =========================================================================

    def Initialize(self, entity_slug: str, api_url: str = "http://localhost:8080"):
        """Initialize connection to Maestra entity"""
        self._entity_slug = entity_slug
        self._api_url = api_url
        self._fetch_initial_state()

    def DiscoverAndInitialize(self, entity_slug: str, timeout: float = 5.0):
        """
        Discover a Maestra server on the local network via mDNS,
        then initialize the connection using the discovered API URL.

        Requires the 'zeroconf' package: pip install zeroconf
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
        # Update output table DAT
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

        # Store numeric values for the Script CHOP to read on its next cook
        chop = self.ownerComp.op('state_chop')
        if chop:
            try:
                chop.cook(force=True)
            except Exception:
                pass

        # Run user callback
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


# Module-level cached factory — prevents re-instantiation every frame
_cached_ext = None
_cached_owner = None

def get_ext(owner):
    global _cached_ext, _cached_owner
    if _cached_ext is None or _cached_owner is not owner:
        _cached_ext = MaestraExt(owner)
        _cached_owner = owner
    return _cached_ext
'''

_MAESTRA_DISCOVERY_SOURCE = '''"""
Maestra Discovery - mDNS/DNS-SD helpers for TouchDesigner

Provides automatic discovery of Maestra servers on the local network,
device advertisement to the Fleet Manager, and provisioning polling.

Requires the 'zeroconf' package: pip install zeroconf
"""

import json
import socket
import threading
import urllib.request
import urllib.error


SERVICE_TYPE = "_maestra._tcp.local."


def discover_maestra(timeout=5.0):
    """
    Discover a Maestra server on the local network via mDNS.

    Returns:
        dict with keys: api_url, nats_url, mqtt_broker, mqtt_port, ws_url

    Raises:
        ImportError: If zeroconf is not installed
        TimeoutError: If no Maestra server found within timeout
    """
    try:
        from zeroconf import Zeroconf, ServiceBrowser, ServiceInfo
    except ImportError:
        raise ImportError(
            "zeroconf is required for Maestra discovery. "
            "Install it with: pip install zeroconf"
        )

    found_config = {}
    event = threading.Event()

    class Listener:
        def add_service(self, zc, type_, name):
            info = ServiceInfo(type_, name)
            if info.request(zc, 3000):
                props = {}
                if info.properties:
                    for k, v in info.properties.items():
                        key = k.decode("utf-8") if isinstance(k, bytes) else k
                        val = v.decode("utf-8") if isinstance(v, bytes) else str(v)
                        props[key] = val

                ip = _get_ip(info)
                found_config["api_url"] = props.get("api_url", f"http://{ip}:8080")
                found_config["nats_url"] = props.get("nats_url", f"nats://{ip}:4222")
                found_config["mqtt_broker"] = props.get("mqtt_broker", ip)
                found_config["mqtt_port"] = int(props.get("mqtt_port", "1883"))
                found_config["ws_url"] = props.get("ws_url", f"ws://{ip}:8765")

                print(f"Maestra: Discovered server at {found_config['api_url']}")
                event.set()

        def remove_service(self, zc, type_, name):
            pass

        def update_service(self, zc, type_, name):
            pass

    zc = Zeroconf()
    try:
        browser = ServiceBrowser(zc, SERVICE_TYPE, Listener())  # noqa: F841
        if not event.wait(timeout=timeout):
            raise TimeoutError(
                f"No Maestra server found within {timeout}s. "
                "Ensure the discovery service is running."
            )
        return found_config
    finally:
        zc.close()


def advertise_device(
    api_url,
    hardware_id,
    device_type,
    name=None,
    ip_address=None,
    metadata=None,
):
    """
    Register this device with the Fleet Manager via HTTP POST to /devices/discover.
    The device will appear as 'pending' in the dashboard until an admin approves it.
    """
    url = f"{api_url.rstrip('/')}/devices/discover"

    if name is None:
        name = f"TD-{hardware_id}"

    if ip_address is None:
        ip_address = _get_local_ip()

    body = {
        "name": name,
        "device_type": device_type,
        "hardware_id": hardware_id,
        "ip_address": ip_address,
    }
    if metadata:
        body["metadata"] = metadata

    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"Maestra: Device registered as pending (id={data.get('id')})")
            return data
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"Maestra: Error registering device: {e.code} {error_body}")
        raise
    except Exception as e:
        print(f"Maestra: Error registering device: {e}")
        raise


def wait_for_provisioning(api_url, device_id, poll_interval=5.0, timeout=300.0):
    """
    Poll the Fleet Manager until this device is approved and provisioned.
    Blocking call — run from a Script CHOP callback or background thread.
    """
    import time

    url = f"{api_url.rstrip('/')}/devices/{device_id}/provision"
    elapsed = 0.0

    print(f"Maestra: Waiting for device approval (polling every {poll_interval}s, timeout {timeout}s)...")

    while elapsed < timeout:
        try:
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                print(f"Maestra: Device provisioned (status={data.get('provision_status')})")
                return data
        except urllib.error.HTTPError as e:
            if e.code == 403:
                pass  # Not approved yet
            elif e.code == 404:
                print(f"Maestra: No provisioning record found for device {device_id}")
                raise
            else:
                print(f"Maestra: Provision check returned {e.code}")
        except Exception as e:
            print(f"Maestra: Provision check failed: {e}")

        time.sleep(poll_interval)
        elapsed += poll_interval

    raise TimeoutError(
        f"Device not provisioned within {timeout}s. "
        "Check the Maestra dashboard to approve the device."
    )


def _get_ip(info):
    """Extract IP address string from a zeroconf ServiceInfo"""
    if info.addresses:
        return socket.inet_ntoa(info.addresses[0])
    return "localhost"


def _get_local_ip():
    """Get the local IP address of this machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
'''

_STATE_CHOP_CALLBACKS_SOURCE = '''# Script CHOP callbacks — reads numeric state values into CHOP channels

def onCook(scriptOp):
    scriptOp.clear()
    m = parent().op('maestra_ext').module
    ext = m.get_ext(parent())
    state = ext.State
    for key, value in state.items():
        if isinstance(value, bool):
            scriptOp.appendChan(key)[0] = 1 if value else 0
        elif isinstance(value, (int, float)):
            scriptOp.appendChan(key)[0] = value
'''

_PARAM_HANDLER_SOURCE = '''# Parameter Execute DAT — handles pulse and value changes on the COMP
# This fires only when parameters change (NOT every frame), so it is safe
# to call get_ext() here without freezing TouchDesigner.

def onPulse(par):
    m = parent().op('maestra_ext').module
    ext = m.get_ext(parent())
    ext.onParPulse(par)

def onValueChange(par, prev):
    m = parent().op('maestra_ext').module
    ext = m.get_ext(parent())
    ext.onParValueChange(par, prev)
'''

_WS_CALLBACK_SOURCE = '''# WebSocket DAT Execute callback — receives real-time state changes from Maestra
import json

def onTableChange(dat):
    # Called when the WebSocket DAT table changes (new message received)
    if dat.numRows < 1:
        return

    # Get the latest row
    row = dat.numRows - 1
    message = dat[row, 0].val if dat.numCols > 0 else ''

    if not message:
        return

    try:
        msg = json.loads(message)
    except Exception:
        return

    msg_type = msg.get('type', '')

    # Handle welcome message
    if msg_type == 'welcome':
        print('Maestra: WebSocket connected to gateway')
        return

    # Handle state change broadcast
    if msg_type == 'message':
        data = msg.get('data', {})

        # Check if this is a state_changed event
        if isinstance(data, dict) and data.get('type') == 'state_changed':
            m = parent().op('maestra_ext').module
            ext = m.get_ext(parent())
            # Only process if it matches our entity
            event_slug = data.get('entity_slug', '')
            if event_slug == ext.EntitySlug:
                new_state = data.get('current_state', {})
                ext._state = new_state
                ext._notify_state_change()
                ext._update_status_pars()
                ext._set_status(f"State updated (source: {data.get('source', 'unknown')})")

def onRowChange(dat, rows):
    pass

def onCellChange(dat, cells, prev):
    pass

def onSizeChange(dat):
    pass
'''

_OSC_CALLBACK_SOURCE = '''# OSC In callback — routes incoming OSC messages to MaestraExt

def onTableChange(dat):
    if dat.numRows < 2:
        return
    # Last row contains the most recent message
    row = dat.numRows - 1
    address = dat[row, 'address'].val if dat.col('address') else ''
    args_str = dat[row, 'args'].val if dat.col('args') else ''

    if address:
        m = parent().op('maestra_ext').module
        ext = m.get_ext(parent())
        ext.OnOscMessage(address, args_str)
'''

_TIMER_CALLBACK_SOURCE = '''# Timer CHOP callback — sends stream heartbeat every cycle

def onOffToOn(channel, sampleIndex, val, prev):
    if channel.name == 'timer_pulse' or channel.name == 'done':
        m = parent().op('maestra_ext').module
        ext = m.get_ext(parent())
        ext.onHeartbeat()
'''

_USER_CALLBACKS_SOURCE = '''# Maestra State Change Callback
# This script runs whenever entity state changes.
# Edit it to react to state updates in your project.
#
# The 'state' argument is a dict with the current entity state.
#
# Examples:
#   state.get('brightness', 0)
#   state.get('color', '#ffffff')
#   state.get('active', False)

def onStateChange(state):
    # Uncomment and edit to react to state changes:
    # op('level1').par.opacity = state.get('brightness', 100) / 100
    pass
'''

_PROJECT_START_SOURCE = (
    "# Project start callback — triggers auto-connect if enabled\n"
    "\n"
    "def onTableChange(dat):\n"
    "    pass\n"
    "\n"
    "# This DAT is a placeholder. Auto-connect is handled by\n"
    "# MaestraExt.onStart() which should be called from a\n"
    "# project-level Execute DAT or manually after load.\n"
    "#\n"
    "# To enable auto-connect on project open, create an\n"
    "# Execute DAT at the project level with:\n"
    "#\n"
    "#   def onStart():\n"
    "#       m = op('" + COMP_PATH + "').op('maestra_ext').module\n"
    "#       m.get_ext(op('" + COMP_PATH + "')).onStart()\n"
)


# =============================================================================
# Run the builder
# =============================================================================
build()
