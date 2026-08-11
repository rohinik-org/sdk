#!/usr/bin/env node
import { install, start, stop, status, version, formatVersionInfo, listInstalledVersions,
         configPath, configValidate, configShow, listProviders, configureProvider,
         runDoctor, formatDoctorReport } from './index.js'
import { downloadAndInstall } from './commands/install.js'
import { resolveHome } from '@rohinik-org/install-manifest'
import { devValidate, devPack } from './commands/dev.js'
import { devCreate } from './commands/create.js'

const args = process.argv.slice(2)
const cmd  = args[0]

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

function hasFlag(name: string): boolean {
  return args.includes(name)
}

const homeOverride = flag('--home')

async function main(): Promise<void> {
  switch (cmd) {
    case 'install': {
      const versionArg  = flag('--version')
      const artifactArg = flag('--artifact')
      const bundleArg   = flag('--bundle')
      const manifestArg = flag('--manifest')
      const baseUrlArg  = flag('--base-url')

      if (versionArg) {
        // Download mode: fetch from GitHub Releases
        const result = await downloadAndInstall({ home: homeOverride, version: versionArg, baseUrl: baseUrlArg })
        if (!result.ok) { console.error(`Install failed: ${result.reason}`); process.exit(1) }
        console.log(`Installed runtime ${result.runtimeVersion} → ${result.installDir}`)
      } else {
        // Local mode: explicit artifact + bundle + manifest paths
        if (!artifactArg || !bundleArg || !manifestArg) {
          console.error('Usage: rohinik install --version <ver>  [--base-url <url>]')
          console.error('       rohinik install --artifact <file> --bundle <dir> --manifest <path>')
          process.exit(1)
        }
        const result = await install({ home: homeOverride, artifactPath: artifactArg, bundlePath: bundleArg, manifestPath: manifestArg })
        if (!result.ok) { console.error(`Install failed: ${result.reason}`); process.exit(1) }
        console.log(`Installed runtime ${result.runtimeVersion} → ${result.installDir}`)
      }
      break
    }

    case 'start': {
      const configArg = flag('--config')
      const result = await start({ home: homeOverride, configPath: configArg })
      if (!result.ok) { console.error(`Start failed: ${result.reason}`); process.exit(1) }
      console.log(`Runtime started  version=${result.runtimeVersion}  pid=${result.pid}  endpoint=${result.endpoint}`)
      break
    }

    case 'stop': {
      const result = await stop({ home: homeOverride })
      if (!result.ok) { console.error(`Stop failed: ${result.reason}`); process.exit(1) }
      console.log(`Runtime stopped  pid=${result.stoppedPid}`)
      break
    }

    case 'status': {
      const result = await status({ home: homeOverride })
      const extra: string[] = []
      if (result.pid)              extra.push(`pid=${result.pid}`)
      if (result.runtimeVersion)   extra.push(`version=${result.runtimeVersion}`)
      if (result.endpoint)         extra.push(`endpoint=${result.endpoint}`)
      if (result.healthLatencyMs !== undefined) extra.push(`latency=${result.healthLatencyMs}ms`)
      console.log(`${result.status}${extra.length ? '  ' + extra.join('  ') : ''}`)
      break
    }

    case 'version': {
      console.log(formatVersionInfo(version({ home: homeOverride })))
      break
    }

    case 'runtime': {
      if (args[1] === 'list') {
        const home = resolveHome(homeOverride)
        const versions = listInstalledVersions(home.runtimes)
        if (versions.length === 0) { console.log('No runtimes installed.'); break }
        for (const v of versions) console.log(v)
        break
      }
      console.error('Unknown subcommand: rohinik runtime ' + (args[1] ?? ''))
      process.exit(1)
    }

    case 'config': {
      const sub       = args[1]
      const configArg = flag('--config')
      const home      = resolveHome(homeOverride)

      if (sub === 'path') {
        console.log(configPath(home, configArg))
        break
      }
      if (sub === 'validate') {
        const r = configValidate(home, configArg)
        if (r.ok) { console.log(`Config valid: ${r.path} (${r.source})`); break }
        console.error(`Config invalid: ${r.errors.join('; ')}`)
        process.exit(1)
      }
      if (sub === 'show') {
        const r = configShow(home, configArg)
        if (!r) { console.error('No config file found.'); process.exit(1) }
        console.log(`# ${r.path} (${r.source})\n${r.content}`)
        break
      }
      console.error('Usage: rohinik config <path|validate|show> [--config <file>]')
      process.exit(1)
    }

    case 'provider': {
      const sub       = args[1]
      const configArg = flag('--config')
      const home      = resolveHome(homeOverride)

      if (sub === 'list') {
        const providers = listProviders(home, configArg)
        if (providers.length === 0) { console.log('No providers configured.'); break }
        for (const p of providers) {
          const secrets = p.secretsResolvable ? 'secrets OK' : 'MISSING SECRETS'
          const parts   = [p.hasApiKey && 'apiKey', p.hasBaseUrl && 'baseUrl'].filter(Boolean)
          console.log(`  ${p.name}  [${parts.join(', ')}]  ${secrets}`)
        }
        break
      }
      if (sub === 'configure') {
        const providerName = args[2]
        const apiKeyEnv    = flag('--api-key-env')
        const baseUrl      = flag('--base-url')
        if (!providerName || !apiKeyEnv) {
          console.error('Usage: rohinik provider configure <name> --api-key-env <VAR> [--base-url <url>]')
          process.exit(1)
        }
        const r = configureProvider(home, { name: providerName, apiKeyEnv, baseUrl }, configArg)
        if (!r.ok) { console.error(`Configure failed: ${r.reason}`); process.exit(1) }
        console.log(`Provider ${providerName} configured with apiKey: \${${apiKeyEnv}}`)
        break
      }
      console.error('Usage: rohinik provider <list|configure> [options]')
      process.exit(1)
    }

    case 'doctor': {
      const configArg = flag('--config')
      const home      = resolveHome(homeOverride)
      const report    = await runDoctor(home, configArg)
      console.log(formatDoctorReport(report))
      if (report.hasFail) process.exit(1)
      break
    }

    case 'dev': {
      const sub      = args[1]
      const cwd      = process.cwd()
      const entry    = flag('--entry')
      const output   = flag('--output')
      const packedBy = flag('--packed-by')

      if (sub === 'create') {
        const kind      = args[2]
        const targetDir = args[3]
        if (!kind) {
          console.error('Usage: rohinik dev create <app|capability|agent|provider> [dir]')
          process.exit(1)
        }
        const r = devCreate(kind, targetDir, process.cwd())
        if (r.ok) {
          console.log(`✓ ${r.message}`)
          if (r.files) {
            for (const f of r.files) console.log(`  ${f}`)
          }
          console.log('\nNext steps:')
          console.log(`  cd ${targetDir ?? `my-${kind === 'app' ? 'app' : kind}`}`)
          console.log('  npm install')
          console.log('  npm test')
        } else {
          console.error(`✗ ${r.message}`)
          process.exit(1)
        }
        break
      }

      if (sub === 'validate') {
        const r = await devValidate(cwd, { entry })
        if (r.ok) {
          console.log(`✓ ${r.message}`)
        } else {
          console.error(`✗ ${r.message}`)
          if (r.details) for (const d of r.details) console.error(`  ${d}`)
          process.exit(1)
        }
        break
      }

      if (sub === 'pack') {
        const r = await devPack(cwd, { entry, output, packedBy })
        if (r.ok) {
          console.log(`✓ ${r.message}`)
          if (r.details) for (const d of r.details) console.log(d)
        } else {
          console.error(`✗ ${r.message}`)
          if (r.details) for (const d of r.details) console.error(d)
          process.exit(1)
        }
        break
      }

      console.error('Usage: rohinik dev <create|validate|pack> [options]')
      process.exit(1)
    }

    default:
      console.error([
        'Usage: rohinik <command>',
        '',
        'Commands:',
        '  install   --artifact <file> --bundle <dir> --manifest <path>   Install a runtime bundle',
        '  start     [--config <path>]                     Start the runtime',
        '  stop                                            Stop the runtime (graceful)',
        '  status                                          Show runtime status',
        '  version                                         Show CLI and runtime versions',
        '  runtime list                                    List installed runtime versions',
        '  config    <path|validate|show> [--config <file>]',
        '  provider  <list|configure <name> --api-key-env <VAR> [--base-url <url>]>',
        '  doctor    [--config <file>]                     Diagnose installation',
        '  dev       <validate|pack> [--entry <file>] [--output <file>]   Package authoring',
        '  dev       create <app|capability|agent|provider> [dir]         Scaffold new project',
        '',
        'Options:',
        '  --home <path>   Override ROHINIK_HOME',
      ].join('\n'))
      process.exit(cmd ? 1 : 0)
  }
}

main().catch(err => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
