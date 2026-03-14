#!/usr/bin/env node
'use strict'

/**
 * sync-ofl.js — Sync the Open Fixture Library (OFL) submodule into PostgreSQL.
 *
 * Reads vendor/ofl/manufacturers.json and vendor/ofl/fixtures/<mfr>/<fixture>.json,
 * upserts into ofl_manufacturers + ofl_fixtures, then writes an ofl_sync_log row.
 *
 * Environment variables:
 *   DATABASE_URL              — PostgreSQL connection string (required)
 *   OFL_PATH                  — path to OFL checkout (default: vendor/ofl)
 *   OFL_EXPECTED_MAJOR_VERSION — expected OFL schema major version (default: 12)
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const OFL_PATH = process.env.OFL_PATH || path.join(__dirname, '..', 'vendor', 'ofl')
const EXPECTED_MAJOR = parseInt(process.env.OFL_EXPECTED_MAJOR_VERSION || '12', 10)
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getOflCommitSha() {
  try {
    return execSync(`git -C "${OFL_PATH}" rev-parse HEAD`, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function getSchemaVersion() {
  const schemaPath = path.join(OFL_PATH, 'schemas', 'fixture.json')
  if (!fs.existsSync(schemaPath)) return null
  try {
    const schema = readJson(schemaPath)
    // $schema or version field — OFL uses a version string like "12.2.0" in the $schema URL
    // or as a top-level "version" key. Try both.
    const raw =
      schema.version ||
      (schema.$schema && schema.$schema.match(/\/(\d+\.\d+(?:\.\d+)?)(?:\/|\.json)/)?.[1]) ||
      null
    return raw
  } catch {
    return null
  }
}

function parseMajorVersion(versionStr) {
  if (!versionStr) return null
  const match = String(versionStr).match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Extract the minimum and maximum channel counts across all fixture modes.
 */
function extractChannelCounts(modes) {
  if (!Array.isArray(modes) || modes.length === 0) return { min: null, max: null }
  const counts = modes.map((m) => {
    const channels = m.channels
    if (!Array.isArray(channels)) return 0
    return channels.length
  })
  return { min: Math.min(...counts), max: Math.max(...counts) }
}

/**
 * Normalize a single OFL mode into our DB shape:
 * { shortName, name, channels: [{name, type, defaultValue?, capabilities?}], channel_count }
 */
function normalizeMode(mode) {
  const channels = (mode.channels || []).map((ch) => {
    if (typeof ch === 'string') {
      // OFL channel reference — the name IS the channel key; type defaults to 'range'
      return { name: ch, type: 'range' }
    }
    // Inline channel object
    return {
      name: ch.name || ch,
      type: ch.type || 'range',
      ...(ch.defaultValue !== undefined ? { defaultValue: ch.defaultValue } : {}),
      ...(ch.capabilities ? { capabilities: ch.capabilities } : {}),
    }
  })
  return {
    shortName: mode.shortName || mode.name || '',
    name: mode.name || mode.shortName || '',
    channels,
    channel_count: channels.length,
  }
}

/**
 * Parse a single OFL fixture JSON into DB-ready fields.
 */
