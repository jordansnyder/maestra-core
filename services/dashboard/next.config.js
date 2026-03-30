const fs = require('fs')
const path = require('path')

// Version priority: env var > local VERSION (Docker mount) > root VERSION (local dev)
function resolveVersion() {
  if (process.env.NEXT_PUBLIC_MAESTRA_VERSION) return process.env.NEXT_PUBLIC_MAESTRA_VERSION
  const candidates = [
    path.resolve(__dirname, 'VERSION'),       // Docker: mounted at /app/VERSION
    path.resolve(__dirname, '../../VERSION'),  // Local dev: repo root
  ]
  for (const f of candidates) {
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim()
  }
  return '0.0.0'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_MAESTRA_VERSION: resolveVersion(),
  },
}

module.exports = nextConfig
