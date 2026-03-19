import { useEffect, useRef, useState } from "react";
import { LogLine } from "../lib/invoke";

interface Props {
  logs: LogLine[];
  onFilterChange: (services: string[]) => void;
  availableServices: string[];
}

const SERVICE_COLORS: Record<string, string> = {
  "fleet-manager": "text-maestra-400",
  dashboard: "text-accent-violet",
  nats: "text-accent-emerald",
  mosquitto: "text-accent-amber",
  redis: "text-accent-rose",
  postgres: "text-accent-cyan",
  nodered: "text-orange-400",
  grafana: "text-pink-400",
  "osc-gateway": "text-emerald-300",
  "websocket-gateway": "text-indigo-300",
  "mqtt-nats-bridge": "text-amber-300",
  system: "text-gray-500",
};

function getServiceColor(service: string): string {
  if (SERVICE_COLORS[service]) return SERVICE_COLORS[service];
  for (const [key, color] of Object.entries(SERVICE_COLORS)) {
    if (service.includes(key)) return color;
  }
  return "text-gray-500";
}

export function LogViewer({ logs, onFilterChange, availableServices }: Props) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [pinToBottom, setPinToBottom] = useState(true);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const savedScrollTop = useRef<number>(0);

  // Before React commits new log elements, remember scroll position
  useEffect(() => {
    if (!pinToBottom && scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
  });

  // After render, either auto-scroll or restore position
  useEffect(() => {
    if (!scrollRef.current) return;
    if (pinToBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [logs, pinToBottom]);

  const handleFilterClick = (service: string) => {
    setActiveFilter(service);
    if (service === "all") {
      onFilterChange([]);
    } else {
      onFilterChange([service]);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (activeFilter !== "all") {
      // Match compose service name against parsed log service name in either direction
      // e.g. filter "discovery-service" should match log service "discovery" and vice versa
      const f = activeFilter.toLowerCase();
      const s = log.service.toLowerCase();
      if (s !== f && !s.includes(f) && !f.includes(s)) {
        return false;
      }
    }
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const tabs = ["all", ...availableServices];

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Tabs + search */}
      <div className="flex items-center gap-2 border-b border-surface-3 pb-2.5 mb-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => handleFilterClick(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
              activeFilter === tab
                ? "bg-maestra-600/20 text-maestra-300 ring-1 ring-maestra-500/30"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-3"
            }`}
          >
            {tab === "all" ? "All" : tab}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface-2 text-gray-300 text-xs pl-7 pr-2 py-1.5 rounded-md border border-surface-4 w-36 focus:outline-none focus:border-maestra-500/50 focus:ring-1 focus:ring-maestra-500/20 placeholder-gray-600 transition-all"
          />
        </div>
        <button
          onClick={() => setPinToBottom(!pinToBottom)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            pinToBottom
              ? "bg-maestra-600/20 text-maestra-300 ring-1 ring-maestra-500/30"
              : "text-gray-500 hover:text-gray-300 hover:bg-surface-3"
          }`}
          title={pinToBottom ? "Auto-scroll ON" : "Auto-scroll OFF"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>

      {/* Log output — terminal style */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs glass rounded-lg p-3 space-y-px"
        style={{ overflowAnchor: "none" }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-600 text-center py-12 font-sans text-sm">
            {logs.length === 0
              ? "No logs yet. Start Maestra to see output."
              : "No matching logs."}
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="flex gap-2 leading-relaxed hover:bg-white/[0.02] rounded px-1 -mx-1 transition-colors">
              <span
                className={`${getServiceColor(log.service)} w-28 flex-shrink-0 truncate text-right opacity-70`}
              >
                {log.service}
              </span>
              <span className="text-gray-400 select-text break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
