import { useState, useCallback, useRef, useEffect } from "react";

const DEVICES = [
  { id: "cam-a", name: "RED V-Raptor", type: "camera", icon: "🎬", inputs: [], outputs: ["sdi-out", "hdmi-out", "tc-out"], color: "#E84855" },
  { id: "cam-b", name: "Sony FX6", type: "camera", icon: "🎬", inputs: [], outputs: ["sdi-out", "hdmi-out", "tc-out"], color: "#E84855" },
  { id: "cam-c", name: "BMPCC 6K Pro", type: "camera", icon: "🎬", inputs: [], outputs: ["sdi-out", "hdmi-out"], color: "#E84855" },
  { id: "mon-a", name: "SmallHD Cine 13", type: "monitor", icon: "🖥", inputs: ["sdi-in", "hdmi-in"], outputs: ["sdi-loop"], color: "#3185FC" },
  { id: "mon-b", name: "Atomos Ninja V+", type: "recorder", icon: "⏺", inputs: ["hdmi-in", "sdi-in"], outputs: ["hdmi-out"], color: "#3185FC" },
  { id: "switch-a", name: "ATEM Mini Extreme", type: "switcher", icon: "🔀", inputs: ["hdmi-1", "hdmi-2", "hdmi-3", "hdmi-4"], outputs: ["pgm-out", "aux-out", "stream-out"], color: "#35CE8D" },
  { id: "audio-a", name: "Sound Devices 888", type: "audio", icon: "🎙", inputs: ["ch-1", "ch-2", "ch-3", "ch-4"], outputs: ["mix-L", "mix-R", "iso-1", "iso-2"], color: "#F9A620" },
  { id: "audio-b", name: "Wireless Lav Kit", type: "audio", icon: "📡", inputs: [], outputs: ["ch-out"], color: "#F9A620" },
  { id: "ai-node", name: "Maestra AI Engine", type: "ai", icon: "✦", inputs: ["video-in", "audio-in", "data-in"], outputs: ["processed-v", "processed-a", "metadata", "llm-out"], color: "#B56CED" },
  { id: "storage", name: "NAS / Frame.io", type: "storage", icon: "💾", inputs: ["ingest-1", "ingest-2", "ingest-3"], outputs: ["playback"], color: "#6C757D" },
  { id: "stream", name: "Live Stream Out", type: "output", icon: "📡", inputs: ["stream-in"], outputs: [], color: "#FF6B6B" },
  { id: "tc-gen", name: "Timecode Generator", type: "sync", icon: "⏱", inputs: [], outputs: ["tc-out", "genlock"], color: "#ADB5BD" },
];

const SIGNAL_TYPES = {
  sdi: { label: "SDI", color: "#3185FC" },
  hdmi: { label: "HDMI", color: "#35CE8D" },
  audio: { label: "Audio", color: "#F9A620" },
  data: { label: "Data", color: "#B56CED" },
  tc: { label: "Timecode", color: "#ADB5BD" },
  stream: { label: "Stream", color: "#FF6B6B" },
};

function getSignalType(portName) {
  if (portName.includes("sdi")) return "sdi";
  if (portName.includes("hdmi")) return "hdmi";
  if (portName.includes("ch-") || portName.includes("mix") || portName.includes("iso") || portName.includes("audio")) return "audio";
  if (portName.includes("tc") || portName.includes("genlock")) return "tc";
  if (portName.includes("stream") || portName.includes("pgm") || portName.includes("aux")) return "sdi";
  if (portName.includes("data") || portName.includes("metadata") || portName.includes("llm") || portName.includes("processed") || portName.includes("ingest") || portName.includes("playback") || portName.includes("video")) return "data";
  return "data";
}

