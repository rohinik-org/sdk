// Local re-shape of PackageDefinition using only manifest-ir types.
// Mirrors @rohinik-org/package-sdk PackageDefinition exactly.
import type {
  PackageDeclaration,
  PublisherDeclaration,
  RuntimeDeclaration,
  ProvidedCapabilityDeclaration,
  ConsumedCapabilityDeclaration,
  DependencyDeclarations,
  ConfigurationDeclarations,
  PermissionDeclarations,
  HealthDeclaration,
  LifecycleDeclaration,
} from '@rohinik-org/package-manifest-ir'

export interface PackageDefinition {
  readonly package:        PackageDeclaration
  readonly publisher?:     PublisherDeclaration
  readonly runtime?:       RuntimeDeclaration
  readonly provides:       readonly ProvidedCapabilityDeclaration[]
  readonly consumes:       readonly ConsumedCapabilityDeclaration[]
  readonly dependencies?:  DependencyDeclarations
  readonly configuration?: ConfigurationDeclarations
  readonly permissions?:   PermissionDeclarations
  readonly health?:        HealthDeclaration
  readonly lifecycle?:     LifecycleDeclaration
  readonly metadata?:      Readonly<Record<string, string>>
}
