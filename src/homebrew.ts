/** Data-driven homebrew definitions. Rules content is campaign-scoped, not hardcoded. */
export type HomebrewKind = 'species' | 'class' | 'background' | 'feature'
export type HomebrewStatus = 'draft' | 'published'
export type Activation = 'passive' | 'action' | 'bonus_action' | 'reaction' | 'special'
export type Recharge = 'none' | 'short_rest' | 'long_rest' | 'dawn' | 'special'
export type ModifierStat = 'speed' | 'max_hp' | 'ac' | 'initiative'
export interface RulesModifier { stat: ModifierStat; amount: number; condition?: string }
export interface RulesConfig {
  creature_type?: string
  size?: string
  speed?: number
  languages?: string[]
  hit_die?: number
  primary_abilities?: string[]
  proficiencies?: string[]
  starting_equipment?: string
  activation?: Activation
  recharge?: Recharge
  uses?: number
  prerequisites?: string
  modifiers?: RulesModifier[]
  [key: string]: unknown
}
export interface HomebrewDefinition {
  id: string
  campaign_id: string
  created_by: string
  kind: HomebrewKind
  name: string
  summary: string
  description: string
  config: RulesConfig
  status: HomebrewStatus
  created_at: string
  updated_at: string
}
export interface HomebrewGrant {
  id: string
  campaign_id: string
  parent_definition_id: string
  feature_definition_id: string
  unlock_level: number
}
export type DefinitionInput = Pick<HomebrewDefinition, 'kind'|'name'|'summary'|'description'|'status'|'config'>
export interface GrantInput { feature_definition_id: string; unlock_level: number }
export const kindNames: Record<HomebrewKind, string> = {
  species: 'Species', class: 'Classes', background: 'Backgrounds', feature: 'Features'
}
export const kinds: HomebrewKind[] = ['species', 'class', 'background', 'feature']
export const blankDefinition = (kind: HomebrewKind): DefinitionInput => ({
  kind, name: '', summary: '', description: '', status: 'draft', config: kind === 'species'
    ? { creature_type: 'Humanoid', size: 'Medium', speed: 30, languages: [] }
    : kind === 'class' ? { hit_die: 8, primary_abilities: [], proficiencies: [] }
    : kind === 'background' ? { proficiencies: [], starting_equipment: '' }
    : { activation: 'passive', recharge: 'none', uses: 0, modifiers: [] }
})
export function grantedFeatures(
  selections: Array<string|null|undefined>, level: number,
  definitions: HomebrewDefinition[], grants: HomebrewGrant[]
): Array<{feature: HomebrewDefinition, unlock_level: number, source: HomebrewDefinition}> {
  const byId = new Map(definitions.filter(d => d.status === 'published').map(d => [d.id, d]))
  const result: Array<{feature: HomebrewDefinition, unlock_level: number, source: HomebrewDefinition}> = []
  for (const selection of selections) {
    const source = selection && byId.get(selection)
    if (!source) continue
    for (const grant of grants.filter(g => g.parent_definition_id === selection && g.unlock_level <= level)) {
      const feature = byId.get(grant.feature_definition_id)
      if (feature?.kind === 'feature') result.push({ feature, unlock_level: grant.unlock_level, source })
    }
  }
  return result.sort((a,b) => a.unlock_level-b.unlock_level || a.feature.name.localeCompare(b.feature.name))
}
export function derivedModifiers(features: ReturnType<typeof grantedFeatures>): Record<ModifierStat, number> {
  const totals: Record<ModifierStat, number> = { speed: 0, max_hp: 0, ac: 0, initiative: 0 }
  for (const entry of features) {
    for (const effect of entry.feature.config.modifiers ?? []) {
      if (typeof effect.amount !== 'number' || !Number.isFinite(effect.amount)) continue
      if (effect.condition?.trim()) continue // Conditional bonuses are advisory only.
      if (effect.stat in totals) totals[effect.stat] += effect.amount
    }
  }
  return totals
}
export const csvList = (value: string): string[] => value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,30)
