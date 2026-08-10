/**
 * T6 acceptance tests — agent authoring boundary enforcement.
 *
 * Critical invariants:
 *   PASS:   valid id + version + role + capabilities + authority + budget + instructions
 *   REJECT: invalid ID format
 *   REJECT: invalid semver
 *   REJECT: empty role
 *   REJECT: bad capability ID in capabilities or authority.allowedCapabilities
 *   REJECT: negative maxDelegationDepth
 *   REJECT: negative budget fields
 *   REJECT: bad goal priority
 *   REJECT: empty policy refs
 *   ABSENT: AgentHandle, AgentRunHandle, DelegationHandle, admit(), DelegationCertificate
 *   ABSENT: instanceId, runId, grantedAuthority, certificateId on AgentDefinition
 */

import { describe, it, expect } from 'vitest'
import {
  defineAgent,
  validateAgentDefinition,
} from '../index.js'
import type { AgentDefinition, AgentContext } from '../index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minimal(): Parameters<typeof defineAgent>[0] {
  return {
    id:           'repo-reviewer',
    version:      '1.0.0',
    role:         'Repository reviewer',
    capabilities: ['code:detect'],
    authority: {
      allowedCapabilities: ['code:detect'],
      allowedActions:      ['read-file'],
      deniedActions:       [],
      maxDelegationDepth:  1,
    },
    budget: { maxCostUsd: 0.50, maxLatencyMs: 30_000, maxTokens: 8_000 },
    policy: [{ policyId: 'p-1', policyKind: 'content-safety' }],
    async instructions(_ctx) { return 'Review the repository for issues.' },
  }
}

// ── Golden path ───────────────────────────────────────────────────────────────

describe('defineAgent — golden path', () => {
  it('returns frozen AgentDefinition for valid input', () => {
    const agent = defineAgent(minimal())
    expect(agent.id).toBe('repo-reviewer')
    expect(agent.version).toBe('1.0.0')
    expect(agent.role).toBe('Repository reviewer')
    expect(Object.isFrozen(agent)).toBe(true)
    expect(Object.isFrozen(agent.authority)).toBe(true)
    expect(Object.isFrozen(agent.budget)).toBe(true)
  })

  it('instructions() is callable and returns a string', async () => {
    const agent = defineAgent(minimal())
    const ctx: AgentContext = { workspaceId: 'ws-1', params: {} }
    const instr = await agent.instructions(ctx)
    expect(typeof instr).toBe('string')
    expect(instr.length).toBeGreaterThan(0)
  })

  it('omitted optional fields get correct defaults', () => {
    const agent = defineAgent({
      id:           'simple-agent',
      version:      '0.1.0',
      role:         'Simple',
      async instructions() { return 'ok' },
    })
    expect(agent.goals).toHaveLength(0)
    expect(agent.capabilities).toHaveLength(0)
    expect(agent.authority.maxDelegationDepth).toBe(0)
    expect(agent.authority.allowedCapabilities).toHaveLength(0)
    expect(agent.policy).toHaveLength(0)
    expect(agent.budget.maxCostUsd).toBeUndefined()
  })

  it('goals carry declared priority', () => {
    const agent = defineAgent({
      ...minimal(),
      goals: [
        { description: 'Detect issues', priority: 'HIGH', required: true },
        { description: 'Report findings', priority: 'NORMAL' },
      ],
    })
    expect(agent.goals).toHaveLength(2)
    expect(agent.goals[0]!.priority).toBe('HIGH')
  })

  it('instructions() receives AgentContext with workspaceId and params', async () => {
    let captured: AgentContext | undefined
    const agent = defineAgent({
      id:           'ctx-check',
      version:      '1.0.0',
      role:         'Checker',
      async instructions(ctx) { captured = ctx; return 'done' },
    })
    const ctx: AgentContext = { workspaceId: 'ws-test', params: { depth: 3 } }
    await agent.instructions(ctx)
    expect(captured!.workspaceId).toBe('ws-test')
    expect(captured!.params['depth']).toBe(3)
  })
})

// ── ID boundary ───────────────────────────────────────────────────────────────

describe('defineAgent — ID boundary', () => {
  it('REJECT: uppercase letters', () => {
    expect(() => defineAgent({ ...minimal(), id: 'Repo-Reviewer' })).toThrow(/invalid/)
  })

  it('REJECT: starts with digit', () => {
    expect(() => defineAgent({ ...minimal(), id: '1agent' })).toThrow(/invalid/)
  })

  it('REJECT: spaces in ID', () => {
    expect(() => defineAgent({ ...minimal(), id: 'repo reviewer' })).toThrow(/invalid/)
  })

  it('REJECT: empty ID', () => {
    expect(() => defineAgent({ ...minimal(), id: '' })).toThrow(/invalid/)
  })

  it('PASS: hyphens allowed', () => {
    expect(() => defineAgent({ ...minimal(), id: 'repo-code-reviewer' })).not.toThrow()
  })
})

// ── Version boundary ──────────────────────────────────────────────────────────

describe('defineAgent — version boundary', () => {
  it('REJECT: empty version', () => {
    expect(() => defineAgent({ ...minimal(), version: '' })).toThrow(/version/)
  })

  it('REJECT: non-semver', () => {
    expect(() => defineAgent({ ...minimal(), version: 'latest' })).toThrow(/version/)
  })

  it('PASS: semver with pre-release tag', () => {
    expect(() => defineAgent({ ...minimal(), version: '1.0.0-alpha.1' })).not.toThrow()
  })
})

