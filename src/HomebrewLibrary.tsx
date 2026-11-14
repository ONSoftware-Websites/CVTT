import { useState, type FormEvent } from 'react'
import { BookOpen, Check, ChevronRight, FilePlus2, LoaderCircle, Pencil, Plus, Save, Shield, Trash2, X } from 'lucide-react'
import { supabase } from './supabase'
import {
  blankDefinition, csvList, kindNames, kinds, type DefinitionInput, type GrantInput,
  type HomebrewDefinition, type HomebrewGrant, type HomebrewKind,
  type ModifierStat, type RulesConfig, type RulesModifier
} from './homebrew'

const db = supabase!
const modifierStats: ModifierStat[] = ['speed','max_hp','ac','initiative']
const activationOptions = ['passive','action','bonus_action','reaction','special'] as const
const rechargeOptions = ['none','short_rest','long_rest','dawn','special'] as const
const pretty = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase())

interface Props {
  campaignId: string
  isDm: boolean
  definitions: HomebrewDefinition[]
  grants: HomebrewGrant[]
  onRefresh: () => Promise<void>
  onNotice: (notice:string) => void
}
function TextField({ label, value, onChange, placeholder='', required=false, type='text', min, max }:{
  label:string, value:string|number, onChange:(v:string)=>void, placeholder?:string,
  required?:boolean, type?:string, min?:number, max?:number
}) {
  return <label className="field"><span>{label}</span><input value={value} type={type} min={min} max={max} required={required} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>
}
function SelectField({label, value, onChange, options}:{ label:string,value:string,onChange:(v:string)=>void,options:Array<{value:string,label:string}> }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
}
function parseError(error:unknown):string {return error instanceof Error?error.message:String(error)}

