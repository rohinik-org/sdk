import { describe, it, expect } from 'vitest'
import { RegistrationPipeline } from '../registration-pipeline.js'
import type { SdkCapability } from '@rohinik-org/foundation'

function makeCap(capabilityId: string, tierId: string): SdkCapability {
  return {
    metadata: {
      capabilityId,
      name: capabilityId,
      version: '1.0.0',
      contractVersion: '1.0',
      description: 'test',
      category: 'utility',
      tags: [],
      execution: { tierId: tierId as 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING' | 'MEMORY' },
    },
    skills: [],
  }
}

describe('RegistrationPipeline', () => {
  const pipeline = new RegistrationPipeline('0.1.0-alpha.1', '1.0')

  it('admits a compatible capability', () => {
    const record = pipeline.admit([makeCap('filesystem.read', 'LOCAL_TOOL')], 'sess-1', 'snap-1', 'cdir-1')
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds).toContain('filesystem.read')
    expect(record.meta.kind).toBe('RegistrationRecord')
  })

  it('RegistrationRecord has subject (DiagnosticArtifactBase)', () => {
    const record = pipeline.admit([makeCap('math.add', 'DETERMINISTIC')], 'sess-1', 'snap-1', 'cdir-1')
    expect('subject' in record).toBe(true)
    expect('provenance' in record).toBe(false)
  })

  it('rejects empty capability list', () => {
    const record = pipeline.admit([], 'sess-1', 'snap-1', 'cdir-1')
    expect(record.status).toBe('REJECTED')
    expect(record.errors).toContain('No capabilities to register')
  })

  it('subject references the CapabilityDescriptorIR', () => {
    const record = pipeline.admit([makeCap('math.add', 'DETERMINISTIC')], 'sess-1', 'snap-1', 'cdir-42')
    expect(record.subject.references.some(r => r.id === 'cdir-42')).toBe(true)
  })
})