function parseFixture(fixtureJson, manufacturerKey, fixtureKey) {
  const modes = (fixtureJson.modes || []).map(normalizeMode)

  // If the fixture defines channels at top level but no modes, synthesize a single mode
  if (modes.length === 0 && fixtureJson.channels) {
    const chEntries = Object.entries(fixtureJson.channels || {})
    const syntheticChannels = chEntries.map(([name, def]) => ({
      name,
      type: (typeof def === 'object' && def !== null ? def.type : null) || 'range',
    }))
    if (syntheticChannels.length > 0) {
      modes.push({
        shortName: 'Default',
        name: 'Default Mode',
        channels: syntheticChannels,
        channel_count: syntheticChannels.length,
      })
    }
  }

  const { min, max } = extractChannelCounts(modes)

  return {
    manufacturer_key: manufacturerKey,
    fixture_key: fixtureKey,
    name: fixtureJson.name || fixtureKey,
    categories: Array.isArray(fixtureJson.categories) ? fixtureJson.categories : [],
    channel_count_min: min,
    channel_count_max: max,
    physical: fixtureJson.physical || {},
    modes,
    ofl_last_modified: (fixtureJson.meta && (fixtureJson.meta.lastModifyDate || fixtureJson.meta.lastModified)) || null,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Check OFL path exists
  if (!fs.existsSync(OFL_PATH)) {
    console.error(`ERROR: OFL path not found: ${OFL_PATH}`)
    console.error('Run: git submodule update --init vendor/ofl')
    process.exit(1)
  }

  // 2. Validate schema version
  const schemaVersion = getSchemaVersion()
  const schemaMajor = parseMajorVersion(schemaVersion)
  console.log(`OFL schema version: ${schemaVersion || 'unknown'} (expected major: ${EXPECTED_MAJOR})`)

  if (schemaMajor !== null && schemaMajor !== EXPECTED_MAJOR) {
    console.error(
      `ERROR: OFL schema major version mismatch. Got ${schemaMajor}, expected ${EXPECTED_MAJOR}.`
    )
    console.error('Update OFL_EXPECTED_MAJOR_VERSION env var or pin the submodule to a compatible commit.')
    process.exit(1)
  }

  // 3. Get commit SHA
  const oflCommitSha = getOflCommitSha()
  console.log(`OFL commit: ${oflCommitSha || 'unknown'}`)

  // 4. Load manufacturers
  const manufacturersPath = path.join(OFL_PATH, 'fixtures', 'manufacturers.json')
  if (!fs.existsSync(manufacturersPath)) {
    console.error(`ERROR: manufacturers.json not found at ${manufacturersPath}`)
    process.exit(1)
  }

  const manufacturersRaw = readJson(manufacturersPath)
  // OFL manufacturers.json is an object keyed by manufacturer slug; the $schema key should be ignored
  const manufacturers = Object.entries(manufacturersRaw)
    .filter(([key]) => key !== '$schema')
    .map(([key, info]) => ({
      key,
      name: info.name || key,
      website: info.website || null,
    }))

  console.log(`Loaded ${manufacturers.length} manufacturers`)

  // 5. Collect fixture files
  const fixturesDir = path.join(OFL_PATH, 'fixtures')
  if (!fs.existsSync(fixturesDir)) {
    console.error(`ERROR: fixtures directory not found at ${fixturesDir}`)
    process.exit(1)
  }

  const fixtureFiles = []
  for (const mfrKey of fs.readdirSync(fixturesDir)) {
    const mfrDir = path.join(fixturesDir, mfrKey)
    if (!fs.statSync(mfrDir).isDirectory()) continue
    for (const file of fs.readdirSync(mfrDir)) {
      if (!file.endsWith('.json')) continue
      const fixtureKey = file.replace(/\.json$/, '')
      fixtureFiles.push({ manufacturerKey: mfrKey, fixtureKey, filePath: path.join(mfrDir, file) })
    }
  }

  console.log(`Found ${fixtureFiles.length} fixture files`)

  // 6. Connect to database
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  console.log('Connected to database')

  const stats = { added: 0, updated: 0, skipped: 0, errored: 0 }
  const errors = []

  try {
    // 7. Upsert manufacturers
    console.log('Upserting manufacturers…')
    for (const mfr of manufacturers) {
      await client.query(
        `INSERT INTO ofl_manufacturers (key, name, website, synced_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET
           name = EXCLUDED.name,
           website = EXCLUDED.website,
           synced_at = NOW()`,
        [mfr.key, mfr.name, mfr.website]
      )
    }
    console.log(`Upserted ${manufacturers.length} manufacturers`)

    // 8. Upsert fixtures (per-fixture error isolation)
    console.log('Processing fixtures…')
    let processed = 0
    for (const { manufacturerKey, fixtureKey, filePath } of fixtureFiles) {
      try {
        const raw = readJson(filePath)
        const parsed = parseFixture(raw, manufacturerKey, fixtureKey)

        const result = await client.query(
          `INSERT INTO ofl_fixtures (
             manufacturer_key, fixture_key, name, source, categories,
             channel_count_min, channel_count_max, physical, modes,
             ofl_last_modified, ofl_schema_version, synced_at, updated_at
           ) VALUES (
             $1, $2, $3, 'ofl', $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
           )
           ON CONFLICT (manufacturer_key, fixture_key) DO UPDATE SET
             name                = EXCLUDED.name,
             categories          = EXCLUDED.categories,
             channel_count_min   = EXCLUDED.channel_count_min,
             channel_count_max   = EXCLUDED.channel_count_max,
             physical            = EXCLUDED.physical,
             modes               = EXCLUDED.modes,
             ofl_last_modified   = EXCLUDED.ofl_last_modified,
             ofl_schema_version  = EXCLUDED.ofl_schema_version,
             synced_at           = NOW(),
             updated_at          = NOW()
           WHERE
             ofl_fixtures.source = 'ofl'
             AND (
               ofl_fixtures.ofl_last_modified IS NULL
               OR EXCLUDED.ofl_last_modified IS NULL
               OR ofl_fixtures.ofl_last_modified < EXCLUDED.ofl_last_modified
             )
           RETURNING (xmax = 0) AS inserted`,
          [
            parsed.manufacturer_key,
            parsed.fixture_key,
            parsed.name,
            parsed.categories,
            parsed.channel_count_min,
            parsed.channel_count_max,
            JSON.stringify(parsed.physical),
            JSON.stringify(parsed.modes),
            parsed.ofl_last_modified,
            schemaVersion,
          ]
        )

        if (result.rowCount === 0) {
          // Conflict matched but WHERE clause prevented update (up to date)
          stats.skipped++
        } else if (result.rows[0]?.inserted) {
          stats.added++
        } else {
          stats.updated++
        }
      } catch (err) {
        stats.errored++
        const errMsg = `${manufacturerKey}/${fixtureKey}: ${err.message}`
        errors.push(errMsg)
        console.error(`  ERROR: ${errMsg}`)
      }

      processed++
      if (processed % 500 === 0) {
        console.log(`  Processed ${processed}/${fixtureFiles.length}…`)
      }
    }

    // 9. Write sync log
    const status = stats.errored === 0 ? 'success' : stats.errored < fixtureFiles.length ? 'partial' : 'failed'
    await client.query(
      `INSERT INTO ofl_sync_log (
         ofl_commit_sha, ofl_schema_version,
         fixtures_added, fixtures_updated, fixtures_skipped, fixtures_errored,
         errors, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        oflCommitSha,
        schemaVersion,
        stats.added,
        stats.updated,
        stats.skipped,
        stats.errored,
        JSON.stringify(errors),
        status,
      ]
    )

    console.log('')
    console.log('=== Sync complete ===')
    console.log(`  Added:   ${stats.added}`)
    console.log(`  Updated: ${stats.updated}`)
    console.log(`  Skipped: ${stats.skipped}`)
    console.log(`  Errored: ${stats.errored}`)
    console.log(`  Status:  ${status}`)

    if (status === 'failed') process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