// ─── NODE GRAPH VIEW ───
function NodeGraphView({ routes, onAddRoute, onRemoveRoute }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoveredPort, setHoveredPort] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const cols = { camera: 0, audio: 0, sync: 0, switcher: 1, ai: 1, recorder: 1, monitor: 2, storage: 2, output: 2 };
    const colCounts = {};
    const init = {};
    DEVICES.forEach((d) => {
      const col = cols[d.type] ?? 1;
      colCounts[col] = (colCounts[col] || 0) + 1;
      init[d.id] = { x: 80 + col * 380, y: 40 + (colCounts[col] - 1) * 160 };
    });
    setPositions(init);
  }, []);

  const getPortPos = useCallback((deviceId, portName, isOutput) => {
    const pos = positions[deviceId];
    if (!pos) return { x: 0, y: 0 };
    const device = DEVICES.find((d) => d.id === deviceId);
    const ports = isOutput ? device.outputs : device.inputs;
    const idx = ports.indexOf(portName);
    const nodeW = 220;
    const portStartY = 42;
    const portSpacing = 20;
    return {
      x: pos.x + (isOutput ? nodeW : 0),
      y: pos.y + portStartY + idx * portSpacing,
    };
  }, [positions]);

  const handleMouseDown = (e, deviceId) => {
    if (e.target.closest(".port-circle")) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = positions[deviceId];
    setDragOffset({ x: (e.clientX - rect.left) / zoom - pos.x, y: (e.clientY - rect.top) / zoom - pos.y });
    setDragging(deviceId);
    setSelectedDevice(deviceId);
  };

  const handleMouseMove = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / zoom;
    const my = (e.clientY - rect.top) / zoom;
    setMousePos({ x: mx, y: my });
    if (dragging) {
      setPositions((p) => ({ ...p, [dragging]: { x: mx - dragOffset.x, y: my - dragOffset.y } }));
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    if (connecting && hoveredPort) {
      onAddRoute({ from: connecting.deviceId, fromPort: connecting.portName, to: hoveredPort.deviceId, toPort: hoveredPort.portName });
    }
    setConnecting(null);
  };

  const startConnect = (e, deviceId, portName) => {
    e.stopPropagation();
    setConnecting({ deviceId, portName });
  };

  const renderCable = (x1, y1, x2, y2, signalType, key, isTemp) => {
    const sig = SIGNAL_TYPES[signalType] || SIGNAL_TYPES.data;
    const dx = Math.abs(x2 - x1) * 0.5;
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    return (
      <g key={key}>
        <path d={path} stroke={sig.color} strokeWidth={isTemp ? 2 : 3} fill="none" opacity={isTemp ? 0.5 : 0.85}
          strokeDasharray={isTemp ? "6 4" : "none"} style={{ filter: isTemp ? "none" : `drop-shadow(0 0 4px ${sig.color}55)` }} />
        {!isTemp && (
          <path d={path} stroke={sig.color} strokeWidth={1} fill="none" opacity={0.3} />
        )}
      </g>
    );
  };

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", cursor: dragging ? "grabbing" : "default" }}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", gap: 8 }}>
        {Object.entries(SIGNAL_TYPES).map(([k, v]) => (
          <span key={k} style={{ fontSize: 11, color: v.color, background: `${v.color}15`, border: `1px solid ${v.color}30`, borderRadius: 4, padding: "2px 8px", fontFamily: "'JetBrains Mono', monospace" }}>
            ● {v.label}
          </span>
        ))}
      </div>

      <svg ref={svgRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff06" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {routes.map((r, i) => {
          const from = getPortPos(r.from, r.fromPort, true);
          const to = getPortPos(r.to, r.toPort, false);
          const sig = getSignalType(r.fromPort);
          return renderCable(from.x, from.y, to.x, to.y, sig, `route-${i}`);
        })}
        
        {connecting && (
          renderCable(
            getPortPos(connecting.deviceId, connecting.portName, true).x,
            getPortPos(connecting.deviceId, connecting.portName, true).y,
            mousePos.x, mousePos.y,
            getSignalType(connecting.portName),
            "temp-cable", true
          )
        )}
      </svg>

      {DEVICES.map((device) => {
        const pos = positions[device.id];
        if (!pos) return null;
        const isSelected = selectedDevice === device.id;
        const maxPorts = Math.max(device.inputs.length, device.outputs.length);
        const nodeH = 42 + maxPorts * 20 + 12;
        
        return (
          <div key={device.id} onMouseDown={(e) => handleMouseDown(e, device.id)}
            style={{
              position: "absolute", left: pos.x, top: pos.y, width: 220,
              background: isSelected ? "#1a1a2e" : "#12121f",
              border: `1px solid ${isSelected ? device.color : "#2a2a3a"}`,
              borderRadius: 8, cursor: dragging === device.id ? "grabbing" : "grab",
              boxShadow: isSelected ? `0 0 20px ${device.color}20, 0 4px 12px #00000060` : "0 2px 8px #00000040",
              transition: "box-shadow 0.2s, border-color 0.2s",
              zIndex: dragging === device.id ? 100 : isSelected ? 50 : 10,
              userSelect: "none",
            }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${device.color}25` }}>
              <span style={{ fontSize: 16 }}>{device.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e0e0e0", fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.3 }}>{device.name}</div>
                <div style={{ fontSize: 9, color: device.color, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>{device.type}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", minHeight: nodeH - 42 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {device.inputs.map((inp) => {
                  const sig = getSignalType(inp);
                  const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portName === inp;
                  return (
                    <div key={inp} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", left: -6 }}
                      onMouseEnter={() => setHoveredPort({ deviceId: device.id, portName: inp })}
                      onMouseLeave={() => setHoveredPort(null)}>
                      <div className="port-circle" style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: isHovered ? SIGNAL_TYPES[sig].color : `${SIGNAL_TYPES[sig].color}40`,
                        border: `2px solid ${SIGNAL_TYPES[sig].color}`,
                        cursor: "crosshair",
                        transition: "all 0.15s",
                        boxShadow: isHovered ? `0 0 8px ${SIGNAL_TYPES[sig].color}` : "none",
                      }} />
                      <span style={{ fontSize: 10, color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>{inp}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                {device.outputs.map((out) => {
                  const sig = getSignalType(out);
                  const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portName === out;
                  return (
                    <div key={out} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", right: -6, cursor: "crosshair" }}
                      onMouseDown={(e) => startConnect(e, device.id, out)}
                      onMouseEnter={() => setHoveredPort({ deviceId: device.id, portName: out })}
                      onMouseLeave={() => setHoveredPort(null)}>
                      <span style={{ fontSize: 10, color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>{out}</span>
                      <div className="port-circle" style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: isHovered ? SIGNAL_TYPES[sig].color : `${SIGNAL_TYPES[sig].color}40`,
                        border: `2px solid ${SIGNAL_TYPES[sig].color}`,
                        transition: "all 0.15s",
                        boxShadow: isHovered ? `0 0 8px ${SIGNAL_TYPES[sig].color}` : "none",
                      }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MATRIX ROUTER VIEW ───
function MatrixView({ routes, onAddRoute, onRemoveRoute }) {
  const outputs = DEVICES.flatMap((d) => d.outputs.map((p) => ({ deviceId: d.id, port: p, device: d })));
  const inputs = DEVICES.flatMap((d) => d.inputs.map((p) => ({ deviceId: d.id, port: p, device: d })));

  const isRouted = (out, inp) => routes.some((r) => r.from === out.deviceId && r.fromPort === out.port && r.to === inp.deviceId && r.toPort === inp.port);

  const toggleRoute = (out, inp) => {
    if (isRouted(out, inp)) {
      onRemoveRoute({ from: out.deviceId, fromPort: out.port, to: inp.deviceId, toPort: inp.port });
    } else {
      onAddRoute({ from: out.deviceId, fromPort: out.port, to: inp.deviceId, toPort: inp.port });
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 20 }}>
      <div style={{ display: "inline-block", minWidth: "fit-content" }}>
        <div style={{ display: "flex", marginBottom: 2 }}>
          <div style={{ width: 160, minWidth: 160, height: 120, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0 12px 8px 0" }}>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", textAlign: "right" }}>
              <div>OUTPUTS →</div>
              <div>↓ INPUTS</div>
            </div>
          </div>
          {outputs.map((out, i) => (
            <div key={`h-${i}`} style={{ width: 36, minWidth: 36, height: 120, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}>
              <div style={{ transform: "rotate(-65deg)", transformOrigin: "bottom center", whiteSpace: "nowrap", fontSize: 9, color: out.device.color, fontFamily: "'JetBrains Mono', monospace" }}>
                {out.device.name.split(" ").pop()} / {out.port}
              </div>
            </div>
          ))}
        </div>

        {inputs.map((inp, row) => (
          <div key={`r-${row}`} style={{ display: "flex", marginBottom: 1 }}>
            <div style={{ width: 160, minWidth: 160, height: 36, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 12, gap: 6 }}>
              <span style={{ fontSize: 9, color: "#666", fontFamily: "'JetBrains Mono', monospace", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inp.device.name.split(" ").pop()} / {inp.port}
              </span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: inp.device.color, flexShrink: 0, opacity: 0.6 }} />
            </div>
            {outputs.map((out, col) => {
              const active = isRouted(out, inp);
              const outSig = getSignalType(out.port);
              const inSig = getSignalType(inp.port);
              const compatible = outSig === inSig || outSig === "data" || inSig === "data";
              const sigColor = SIGNAL_TYPES[outSig]?.color || "#555";
              
              return (
                <div key={`c-${row}-${col}`}
                  onClick={() => compatible && toggleRoute(out, inp)}
                  style={{
                    width: 36, minWidth: 36, height: 36,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? `${sigColor}20` : compatible ? "#14141f" : "#0a0a12",
                    border: `1px solid ${active ? sigColor : compatible ? "#1e1e30" : "#111118"}`,
                    borderRadius: 3,
                    cursor: compatible ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                    marginRight: 1,
                  }}
                  onMouseEnter={(e) => { if (compatible && !active) e.currentTarget.style.background = `${sigColor}10`; }}
                  onMouseLeave={(e) => { if (compatible && !active) e.currentTarget.style.background = "#14141f"; }}>
                  {active && (
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: sigColor, boxShadow: `0 0 8px ${sigColor}80`, transition: "all 0.2s" }} />
                  )}
                  {!active && compatible && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2a2a3a" }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RACK TOPOLOGY VIEW ───
function RackView({ routes }) {
  const typeGroups = {};
  DEVICES.forEach((d) => {
    if (!typeGroups[d.type]) typeGroups[d.type] = [];
    typeGroups[d.type].push(d);
  });

  const groupLabels = {
    camera: "📹 CAMERAS", audio: "🎙 AUDIO", sync: "⏱ SYNC",
    switcher: "🔀 SWITCHING", ai: "✦ AI PROCESSING", recorder: "⏺ RECORDERS",
    monitor: "🖥 MONITORS", storage: "💾 STORAGE", output: "📡 OUTPUT"
  };

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
        {Object.entries(typeGroups).map(([type, devices]) => (
          <div key={type} style={{
            background: "#0d0d18", border: "1px solid #1e1e30", borderRadius: 12,
            padding: 16, minWidth: 200, flex: "0 1 280px",
          }}>
            <div style={{ fontSize: 11, color: devices[0].color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5, marginBottom: 12, fontWeight: 600 }}>
              {groupLabels[type] || type.toUpperCase()}
            </div>
            
            {devices.map((device) => {
              const outRoutes = routes.filter((r) => r.from === device.id);
              const inRoutes = routes.filter((r) => r.to === device.id);
              
              return (
                <div key={device.id} style={{
                  background: "#12121f", border: `1px solid ${device.color}20`,
                  borderRadius: 8, padding: 12, marginBottom: 8,
                  borderLeft: `3px solid ${device.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, marginRight: 8 }}>{device.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#e0e0e0", fontFamily: "'JetBrains Mono', monospace" }}>{device.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {outRoutes.length > 0 && <span style={{ fontSize: 9, color: "#35CE8D", background: "#35CE8D15", borderRadius: 4, padding: "1px 6px", fontFamily: "'JetBrains Mono', monospace" }}>{outRoutes.length} out</span>}
                      {inRoutes.length > 0 && <span style={{ fontSize: 9, color: "#3185FC", background: "#3185FC15", borderRadius: 4, padding: "1px 6px", fontFamily: "'JetBrains Mono', monospace" }}>{inRoutes.length} in</span>}
                    </div>
                  </div>
                  
                  {device.outputs.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      {device.outputs.map((port) => {
                        const routed = routes.filter((r) => r.from === device.id && r.fromPort === port);
                        const sig = getSignalType(port);
                        const sc = SIGNAL_TYPES[sig]?.color || "#555";
                        return (
                          <div key={port} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc }} />
                            <span style={{ color: "#777", minWidth: 60 }}>{port}</span>
                            {routed.map((r, i) => {
                              const target = DEVICES.find((d) => d.id === r.to);
                              return (
                                <span key={i} style={{ color: target?.color || "#666", fontSize: 9, background: `${target?.color || "#666"}15`, borderRadius: 3, padding: "0 4px" }}>
                                  → {target?.name.split(" ").pop()}/{r.toPort}
                                </span>
                              );
                            })}
                            {routed.length === 0 && <span style={{ color: "#333", fontSize: 9 }}>unpatched</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {device.inputs.length > 0 && (
                    <div>
                      {device.inputs.map((port) => {
                        const routed = routes.filter((r) => r.to === device.id && r.toPort === port);
                        const sig = getSignalType(port);
                        const sc = SIGNAL_TYPES[sig]?.color || "#555";
                        return (
                          <div key={port} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: sc }} />
                            <span style={{ color: "#777", minWidth: 60 }}>{port}</span>
                            {routed.map((r, i) => {
                              const source = DEVICES.find((d) => d.id === r.from);
                              return (
                                <span key={i} style={{ color: source?.color || "#666", fontSize: 9, background: `${source?.color || "#666"}15`, borderRadius: 3, padding: "0 4px" }}>
                                  ← {source?.name.split(" ").pop()}/{r.fromPort}
                                </span>
                              );
                            })}
                            {routed.length === 0 && <span style={{ color: "#333", fontSize: 9 }}>unpatched</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export default function MaestraRouter() {
  const [view, setView] = useState("nodes");
  const [routes, setRoutes] = useState([
    { from: "cam-a", fromPort: "sdi-out", to: "switch-a", toPort: "hdmi-1" },
    { from: "cam-b", fromPort: "sdi-out", to: "switch-a", toPort: "hdmi-2" },
    { from: "cam-c", fromPort: "hdmi-out", to: "switch-a", toPort: "hdmi-3" },
    { from: "switch-a", fromPort: "pgm-out", to: "mon-a", toPort: "sdi-in" },
    { from: "switch-a", fromPort: "aux-out", to: "ai-node", toPort: "video-in" },
    { from: "switch-a", fromPort: "stream-out", to: "stream", toPort: "stream-in" },
    { from: "audio-b", fromPort: "ch-out", to: "audio-a", toPort: "ch-1" },
    { from: "audio-a", fromPort: "mix-L", to: "ai-node", toPort: "audio-in" },
    { from: "ai-node", fromPort: "processed-v", to: "mon-b", toPort: "hdmi-in" },
    { from: "ai-node", fromPort: "metadata", to: "storage", toPort: "ingest-1" },
    { from: "cam-a", fromPort: "hdmi-out", to: "mon-b", toPort: "sdi-in" },
    { from: "tc-gen", fromPort: "tc-out", to: "audio-a", toPort: "ch-4" },
  ]);

  const addRoute = useCallback((route) => {
    setRoutes((r) => [...r, route]);
  }, []);

  const removeRoute = useCallback((route) => {
    setRoutes((r) => r.filter((x) => !(x.from === route.from && x.fromPort === route.fromPort && x.to === route.to && x.toPort === route.toPort)));
  }, []);

  const views = [
    { id: "nodes", label: "Node Graph", icon: "◇" },
    { id: "matrix", label: "Matrix Router", icon: "▦" },
    { id: "rack", label: "Rack View", icon: "▤" },
  ];

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#09090f",
      display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono', monospace",
      color: "#e0e0e0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #09090f; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid #1a1a28",
        background: "#0c0c16",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20, color: "#B56CED" }}>✦</span>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, color: "#f0f0f0" }}>MAESTRA</span>
            <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>/ Device Router</span>
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 2, background: "#12121f", borderRadius: 8, padding: 3 }}>
          {views.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{
                background: view === v.id ? "#1e1e32" : "transparent",
                border: view === v.id ? "1px solid #2a2a45" : "1px solid transparent",
                color: view === v.id ? "#e0e0e0" : "#555",
                borderRadius: 6, padding: "6px 14px",
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s",
              }}>
              <span style={{ fontSize: 14 }}>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#555" }}>
            {routes.length} routes · {DEVICES.length} devices
          </span>
          <button onClick={() => setRoutes([])} style={{
            background: "#1a1018", border: "1px solid #3a1525", color: "#E84855",
            borderRadius: 6, padding: "5px 12px", fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
          }}>
            Clear All
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {view === "nodes" && <NodeGraphView routes={routes} onAddRoute={addRoute} onRemoveRoute={removeRoute} />}
        {view === "matrix" && <MatrixView routes={routes} onAddRoute={addRoute} onRemoveRoute={removeRoute} />}
        {view === "rack" && <RackView routes={routes} />}
      </div>

      {/* Status Bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 20px", borderTop: "1px solid #1a1a28",
        background: "#0c0c16", fontSize: 10, color: "#444",
      }}>
        <span>
          {view === "nodes" ? "Drag outputs → inputs to create routes · Drag nodes to reposition" :
           view === "matrix" ? "Click crosspoints to toggle routes · Lit = active" :
           "Read-only topology overview · Route in Node or Matrix view"}
        </span>
        <span>Maestra v0.1 · Device Ecosystem Router</span>
      </div>
    </div>
  );
}
