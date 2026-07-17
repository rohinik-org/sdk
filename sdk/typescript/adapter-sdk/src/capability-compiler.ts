import type { SdkCapability, SdkSkill } from '@rohinik-org/foundation'
import { KeywordMatcher } from '@rohinik-org/foundation'
import type { CapabilityDescriptorIR, CapabilityDefinition, SemanticCapabilityID } from '@rohinik-org/compiler'
import type { ExecutionBinding } from './types.js'

const SEMANTIC_NORMALIZATION: Array<[RegExp, SemanticCapabilityID]> = [
  [/^read_file|^file_read|^fs_read/, 'filesystem.read'],
  [/^write_file|^file_write|^fs_write/, 'filesystem.write'],
  [/^list_dir|^list_directory|^list_files/, 'filesystem.list'],
  [/^delete_file|^file_delete/, 'filesystem.delete'],
  [/^add|^sum|^plus/, 'math.add'],
  [/^subtract|^minus/, 'math.subtract'],
  [/^multiply|^times/, 'math.multiply'],
  [/^divide|^division/, 'math.divide'],
  [/^search|^find|^query/, 'search.query'],
  [/^fetch|^get_url|^http_get/, 'web.fetch'],
  [/^run_code|^execute_code|^eval/, 'code.execute'],
  [/^complete|^generate|^chat/, 'llm.complete'],
]

const TIER_RULES: Array<[string, string]> = [
  ['filesystem.', 'LOCAL_TOOL'],
  ['math.', 'DETERMINISTIC'],
  ['code.', 'LOCAL_TOOL'],
  ['web.', 'EXTERNAL'],
  ['search.', 'EXTERNAL'],
  ['llm.', 'REASONING'],
]

export class CapabilityCompiler {
  constructor(private readonly adapterId: string) {}

  compile(descriptor: CapabilityDescriptorIR, bindings: Map<string, ExecutionBinding>): SdkCapability[] {
    return descriptor.capabilities.map(cap => this.compileOne(cap, descriptor, bindings))
  }

  private compileOne(cap: CapabilityDefinition, descriptor: CapabilityDescriptorIR, bindings: Map<string, ExecutionBinding>): SdkCapability {
    const semanticId = this.normalizeId(cap.id)
    const tokens = semanticId.split(/[._-]/).filter(t => t.length > 1)
    const matcher = new KeywordMatcher(tokens.length > 0 ? tokens : [cap.id])
    const tierId = this.classifyTier(semanticId, cap.tags ?? [])
    const skillId = semanticId
    const binding = bindings.get(cap.id)

    const executionModel = tierId === 'REASONING' ? 'REASONING' as const : 'DETERMINISTIC' as const
    const requirements = tierId === 'LOCAL_TOOL'
      ? { environments: { filesystem: { read: true, write: true } } }
      : tierId === 'EXTERNAL'
      ? { environments: { network: true } }
      : {}

    const skill = {
      metadata: {
        skillId,
        name: cap.name,
        version: '1.0.0',
        tierId: tierId as 'MEMORY' | 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING',
        executionModel,
        requirements,
        matching: { matcher },
      },
      estimatedCost: () => ({ estimated: { cpuMs: 10 } }),
      execute: async (ctx: unknown) => {
        const context = (ctx as { request: { context: Record<string, unknown> } }).request.context
        if (!binding) {
          return {
            status: 'FAILURE' as const, result: undefined, skillId, stepId: 'step-0',
            diagnostics: [{ code: 'NO_BINDING', message: `No execution binding for ${cap.id}` }],
            metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
            cacheable: false, retryable: false, error: new Error('No binding'),
          }
        }
        const start = Date.now()
        try {
          const result = await binding.invoke(context)
          return {
            status: 'SUCCESS' as const, result, skillId, stepId: 'step-0', diagnostics: [],
            metrics: { durationMs: Date.now() - start, resourceCost: { estimated: { cpuMs: Date.now() - start } }, cacheHit: false },
            cacheable: false, retryable: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return {
            status: 'FAILURE' as const, result: undefined, skillId, stepId: 'step-0',
            diagnostics: [{ code: 'EXECUTION_ERROR', message: msg }],
            metrics: { durationMs: Date.now() - start, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
            cacheable: false, retryable: true, error: err instanceof Error ? err : new Error(msg),
          }
        }
      },
    } as unknown as SdkSkill

    const category = tierId === 'DETERMINISTIC' ? 'data' as const
      : tierId === 'LOCAL_TOOL' ? 'tool' as const
      : tierId === 'REASONING' ? 'reasoning' as const
      : 'utility' as const

    return {
      metadata: {
        capabilityId: semanticId,
        name: cap.name,
        version: '1.0.0',
        contractVersion: '1.0',
        description: cap.description,
        category,
        tags: [...(cap.tags ?? []), descriptor.origin.protocol],
        execution: { tierId: tierId as 'MEMORY' | 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING' },
      },
      skills: [skill],
    }
  }

  private normalizeId(rawId: string): SemanticCapabilityID {
    const lower = rawId.toLowerCase()
    for (const [pattern, semanticId] of SEMANTIC_NORMALIZATION) {
      if (pattern.test(lower)) return semanticId
    }
    const adapterShortName = this.adapterId.split('/').pop() ?? 'adapter'
    return `${adapterShortName}.${lower}`
  }

  private classifyTier(semanticId: string, tags: readonly string[]): string {
    const tagLower = tags.map(t => t.toLowerCase())
    if (tagLower.includes('filesystem') || tagLower.includes('local')) return 'LOCAL_TOOL'
    if (tagLower.includes('math') || tagLower.includes('deterministic')) return 'DETERMINISTIC'
    if (tagLower.includes('llm') || tagLower.includes('reasoning') || tagLower.includes('ai')) return 'REASONING'
    if (tagLower.includes('web') || tagLower.includes('external') || tagLower.includes('network')) return 'EXTERNAL'
    for (const [prefix, tier] of TIER_RULES) {
      if (semanticId.startsWith(prefix)) return tier
    }
    return 'EXTERNAL'
  }
}
