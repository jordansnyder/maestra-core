interface Props {
  profile: string;
  onChange: (profile: string) => void;
  disabled: boolean;
}

const PROFILES = [
  {
    id: "starter",
    label: "Starter",
    description: "Core services — lightweight for prototyping",
    accent: "from-maestra-500/20 to-accent-violet/10",
    services: [
      "NATS",
      "MQTT",
      "Redis",
      "PostgreSQL",
      "Fleet Manager",
      "Dashboard",
      "Gateways",
    ],
  },
  {
    id: "full",
    label: "Full",
    description: "All services including monitoring & visual programming",
    accent: "from-accent-violet/20 to-accent-cyan/10",
    services: [
      "Everything in Starter",
      "Node-RED",
      "Grafana",
      "Traefik",
      "Portainer",
      "Docs",
    ],
  },
];

export function ProfileSelector({ profile, onChange, disabled }: Props) {
  return (
    <div className="w-full animate-fade-in">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
        Profile
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {PROFILES.map((p) => {
          const isActive = profile === p.id;
          return (
            <button
              key={p.id}
              onClick={() => !disabled && onChange(p.id)}
              disabled={disabled}
              className={`relative text-left rounded-xl border p-4 transition-all overflow-hidden ${
                isActive
                  ? "border-maestra-500/40 shadow-glow"
                  : "border-surface-3 hover:border-surface-4"
              } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {/* Background gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br transition-opacity ${p.accent} ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
              />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-3 h-3 rounded-full border-2 transition-all flex items-center justify-center ${
                      isActive
                        ? "border-maestra-400"
                        : "border-gray-600"
                    }`}
                  >
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-maestra-400" />
                    )}
                  </div>
                  <span className="font-semibold text-sm text-gray-100">
                    {p.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3 ml-5">
                  {p.description}
                </p>
                <div className="flex flex-wrap gap-1 ml-5">
                  {p.services.map((svc) => (
                    <span
                      key={svc}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-all ${
                        isActive
                          ? "bg-maestra-500/15 text-maestra-300"
                          : "bg-surface-3/50 text-gray-500"
                      }`}
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
