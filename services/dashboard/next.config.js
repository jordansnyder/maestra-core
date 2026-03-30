const fs = require('fs')
const path = require('path')

// Read version from root VERSION file (canonical source of truth)
const versionFile = path.resolve(__dirname, '../../VERSION')
const version = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, 'utf-8').trim()
  : '0.0.0'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_MAESTRA_VERSION: version,
  },
}

module.exports = nextConfig
