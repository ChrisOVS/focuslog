/* =====================================================================
   FocusLog — study timer, planner & insights (offline-first PWA)
   Single-file app logic. Data in localStorage, optional Supabase sync.
   ===================================================================== */
'use strict';

/* ---------- tiny helpers ---------- */
const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const nowIso = () => new Date().toISOString();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const EXAM_COLORS = ['#6366f1','#22d3ee','#34d399','#f59e0b','#f472b6',
                     '#a78bfa','#fb7185','#38bdf8','#4ade80','#facc15'];
const WD_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad(n){ return String(n).padStart(2,'0'); }
function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function dateKey(iso){ const d=new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x=startOfDay(d); const wd=(x.getDay()+6)%7; return addDays(x,-wd); } // Monday
function daysBetween(a,b){ return Math.round((startOfDay(b)-startOfDay(a))/86400000); }

function fmtClock(sec){
  sec = Math.max(0, Math.floor(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return h>0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtDur(sec){
  const m=Math.round(sec/60);
  if(m<60) return `${m}m`;
  const h=Math.floor(m/60), mm=m%60;
  return mm? `${h}h ${pad(mm)}m` : `${h}h`;
}
function fmtMin(min){ return fmtDur(min*60); }

function toast(msg){
  const t=$('toast'); t.textContent=msg; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(()=>{ t.hidden=true; }, 2600);
}

/* ---------- state + storage ---------- */
const STORE_KEY = 'focuslog.v1';
const DEFAULT_SETTINGS = {
  accent:'indigo', breakEvery:25, longWarn:90,
  sound:true, voice:true, notif:false, autoSync:true
};
let S = { exams:[], sessions:[], plans:[], settings:{...DEFAULT_SETTINGS},
          sync:{ url:'', key:'', email:'', lastSyncAt:null }, meta:{} };

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const d = JSON.parse(raw);
      S.exams    = d.exams    || [];
      S.sessions = d.sessions || [];
      S.plans    = d.plans    || [];
      S.settings = {...DEFAULT_SETTINGS, ...(d.settings||{})};
      S.sync     = {...S.sync, ...(d.sync||{})};
      S.meta     = d.meta || {};
    }
  }catch(e){ console.warn('load failed', e); }
}
function save(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch(e){ console.warn('save failed', e); }
}

/* active (non-deleted) helpers */
const activeExams    = () => S.exams.filter(e=>!e.deleted);
const activeSessions = () => S.sessions.filter(s=>!s.deleted);
const activePlans    = () => S.plans.filter(p=>!p.deleted);
const examById = (id) => S.exams.find(e=>e.id===id);
const examName = (id) => { const e=examById(id); return e ? e.name : (id? '(removed)' : 'No exam'); };
const examColor = (id) => { const e=examById(id); return e ? e.color : '#6f7596'; };

/* ---------- CRUD (with sync metadata) ---------- */
function upsertExam(o){
  const i=S.exams.findIndex(e=>e.id===o.id);
  o.updatedAt=nowIso();
  if(i>=0) S.exams[i]={...S.exams[i],...o}; else S.exams.push(o);
  save();
}
function addSession(o){
  o.id=o.id||uid(); o.deleted=false; o.updatedAt=nowIso();
  S.sessions.push(o); save();
}
function updateSession(id,patch){
  const s=S.sessions.find(x=>x.id===id); if(!s)return;
  Object.assign(s,patch); s.updatedAt=nowIso(); save();
}
function delSession(id){ updateSession(id,{deleted:true}); }
function addPlan(o){ o.id=uid(); o.deleted=false; o.done=false; o.updatedAt=nowIso(); S.plans.push(o); save(); }
function delPlan(id){ const p=S.plans.find(x=>x.id===id); if(p){ p.deleted=true; p.updatedAt=nowIso(); save(); } }

/* =====================================================================
   NAVIGATION
   ===================================================================== */
let currentView='timer';
function setView(v){
  currentView=v;
  $$('.view').forEach(s=>s.classList.toggle('active', s.id==='view-'+v));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  $$('.bn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  if(v==='plan')     renderPlan();
  if(v==='insights') renderInsights();
  if(v==='log')      renderLog();
  if(v==='settings') renderSettings();
  window.scrollTo({top:0,behavior:'instant'});
}
function wireNav(){
  $$('.nav-btn, .bn').forEach(b=> b.addEventListener('click',()=>setView(b.dataset.view)));
}

/* =====================================================================
   ANNOUNCEMENTS  (chime + voice + notification + banner)
   ===================================================================== */
let audioCtx=null;
function chime(){
  if(!S.settings.sound) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const seq=[[880,0],[1175,0.16],[1568,0.32]];
    seq.forEach(([f,t])=>{
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='sine'; o.frequency.value=f;
      const t0=audioCtx.currentTime+t;
      g.gain.setValueAtTime(0,t0);
      g.gain.linearRampToValueAtTime(0.18,t0+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0+0.45);
    });
  }catch(e){/* ignore */}
}
function speak(text){
  if(!S.settings.voice || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.rate=1.0; u.pitch=1.0; u.volume=1.0;
    speechSynthesis.speak(u);
  }catch(e){/* ignore */}
}
function notify(title, body){
  if(!S.settings.notif) return;
  try{ if('Notification' in window && Notification.permission==='granted')
        new Notification(title,{body, icon:'icon-192.png', badge:'icon-192.png', tag:'focuslog'}); }
  catch(e){/* ignore */}
}
let bannerTimer=null;
function showBanner(icon,title,sub){
  $('bannerIcon').textContent=icon;
  $('bannerTitle').textContent=title;
  $('bannerSub').textContent=sub;
  $('banner').hidden=false;
  clearTimeout(bannerTimer); bannerTimer=setTimeout(()=>{ $('banner').hidden=true; }, 14000);
}
function announce({icon,title,sub,say}){
  chime(); speak(say||`${title}. ${sub||''}`); notify(title,sub||''); showBanner(icon,title,sub||'');
}

/* =====================================================================
   TIMER ENGINE
   ===================================================================== */