// ── Role boundary ─────────────────────────────────────────────────────────────

describe('defineAgent — role boundary', () => {
  it('REJECT: empty role', () => {
    expect(() => defineAgent({ ...minimal(), role: '' })).toThrow(/role/)
  })

  it('REJECT: whitespace-only role', () => {
    expect(() => defineAgent({ ...minimal(), role: '   ' })).toThrow(/role/)
  })
})

// ── Capability boundary ───────────────────────────────────────────────────────

describe('defineAgent — capability boundary', () => {
  it('REJECT: capability without colon', () => {
    expect(() => defineAgent({ ...minimal(), capabilities: ['codedetect'] })).toThrow(/invalid/)
  })

  it('REJECT: uppercase capability ID', () => {
    expect(() => defineAgent({ ...minimal(), capabilities: ['Code:Detect'] })).toThrow(/invalid/)
  })

  it('REJECT: bad capability in authority.allowedCapabilities', () => {
    expect(() => defineAgent({
      ...minimal(),
      authority: { ...minimal().authority!, allowedCapabilities: ['INVALID'] },
    })).toThrow(/invalid/)
  })
})

// ── Authority boundary ────────────────────────────────────────────────────────

describe('defineAgent — authority boundary', () => {
  it('REJECT: negative maxDelegationDepth', () => {
    expect(() => defineAgent({
      ...minimal(),
      authority: { ...minimal().authority!, maxDelegationDepth: -1 },
    })).toThrow(/maxDelegationDepth/)
  })

  it('REJECT: fractional maxDelegationDepth', () => {
    expect(() => defineAgent({
      ...minimal(),
      authority: { ...minimal().authority!, maxDelegationDepth: 1.5 },
    })).toThrow(/maxDelegationDepth/)
  })

  it('PASS: maxDelegationDepth=0 (no delegation)', () => {
    expect(() => defineAgent({
      ...minimal(),
      authority: { ...minimal().authority!, maxDelegationDepth: 0 },
    })).not.toThrow()
  })
})

// ── Budget boundary ───────────────────────────────────────────────────────────

describe('defineAgent — budget boundary', () => {
  it('REJECT: negative maxCostUsd', () => {
    expect(() => defineAgent({ ...minimal(), budget: { maxCostUsd: -1 } })).toThrow(/maxCostUsd/)
  })

  it('REJECT: negative maxTokens', () => {
    expect(() => defineAgent({ ...minimal(), budget: { maxTokens: -100 } })).toThrow(/maxTokens/)
  })

  it('PASS: all fields omitted (no declared ceiling)', () => {
    expect(() => defineAgent({ ...minimal(), budget: {} })).not.toThrow()
  })
})

// ── Goal boundary ─────────────────────────────────────────────────────────────

describe('defineAgent — goal boundary', () => {
  it('REJECT: goal with empty description', () => {
    expect(() => defineAgent({
      ...minimal(),
      goals: [{ description: '' }],
    })).toThrow(/description/)
  })

  it('REJECT: unknown priority value', () => {
    expect(() => defineAgent({
      ...minimal(),
      goals: [{ description: 'Do something', priority: 'URGENT' as 'HIGH' }],
    })).toThrow(/priority/)
  })
})

// ── Policy boundary ───────────────────────────────────────────────────────────

describe('defineAgent — policy boundary', () => {
  it('REJECT: policy ref with empty policyId', () => {
    expect(() => defineAgent({
      ...minimal(),
      policy: [{ policyId: '', policyKind: 'content-safety' }],
    })).toThrow(/policyId/)
  })

  it('REJECT: policy ref with empty policyKind', () => {
    expect(() => defineAgent({
      ...minimal(),
      policy: [{ policyId: 'p-1', policyKind: '' }],
    })).toThrow(/policyKind/)
  })
})

// ── Admission state absent from AgentDefinition ───────────────────────────────

describe('AgentDefinition — admission state absent', () => {
  it('no instanceId on AgentDefinition', () => {
    const agent = defineAgent(minimal()) as unknown as Record<string, unknown>
    expect(agent['instanceId']).toBeUndefined()
    expect(agent['runId']).toBeUndefined()
    expect(agent['admitted']).toBeUndefined()
  })

  it('no grantedAuthority on AgentDefinition (only declared authority)', () => {
    const agent = defineAgent(minimal()) as unknown as Record<string, unknown>
    expect(agent['grantedAuthority']).toBeUndefined()
    expect(agent['certificate']).toBeUndefined()
    expect(agent['fingerprint']).toBeUndefined()
  })

  it('no delegation certificate fields present', () => {
    const agent = defineAgent(minimal()) as unknown as Record<string, unknown>
    expect(agent['certificateId']).toBeUndefined()
    expect(agent['delegationId']).toBeUndefined()
    expect(agent['delegatorRunId']).toBeUndefined()
  })

  it('validateAgentDefinition returns ok=true for valid definition', () => {
    const agent = defineAgent(minimal())
    const r = validateAgentDefinition(agent)
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('validateAgentDefinition collects multiple errors in one pass', () => {
    const def = {
      id:           'INVALID ID',
      version:      'not-semver',
      role:         '',
      goals:        [],
      capabilities: ['badcap'],
      authority:    { allowedCapabilities: [], allowedActions: [], deniedActions: [], maxDelegationDepth: -1 },
      budget:       { maxCostUsd: -5 },
      policy:       [],
      instructions: async () => '',
    } as AgentDefinition
    const r = validateAgentDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(3)
  })
})
