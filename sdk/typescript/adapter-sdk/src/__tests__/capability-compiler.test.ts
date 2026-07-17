import { describe, it, expect } from 'vitest'
import { CapabilityCompiler } from '../capability-compiler.js'
import type { CapabilityDescriptorIR } from '@rohinik-org/compiler'

function makeDescriptorIR(caps: Array<{ id: string; description: string; tags?: string[] }>): CapabilityDescriptorIR {
  return {
    meta: { artifactId: 'cdir-1', schemaVersion: '1.0', kind: 'CapabilityDescriptorIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: 'sha256-x' },
    lifecycle: { state: 'ACTIVE' },
    origin: { protocol: 'mcp', adapterId: 'test', adapterVersion: '1.0.0', protocolVersion: '2024-11-05', discoveryHash: 'dh-1', capturedAt: '2026-07-07T00:00:00Z' },
    capabilities: caps.map(c => ({ id: c.id, name: c.id, description: c.description, ...(c.tags !== undefined ? { tags: c.tags } : {}) })),
  }
}

describe('CapabilityCompiler', () => {
  const compiler = new CapabilityCompiler('test-adapter')

  it('produces SdkCapability[] from CapabilityDescriptorIR', () => {
    const ir = makeDescriptorIR([{ id: 'read_file', description: 'Read a file', tags: ['filesystem'] }])
    const caps = compiler.compile(ir, new Map())
    expect(caps).toHaveLength(1)
  })

  it('Pass 1 — read_file normalizes to filesystem.read', () => {
    const ir = makeDescriptorIR([{ id: 'read_file', description: 'Read' }])
    const caps = compiler.compile(ir, new Map())
    expect(caps[0]!.metadata.capabilityId).toBe('filesystem.read')
  })

  it('Pass 1 — unknown names get adapter prefix', () => {
    const ir = makeDescriptorIR([{ id: 'some_exotic_tool', description: 'Does stuff' }])
    const caps = compiler.compile(ir, new Map())
    expect(caps[0]!.metadata.capabilityId).toContain('some_exotic_tool')
  })

  it('Pass 2 — matcher is declared on the skill', () => {
    const ir = makeDescriptorIR([{ id: 'read_file', description: 'Read' }])
    const caps = compiler.compile(ir, new Map())
    const skill = caps[0]!.skills[0]!
    expect((skill.metadata as { matching?: { matcher: unknown } }).matching).toBeDefined()
  })

  it('Pass 3 — filesystem tag → LOCAL_TOOL', () => {
    const ir = makeDescriptorIR([{ id: 'read_file', description: 'Read', tags: ['filesystem'] }])
    const caps = compiler.compile(ir, new Map())
    expect(caps[0]!.metadata.execution?.tierId).toBe('LOCAL_TOOL')
  })

  it('Pass 3 — math tag → DETERMINISTIC', () => {
    const ir = makeDescriptorIR([{ id: 'add_numbers', description: 'Add', tags: ['math'] }])
    const caps = compiler.compile(ir, new Map())
    expect(caps[0]!.metadata.execution?.tierId).toBe('DETERMINISTIC')
  })

  it('Pass 4 — execute() delegates to ExecutionBinding', async () => {
    let invoked = false
    const binding = { adapterId: 'test', capabilityId: 'read_file', invoke: async (_input: unknown) => { invoked = true; return { content: 'hello' } } }
    const ir = makeDescriptorIR([{ id: 'read_file', description: 'Read a file' }])
    const caps = compiler.compile(ir, new Map([['read_file', binding]]))
    const skill = caps[0]!.skills[0]! as { execute: (ctx: unknown, p: unknown) => Promise<unknown> }
    await skill.execute({ request: { context: { path: '/tmp/test.txt' } } }, {})
    expect(invoked).toBe(true)
  })
})
