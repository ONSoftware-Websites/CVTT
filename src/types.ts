export type Role = 'dm' | 'player'
export interface Campaign {
  id: string
  owner_id: string
  name: string
  description: string
  created_at: string
}
export interface Member {
  campaign_id: string
  user_id: string
  role: Role
  joined_at: string
}
export interface Character {
  id: string
  campaign_id: string
  created_by: string
  name: string
  species_name: string
  class_name: string
  level: number
  max_hp: number
  current_hp: number
  notes: string
  species_id: string | null
  class_id: string | null
  background_id: string | null
  created_at: string
  updated_at: string
}
export type CharacterForm = Pick<Character,'name'|'species_name'|'class_name'|'background_id'|'species_id'|'class_id'|'level'|'max_hp'|'current_hp'|'notes'>
export const newCharacter: CharacterForm = { name: '', species_name: '', class_name: '', level: 1, max_hp: 10, current_hp: 10, notes: '', species_id: null, class_id: null, background_id: null }
