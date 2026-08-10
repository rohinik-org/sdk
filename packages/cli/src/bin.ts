#!/usr/bin/env node
import { install, start, stop, status, version, formatVersionInfo, listInstalledVersions } from './index.js'
import { resolveHome } from '@rohinik-org/install-manifest'

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
      const artifactArg = flag('--artifact')
      const bundleArg   = flag('--bundle')
      const manifestArg = flag('--manifest')
      if (!artifactArg || !bundleArg || !manifestArg) {
        console.error('Usage: rohinik install --artifact <file> --bundle <dir> --manifest <path>')
        process.exit(1)
      }
      const result = await install({ home: homeOverride, artifactPath: artifactArg, bundlePath: bundleArg, manifestPath: manifestArg })
      if (!result.ok) { console.error(`Install failed: ${result.reason}`); process.exit(1) }
      console.log(`Installed runtime ${result.runtimeVersion} → ${result.installDir}`)
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
