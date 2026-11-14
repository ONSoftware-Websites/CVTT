import { useState, type FormEvent } from 'react'
import { ArrowRight, X, Heart, Sparkles } from 'lucide-react'
import { derivedModifiers, grantedFeatures, type HomebrewDefinition, type HomebrewGrant, type HomebrewKind } from './homebrew'
import { newCharacter, type Character, type CharacterForm } from './types'

type Props = {
  value?: Character
  onClose: () => void
  onSave: (form:CharacterForm) => Promise<void>
  busy: boolean
  definitions: HomebrewDefinition[]
  grants: HomebrewGrant[]
}
export default function CharacterEditor({value,onClose,onSave,busy,definitions,grants}:Props){
  const [form,setForm]=useState<CharacterForm>(value?{
    name:value.name, species_name:value.species_name, class_name:value.class_name,
    species_id:value.species_id, class_id:value.class_id, background_id:value.background_id,
    level:value.level, max_hp:value.max_hp, current_hp:value.current_hp, notes:value.notes
  }:{...newCharacter})
  const update = <K extends keyof CharacterForm>(key:K, value:CharacterForm[K]) => setForm(old=>({...old,[key]:value}))
  const published=definitions.filter(d=>d.status==='published')
  const byId=new Map(published.map(d=>[d.id,d]))
  const selections=[form.species_id,form.class_id,form.background_id]
  const features=grantedFeatures(selections,form.level,published,grants)
  const mods=derivedModifiers(features)
  const species=form.species_id?byId.get(form.species_id):undefined
  const career=form.class_id?byId.get(form.class_id):undefined
  const background=form.background_id?byId.get(form.background_id):undefined
  function selectRule(kind:HomebrewKind,id:string){
    const row=byId.get(id)
    if(kind==='species')setForm(old=>({...old,species_id:id||null,species_name:row?.name??old.species_name}))
    if(kind==='class')setForm(old=>({...old,class_id:id||null,class_name:row?.name??old.class_name}))
    if(kind==='background')update('background_id',id||null)
  }
  function submit(e:FormEvent){e.preventDefault();void onSave(form)}
  return <div className="overlay" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
    <div className="modal homebrew-modal" role="dialog" aria-modal="true" aria-label={value?'Edit character':'Create character'}>
      <div className="modal-head"><h2>{value?'Edit character':'Create a character'}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>Character name</span><input required maxLength={100} value={form.name} onChange={e=>update('name',e.target.value)} placeholder="The name they go by"/></label>
        <div className="form-two">
          {(['species','class'] as const).map(kind=>{
            const id=kind==='species'?form.species_id:form.class_id
            const name=kind==='species'?form.species_name:form.class_name
            return <div className="form-stack choice-stack" key={kind}>
              <label className="field"><span>{kind==='species'?'Species':'Class'} · published rules</span><select value={id??''} onChange={e=>selectRule(kind,e.target.value)}>
                <option value="">Manual / existing</option>{published.filter(d=>d.kind===kind).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select></label>
              {!id&&<label className="field"><span>{kind==='species'?'Species':'Class'} name</span><input required value={name} placeholder={kind==='species'?'e.g. Gallifreyan':'e.g. Scientist'} onChange={e=>update(kind==='species'?'species_name':'class_name',e.target.value)}/></label>}
            </div>
          })}
        </div>
        <label className="field"><span>Background (optional)</span><select value={form.background_id??''} onChange={e=>selectRule('background',e.target.value)}>
          <option value="">No background selected</option>{published.filter(d=>d.kind==='background').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
        <div className="form-three">
          <label className="field"><span>Level</span><input type="number" min={1} max={20} value={form.level} onChange={e=>update('level',Number(e.target.value))}/></label>
          <label className="field"><span>Maximum HP</span><input type="number" min={1} max={10000} value={form.max_hp} onChange={e=>update('max_hp',Number(e.target.value))}/></label>
          <label className="field"><span>Current HP</span><input type="number" min={0} max={form.max_hp} value={form.current_hp} onChange={e=>update('current_hp',Number(e.target.value))}/></label>
        </div>
        {(species||career||background||features.length>0)&&<div className="character-preview">
          <div className="preview-head"><Sparkles size={17}/><strong>Selected rules preview</strong></div>
          <div className="preview-stats">
            {species&&<span>Type: {species.config.creature_type??'Humanoid'}</span>}
            {species&&<span>Size: {species.config.size??'Medium'}</span>}
            {species&&<span>Speed: {Number(species.config.speed??30)+mods.speed} ft</span>}
            {career&&<span>Class Hit Die: d{career.config.hit_die??8}</span>}
            {background&&<span>Skills: {(background.config.proficiencies??[]).join(', ')||'Not specified'}</span>}
          </div>
          {features.length>0&&<div className="preview-features"><strong>{features.length} granted features at level {form.level}</strong>
            {features.map(({feature,source})=><div key={`${source.id}-${feature.id}`}><span>{feature.name}</span><small>{source.name} · {feature.config.activation?.replaceAll('_',' ')??'passive'}{feature.config.uses?` · ${feature.config.uses} uses`:''}</small></div>)}
          </div>}
          {(mods.ac||mods.max_hp||mods.initiative)&&<p className="hint">Unconditional bonuses preview: {mods.ac?`AC ${mods.ac>0?'+':''}${mods.ac} `:''}{mods.max_hp?`Maximum HP ${mods.max_hp>0?'+':''}${mods.max_hp} `:''}{mods.initiative?`Initiative ${mods.initiative>0?'+':''}${mods.initiative}`:''}. They are not yet applied to saved HP or combat rolls.</p>}
        </div>}
        <label className="field"><span>Notes</span><textarea value={form.notes} rows={4} onChange={e=>update('notes',e.target.value)} placeholder="Character's story, personality or special circumstances"/></label>
        <p className="hint">Published custom rules are selected by ID and their granted features follow level requirements. Manual species and class names remain supported for v0.1 characters.</p>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':'Save character'} <ArrowRight size={16}/></button></div>
      </form>
    </div>
  </div>
}
export function CharacterRules({character,definitions,grants}:{character:Character,definitions:HomebrewDefinition[],grants:HomebrewGrant[]}) {
  const features=grantedFeatures([character.species_id,character.class_id,character.background_id],character.level,definitions,grants)
  const mods=derivedModifiers(features)
  const species=definitions.find(d=>d.id===character.species_id)
  const career=definitions.find(d=>d.id===character.class_id)
  const background=definitions.find(d=>d.id===character.background_id)
  if(!features.length&&!species&&!career&&!background)return null
  return <details className="character-rules"><summary><Sparkles size={14}/> Homebrew rules ({features.length})</summary>
    <div className="character-rules-body">
      {species&&<p><strong>Species:</strong> {species.name} · {Number(species.config.speed??30)+mods.speed} ft speed</p>}
      {career&&<p><strong>Class:</strong> {career.name} · d{career.config.hit_die??8}</p>}
      {background&&<p><strong>Background:</strong> {background.name}</p>}
      {features.map(({feature,source})=><div key={`${source.id}-${feature.id}`} className="granted-feature"><strong>{feature.name}</strong><small>{source.name} · {feature.config.activation?.replaceAll('_',' ')??'passive'}</small><p>{feature.description||feature.summary||'No description provided.'}</p></div>)}
      {mods.max_hp!==0&&<p className="hint"><Heart size={12}/> Potential maximum HP modifier: {mods.max_hp>0?'+':''}{mods.max_hp} (preview only)</p>}
    </div>
  </details>
}
