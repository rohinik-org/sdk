import type { SemanticFrontend, DetectionResult } from './types.js'

export class SemanticFrontendRegistry {
  private readonly frontends: SemanticFrontend[] = []

  register(frontend: SemanticFrontend): void {
    this.frontends.push(frontend)
  }

  // Returns detection results for all registered frontends, sorted by confidence desc.
  detect(localPath: string): readonly DetectionResult[] {
    return this.frontends
      .map(f => {
        const result = f.detect(localPath)
        return { ...result, frontend: f }
      })
      .sort((a, b) => b.confidence - a.confidence)
  }
}