const RING_CIRC = 2*Math.PI*108;
const timer = {
  mode:'stopwatch', targetSec:50*60,
  running:false, accumulated:0, runStart:0,
  startedAtIso:null, pauses:0,
  breakOn:true, breakEvery:25*60, nextBreak:25*60,
  longWarnSec:90*60, longWarned:false, targetHit:false,
  interval:null
};
function timerElapsed(){
  return timer.accumulated + (timer.running ? (Date.now()-timer.runStart)/1000 : 0);
}
function timerStart(){
  if(timer.running) return;
  if(!timer.startedAtIso) timer.startedAtIso = nowIso();
  // sync config from inputs/settings
  timer.breakOn   = $('breakOn').checked;
  timer.breakEvery= Math.max(1, (S.settings.breakEvery||25))*60;
  if(timer.nextBreak <= timerElapsed()) timer.nextBreak = Math.ceil((timerElapsed()+1)/timer.breakEvery)*timer.breakEvery;
  if(!timer.accumulated) timer.nextBreak = timer.breakEvery;
  timer.longWarnSec=(S.settings.longWarn||0)*60;
  timer.running=true; timer.runStart=Date.now();
  $('btnStart').textContent='Pause';
  $('ringWrapEl').classList.add('run');
  $('btnFinish').disabled=false;
  if(!timer.interval) timer.interval=setInterval(timerTick,500);
  // unlock audio on first user gesture
  try{ audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume(); }catch(e){}
}
function timerPause(){
  if(!timer.running) return;
  timer.accumulated += (Date.now()-timer.runStart)/1000;
  timer.running=false; timer.pauses++;
  $('btnStart').textContent='Resume';
  $('ringWrapEl').classList.remove('run');
  timerRender();
}
function timerToggle(){ timer.running ? timerPause() : timerStart(); }
function timerReset(){
  timer.running=false; timer.accumulated=0; timer.runStart=0;
  timer.startedAtIso=null; timer.pauses=0; timer.longWarned=false; timer.targetHit=false;
  timer.nextBreak=timer.breakEvery;
  clearInterval(timer.interval); timer.interval=null;
  $('btnStart').textContent='Start';
  $('ringWrapEl').classList.remove('run');
  $('btnFinish').disabled=true;
  timerRender();
}
function timerTick(){
  const el=timerElapsed();
  // break reminders
  if(timer.running && timer.breakOn && timer.breakEvery>0){
    while(el >= timer.nextBreak){
      const mins=Math.round(timer.nextBreak/60);
      announce({icon:'☕', title:'Time for a break',
        sub:`You've focused for ${mins} minutes. Stand up, breathe, then come back.`,
        say:`You've done ${mins} minutes. Time for a short break.`});
      timer.nextBreak += timer.breakEvery;
    }
  }
  // long-session nudge
  if(timer.running && timer.longWarnSec>0 && !timer.longWarned && el>=timer.longWarnSec){
    timer.longWarned=true;
    const m=Math.round(timer.longWarnSec/60);
    announce({icon:'⏳', title:`${m} minutes in`, sub:'Long stretch — a proper break will protect your focus.',
      say:`You've been going for ${m} minutes. Consider a longer break.`});
  }
  // countdown target reached
  if(timer.running && timer.mode==='countdown' && !timer.targetHit && el>=timer.targetSec){
    timer.targetHit=true;
    const m=Math.round(timer.targetSec/60);
    announce({icon:'🎯', title:'Target reached!', sub:`You hit your ${m}-minute goal. Finish & log, or keep going.`,
      say:`Nice. You reached your ${m} minute target.`});
  }
  timerRender();
}
function timerRender(){
  const el=timerElapsed();
  let display, frac;
  if(timer.mode==='countdown'){
    const rem=Math.max(0, timer.targetSec-el);
    display = rem>0 ? fmtClock(rem) : '00:00';
    frac = clamp(el/timer.targetSec,0,1);
    $('clockSub').textContent = rem>0 ? `Countdown · ${Math.round(timer.targetSec/60)}m goal` : 'Goal reached';
  }else{
    display = fmtClock(el);
    const cyc = timer.breakOn ? timer.breakEvery : 60*60;
    frac = (el%cyc)/cyc;
    $('clockSub').textContent = timer.breakOn ? `Stopwatch · break at ${Math.round(timer.nextBreak/60)}m` : 'Stopwatch';
  }
  $('clock').textContent=display;
  $('ringProg').style.strokeDashoffset = String(RING_CIRC*(1-frac));
  // mini stats
  $('msActive').textContent=fmtDur(el);
  $('msPauses').textContent=String(timer.pauses);
  const todayMin = activeSessions().filter(s=>dateKey(s.startTs)===todayStr())
                    .reduce((a,s)=>a+s.durationSec,0)/60 + el/60;
  $('msToday').textContent=fmtDur(todayMin*60);
}

/* finish flow */
function openFinish(){
  const el=Math.round(timerElapsed());
  if(el<5){ toast('Run the timer a little first.'); return; }
  if(timer.running) timerPause();
  $('finishSummary').innerHTML =
    `<b>${fmtDur(el)}</b> of focus${timer.pauses?` · ${timer.pauses} pause(s)`:''}`;
  fillExamSelect($('finishExam'), $('timerExam').value);
  $('finishEffort').value=3; $('finishEffortVal').textContent='3';
  $('finishAtt').value=80;   $('finishAttVal').textContent='80';
  $('finishNote').value = $('timerNote').value || '';
  $('finishModal').hidden=false;
}
function saveFinish(){
  const el=Math.round(timerElapsed());
  const start = timer.startedAtIso || new Date(Date.now()-el*1000).toISOString();
  addSession({
    examId: $('finishExam').value || null,
    startTs: start, endTs: nowIso(), durationSec: el,
    effort: +$('finishEffort').value, attention: +$('finishAtt').value,
    note: $('finishNote').value.trim(), source:'timer'
  });
  $('finishModal').hidden=true;
  $('timerNote').value='';
  timerReset();
  toast('Session logged ✓');
  maybeAutoSync();
}

/* =====================================================================
   EXAM SELECTS + EXAM MODAL
   ===================================================================== */
