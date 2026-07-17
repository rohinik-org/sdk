import type { SemanticFrontend, ResolvedFrontend, ResolverOptions } from './types.js'
import type { SemanticFrontendRegistry } from './registry.js'

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7

export class SemanticFrontendResolver {
  private readonly threshold: number
  private readonly confirm?: ResolverOptions['confirm']

  constructor(
    private readonly registry: SemanticFrontendRegistry,
    options: ResolverOptions = {},
  ) {
    this.threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
    this.confirm = options.confirm
  }

  async resolve(localPath: string, hint?: string): Promise<ResolvedFrontend> {
    const results = this.registry.detect(localPath)

    if (results.length === 0) {
      throw new Error(
        `No Semantic Frontends registered. Install a frontend package (e.g. @rohinik-org/claude-asset-frontend).`
      )
    }

    // Hint bypasses detection — find by ecosystem id match
    if (hint) {
      const hinted = results.find(r => r.frontend.ecosystem === hint || r.frontend.id.includes(hint))
      if (hinted) {
        return { frontend: hinted.frontend, detection: hinted, requiresConfirmation: false }
      }
    }

    const best = results[0]!

    if (best.confidence >= this.threshold) {
      return { frontend: best.frontend, detection: best, requiresConfirmation: false }
    }

    if (this.confirm) {
      const chosen: SemanticFrontend = await this.confirm(results)
      const detection = results.find(r => r.frontend === chosen) ?? best
      return { frontend: chosen, detection, requiresConfirmation: false }
    }

    return { frontend: best.frontend, detection: best, requiresConfirmation: true }
  }
}
