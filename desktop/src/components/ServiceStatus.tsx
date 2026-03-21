import { ServiceInfo } from "../lib/invoke";

interface Props {
  services: ServiceInfo[];
}

function stateColor(state: string): string {
  switch (state) {
    case "running":
      return "bg-accent-emerald shadow-[0_0_6px_rgba(16,185,129,0.4)]";
    case "restarting":
      return "bg-accent-amber shadow-[0_0_6px_rgba(245,158,11,0.4)]";
    case "exited":
    case "dead":
      return "bg-accent-rose shadow-[0_0_6px_rgba(244,63,94,0.4)]";
    case "created":
    case "paused":
      return "bg-gray-500";
    default:
      return "bg-gray-600";
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case "running":
      return "Running";
    case "restarting":
      return "Restarting";
    case "exited":
      return "Exited";
    case "dead":
      return "Dead";
    case "created":
      return "Created";
    case "paused":
      return "Paused";
    default:
      return state;
  }
}

export function ServiceStatus({ services }: Props) {
  if (services.length === 0) return null;

  return (
    <div className="w-full animate-fade-in">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
        Services
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {services.map((svc) => (
          <div
            key={svc.service}
            className="group flex items-center gap-2.5 glass rounded-lg px-3 py-2.5 hover:bg-surface-3/50 transition-all"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${stateColor(svc.state)}`}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-gray-300 truncate block leading-tight">
                {svc.service}
              </span>
              <span className="text-[10px] text-gray-600 leading-tight">
                {stateLabel(svc.state)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
