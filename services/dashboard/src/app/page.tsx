'use client'

import { useEffect, useState } from 'react'

interface ServiceStatus {
  name: string
  url: string
  status: 'checking' | 'healthy' | 'unhealthy'
}

export default function Home() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Fleet Manager API', url: 'http://localhost:8080/health', status: 'checking' },
    { name: 'NATS', url: 'http://localhost:8222', status: 'checking' },
    { name: 'Node-RED', url: 'http://localhost:1880', status: 'checking' },
    { name: 'Grafana', url: 'http://localhost:3000', status: 'checking' },
  ])

  useEffect(() => {
    // Check service health (placeholder - implement actual checks)
    const timer = setTimeout(() => {
      setServices(services.map(s => ({ ...s, status: 'healthy' })))
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Maestra Dashboard
          </h1>
          <p className="text-slate-400 text-lg">
            Immersive Experience Infrastructure Control Panel
          </p>
        </header>

        {/* Service Status Grid */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Infrastructure Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {services.map((service) => (
              <div
                key={service.name}
                className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{service.name}</h3>
                  <div
                    className={`w-3 h-3 rounded-full ${
                      service.status === 'healthy'
                        ? 'bg-green-500'
                        : service.status === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-yellow-500 animate-pulse'
                    }`}
                  />
                </div>
                <p className="text-sm text-slate-400">
                  {service.status === 'checking' ? 'Checking...' : service.status}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Quick Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLink
              title="Node-RED"
              description="Visual programming and automation"
              url="http://localhost:1880"
              icon="🔧"
            />
            <QuickLink
              title="Grafana"
              description="Monitoring and analytics"
              url="http://localhost:3000"
              icon="📊"
            />
            <QuickLink
              title="Fleet Manager API"
              description="Device management API docs"
              url="http://localhost:8080/docs"
              icon="🚀"
            />
            <QuickLink
              title="Portainer"
              description="Container management"
              url="https://localhost:9443"
              icon="🐳"
            />
            <QuickLink
              title="Traefik"
              description="Reverse proxy dashboard"
              url="http://localhost:8081"
              icon="🔀"
            />
            <QuickLink
              title="Documentation"
              description="SDK and API documentation"
              url="http://localhost:8000"
              icon="📚"
            />
          </div>
        </section>

        {/* Integration Examples */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">SDK Integration</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <IntegrationCard
              title="Creative Tools"
              items={['TouchDesigner', 'Max/MSP', 'Unreal Engine']}
              protocol="OSC / WebSocket"
            />
            <IntegrationCard
              title="IoT Devices"
              items={['Arduino', 'ESP32', 'Raspberry Pi']}
              protocol="MQTT"
            />
            <IntegrationCard
              title="Web & Mobile"
              items={['Browser SDK', 'iOS', 'Android']}
              protocol="WebSocket / MQTT"
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function QuickLink({ title, description, url, icon }: {
  title: string
  description: string
  url: string
  icon: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-blue-500 transition-colors group"
    >
      <div className="flex items-start gap-4">
        <span className="text-3xl">{icon}</span>
        <div>
          <h3 className="font-semibold mb-1 group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </a>
  )
}

function IntegrationCard({ title, items, protocol }: {
  title: string
  items: string[]
  protocol: string
}) {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ul className="space-y-2 mb-4">
        {items.map((item) => (
          <li key={item} className="text-sm text-slate-300 flex items-center gap-2">
            <span className="text-blue-400">•</span>
            {item}
          </li>
        ))}
      </ul>
      <div className="pt-3 border-t border-slate-700">
        <span className="text-xs text-slate-500 font-mono">{protocol}</span>
      </div>
    </div>
  )
}
