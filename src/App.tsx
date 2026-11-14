import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Copy,
  Dices, Heart, Library, LoaderCircle, LockKeyhole, LogOut, Menu,
  Plus, RefreshCw, ScrollText, Shield, ShieldCheck, Sparkles, Trash2, Users, X
} from 'lucide-react'
import { configured, supabase } from './supabase'
import { type Campaign, type Character, type CharacterForm, type Member } from './types'
import HomebrewLibrary from './HomebrewLibrary'
import CharacterEditor, { CharacterRules } from './CharacterEditor'
import type { HomebrewDefinition, HomebrewGrant } from './homebrew'

const db = supabase!
function errText(error: unknown) { return error instanceof Error ? error.message : String(error) }
function Input({ label, value, onChange, placeholder = '', type = 'text', required = false, min, max }: {
  label: string, value: string | number, onChange: (value: string) => void,
  placeholder?: string, type?: string, required?: boolean, min?: number, max?: number
}) {
  return <label className="field"><span>{label}</span><input required={required} value={value} type={type} min={min} max={max} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></label>
}
function Modal({ title, children, close }: { title: string, children: ReactNode, close: () => void }) {
  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={close}><X size={19}/></button></div>
      {children}
    </div>
  </div>
}
function AuthScreen({ onMessage }: { onMessage: (s: string) => void }) {
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true)
    try {
      const result = mode === 'login'
        ? await db.auth.signInWithPassword({ email: email.trim(), password })
        : await db.auth.signUp({ email: email.trim(), password })
      if (result.error) throw result.error
      if (mode === 'signup') onMessage(result.data.session ? 'Account created.' : 'Check your email to confirm your account, then sign in.')
    } catch (error) { onMessage(errText(error)) }
    finally { setLoading(false) }
  }
  return <div className="auth-layout">
    <div className="auth-story"><div className="wordmark"><div className="brand-symbol"><Dices size={26}/></div> CHRONICLE<span className="brand-mini">VTT</span></div>
      <div className="hero-content"><div className="eyebrow"><span className="dot"/> A WORLD OF POSSIBILITIES</div><h1>Every legend<br/><em>starts somewhere.</em></h1>
        <p>Build worlds, tell stories and bring your characters to life. Your rules. Your realm. Your table.</p>
        <div className="hero-stats"><div><strong>01</strong><small>Create your world</small></div><div><strong>02</strong><small>Gather your party</small></div><div><strong>03</strong><small>Shape your story</small></div></div>
      </div><div className="hero-foot">CHRONICLE VTT <span>—</span> A NEW WAY TO PLAY</div>
    </div>
    <div className="auth-panel"><div className="auth-content"><div className="section-kicker">WELCOME TO CHRONICLE</div><h2>{mode === 'login' ? 'Enter your story.' : 'Begin your journey.'}</h2><p className="muted">{mode === 'login' ? 'Sign in to continue to your campaigns.' : 'Create an account to join or run a campaign.'}</p>
      <form className="form-stack" onSubmit={submit}>
        <Input label="Email address" type="email" value={email} onChange={setEmail} required placeholder="you@example.com" />
        <Input label="Password" type="password" value={password} onChange={setPassword} required placeholder="At least 6 characters" />
        <button className="button primary full" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17}/> : <><span>{mode === 'login' ? 'Sign in' : 'Create account'}</span><ArrowRight size={17}/></>}</button>
      </form>
      <p className="auth-switch">{mode === 'login' ? 'New to Chronicle?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </div><footer className="auth-bottom">Private playtest · Version 0.2</footer></div>
  </div>
}
function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [definitions, setDefinitions] = useState<HomebrewDefinition[]>([])
  const [grants, setGrants] = useState<HomebrewGrant[]>([])
  const [view, setView] = useState<'overview'|'homebrew'>('overview')
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create'|'join'|'character'|null>(null)
  const [editing, setEditing] = useState<Character | undefined>()
  const [campaignName, setCampaignName] = useState('')
  const [campaignDesc, setCampaignDesc] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!configured) return
    let mounted = true
    db.auth.getUser().then(({data,error}) => { if (mounted) { setUser(error ? null : data.user); setAuthReady(true) } })
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,session) => { setUser(session?.user ?? null); if(!session) {setCampaigns([]);setActiveId(null);setDefinitions([]);setGrants([])} })
    return ()=>{mounted=false;subscription.unsubscribe()}
  }, [])
  async function loadCampaigns() {
    const {data,error}=await db.from('campaigns').select('id,owner_id,name,description,created_at').order('created_at',{ascending:false})
    if(error) throw error
    setCampaigns((data??[]) as Campaign[])
  }
  useEffect(() => {if (!user) return; loadCampaigns().catch(e=>setNotice(errText(e)))}, [user])
  async function loadActive(id: string) {
    setLoading(true)
    try {
      const [chars,mem,inv,homebrew,links] = await Promise.all([
        db.from('characters').select('*').eq('campaign_id',id).order('created_at',{ascending:true}),
        db.from('campaign_members').select('*').eq('campaign_id',id),
        db.from('campaign_invites').select('code').eq('campaign_id',id).maybeSingle(),
        db.from('homebrew_definitions').select('*').eq('campaign_id',id).order('name'),
        db.from('homebrew_feature_links').select('*').eq('campaign_id',id)
      ])
      if(chars.error) throw chars.error
      if(mem.error) throw mem.error
      if(inv.error) throw inv.error
      if(homebrew.error) throw homebrew.error
      if(links.error) throw links.error
      setCharacters((chars.data??[]) as Character[])
      setMembers((mem.data??[]) as Member[])
      setInvite(inv.data?.code??'')
      setDefinitions((homebrew.data??[]) as HomebrewDefinition[])
      setGrants((links.data??[]) as HomebrewGrant[])
    } catch(e) {setNotice(errText(e))}
    finally {setLoading(false)}
  }
  useEffect(() => {if (activeId && user) void loadActive(activeId)}, [activeId,user])
  async function createCampaign(e:FormEvent) {
    e.preventDefault(); if(!user) return; setBusy(true)
    try {
      const {data,error}=await db.from('campaigns').insert({name:campaignName.trim(),description:campaignDesc.trim(),owner_id:user.id}).select('id').single()
      if(error)throw error
      await loadCampaigns();setActiveId(data.id);setModal(null);setCampaignName('');setCampaignDesc('');setNotice('Campaign created. Share its invite code with your players.')
    }catch(e){setNotice(errText(e))}finally{setBusy(false)}
  }
  async function joinCampaign(e:FormEvent) {
    e.preventDefault();setBusy(true)
    try {
      const {data,error}=await db.rpc('join_campaign',{p_code:inviteInput.trim()})
      if(error)throw error
      await loadCampaigns();setActiveId(data as string);setModal(null);setInviteInput('');setNotice('You have joined the campaign.')
    }catch(e){setNotice(errText(e))}finally{setBusy(false)}
  }
  async function saveCharacter(form:CharacterForm) {
    if(!user||!activeId)return
    if(form.current_hp > form.max_hp) {setNotice('Current HP cannot exceed maximum HP.');return}
    setBusy(true)
    try {
      const payload={...form,name:form.name.trim(),species_name:form.species_name.trim(),class_name:form.class_name.trim()}
      const result = editing
        ? await db.from('characters').update(payload).eq('id',editing.id)
        : await db.from('characters').insert({...payload,campaign_id:activeId,created_by:user.id})
      if(result.error)throw result.error
      await loadActive(activeId);setEditing(undefined);setModal(null);setNotice(editing?'Character updated.':'Character created.')
    }catch(e){setNotice(errText(e))}finally{setBusy(false)}
  }
  async function removeCharacter(c:Character) {
    if(!activeId||!window.confirm(`Delete ${c.name}? This cannot be undone.`))return
    setBusy(true)
    try {const {error}=await db.from('characters').delete().eq('id',c.id);if(error)throw error;await loadActive(activeId);setNotice('Character deleted.')}
    catch(e){setNotice(errText(e))}finally{setBusy(false)}
  }
  async function copyInvite(){try {await navigator.clipboard.writeText(invite);setNotice('Invitation code copied.')}catch{setNotice('Could not copy automatically. Select and copy the code shown.') }}
  const active=campaigns.find(c=>c.id===activeId)
  const isDm=Boolean(active&&user&&active.owner_id===user.id)
  if(!configured)return <div className="setup-screen"><div className="brand-symbol"><Dices size={32}/></div><h1>Chronicle needs a database.</h1><p>Create a new Supabase project, run the included SQL migration and add your project URL and publishable key to <code>.env.local</code>.</p><div className="setup-code">VITE_SUPABASE_URL=…<br/>VITE_SUPABASE_PUBLISHABLE_KEY=…</div><p className="muted small">See README.md for the complete setup instructions. Your existing projects should remain untouched.</p></div>
  if(!authReady)return <div className="loading-screen"><LoaderCircle className="spin" size={32}/><span>Opening Chronicle…</span></div>
  if(!user)return <><AuthScreen onMessage={setNotice}/>{notice&&<div className="toast"><span>{notice}</span><button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={16}/></button></div>}</>
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen?'opened':''}`}>
      <div className="sidebar-top"><div className="wordmark"><div className="brand-symbol"><Dices size={23}/></div> CHRONICLE<span className="brand-mini">VTT</span></div><button className="icon-button sidebar-close" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav><button className={`nav-link ${!activeId?'selected':''}`} onClick={()=>{setActiveId(null);setView('overview');setSidebarOpen(false)}}><Library size={18}/> Overview</button>
        <button className={`nav-link ${activeId&&view==='homebrew'?'selected':''}`} disabled={!activeId} title={activeId?'Open campaign rulebook':'Select a campaign first'} onClick={()=>{setView('homebrew');setSidebarOpen(false)}}><BookOpen size={18}/> Homebrew Library</button>
        <button className="nav-link" disabled title="Coming in v0.4"><Shield size={18}/> Tabletop <span className="soon">SOON</span></button>
      </nav>
      <div className="sidebar-label campaign-heading">YOUR CAMPAIGNS <button aria-label="Create campaign" onClick={()=>setModal('create')}><Plus size={16}/></button></div>
      <nav className="campaign-nav">{campaigns.map(c=><button key={c.id} className={`nav-link campaign-link ${activeId===c.id?'selected':''}`} onClick={()=>{setActiveId(c.id);setView('overview');setSidebarOpen(false)}}><span className="campaign-letter">{c.name.charAt(0).toUpperCase()}</span><span className="ellipsis">{c.name}</span></button>)}
        {!campaigns.length&&<p className="sidebar-empty">No campaigns yet.</p>}
      </nav>
      <div className="sidebar-bottom"><div className="release-chip"><span className="dot"/> PRIVATE PLAYTEST · v0.2</div><button className="user-row" onClick={()=>db.auth.signOut()} title="Sign out"><span className="user-avatar">{(user.email||'U')[0].toUpperCase()}</span><span className="user-details"><strong>{user.email?.split('@')[0]}</strong><small>Sign out</small></span><LogOut size={17}/></button></div>
    </aside>
    <main className="main-panel"><div className="mobile-top"><button className="icon-button" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu/></button><span className="wordmark">CHRONICLE <span className="brand-mini">VTT</span></span></div>
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{active ? (view==='homebrew'?`${active.name} · Rules`:active.name) : 'Overview'}</strong></div><div className="topbar-right"><span className="status-online"><span className="dot"/> Online</span><span className="top-avatar">{user.email?.charAt(0).toUpperCase()}</span></div></header>
      {!active ? <div className="page-content">
        <div className="eyebrow dark">CAMPAIGN CONTROL CENTER</div><div className="page-heading"><div><h1>Your stories start here.</h1><p>Manage your worlds, gather your party, and make the impossible happen.</p></div></div>
        <div className="welcome-banner"><div><div className="eyebrow">WELCOME TO CHRONICLE VTT</div><h2>A universe of stories<br/><em>waiting to unfold.</em></h2><p>Build a campaign and invite your friends. Your first adventure is just a few clicks away.</p><button className="button light" onClick={()=>setModal('create')}>Create a campaign <ArrowRight size={17}/></button></div><div className="banner-mark">C</div></div>
        <div className="content-heading"><div><h2>Campaigns</h2><p>{campaigns.length} {campaigns.length===1?'world':'worlds'} in your collection</p></div><button className="button outline" onClick={()=>setModal('join')}><Users size={16}/> Join with code</button></div>
        <div className="campaign-grid">{campaigns.map(c=><button className="campaign-card" onClick={()=>{setActiveId(c.id);setView('overview')}} key={c.id}><div className="campaign-card-cover"><div className="cover-orb">{c.name[0]?.toUpperCase()}</div><span className="cover-tag">{c.owner_id===user.id?'GAME MASTER':'PLAYER'}</span></div><div className="campaign-card-body"><h3>{c.name}</h3><p>{c.description||'A world waiting to be explored.'}</p><span className="card-open">Open campaign <ArrowRight size={15}/></span></div></button>)}
          <button className="campaign-card new-card" onClick={()=>setModal('create')}><span className="large-plus"><Plus size={25}/></span><strong>Create a new campaign</strong><span>Every great story needs a beginning.</span></button>
        </div>
        <div className="footer-note"><CircleHelp size={16}/> Your data is stored in your own Supabase project. New features are being developed in stages.</div>
      </div> : view==='homebrew' ? <HomebrewLibrary campaignId={active.id} isDm={isDm} definitions={definitions} grants={grants} onRefresh={()=>loadActive(active.id)} onNotice={setNotice}/> : <div className="page-content">
        <button className="back-link" onClick={()=>setActiveId(null)}><ArrowLeft size={15}/> All campaigns</button>
        <div className="campaign-titlebar"><div><div className="eyebrow dark">{isDm?'GAME MASTER DASHBOARD':'CAMPAIGN PLAYER AREA'}</div><h1>{active.name}</h1><p>{active.description||'A new adventure is about to begin.'}</p></div><span className="role-tag"><ShieldCheck size={16}/>{isDm?'Game Master':'Player'}</span></div>
        <div className="metric-grid"><div className="metric-card"><span><Users size={17}/> Party members</span><strong>{members.length}</strong><small>Characters ready for adventure</small></div><div className="metric-card"><span><ScrollText size={17}/> Characters</span><strong>{characters.length}</strong><small>Across your campaign</small></div><div className="metric-card"><span><Sparkles size={17}/> Ruleset</span><strong className="metric-word">5e-compatible</strong><small>{definitions.length} homebrew entries</small></div></div>
        <div className="content-heading"><div><h2>Character roster</h2><p>Explore the heroes of your story.</p></div><div className="heading-actions"><button className="button outline" title="Refresh roster" onClick={()=>loadActive(active.id)}><RefreshCw size={16}/></button><button className="button primary" onClick={()=>{setEditing(undefined);setModal('character')}}><Plus size={17}/> New character</button></div></div>
        {loading?<div className="empty-state"><LoaderCircle className="spin"/> Loading party…</div>:characters.length===0?<div className="empty-state"><div className="empty-icon"><Users size={28}/></div><h3>Your party is waiting.</h3><p>Create the first character to begin populating your world.</p><button className="button primary" onClick={()=>{setEditing(undefined);setModal('character')}}><Plus size={16}/> Create character</button></div>:
          <div className="character-grid">{characters.map(c=><article className="character-card" key={c.id}><div className="character-icon">{c.name.charAt(0).toUpperCase()}</div><div className="character-meta"><span className="overline">LEVEL {c.level}</span><h3>{c.name}</h3><p>{c.species_name} · {c.class_name}</p><div className="hp-line"><Heart size={15}/> {c.current_hp} / {c.max_hp} HP</div><CharacterRules character={c} definitions={definitions} grants={grants}/></div><div className="character-actions">{(c.created_by===user.id||isDm)&&<><button className="text-button" onClick={()=>{setEditing(c);setModal('character')}}>Edit</button><button className="icon-button danger" disabled={busy} aria-label={`Delete ${c.name}`} onClick={()=>removeCharacter(c)}><Trash2 size={17}/></button></>}</div></article>)}</div>}
        <div className="lower-grid"><section className="panel"><div className="panel-title"><Users size={18}/><h3>Party members</h3></div>{members.map(m=><div className="member-row" key={m.user_id}><span className="member-avatar">{m.user_id===user.id?'Y':'P'}</span><span>{m.user_id===user.id?'You':`Player ${m.user_id.slice(0,6)}`}</span><span className={`member-badge ${m.role==='dm'?'gm':''}`}>{m.role==='dm'?'DM':'PLAYER'}</span></div>)}</section>
          <section className="panel"><div className="panel-title"><LockKeyhole size={18}/><h3>Campaign access</h3></div>{isDm?<><p className="muted small">Share this private code with players you trust. Anyone with it can join your campaign.</p><div className="invite-code"><code>{invite||'Loading…'}</code><button onClick={copyInvite} disabled={!invite} title="Copy code"><Copy size={18}/></button></div></>:<><p className="muted small">You have access as a campaign player. Ask your DM for the invite code to bring another player into the party.</p><div className="access-note"><Check size={16}/> Membership active</div></>}</section></div>
      </div>}
    </main>
    {modal==='create'&&<Modal title="Create a campaign" close={()=>setModal(null)}><form className="form-stack" onSubmit={createCampaign}><Input label="Campaign name" required value={campaignName} onChange={setCampaignName} placeholder="The Unwritten Timeline"/><label className="field"><span>Description</span><textarea value={campaignDesc} rows={4} placeholder="What sort of story awaits your party?" onChange={e=>setCampaignDesc(e.target.value)} /></label><p className="hint">You'll be the Game Master. Once created, you'll get a private code to invite your players.</p><div className="modal-actions"><button className="button ghost" type="button" onClick={()=>setModal(null)}>Cancel</button><button disabled={busy} className="button primary">{busy?'Creating…':'Create campaign'} <ArrowRight size={16}/></button></div></form></Modal>}
    {modal==='join'&&<Modal title="Join a campaign" close={()=>setModal(null)}><form className="form-stack" onSubmit={joinCampaign}><p className="muted small">Enter the private invitation code shared by your Game Master.</p><Input required label="Invitation code" placeholder="Paste your code" value={inviteInput} onChange={setInviteInput}/><div className="modal-actions"><button className="button ghost" type="button" onClick={()=>setModal(null)}>Cancel</button><button disabled={busy} className="button primary">{busy?'Joining…':'Join campaign'} <ArrowRight size={16}/></button></div></form></Modal>}
    {modal==='character'&&<CharacterEditor value={editing} busy={busy} definitions={definitions} grants={grants} onClose={()=>{setModal(null);setEditing(undefined)}} onSave={saveCharacter}/>}
    {notice&&<div className="toast"><span>{notice}</span><button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={16}/></button></div>}
  </div>
}
export default App