export default function HomebrewLibrary({campaignId,isDm,definitions,grants,onRefresh,onNotice}:Props) {
  const [kind,setKind] = useState<HomebrewKind>('species')
  const [editing,setEditing] = useState<HomebrewDefinition|null>(null)
  const [form,setForm] = useState<DefinitionInput|null>(null)
  const [linked,setLinked] = useState<GrantInput[]>([])
  const [busy,setBusy] = useState(false)
  const [showDrafts,setShowDrafts] = useState(true)

  function startCreate(k:HomebrewKind=kind){setKind(k);setEditing(null);setForm(blankDefinition(k));setLinked([])}
  function startEdit(def:HomebrewDefinition) {
    setKind(def.kind);setEditing(def)
    setForm({kind:def.kind,name:def.name,summary:def.summary,description:def.description,status:def.status,config:structuredClone(def.config)})
    setLinked(grants.filter(g=>g.parent_definition_id===def.id).map(g=>({feature_definition_id:g.feature_definition_id,unlock_level:g.unlock_level})))
  }
  function setField<K extends keyof DefinitionInput>(field:K,value:DefinitionInput[K]){
    setForm(old=>old?{...old,[field]:value}:old)
  }
  function cfg<K extends keyof RulesConfig>(field:K, value:RulesConfig[K]){
    setForm(old=>old?{...old,config:{...old.config,[field]:value}}:old)
  }
  function changeModifier(index:number, patch:Partial<RulesModifier>){
    if(!form)return
    cfg('modifiers',(form.config.modifiers??[]).map((m,i)=>i===index?{...m,...patch}:m))
  }
  async function save(e:FormEvent){
    e.preventDefault(); if(!form||!isDm)return
    if(form.name.trim().length<2){onNotice('A homebrew entry needs a name of at least 2 characters.');return}
    if(form.kind!=='feature' && linked.some(g=>g.unlock_level<1||g.unlock_level>20)){
      onNotice('Feature unlock levels must be between 1 and 20.');return
    }
    setBusy(true)
    try{
      const data={...form,name:form.name.trim(),summary:form.summary.trim(),description:form.description.trim()}
      let id=editing?.id
      if(editing){
        const {error}=await db.from('homebrew_definitions').update(data).eq('id',editing.id).eq('campaign_id',campaignId)
        if(error)throw error
      }else{
        const {data:inserted,error}=await db.from('homebrew_definitions')
          .insert({...data,campaign_id:campaignId,created_by:(await db.auth.getUser()).data.user?.id}).select('id').single()
        if(error)throw error
        id=inserted.id
      }
      if(!id)throw new Error('Could not identify the saved entry.')
      if(form.kind!=='feature'){
        const old=grants.filter(g=>g.parent_definition_id===id)
        const target=new Map(linked.map(g=>[g.feature_definition_id,g.unlock_level]))
        const toRemove=old.filter(g=>!target.has(g.feature_definition_id)||target.get(g.feature_definition_id)!==g.unlock_level)
        const toAdd=linked.filter(g=>!old.some(prev=>prev.feature_definition_id===g.feature_definition_id&&prev.unlock_level===g.unlock_level))
        if(toRemove.length){
          const {error}=await db.from('homebrew_feature_links').delete().in('id',toRemove.map(g=>g.id))
          if(error)throw error
        }
        if(toAdd.length){
          const {error}=await db.from('homebrew_feature_links').insert(toAdd.map(g=>({campaign_id:campaignId,parent_definition_id:id,feature_definition_id:g.feature_definition_id,unlock_level:g.unlock_level})))
          if(error)throw error
        }
      }
      await onRefresh();setForm(null);setEditing(null);onNotice(`${form.name} saved to the ${form.status} homebrew library.`)
    }catch(error){onNotice(`Homebrew save failed: ${parseError(error)}`);await onRefresh().catch(()=>undefined)}
    finally{setBusy(false)}
  }
  async function remove(def:HomebrewDefinition){
    if(!isDm||!window.confirm(`Delete ${def.name}? Existing characters keep their name labels, but linked features will be removed. This cannot be undone.`))return
    setBusy(true)
    try{
      const {error}=await db.from('homebrew_definitions').delete().eq('id',def.id).eq('campaign_id',campaignId)
      if(error)throw error
      await onRefresh();onNotice(`${def.name} deleted.`)
    }catch(error){onNotice(`Could not delete: ${parseError(error)}`)}finally{setBusy(false)}
  }
  const filtered=definitions.filter(d=>d.kind===kind&&(showDrafts||d.status==='published')).sort((a,b)=>a.name.localeCompare(b.name))
  const availableFeatures=definitions.filter(d=>d.kind==='feature'&&(!editing||d.id!==editing.id))
  return <div className="page-content">
    <div className="eyebrow dark">CAMPAIGN RULEBOOK</div>
    <div className="page-heading homebrew-page-title"><div><h1>Homebrew Library</h1><p>Build your own species, classes, backgrounds and special features. Published rules become available in character creation.</p></div>
      {isDm&&<button className="button primary" onClick={()=>startCreate()}><Plus size={17}/> New entry</button>}</div>
    <div className="rules-note"><Shield size={17}/><span>{isDm?'Drafts are only visible to campaign DMs. Publish an entry to let players select it.':'This library contains the campaign rules published by your DM.'}</span></div>
    <div className="homebrew-tabs" role="tablist" aria-label="Homebrew categories">
      {kinds.map(k=><button key={k} role="tab" aria-selected={kind===k} className={kind===k?'active':''} onClick={()=>{setKind(k);setForm(null)}}>{kindNames[k]} <span>{definitions.filter(d=>d.kind===k).length}</span></button>)}
    </div>
    {isDm&&<label className="homebrew-show-drafts"><input type="checkbox" checked={showDrafts} onChange={e=>setShowDrafts(e.target.checked)}/> Show unpublished drafts</label>}
    {filtered.length===0?<div className="empty-state homebrew-empty"><BookOpen size={26}/><h3>No {kindNames[kind].toLowerCase()} yet</h3><p>{isDm?'Create your first entry to begin your custom campaign rulebook.':'Your DM has not published any entries in this category.'}</p>
      {isDm&&<button className="button primary" onClick={()=>startCreate()}><FilePlus2 size={16}/> Create {kind==='class'?'class':kind}</button>}</div>:
      <div className="homebrew-grid">{filtered.map(def=><article className="homebrew-card" key={def.id}>
        <div className="homebrew-card-head"><div className="homebrew-kind">{pretty(def.kind)}</div><span className={`homebrew-status ${def.status}`}>{def.status}</span></div>
        <h3>{def.name}</h3><p>{def.summary||def.description||'No description provided.'}</p>
        <div className="homebrew-details">
          {def.kind==='species'&&<span>{def.config.size??'Medium'} · {def.config.speed??30} ft</span>}
          {def.kind==='class'&&<span>d{def.config.hit_die??8} Hit Die</span>}
          {def.kind==='feature'&&<span>{pretty(def.config.activation??'passive')}</span>}
          {def.kind!=='feature'&&<span>{grants.filter(g=>g.parent_definition_id===def.id).length} linked features</span>}
        </div>
        {def.description&&<details className="homebrew-expand"><summary>Read full description <ChevronRight size={14}/></summary><p className="preline">{def.description}</p></details>}
        {isDm&&<div className="homebrew-actions"><button className="button outline" onClick={()=>startEdit(def)}><Pencil size={15}/> Edit</button><button className="icon-button danger" aria-label={`Delete ${def.name}`} disabled={busy} onClick={()=>void remove(def)}><Trash2 size={17}/></button></div>}
      </article>)}</div>}
    {form&&isDm&&<div className="overlay" onMouseDown={e=>{if(e.currentTarget===e.target)setForm(null)}}>
      <div className="modal homebrew-modal" role="dialog" aria-modal="true" aria-label={editing?'Edit homebrew entry':'Create homebrew entry'}>
        <div className="modal-head"><h2>{editing?'Edit':'Create'} {pretty(form.kind)}</h2><button className="icon-button" onClick={()=>setForm(null)} aria-label="Close editor"><X size={20}/></button></div>
        <form onSubmit={e=>void save(e)} className="form-stack">
          {!editing&&<SelectField label="Category" value={form.kind} onChange={v=>{setForm(blankDefinition(v as HomebrewKind));setLinked([])}} options={kinds.map(k=>({value:k,label:kindNames[k]}))}/>}
          <TextField label="Name" required value={form.name} onChange={v=>setField('name',v)} placeholder="e.g. Gallifreyan" />
          <TextField label="Short description" value={form.summary} onChange={v=>setField('summary',v)} placeholder="A concise description for cards and choices"/>
          <label className="field"><span>Rules description</span><textarea rows={5} value={form.description} onChange={e=>setField('description',e.target.value)} placeholder="Lore, limitations and detailed gameplay rules"/></label>
          {form.kind==='species'&&<div className="rules-editor-group"><h3>Species statistics</h3><div className="form-three">
            <TextField label="Creature type" value={form.config.creature_type??''} onChange={v=>cfg('creature_type',v)}/>
            <SelectField label="Size" value={form.config.size??'Medium'} onChange={v=>cfg('size',v)} options={['Small','Medium','Large'].map(x=>({value:x,label:x}))}/>
            <TextField label="Speed (ft)" type="number" min={0} max={120} value={form.config.speed??30} onChange={v=>cfg('speed',Math.min(120,Math.max(0,Number(v))))}/>
          </div><TextField label="Languages (comma-separated)" value={(form.config.languages??[]).join(', ')} onChange={v=>cfg('languages',csvList(v))} placeholder="Gallifreyan, Common"/></div>}
          {form.kind==='class'&&<div className="rules-editor-group"><h3>Class statistics</h3><SelectField label="Hit Die" value={String(form.config.hit_die??8)} onChange={v=>cfg('hit_die',Number(v))} options={[6,8,10,12].map(n=>({value:String(n),label:`d${n}`}))}/>
            <TextField label="Primary abilities (comma-separated)" value={(form.config.primary_abilities??[]).join(', ')} onChange={v=>cfg('primary_abilities',csvList(v))} placeholder="INT, WIS"/>
            <TextField label="Proficiencies (comma-separated)" value={(form.config.proficiencies??[]).join(', ')} onChange={v=>cfg('proficiencies',csvList(v))} placeholder="Investigation, History, Light armour"/>
            <TextField label="Starting equipment" value={form.config.starting_equipment??''} onChange={v=>cfg('starting_equipment',v)}/></div>}
          {form.kind==='background'&&<div className="rules-editor-group"><h3>Background statistics</h3><TextField label="Proficiencies (comma-separated)" value={(form.config.proficiencies??[]).join(', ')} onChange={v=>cfg('proficiencies',csvList(v))} placeholder="History, Arcana"/>
            <TextField label="Starting equipment" value={form.config.starting_equipment??''} onChange={v=>cfg('starting_equipment',v)} placeholder="A piece of technology, traveller's clothes"/></div>}
          {form.kind==='feature'&&<div className="rules-editor-group"><h3>Ability configuration</h3><div className="form-two">
            <SelectField label="Activation" value={form.config.activation??'passive'} onChange={v=>cfg('activation',v as RulesConfig['activation'])} options={activationOptions.map(v=>({value:v,label:pretty(v)}))}/>
            <SelectField label="Recharge" value={form.config.recharge??'none'} onChange={v=>cfg('recharge',v as RulesConfig['recharge'])} options={rechargeOptions.map(v=>({value:v,label:pretty(v)}))}/>
          </div><TextField label="Uses per recharge (0 = unrestricted)" type="number" min={0} max={99} value={form.config.uses??0} onChange={v=>cfg('uses',Math.min(99,Math.max(0,Number(v))))}/>
          <TextField label="Prerequisites / conditions (manual ruling)" value={form.config.prerequisites??''} onChange={v=>cfg('prerequisites',v)} placeholder="e.g. Only while touching a willing target"/>
          <div className="modifier-heading"><h4>Numeric modifiers</h4><button className="button outline" type="button" onClick={()=>cfg('modifiers',[...(form.config.modifiers??[]),{stat:'speed',amount:0}])}><Plus size={14}/> Modifier</button></div>
          {(form.config.modifiers??[]).map((mod,i)=><div className="modifier-row" key={i}>
            <select aria-label="Modifier statistic" value={mod.stat} onChange={e=>changeModifier(i,{stat:e.target.value as ModifierStat})}>{modifierStats.map(s=><option value={s} key={s}>{pretty(s)}</option>)}</select>
            <input aria-label="Modifier amount" type="number" min={-1000} max={1000} value={mod.amount} onChange={e=>changeModifier(i,{amount:Number(e.target.value)})}/>
            <input aria-label="Condition (optional)" placeholder="Condition (optional)" value={mod.condition??''} onChange={e=>changeModifier(i,{condition:e.target.value})}/>
            <button type="button" className="icon-button danger" title="Remove modifier" onClick={()=>cfg('modifiers',(form.config.modifiers??[]).filter((_,j)=>j!==i))}><X size={16}/></button>
          </div>)}
          <p className="hint">Only unconditional numeric modifiers are totalled in the v0.2 character preview. Other abilities remain descriptive until the v0.3 rules engine.</p></div>}
          {form.kind!=='feature'&&<div className="rules-editor-group"><h3>Granted features</h3>
            <p className="hint">Create features in the Features tab first, then link them here. Unlock level 1 applies immediately; class features can be awarded at later levels.</p>
            {availableFeatures.length===0&&<p className="muted small">No features created yet. Save this entry and add features later.</p>}
            {availableFeatures.map(f=>{
              const value=linked.find(g=>g.feature_definition_id===f.id)
              return <div className="grant-row" key={f.id}><label><input type="checkbox" checked={Boolean(value)} onChange={e=>setLinked(old=>e.target.checked?[...old,{feature_definition_id:f.id,unlock_level:1}]:old.filter(g=>g.feature_definition_id!==f.id))}/>
                <span>{f.name} <small>{f.status==='draft'?'· Draft (invisible to players)':''}</small></span></label>
                {value&&<label>Level <input type="number" min={1} max={20} value={value.unlock_level} onChange={e=>setLinked(old=>old.map(g=>g.feature_definition_id===f.id?{...g,unlock_level:Number(e.target.value)}:g))}/></label>}
              </div>
            })}</div>}
          <SelectField label="Publication" value={form.status} onChange={v=>setField('status',v as 'draft'|'published')} options={[{value:'draft',label:'Draft — DM only'},{value:'published',label:'Published — available to players'}]}/>
          <div className="modal-actions"><button className="button ghost" type="button" onClick={()=>setForm(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>} Save {pretty(form.kind)}</button></div>
        </form>
      </div>
    </div>}
    <div className="footer-note"><Check size={16}/> Homebrew definitions are saved only within this campaign. Existing character records are preserved.</div>
  </div>
}