function fillExamSelect(sel, keep, withNone){
  const prev = keep!==undefined ? keep : sel.value;
  const opts = activeExams().map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  sel.innerHTML = (withNone? `<option value="">No exam</option>`:'') + opts;
  if(prev && activeExams().some(e=>e.id===prev)) sel.value=prev;
}
function populateExamSelects(){
  fillExamSelect($('timerExam'));
  fillExamSelect($('planExam'));
  fillExamSelect($('mExam'));
  const f=$('histExamFilter'); const pv=f.value;
  f.innerHTML = `<option value="">All exams</option>` +
    activeExams().map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  if(pv) f.value=pv;
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function openExamModal(id){
  const ex = id? examById(id) : null;
  $('examModalTitle').textContent = ex? 'Edit exam' : 'New exam';
  $('examEditId').value = ex? ex.id : '';
  $('examName').value = ex? ex.name : '';
  $('examDate').value = ex && ex.examDate? ex.examDate : '';
  const used = activeExams().map(e=>e.color);
  const pick = ex? ex.color : (EXAM_COLORS.find(c=>!used.includes(c)) || EXAM_COLORS[0]);
  $('examColors').innerHTML = EXAM_COLORS.map(c=>
    `<button type="button" data-c="${c}" class="${c===pick?'active':''}" style="background:${c}"></button>`).join('');
  $$('#examColors button').forEach(b=>b.addEventListener('click',()=>{
    $$('#examColors button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  }));
  $('examModal').hidden=false;
  $('examName').focus();
}
function saveExamModal(){
  const name=$('examName').value.trim();
  if(!name){ toast('Give the exam a name.'); return; }
  const sel=document.querySelector('#examColors button.active');
  const color= sel? sel.dataset.c : EXAM_COLORS[0];
  const id=$('examEditId').value || uid();
  upsertExam({ id, name, color, examDate: $('examDate').value || null, deleted:false });
  $('examModal').hidden=true;
  populateExamSelects(); renderLog();
  toast('Exam saved ✓'); maybeAutoSync();
}

/* =====================================================================
   PLAN TAB
   ===================================================================== */
let planKind='once', planWeekday=null;
function renderPlan(){
  fillExamSelect($('planExam'));
  if(!$('planDate').value) $('planDate').value=todayStr();
  // upcoming (next 14 days)
  const today=startOfDay(new Date());
  const horizon=14;
  $('upcomingRange').textContent=`next ${horizon} days`;
  const occ=[];
  activePlans().forEach(p=>{
    if(p.kind==='once' && p.date){
      const d=startOfDay(new Date(p.date+'T00:00'));
      const diff=daysBetween(today,d);
      if(diff>=0 && diff<horizon && !p.done) occ.push({p, date:d});
    }else if(p.kind==='weekly' && p.weekday!=null){
      for(let i=0;i<horizon;i++){ const d=addDays(today,i); if(d.getDay()===p.weekday) occ.push({p, date:d, recur:true}); }
    }
  });
  occ.sort((a,b)=> a.date-b.date || (a.p.time||'').localeCompare(b.p.time||''));
  const ul=$('upcomingList');
  if(!occ.length){ ul.innerHTML=`<div class="empty">Nothing planned. Add a session on the left.</div>`; }
  else ul.innerHTML = occ.map(o=>planItemHtml(o.p,o.date,o.recur)).join('');
  // recurring routines
  const rec=activePlans().filter(p=>p.kind==='weekly');
  const rl=$('recurringList');
  if(!rec.length){ rl.innerHTML=`<div class="empty">No recurring routines yet. Pick “Weekly” when adding a session.</div>`; }
  else rl.innerHTML = rec.sort((a,b)=>a.weekday-b.weekday).map(p=>`
    <div class="plan-item">
      <div class="plan-when"><div class="d">${WD_SHORT[p.weekday]}</div><div class="m">weekly</div></div>
      <div class="plan-body">
        <div class="t"><span class="dotc" style="background:${examColor(p.examId)}"></span>${escapeHtml(examName(p.examId))}
          <span class="tag-recur">every ${WD_SHORT[p.weekday]}</span></div>
        <div class="s">${p.time||''} · ${fmtMin(p.durationMin)}${p.note? ' · '+escapeHtml(p.note):''}</div>
      </div>
      <div class="plan-acts">
        <button class="icon-btn go" title="Start now" data-go="${p.id}">▶</button>
        <button class="icon-btn del" title="Delete routine" data-del="${p.id}">✕</button>
      </div>
    </div>`).join('');
  wirePlanItemActions();
}
function planItemHtml(p,date,recur){
  const dd=date.getDate(), mm=MON_SHORT[date.getMonth()];
  return `<div class="plan-item">
    <div class="plan-when"><div class="d">${dd}</div><div class="m">${mm}</div></div>
    <div class="plan-body">
      <div class="t"><span class="dotc" style="background:${examColor(p.examId)}"></span>${escapeHtml(examName(p.examId))}
        ${recur?'<span class="tag-recur">weekly</span>':''}</div>
      <div class="s">${p.time||''} · ${fmtMin(p.durationMin)}${p.note? ' · '+escapeHtml(p.note):''}</div>
    </div>
    <div class="plan-acts">
      <button class="icon-btn go" title="Start this session" data-go="${p.id}">▶</button>
      <button class="icon-btn del" title="${recur?'Delete routine':'Delete'}" data-del="${p.id}">✕</button>
    </div>
  </div>`;
}
function wirePlanItemActions(){
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>startFromPlan(b.dataset.go)));
  $$('[data-del]').forEach(b=>b.addEventListener('click',()=>{ delPlan(b.dataset.del); renderPlan(); maybeAutoSync(); }));
}
function startFromPlan(id){
  const p=S.plans.find(x=>x.id===id); if(!p)return;
  setView('timer');
  fillExamSelect($('timerExam')); $('timerExam').value=p.examId||'';
  setMode('countdown'); $('targetMin').value=p.durationMin; timer.targetSec=p.durationMin*60;
  $('timerNote').value=p.note||'';
  timerReset();
  toast('Loaded from plan — press Start when ready.');
}
function doAddPlan(){
  const examId=$('planExam').value||null;
  const time=$('planTime').value||'18:00';
  const durationMin=clamp(+$('planDuration').value||50,5,600);
  const note=$('planNote').value.trim();
  if(planKind==='once'){
    const date=$('planDate').value;
    if(!date){ toast('Pick a date.'); return; }
    addPlan({examId, kind:'once', date, weekday:null, time, durationMin, note});
  }else{
    if(planWeekday==null){ toast('Pick a day of the week.'); return; }
    addPlan({examId, kind:'weekly', date:null, weekday:planWeekday, time, durationMin, note});
  }
  $('planNote').value='';
  renderPlan(); toast('Added to plan ✓'); maybeAutoSync();
}

/* =====================================================================
   INSIGHTS TAB
   ===================================================================== */
let insightsRange=14;
function renderInsights(){
  const ss=activeSessions().slice().sort((a,b)=>new Date(a.startTs)-new Date(b.startTs));
  renderStats(ss);
  renderMinutesChart(ss, insightsRange);
  renderHeatmap(ss);
  renderExamChart(ss);
  renderTrendChart(ss);
  renderSuggestions(ss);
}
function renderStats(ss){
  const totalSec=ss.reduce((a,s)=>a+s.durationSec,0);
  const wkStart=startOfWeek(new Date());
  const lastWkStart=addDays(wkStart,-7);
  const thisWk=ss.filter(s=>new Date(s.startTs)>=wkStart).reduce((a,s)=>a+s.durationSec,0);
  const lastWk=ss.filter(s=>{const d=new Date(s.startTs);return d>=lastWkStart&&d<wkStart;}).reduce((a,s)=>a+s.durationSec,0);
  let delta='';
  if(lastWk>0){ const pct=Math.round((thisWk-lastWk)/lastWk*100);
    delta=`<div class="sub ${pct>=0?'up':'down'}">${pct>=0?'▲':'▼'} ${Math.abs(pct)}% vs last week</div>`; }
  else if(thisWk>0){ delta=`<div class="sub up">new this week</div>`; }
  const eff=ss.filter(s=>s.effort); const att=ss.filter(s=>s.attention!=null);
  const avgEff=eff.length? (eff.reduce((a,s)=>a+s.effort,0)/eff.length):0;
  const avgAtt=att.length? Math.round(att.reduce((a,s)=>a+s.attention,0)/att.length):0;
  const streak=computeStreak(ss);
  $('statRow').innerHTML=`
    <div class="stat"><div class="k">${fmtDur(totalSec)}</div><div class="l">Total studied</div></div>
    <div class="stat"><div class="k">${fmtDur(thisWk)}</div><div class="l">This week</div>${delta}</div>
    <div class="stat"><div class="k">${ss.length}</div><div class="l">Sessions</div></div>
    <div class="stat"><div class="k">${streak}🔥</div><div class="l">Day streak</div></div>
    <div class="stat"><div class="k">${avgEff?avgEff.toFixed(1):'–'}</div><div class="l">Avg effort /5</div></div>
    <div class="stat"><div class="k">${avgAtt?avgAtt+'%':'–'}</div><div class="l">Avg attention</div></div>`;
}
function computeStreak(ss){
  const days=new Set(ss.map(s=>dateKey(s.startTs)));
  let streak=0; let cur=startOfDay(new Date());
  if(!days.has(todayStr())) cur=addDays(cur,-1); // today not yet studied: don't break streak
  while(true){ const k=`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`;
    if(days.has(k)){ streak++; cur=addDays(cur,-1); } else break; }
  return streak;
}
/* ---- chart: minutes per day ---- */
function renderMinutesChart(ss, days){
  const today=startOfDay(new Date());
  const buckets=[];
  for(let i=days-1;i>=0;i--){ const d=addDays(today,-i);
    buckets.push({d, key:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, min:0}); }
  const map=new Map(buckets.map(b=>[b.key,b]));
  ss.forEach(s=>{ const b=map.get(dateKey(s.startTs)); if(b) b.min+=s.durationSec/60; });
  const max=Math.max(10, ...buckets.map(b=>b.min));
  const W=720,H=210, padL=34,padB=24,padT=10;
  const cw=(W-padL)/buckets.length, bw=Math.min(26, cw*0.7);
  const yticks=[0,max/2,max].map(v=>Math.round(v));
  let g='';
  yticks.forEach(v=>{ const y=padT+(H-padT-padB)*(1-v/max);
    g+=`<line x1="${padL}" y1="${y}" x2="${W}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
        <text x="0" y="${y+4}" fill="var(--muted-2)" font-size="10">${v}</text>`; });
  let bars='';
  buckets.forEach((b,i)=>{ const h=(H-padT-padB)*(b.min/max);
    const x=padL+i*cw+(cw-bw)/2, y=H-padB-h;
    bars+=`<rect class="bar" x="${x}" y="${y}" width="${bw}" height="${Math.max(0,h)}" rx="3" fill="var(--accent)" opacity="${b.min?0.92:0.18}"><title>${b.d.getDate()} ${MON_SHORT[b.d.getMonth()]}: ${Math.round(b.min)}m</title></rect>`;
    const step=Math.ceil(buckets.length/9);
    if(i%step===0) bars+=`<text x="${x+bw/2}" y="${H-8}" fill="var(--muted-2)" font-size="9.5" text-anchor="middle">${b.d.getDate()}/${b.d.getMonth()+1}</text>`;
  });
  $('chartMinutes').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${g}${bars}</svg>`;
}
/* ---- chart: heatmap weekday x time-of-day ---- */
function renderHeatmap(ss){
  const cols=[['Night','0–6',0,6],['Morn','6–12',6,12],['Noon','12–15',12,15],['Aftn','15–18',15,18],['Eve','18–21',18,21],['Late','21–24',21,24]];
  const rows=[1,2,3,4,5,6,0]; // Mon..Sun
  const grid=rows.map(()=>cols.map(()=>0));
  ss.forEach(s=>{ const d=new Date(s.startTs); const r=rows.indexOf(d.getDay());
    const h=d.getHours(); const c=cols.findIndex(col=>h>=col[2]&&h<col[3]);
    if(r>=0&&c>=0) grid[r][c]+=s.durationSec/60; });
  const max=Math.max(1,...grid.flat());
  const W=720,H=210, padL=40,padT=20, cw=(W-padL)/cols.length, ch=(H-padT-16)/rows.length, gap=3;
  let svg='';
  cols.forEach((c,ci)=> svg+=`<text x="${padL+ci*cw+cw/2}" y="14" fill="var(--muted-2)" font-size="10" text-anchor="middle">${c[1]}</text>`);
  rows.forEach((r,ri)=>{ svg+=`<text x="0" y="${padT+ri*ch+ch/2+3}" fill="var(--muted-2)" font-size="10">${WD_SHORT[r]}</text>`;
    cols.forEach((c,ci)=>{ const v=grid[ri][ci]; const op=v? (0.18+0.82*(v/max)):0;
      const x=padL+ci*cw+gap/2, y=padT+ri*ch+gap/2;
      svg+=`<rect class="heat-cell" x="${x}" y="${y}" width="${cw-gap}" height="${ch-gap}" rx="5" fill="${v?'var(--accent)':'var(--surface-3)'}" fill-opacity="${v?op:1}"><title>${WD_SHORT[r]} ${c[1]}h: ${Math.round(v)}m</title></rect>`; });
  });
  $('chartHeat').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
/* ---- chart: time per exam (horizontal bars) ---- */
function renderExamChart(ss){
  const totals={};
  ss.forEach(s=>{ const k=s.examId||'__none'; totals[k]=(totals[k]||0)+s.durationSec/60; });
  const arr=Object.entries(totals).map(([k,v])=>({id:k==='__none'?null:k, min:v}))
            .sort((a,b)=>b.min-a.min);
  if(!arr.length){ $('chartExam').innerHTML=`<div class="empty">No data yet.</div>`; return; }
  const max=Math.max(...arr.map(a=>a.min));
  const W=720, rowH=34, padL=4, barX=140, H=arr.length*rowH+10;
  let svg='';
  arr.forEach((a,i)=>{ const y=8+i*rowH; const w=(W-barX-60)*(a.min/max);
    const col= a.id? examColor(a.id) : '#6f7596';
    svg+=`<text x="${padL}" y="${y+16}" fill="var(--text)" font-size="12.5">${escapeHtml(a.id?examName(a.id):'No exam')}</text>
      <rect x="${barX}" y="${y+4}" width="${Math.max(2,w)}" height="18" rx="6" fill="${col}"/>
      <text x="${barX+Math.max(2,w)+8}" y="${y+17}" fill="var(--muted)" font-size="11.5">${fmtMin(a.min)}</text>`;
  });
  $('chartExam').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
/* ---- chart: effort & attention trend ---- */
function renderTrendChart(ss){
  const pts=ss.filter(s=>s.effort||s.attention!=null).slice(-24);
  if(pts.length<2){ $('chartTrend').innerHTML=`<div class="empty">Log a few sessions to see trends.</div>`; return; }
  const W=720,H=210,padL=30,padB=22,padT=12,padR=10;
  const n=pts.length, dx=(W-padL-padR)/(n-1);
  const yF=(v)=>padT+(H-padT-padB)*(1-clamp(v,0,100)/100);
  let grid='';
  [0,50,100].forEach(v=>{ const y=yF(v);
    grid+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
           <text x="0" y="${y+4}" fill="var(--muted-2)" font-size="10">${v}</text>`; });
  const lineFor=(getter,color)=>{ const d=pts.map((s,i)=>`${i?'L':'M'}${padL+i*dx},${yF(getter(s))}`).join(' ');
    const dots=pts.map((s,i)=>`<circle cx="${padL+i*dx}" cy="${yF(getter(s))}" r="2.6" fill="${color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4"/>${dots}`; };
  const effLine=lineFor(s=>(s.effort||0)*20, 'var(--accent-2)');
  const attLine=lineFor(s=>(s.attention==null?0:s.attention), 'var(--good)');
  $('chartTrend').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${grid}${attLine}${effLine}</svg>`;
}
/* ---- suggestions ---- */
function renderSuggestions(ss){
  const box=$('suggestions'); const out=[];
  if(ss.length<3){ box.innerHTML=`<div class="sugg"><span class="em">🌱</span><div class="tx">Log a few sessions to unlock personalised suggestions about your best study times and habits.</div></div>`; return; }
  // best part of day by attention
  const parts={Morning:[],Afternoon:[],Evening:[]};
  ss.forEach(s=>{ if(s.attention==null)return; const h=new Date(s.startTs).getHours();
    const p=h<12?'Morning':h<17?'Afternoon':'Evening'; parts[p].push(s.attention); });
  const pAvg=Object.entries(parts).filter(([,a])=>a.length>=2)
    .map(([k,a])=>({k, v:a.reduce((x,y)=>x+y,0)/a.length}));
  if(pAvg.length>=2){ pAvg.sort((a,b)=>b.v-a.v); const best=pAvg[0], worst=pAvg[pAvg.length-1];
    if(best.v-worst.v>=8) out.push(['🌅',`You focus best in the <b>${best.k.toLowerCase()}</b> — attention averages <b>${Math.round(best.v)}%</b> then vs ${Math.round(worst.v)}% in the ${worst.k.toLowerCase()}. Schedule your hardest material then.`]); }
  // session length vs attention
  const long=ss.filter(s=>s.attention!=null && s.durationSec>50*60);
  const short=ss.filter(s=>s.attention!=null && s.durationSec<=50*60);
  if(long.length>=2 && short.length>=2){
    const la=long.reduce((a,s)=>a+s.attention,0)/long.length, sa=short.reduce((a,s)=>a+s.attention,0)/short.length;
    if(sa-la>=10) out.push(['⏱',`Attention drops on long sessions (<b>${Math.round(la)}%</b> over 50 min vs <b>${Math.round(sa)}%</b> under). Try shorter focused blocks with breaks.`]); }
  // streak
  const streak=computeStreak(ss);
  if(streak>=3) out.push(['🔥',`You're on a <b>${streak}-day streak</b>. Keep it alive with even a short session today.`]);
  // neglected exam with upcoming date
  const now=new Date();
  activeExams().forEach(e=>{ if(!e.examDate)return; const exd=new Date(e.examDate+'T23:59');
    const dleft=daysBetween(now,exd); if(dleft<0)return;
    const last=ss.filter(s=>s.examId===e.id).sort((a,b)=>new Date(b.startTs)-new Date(a.startTs))[0];
    const since=last? daysBetween(new Date(last.startTs),now):999;
    if(dleft<=21 && (since>=5)) out.push(['⚠️',`<b>${escapeHtml(e.name)}</b> is in <b>${dleft} day${dleft===1?'':'s'}</b> but you ${last?`haven't studied it in ${since} days`:'haven\'t logged any sessions yet'}. Block some time on the Plan tab.`]);
  });
  // weekly momentum
  const wkStart=startOfWeek(now);
  const thisWk=ss.filter(s=>new Date(s.startTs)>=wkStart).reduce((a,s)=>a+s.durationSec,0);
  const lastWk=ss.filter(s=>{const d=new Date(s.startTs);return d>=addDays(wkStart,-7)&&d<wkStart;}).reduce((a,s)=>a+s.durationSec,0);
  if(lastWk>0){ const pct=Math.round((thisWk-lastWk)/lastWk*100);
    if(pct<=-25) out.push(['📉',`You're <b>${Math.abs(pct)}% down</b> on last week (${fmtDur(thisWk)} vs ${fmtDur(lastWk)}). A couple of focused blocks would get you back on track.`]);
    else if(pct>=25) out.push(['📈',`Strong week — <b>up ${pct}%</b> on last week. Nice momentum.`]); }
  // low effort
  const eff=ss.slice(-8).filter(s=>s.effort);
  if(eff.length>=4){ const ae=eff.reduce((a,s)=>a+s.effort,0)/eff.length;
    if(ae<2.6) out.push(['💪',`Recent effort is light (<b>${ae.toFixed(1)}/5</b>). If you're coasting, try active recall or harder problem sets.`]); }
  if(!out.length) out.push(['✅',`Your study habits look balanced. Keep logging to spot trends over time.`]);
  box.innerHTML=out.map(([em,tx])=>`<div class="sugg"><span class="em">${em}</span><div class="tx">${tx}</div></div>`).join('');
}

/* =====================================================================
   LOG TAB
   ===================================================================== */
let editingSessionId=null;
function renderLog(){
  fillExamSelect($('mExam'));
  if(!$('mDate').value) $('mDate').value=todayStr();
  renderExamList();
  renderHistory();
  updateDataStats();
}
function renderExamList(){
  const el=$('examList'); const ex=activeExams();
  if(!ex.length){ el.innerHTML=`<div class="empty">No exams yet. Add one to organise your sessions.</div>`; return; }
  const now=new Date();
  el.innerHTML=ex.map(e=>{
    let cd='';
    if(e.examDate){ const d=daysBetween(now,new Date(e.examDate+'T23:59'));
      const cls=d<0?'':d<=7?'urgent':d<=21?'soon':'';
      cd=`<span class="cd ${cls}">${d<0?'past':d===0?'today!':`in ${d}d`}</span>`; }
    return `<div class="exam-row">
      <span class="dotc" style="background:${e.color}"></span>
      <span class="nm">${escapeHtml(e.name)}</span>${cd}
      <button class="icon-btn" title="Edit" data-edex="${e.id}">✎</button>
      <button class="icon-btn del" title="Delete" data-delex="${e.id}">🗑</button>
    </div>`;
  }).join('');
  $$('[data-edex]').forEach(b=>b.addEventListener('click',()=>openExamModal(b.dataset.edex)));
  $$('[data-delex]').forEach(b=>b.addEventListener('click',()=>{
    const e=examById(b.dataset.delex);
    if(confirm(`Delete "${e.name}"? Sessions stay logged but lose this label.`)){
      e.deleted=true; e.updatedAt=nowIso(); save(); populateExamSelects(); renderLog(); maybeAutoSync(); }
  }));
}
function renderHistory(){
  const filter=$('histExamFilter').value;
  let rows=activeSessions().slice().sort((a,b)=>new Date(b.startTs)-new Date(a.startTs));
  if(filter) rows=rows.filter(s=>s.examId===filter);
  const body=$('histBody');
  $('histEmpty').hidden = rows.length>0;
  body.innerHTML=rows.map(s=>{
    const d=new Date(s.startTs);
    const dstr=`${d.getDate()} ${MON_SHORT[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `<tr>
      <td>${dstr}</td>
      <td><span class="pill"><span class="dotc" style="background:${examColor(s.examId)}"></span>${escapeHtml(examName(s.examId))}</span></td>
      <td>${fmtDur(s.durationSec)}</td>
      <td>${s.effort? s.effort+'/5':'–'}</td>
      <td>${s.attention!=null? s.attention+'%':'–'}</td>
      <td class="note-cell" title="${escapeHtml(s.note||'')}">${escapeHtml(s.note||'')||'<span class="muted">—</span>'}</td>
      <td><button class="icon-btn" data-eds="${s.id}" title="Edit">✎</button>
          <button class="icon-btn del" data-dels="${s.id}" title="Delete">🗑</button></td>
    </tr>`;
  }).join('');
  $$('[data-dels]').forEach(b=>b.addEventListener('click',()=>{
    if(confirm('Delete this session?')){ delSession(b.dataset.dels); renderLog(); maybeAutoSync(); }
  }));
  $$('[data-eds]').forEach(b=>b.addEventListener('click',()=>loadSessionToForm(b.dataset.eds)));
}
function loadSessionToForm(id){
  const s=S.sessions.find(x=>x.id===id); if(!s)return;
  editingSessionId=id;
  const d=new Date(s.startTs);
  $('mDate').value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  $('mStart').value=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('mDuration').value=Math.round(s.durationSec/60);
  fillExamSelect($('mExam')); $('mExam').value=s.examId||'';
  $('mEffort').value=s.effort||3; $('mEffortVal').textContent=s.effort||3;
  $('mAttention').value=s.attention==null?80:s.attention; $('mAttentionVal').textContent=s.attention==null?80:s.attention;
  $('mNote').value=s.note||'';
  $('btnAddManual').textContent='Update session';
  setView('log'); window.scrollTo({top:0,behavior:'smooth'});
  toast('Editing session — change values and Update.');
}
function saveManual(){
  const date=$('mDate').value, time=$('mStart').value||'00:00';
  if(!date){ toast('Pick a date.'); return; }
  const start=new Date(`${date}T${time}`);
  const durSec=clamp(+$('mDuration').value||0,1,600)*60;
  const data={ examId:$('mExam').value||null, startTs:start.toISOString(),
    endTs:new Date(start.getTime()+durSec*1000).toISOString(), durationSec:durSec,
    effort:+$('mEffort').value, attention:+$('mAttention').value, note:$('mNote').value.trim(), source:'manual' };
  if(editingSessionId){ updateSession(editingSessionId, data); editingSessionId=null; $('btnAddManual').textContent='Save session'; toast('Session updated ✓'); }
  else { addSession(data); toast('Session saved ✓'); }
  $('mNote').value='';
  renderLog(); maybeAutoSync();
}

/* =====================================================================
   SETTINGS TAB + DATA
   ===================================================================== */
function applyAccent(a){ document.documentElement.dataset.accent=a;
  const tc={indigo:'#6366f1',teal:'#14b8a6',amber:'#f59e0b'}[a]||'#6366f1';
  const m=document.querySelector('meta[name=theme-color]'); if(m)m.content=tc; }
function renderSettings(){
  $('setBreakEvery').value=S.settings.breakEvery;
  $('setLongWarn').value=S.settings.longWarn;
  $('setSound').checked=S.settings.sound;
  $('setVoice').checked=S.settings.voice;
  $('setNotif').checked=S.settings.notif;
  $('setAutoSync').checked=S.settings.autoSync;
  $$('#accentPick .ac').forEach(b=>b.classList.toggle('active', b.dataset.accent===S.settings.accent));
  $('sbUrl').value=S.sync.url||''; $('sbKey').value=S.sync.key||'';
  $('authBox').hidden = !(S.sync.url && S.sync.key);
  updateDataStats(); refreshSyncUi();
}
function updateDataStats(){
  const t=`${activeSessions().length} sessions · ${activeExams().length} exams · ${activePlans().length} plans`;
  if($('dataStats')) $('dataStats').textContent=t;
}
function downloadFile(name, content, mime){
  const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportBackup(){
  downloadFile(`focuslog-backup-${todayStr()}.json`,
    JSON.stringify({version:1, exportedAt:nowIso(), exams:S.exams, sessions:S.sessions, plans:S.plans, settings:S.settings},null,2),
    'application/json');
  toast('Backup exported ✓');
}
function importBackup(file){
  const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result);
    if(!d.sessions&&!d.exams) throw new Error('not a backup');
    if(!confirm('Import will replace your current exams, sessions and plans. Continue?')) return;
    S.exams=d.exams||[]; S.sessions=d.sessions||[]; S.plans=d.plans||[];
    if(d.settings) S.settings={...DEFAULT_SETTINGS,...d.settings};
    save(); applyAccent(S.settings.accent); populateExamSelects(); setView('insights');
    toast('Backup imported ✓'); maybeAutoSync();
  }catch(e){ toast('Could not read that file.'); } };
  r.readAsText(file);
}
function exportCsv(){
  const rows=[['date','start_time','exam','duration_min','effort','attention_pct','source','note']];
  activeSessions().slice().sort((a,b)=>new Date(a.startTs)-new Date(b.startTs)).forEach(s=>{
    const d=new Date(s.startTs);
    rows.push([`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      examName(s.examId), Math.round(s.durationSec/60), s.effort||'', s.attention==null?'':s.attention, s.source||'', (s.note||'').replace(/"/g,'""')]);
  });
  const csv=rows.map(r=>r.map(c=>/[",\n]/.test(String(c))?`"${c}"`:c).join(',')).join('\n');
  downloadFile(`focuslog-sessions-${todayStr()}.csv`, csv, 'text/csv');
}
function clearAll(){
  if(!confirm('Erase ALL local data? This cannot be undone (export a backup first).')) return;
  S.exams=[]; S.sessions=[]; S.plans=[]; S.meta={};
  save(); populateExamSelects(); setView('insights'); toast('All data cleared.');
}
function loadDemo(){
  if(activeSessions().length && !confirm('Add demo data on top of what you have?')) return;
  const mk=(name,color,examDate)=>{ const id=uid(); S.exams.push({id,name,color,examDate,deleted:false,updatedAt:nowIso()}); return id; };
  const calc=mk('Calculus II','#6366f1', dateKey(addDays(new Date(),18)));
  const bio =mk('Biology','#34d399', dateKey(addDays(new Date(),32)));
  const hist=mk('History','#f59e0b', dateKey(addDays(new Date(),9)));
  const exams=[calc,bio,hist];
  for(let i=43;i>=0;i--){ const day=addDays(new Date(),-i);
    const sessionsToday = Math.random()<0.32?0 : (Math.random()<0.7?1:2);
    for(let k=0;k<sessionsToday;k++){
      const ex=exams[Math.floor(Math.random()*exams.length)];
      const hour=8+Math.floor(Math.random()*13);
      const start=new Date(day); start.setHours(hour, Math.floor(Math.random()*60),0,0);
      const dur=(20+Math.floor(Math.random()*7)*10);
      const morningBoost = hour<12?8:0;
      const attention=clamp(Math.round(55+Math.random()*35+morningBoost-(dur>60?8:0)),20,100);
      const effort=clamp(Math.round(2+Math.random()*3),1,5);
      S.sessions.push({id:uid(), examId:ex, startTs:start.toISOString(),
        endTs:new Date(start.getTime()+dur*60000).toISOString(), durationSec:dur*60,
        effort, attention, note:'', source:'timer', deleted:false, updatedAt:nowIso()});
    }
  }
  S.plans.push({id:uid(), examId:calc, kind:'weekly', date:null, weekday:6, time:'10:00', durationMin:60, note:'Weekly problem set', done:false, deleted:false, updatedAt:nowIso()});
  S.plans.push({id:uid(), examId:hist, kind:'once', date:dateKey(addDays(new Date(),2)), weekday:null, time:'19:00', durationMin:45, note:'Revise WW1 causes', done:false, deleted:false, updatedAt:nowIso()});
  S.meta.demo=true; save(); populateExamSelects(); setView('insights'); toast('Demo data loaded ✓');
}

/* =====================================================================
   SUPABASE SYNC  (optional, offline-first)
   ===================================================================== */
let sb=null, sbUser=null, syncing=false;
function loadSbLib(){
  return new Promise((res,rej)=>{
    if(window.supabase) return res();
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload=()=>res(); s.onerror=()=>rej(new Error('Could not load sync library (are you offline?)'));
    document.head.appendChild(s);
  });
}
async function sbInit(){
  if(!S.sync.url || !S.sync.key) return false;
  await loadSbLib();
  sb=window.supabase.createClient(S.sync.url, S.sync.key);
  const { data } = await sb.auth.getSession();
  sbUser = data && data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((_e,sess)=>{ sbUser = sess? sess.user : null; refreshSyncUi(); });
  return true;
}
function setSyncStatus(state, text){
  ['syncPill','syncPill2'].forEach(id=>{ const p=$(id); if(!p)return;
    p.classList.remove('ok','warn','err'); if(state) p.classList.add(state); });
  $('syncText').textContent=text; if($('syncText2')) $('syncText2').textContent=text;
}
function refreshSyncUi(){
  const configured = !!(S.sync.url && S.sync.key);
  $('authBox').hidden = !configured;
  if(!configured){ setSyncStatus('', 'Local only'); return; }
  $('authedOut').hidden = !!sbUser; $('authedIn').hidden = !sbUser;
  if(sbUser){ $('authWho').textContent=sbUser.email||'account';
    setSyncStatus('ok', 'Synced');
    $('lastSynced').textContent = S.sync.lastSyncAt? 'Last sync: '+new Date(S.sync.lastSyncAt).toLocaleString() : 'Not synced yet';
  } else { setSyncStatus('warn','Sign in to sync'); }
}
async function sbSaveConn(){
  S.sync.url=$('sbUrl').value.trim().replace(/\/$/,''); S.sync.key=$('sbKey').value.trim(); save();
  try{ await sbInit(); refreshSyncUi(); toast(sbUser?'Connected ✓':'Saved — now sign in.'); }
  catch(e){ toast(e.message); }
}
async function sbAuth(kind){
  if(!sb){ try{ await sbInit(); }catch(e){ toast(e.message); return; } }
  if(!sb){ toast('Save your Supabase connection first.'); return; }
  const email=$('authEmail').value.trim(), password=$('authPass').value;
  if(!email||!password){ toast('Enter email and password.'); return; }
  try{
    setSyncStatus('warn','Working…');
    const fn = kind==='up'? sb.auth.signUp.bind(sb.auth) : sb.auth.signInWithPassword.bind(sb.auth);
    const { data, error } = await fn({email,password});
    if(error) throw error;
    sbUser = data.user || (data.session&&data.session.user) || sbUser;
    if(kind==='up' && !data.session){ toast('Account created — check your email to confirm, then sign in.'); refreshSyncUi(); return; }
    refreshSyncUi(); toast('Signed in ✓'); await syncNow();
  }catch(e){ setSyncStatus('err','Error'); toast(e.message||'Auth failed'); }
}
async function sbSignOut(){ if(sb) await sb.auth.signOut(); sbUser=null; refreshSyncUi(); toast('Signed out.'); }

const TABLES={
  exams:{ list:()=>'exams', to:e=>({id:e.id,user_id:sbUser.id,name:e.name,color:e.color,exam_date:e.examDate||null,deleted:!!e.deleted,updated_at:e.updatedAt}),
          from:r=>({id:r.id,name:r.name,color:r.color,examDate:r.exam_date,deleted:r.deleted,updatedAt:r.updated_at}), arr:'exams' },
  sessions:{ to:s=>({id:s.id,user_id:sbUser.id,exam_id:s.examId||null,start_ts:s.startTs,end_ts:s.endTs||null,duration_sec:s.durationSec,effort:s.effort||null,attention:s.attention==null?null:s.attention,note:s.note||null,source:s.source||null,deleted:!!s.deleted,updated_at:s.updatedAt}),
          from:r=>({id:r.id,examId:r.exam_id,startTs:r.start_ts,endTs:r.end_ts,durationSec:r.duration_sec,effort:r.effort,attention:r.attention,note:r.note,source:r.source,deleted:r.deleted,updatedAt:r.updated_at}), arr:'sessions' },
  plans:{ to:p=>({id:p.id,user_id:sbUser.id,exam_id:p.examId||null,kind:p.kind,date:p.date||null,weekday:p.weekday==null?null:p.weekday,time:p.time||null,duration_min:p.durationMin,note:p.note||null,done:!!p.done,deleted:!!p.deleted,updated_at:p.updatedAt}),
          from:r=>({id:r.id,examId:r.exam_id,kind:r.kind,date:r.date,weekday:r.weekday,time:r.time,durationMin:r.duration_min,note:r.note,done:r.done,deleted:r.deleted,updatedAt:r.updated_at}), arr:'plans' }
};
function mergeRemote(arrName, rows, fromFn){
  const local=S[arrName]; const byId=new Map(local.map(x=>[x.id,x]));
  rows.forEach(r=>{ const o=fromFn(r); const cur=byId.get(o.id);
    if(!cur || new Date(o.updatedAt) >= new Date(cur.updatedAt||0)){
      if(cur) Object.assign(cur,o); else { local.push(o); byId.set(o.id,o); } } });
}
async function syncNow(){
  if(!sb||!sbUser){ toast('Sign in to sync.'); return; }
  if(syncing) return; syncing=true;
  const since=S.sync.lastSyncAt; const stamp=nowIso();
  try{
    setSyncStatus('warn','Syncing…');
    for(const [name,cfg] of Object.entries(TABLES)){
      // push local changes
      const changed=S[cfg.arr].filter(x=> !since || new Date(x.updatedAt) > new Date(since));
      if(changed.length){ const { error }=await sb.from(name).upsert(changed.map(cfg.to)); if(error) throw error; }
      // pull remote changes
      let q=sb.from(name).select('*'); if(since) q=q.gt('updated_at', since);
      const { data, error }=await q; if(error) throw error;
      if(data&&data.length) mergeRemote(cfg.arr, data, cfg.from);
    }
    S.sync.lastSyncAt=stamp; save();
    populateExamSelects();
    if(currentView==='insights')renderInsights(); if(currentView==='log')renderLog(); if(currentView==='plan')renderPlan();
    refreshSyncUi(); setSyncStatus('ok','Synced'); toast('Synced ✓');
  }catch(e){ console.warn(e); setSyncStatus('err','Sync error'); toast('Sync failed: '+(e.message||e)); }
  finally{ syncing=false; }
}
let autoSyncT=null;
function maybeAutoSync(){
  if(!(sb && sbUser && S.settings.autoSync)) return;
  clearTimeout(autoSyncT); autoSyncT=setTimeout(()=>{ syncNow(); }, 2500);
}

/* =====================================================================
   EVENT WIRING
   ===================================================================== */
function setMode(m){
  timer.mode=m;
  $$('#modeSeg .seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===m));
  $('targetField').hidden = m!=='stopwatch'? false : true;
  timerRender();
}
function wireTimer(){
  // give ring wrapper an id handle
  document.querySelector('.ring-wrap').id='ringWrapEl';
  $('btnStart').addEventListener('click', timerToggle);
  $('btnReset').addEventListener('click', ()=>{ if(timerElapsed()<5||confirm('Reset the timer?')) timerReset(); });
  $('btnFinish').addEventListener('click', openFinish);
  $$('#modeSeg .seg-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('targetMin').addEventListener('change',()=>{ timer.targetSec=clamp(+$('targetMin').value||50,1,600)*60; timerRender(); });
  $('breakOn').addEventListener('change',()=>{ timer.breakOn=$('breakOn').checked; updateBreakHint(); timerRender(); });
  $('btnAddExamTimer').addEventListener('click',()=>openExamModal());
  $('finishEffort').addEventListener('input',e=>$('finishEffortVal').textContent=e.target.value);
  $('finishAtt').addEventListener('input',e=>$('finishAttVal').textContent=e.target.value);
  $('finishSave').addEventListener('click', saveFinish);
  $('finishDiscard').addEventListener('click',()=>{ if(confirm('Discard this session without logging?')){ $('finishModal').hidden=true; timerReset(); } });
  $('bannerOk').addEventListener('click',()=>{ $('banner').hidden=true; });
}
function updateBreakHint(){
  $('breakHint').textContent = $('breakOn').checked
    ? `Every ${S.settings.breakEvery} min: a chime + a reminder to take a break.`
    : 'Break reminders are off for this session.';
}
function wirePlanTab(){
  $('btnAddExamPlan').addEventListener('click',()=>openExamModal());
  $$('#planKindSeg .seg-btn').forEach(b=>b.addEventListener('click',()=>{
    planKind=b.dataset.kind;
    $$('#planKindSeg .seg-btn').forEach(x=>x.classList.toggle('active',x===b));
    $('planDateField').hidden = planKind!=='once';
    $('planWeekdayField').hidden = planKind!=='weekly';
  }));
  $$('#planWeekday button').forEach(b=>b.addEventListener('click',()=>{
    $$('#planWeekday button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); planWeekday=+b.dataset.wd;
  }));
  $('btnAddPlan').addEventListener('click', doAddPlan);
}
function wireInsights(){
  $$('#rangeSeg .seg-btn').forEach(b=>b.addEventListener('click',()=>{
    insightsRange=+b.dataset.range; $$('#rangeSeg .seg-btn').forEach(x=>x.classList.toggle('active',x===b));
    renderMinutesChart(activeSessions().slice().sort((a,b)=>new Date(a.startTs)-new Date(b.startTs)), insightsRange);
  }));
}
function wireLog(){
  $('mEffort').addEventListener('input',e=>$('mEffortVal').textContent=e.target.value);
  $('mAttention').addEventListener('input',e=>$('mAttentionVal').textContent=e.target.value);
  $('btnAddManual').addEventListener('click', saveManual);
  $('btnNewExam').addEventListener('click',()=>openExamModal());
  $('histExamFilter').addEventListener('change', renderHistory);
  $('btnExportCsv').addEventListener('click', exportCsv);
  $('examSave').addEventListener('click', saveExamModal);
  $('examCancel').addEventListener('click',()=>{ $('examModal').hidden=true; });
}
function closeAllModals(){
  $$('.modal-back').forEach(m=>{ if(!m.hidden) m.hidden=true; });
}
function wireModals(){
  // click on the dark backdrop (but not inside the dialog) closes it
  $$('.modal-back').forEach(back=>{
    back.addEventListener('mousedown', e=>{ if(e.target===back) back.hidden=true; });
  });
  // any ✕ close button inside a modal
  $$('.modal-x').forEach(x=>x.addEventListener('click',()=>{ const m=x.closest('.modal-back'); if(m) m.hidden=true; }));
  // Escape closes any open modal / banner
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ closeAllModals(); $('banner').hidden=true; }
  });
}
function wireSettings(){
  $$('#accentPick .ac').forEach(b=>b.addEventListener('click',()=>{
    S.settings.accent=b.dataset.accent; save(); applyAccent(b.dataset.accent); renderSettings(); maybeAutoSync();
  }));
  const num=(id,key,min,max)=>$(id).addEventListener('change',()=>{ S.settings[key]=clamp(+$(id).value||min,min,max); $(id).value=S.settings[key]; save(); updateBreakHint(); });
  num('setBreakEvery','breakEvery',5,180); num('setLongWarn','longWarn',0,300);
  const tog=(id,key)=>$(id).addEventListener('change',()=>{ S.settings[key]=$(id).checked; save(); });
  tog('setSound','sound'); tog('setVoice','voice'); tog('setAutoSync','autoSync');
  $('setNotif').addEventListener('change', async()=>{
    if($('setNotif').checked){
      if(!('Notification' in window)){ toast('Notifications not supported here.'); $('setNotif').checked=false; return; }
      const perm=await Notification.requestPermission();
      if(perm!=='granted'){ $('setNotif').checked=false; toast('Notification permission denied.'); return; }
    }
    S.settings.notif=$('setNotif').checked; save();
  });
  $('btnTestAnnounce').addEventListener('click',()=>announce({icon:'🔔',title:'Test announcement',sub:"This is how reminders will look and sound.",say:"This is a test announcement."}));
  $('btnSaveSb').addEventListener('click', sbSaveConn);
  $('btnSignIn').addEventListener('click',()=>sbAuth('in'));
  $('btnSignUp').addEventListener('click',()=>sbAuth('up'));
  $('btnSignOut').addEventListener('click', sbSignOut);
  $('btnSyncNow').addEventListener('click', syncNow);
  $('btnExport').addEventListener('click', exportBackup);
  $('btnImport').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',e=>{ if(e.target.files[0]) importBackup(e.target.files[0]); e.target.value=''; });
  $('btnDemo').addEventListener('click', loadDemo);
  $('btnClear').addEventListener('click', clearAll);
}

/* install prompt */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; const b=$('btnInstall'); if(b){ b.hidden=false; } });
function wireInstall(){
  const b=$('btnInstall'); if(!b)return;
  b.addEventListener('click', async()=>{ if(!deferredPrompt)return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; b.hidden=true; });
}

/* =====================================================================
   INIT
   ===================================================================== */
async function init(){
  load();
  applyAccent(S.settings.accent);
  populateExamSelects();
  wireNav(); wireTimer(); wirePlanTab(); wireInsights(); wireLog(); wireSettings(); wireInstall(); wireModals();
  setMode('stopwatch');
  timer.targetSec=clamp(+$('targetMin').value||50,1,600)*60;
  timer.breakEvery=(S.settings.breakEvery||25)*60; timer.nextBreak=timer.breakEvery;
  updateBreakHint(); timerRender();

  // open requested view (manifest shortcuts / deep link)
  const params=new URLSearchParams(location.search);
  const v=params.get('view'); if(v && document.getElementById('view-'+v)) setView(v);

  // service worker
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('service-worker.js'); }catch(e){ /* file:// or blocked */ }
  }
  // sync init (non-blocking)
  if(S.sync.url && S.sync.key){
    sbInit().then(()=>{ refreshSyncUi(); if(sbUser && S.settings.autoSync) syncNow(); }).catch(()=>refreshSyncUi());
  } else { setSyncStatus('','Local only'); }

  // keep devices in sync without manual action: pull on focus, on reconnect, and periodically
  const maybePull=()=>{ if(sb && sbUser && S.settings.autoSync && navigator.onLine && !syncing) syncNow(); };
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) maybePull(); });
  window.addEventListener('focus', maybePull);
  window.addEventListener('online', maybePull);
  setInterval(maybePull, 30000);

  // warn before leaving mid-session
  window.addEventListener('beforeunload',e=>{ if(timer.running){ e.preventDefault(); e.returnValue=''; } });
}
document.addEventListener('DOMContentLoaded', init);
