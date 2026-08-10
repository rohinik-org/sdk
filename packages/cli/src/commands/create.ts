/**
 * rohinik dev create <app|capability|agent|provider> [dir]
 *
 * Scaffolds a new project from embedded templates.
 * Templates are embedded as strings so the CLI works without monorepo context.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, basename, dirname } from 'node:path'

export interface CreateResult {
  readonly ok:      boolean
  readonly message: string
  readonly files?:  string[]
}

// ── Embedded templates ────────────────────────────────────────────────────────

type TemplateFile = { path: string; content: string }

const TEMPLATES: Record<string, () => TemplateFile[]> = {
  app: () => [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'my-app',
        version: '0.1.0',
        type: 'module',
        description: 'A Rohinik application',
        scripts: {
          build:     'tsc',
          test:      'vitest run',
          typecheck: 'tsc --noEmit',
          start:     'node dist/index.js',
        },
        devDependencies: {
          '@rohinik-org/client':  '^1.0.0',
          '@rohinik-org/testing': '^0.16.0',
          '@types/node':          '^22.0.0',
          typescript:             '^5.0.0',
          vitest:                 '^2.0.0',
        },
      }, null, 2),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
          strict: true, skipLibCheck: true, outDir: 'dist', declaration: true,
        },
        include:  ['src'],
        exclude:  ['node_modules', 'dist', 'test'],
      }, null, 2),
    },
    {
      path: 'src/index.ts',
      content: `import { createRohinikClient } from '@rohinik-org/client'

export async function run(baseUrl: string, prompt: string): Promise<string> {
  const client = createRohinikClient({ baseUrl })
  const handle = await client.executions.start({
    capability: 'text:complete',
    messages:   [{ role: 'user', content: prompt }],
  })
  const result = await handle.waitForResult()
  return (result.output as Record<string, string>)['text'] ?? ''
}
`,
    },
    {
      path: 'test/index.test.ts',
      content: `import { describe, it, expect } from 'vitest'
import {
  createMockExecutionClient,
  ExecutionEventBuilder,
  PublicEventKind,
  createFakeClock,
} from '@rohinik-org/testing'

describe('execution fixtures — app template', () => {
  it('mock client produces golden path', async () => {
    const client = createMockExecutionClient({ executionId: 'e-001' })
    const kinds: string[] = []
    for await (const ev of client.events()) kinds.push(ev.kind)
    expect(kinds).toContain(PublicEventKind.EXECUTION_COMPLETED)
  })

  it('event builder produces deterministic events', () => {
    const clock = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const b = new ExecutionEventBuilder({ executionId: 'e-001', clock })
    const evs = b.goldenPath()
    expect(evs[0]!.occurredAt).toBe('2026-01-01T00:00:00.000Z')
    expect(evs).toHaveLength(4)
  })
})
`,
    },
  ],

  capability: () => [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'my-capability',
        version: '0.1.0',
        type: 'module',
        description: 'A Rohinik capability package',
        scripts: {
          build:     'tsc',
          test:      'vitest run',
          typecheck: 'tsc --noEmit',
          validate:  'rohinik dev validate',
          pack:      'rohinik dev pack',
        },
        devDependencies: {
          '@rohinik-org/capability-sdk': '^0.16.0',
          '@rohinik-org/testing':        '^0.16.0',
          '@rohinik-org/package-sdk':    '^0.16.0',
          '@types/node':                  '^22.0.0',
          typescript:                     '^5.0.0',
          vitest:                         '^2.0.0',
        },
      }, null, 2),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
          strict: true, skipLibCheck: true, outDir: 'dist', declaration: true,
        },
        include:  ['src'],
        exclude:  ['node_modules', 'dist', 'test'],
      }, null, 2),
    },
    {
      path: 'src/index.ts',
      content: `import { defineCapability, inputField, outputField, result } from '@rohinik-org/capability-sdk'

export const myCapability = defineCapability({
  id:          'example:text-echo',
  name:        'Text Echo',
  description: 'Returns the input text unchanged.',
  version:     '0.1.0',
  tier:        'LOCAL',
  tags:        ['example'],
  permissions: [],
  input:  [inputField('text', 'string', { description: 'Text to echo' })],
  output: [outputField('echoed', 'string', { description: 'The echoed text' })],

  async execute(_ctx, input) {
    const fields = input as Record<string, unknown>
    return result({ echoed: fields['text'] as string })
  },
})
`,
    },
    {
      path: 'src/package-definition.ts',
      content: `import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.text-echo',
    name:        'Text Echo',
    version:     '0.1.0',
    type:        'capability-provider',
    description: 'Returns the input text unchanged.',
  },
  provides: [
    { capability: 'example:text-echo', version: '0.1.0' },
  ],
  consumes: [],
}

export default definition
`,
    },
    {
      path: 'test/index.test.ts',
      content: `import { describe, it, expect } from 'vitest'
import { createTestCapabilityContext, assertValidCapability } from '@rohinik-org/testing'
import { myCapability } from '../src/index.js'

describe('myCapability', () => {
  it('passes assertValidCapability', () => {
    assertValidCapability(myCapability)
  })

  it('executes and returns echoed text', async () => {
    const ctx = createTestCapabilityContext()
    const r = await myCapability.execute(ctx, { text: 'hello' })
    expect(r.value['echoed']).toBe('hello')
  })
})
`,
    },
  ],

  agent: () => [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'my-agent',
        version: '0.1.0',
        type: 'module',
        description: 'A Rohinik agent package',
        scripts: {
          build:     'tsc',
          test:      'vitest run',
          typecheck: 'tsc --noEmit',
          validate:  'rohinik dev validate',
          pack:      'rohinik dev pack',
        },
        devDependencies: {
          '@rohinik-org/agent-sdk':   '^0.16.0',
          '@rohinik-org/testing':     '^0.16.0',
          '@rohinik-org/package-sdk': '^0.16.0',
          '@types/node':               '^22.0.0',
          typescript:                  '^5.0.0',
          vitest:                      '^2.0.0',
        },
      }, null, 2),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
          strict: true, skipLibCheck: true, outDir: 'dist', declaration: true,
        },
        include:  ['src'],
        exclude:  ['node_modules', 'dist', 'test'],
      }, null, 2),
    },
    {
      path: 'src/index.ts',
      content: `import { defineAgent } from '@rohinik-org/agent-sdk'

export const myAgent = defineAgent({
  id:      'my-agent',
  version: '0.1.0',
  role:    'A helpful assistant that echoes back what it receives.',
  goals: [
    { description: 'Respond to user input', priority: 'HIGH' },
  ],
  capabilities: ['example:text-echo'],
  authority: {
    allowedCapabilities: ['example:text-echo'],
    allowedActions:      [],
    deniedActions:       [],
    maxDelegationDepth:  0,
  },
  budget: {
    maxCostUsd:   0.10,
    maxLatencyMs: 30_000,
  },
  policy: [],
  instructions: async (_ctx) => \`You are a helpful assistant. Echo back what the user says.\`,
})
`,
    },
    {
      path: 'src/package-definition.ts',
      content: `import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.my-agent',
    name:        'My Agent',
    version:     '0.1.0',
    type:        'capability-provider',
    description: 'A helpful assistant agent.',
  },
  provides: [],
  consumes: [],
}

export default definition
`,
    },
    {
      path: 'test/index.test.ts',
      content: `import { describe, it, expect } from 'vitest'
import { createTestAgentContext, assertValidAgent } from '@rohinik-org/testing'
import { myAgent } from '../src/index.js'

describe('myAgent', () => {
  it('passes assertValidAgent', () => {
    assertValidAgent(myAgent)
  })

  it('has correct id and role', () => {
    expect(myAgent.id).toBe('my-agent')
    expect(typeof myAgent.role).toBe('string')
    expect(myAgent.role.length).toBeGreaterThan(0)
  })

  it('instructions is callable', async () => {
    const ctx = createTestAgentContext({ goalLabel: 'Echo test' })
    const instructions = await myAgent.instructions(ctx)
    expect(typeof instructions).toBe('string')
    expect(instructions.length).toBeGreaterThan(0)
  })

  it('maxDelegationDepth is 0 — does not delegate', () => {
    expect(myAgent.authority.maxDelegationDepth).toBe(0)
  })
})
`,
    },
  ],

  provider: () => [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'my-provider',
        version: '0.1.0',
        type: 'module',
        description: 'A Rohinik model provider package',
        scripts: {
          build:     'tsc',
          test:      'vitest run',
          typecheck: 'tsc --noEmit',
          validate:  'rohinik dev validate',
          pack:      'rohinik dev pack',
        },
        devDependencies: {
          '@rohinik-org/provider-sdk': '^0.16.0',
          '@rohinik-org/testing':      '^0.16.0',
          '@rohinik-org/package-sdk':  '^0.16.0',
          '@types/node':                '^22.0.0',
          typescript:                   '^5.0.0',
          vitest:                       '^2.0.0',
        },
      }, null, 2),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'Node16', moduleResolution: 'Node16',
          strict: true, skipLibCheck: true, outDir: 'dist', declaration: true,
        },
        include:  ['src'],
        exclude:  ['node_modules', 'dist', 'test'],
      }, null, 2),
    },
    {
      path: 'src/index.ts',
      content: `import { defineProvider } from '@rohinik-org/provider-sdk'

export const myProvider = defineProvider({
  id:           'my-provider',
  version:      '0.1.0',
  capabilities: { text: true },
  secretRefs:   ['MY_PROVIDER_API_KEY'],

  async execute(ctx, req) {
    const apiKey = ctx.secretRef('MY_PROVIDER_API_KEY')
    // Replace with real API call using apiKey
    void apiKey
    const messages = req.messages as Array<{ role: string; content: string }>
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    return { text: \`echo: \${lastUserMessage}\` }
  },

  async health(ctx) {
    try {
      ctx.secretRef('MY_PROVIDER_API_KEY')
      return { status: 'HEALTHY' }
    } catch {
      return { status: 'DEGRADED' }
    }
  },
})
`,
    },
    {
      path: 'src/package-definition.ts',
      content: `import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.my-provider',
    name:        'My Provider',
    version:     '0.1.0',
    type:        'model-provider',
    description: 'A Rohinik model provider.',
  },
  provides: [
    { capability: 'text:complete', version: '0.1.0' },
  ],
  consumes: [],
  configuration: {
    secrets: [
      { name: 'MY_PROVIDER_API_KEY', required: true, description: 'API key for the provider' },
    ],
  },
}

export default definition
`,
    },
    {
      path: 'test/index.test.ts',
      content: `import { describe, it, expect } from 'vitest'
import { createTestProviderContext, assertValidProvider } from '@rohinik-org/testing'
import { myProvider } from '../src/index.js'

describe('myProvider', () => {
  it('passes assertValidProvider', () => {
    assertValidProvider(myProvider)
  })

  it('execute echoes user message', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      { MY_PROVIDER_API_KEY: 'test-key' },
    })
    const r = await myProvider.execute(ctx, {
      capability: 'text',
      messages:   [{ role: 'user', content: 'hello provider' }],
    })
    expect(r.text).toContain('hello provider')
  })

  it('health returns HEALTHY when secret is set', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      { MY_PROVIDER_API_KEY: 'test-key' },
    })
    const h = await myProvider.health(ctx)
    expect(h.status).toBe('HEALTHY')
  })

  it('health returns DEGRADED when secret not set', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      {},
    })
    const h = await myProvider.health(ctx)
    expect(h.status).toBe('DEGRADED')
  })

  it('ProviderDefinition has no secret values', () => {
    const json = JSON.stringify(myProvider, (_, v) => typeof v === 'function' ? '[fn]' : v)
    expect(json).not.toMatch(/sk-/)
    expect(json).not.toMatch(/Bearer /)
    expect(myProvider.secretRefs).toEqual(['MY_PROVIDER_API_KEY'])
  })
})
`,
    },
  ],
}

export function devCreate(
  kind: string,
  targetDir: string | undefined,
  cwd: string,
): CreateResult {
  const factory = TEMPLATES[kind]
  if (!factory) {
    return {
      ok:      false,
      message: `Unknown template "${kind}". Available: ${Object.keys(TEMPLATES).join(', ')}`,
    }
  }

  const destDir = resolve(cwd, targetDir ?? basename(kind === 'app' ? 'my-app' : `my-${kind}`))

  if (existsSync(destDir)) {
    return { ok: false, message: `Directory already exists: ${destDir}` }
  }

  const files = factory()
  const written: string[] = []

  for (const f of files) {
    const fullPath = join(destDir, f.path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, f.content, 'utf-8')
    written.push(f.path)
  }

  return {
    ok:      true,
    message: `Created ${kind} project in ${destDir}`,
    files:   written,
  }
}
