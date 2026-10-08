import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const engineSource=fs.readFileSync(new URL('../public/review-engine.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const T=Date.UTC(2026,9,8,8),DAY=86400000,RETRY=600000;
const copy=x=>JSON.parse(JSON.stringify(x));
const core=vm.createContext({Date,Math,JSON});vm.runInContext(engineSource,core);const R=core.AtlasReview;
const reviewed=(extra={})=>({...copy(R.rate(null,'good',T,'first')),phase:'review',reps:4,stability:5,difficulty:5,lastReviewAt:T,dueAt:T+5*DAY,...extra});

function harness(){
  const store=new Map(),elements=new Map(),events=[],patches=[],merges=[];
  let sync={connected:false,role:undefined,busy:false,error:'',pending:0,lastSync:null,conflicts:{}},code='';
  class FixedDate extends Date{constructor(...a){super(...(a.length?a:[T]));}static now(){return T;}}
  const context={console,Date:FixedDate,Math,JSON,URLSearchParams,URL,Blob,crypto:webcrypto,Promise,setTimeout:()=>1,clearTimeout(){},scrollTo(){},scrollY:0,
    location:{hash:'#review'},history:{replaceState(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},sessionStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){}},
    document:{activeElement:null,querySelector:s=>elements.get(s)||null,querySelectorAll:s=>elements.get(s)||[],documentElement:{},createElement:()=>({click(){}})},
    AtlasSync:{status:()=>copy(sync),code:()=>code,patch:(id,p)=>patches.push([id,copy(p)]),merge:p=>merges.push(copy(p))}};
  vm.createContext(context);vm.runInContext(engineSource,context);
  // Load the real application definitions; startup fetches and browser listeners
  // are outside this slice. We exercise actual UI/import/sync handlers below.
  vm.runInContext(appSource.slice(0,appSource.indexOf("window.addEventListener('hashchange'")),context);
  context.testEvents=events;vm.runInContext("render=()=>testEvents.push('render');toast=x=>testEvents.push(x);",context);
  const evaluate=source=>vm.runInContext(source,context);
  const set=(name,value)=>{context.fixture=value;evaluate(`${name}=fixture`);delete context.fixture;};
  const card={id:'m01-c01',module:'m01',minutes:10,title:{zh:'测试卡',en:'Test card'},question:{zh:'问题标记',en:'QUESTION_MARKER'},intuition:{zh:'直觉答案标记',en:'INTUITION_SECRET'},formula:'FORMULA_SECRET',symbols:{zh:'符号标记',en:'SYMBOL_SECRET'},example:{zh:'例子答案标记',en:'EXAMPLE_SECRET'},quiz:{question:{zh:'自测问题',en:'Quiz prompt'},options:[{zh:'甲',en:'A'},{zh:'乙',en:'B'},{zh:'丙',en:'C'}],correct:1,explanation:{zh:'自测答案标记',en:'QUIZ_SECRET'}}};
  set('cards',[card]);set('state',{lang:'en',cards:{},pace:25});
  return{context,store,elements,events,patches,merges,evaluate,set,card,setSync:(value,key='vault-a')=>{sync={...sync,...value};code=sync.connected?key:'';return copy(sync);},status:()=>copy(sync),flush:()=>new Promise(r=>setImmediate(r))};
}

test('first learning and same-session repeated grading are idempotent',()=>{
 const first=R.rate(null,'easy',T,'s');assert.equal(first.phase,'learning');assert.equal(first.dueAt,T+RETRY);
 for(const grade of ['again','hard','good','easy'])assert.deepEqual(copy(R.rate(first,grade,T+RETRY-1,'s',false)),copy(first));
 assert.equal(first.reps,1);assert.equal(first.lapses,0);
});
test('short recall can graduate learning but cannot grow stability or postpone an existing due date',()=>{
 const first=R.rate(null,'good',T,'s'),check=R.rate(first,'easy',T+RETRY,'s');
 assert.equal(check.phase,'review');assert.equal(check.stability,first.stability);
 const old=reviewed(),practice=R.rate(old,'easy',T+20*60000,'other');
 assert.equal(practice.stability,old.stability);assert.ok(practice.dueAt<=old.dueAt);
});
test('actual spacing changes growth; missed recall or an incorrect quiz reduces stability and retries shortly',()=>{
 const old=reviewed(),short=R.rate(old,'good',T+20*60000,'new'),late=R.rate(old,'good',T+10*DAY,'new',true);
 assert.ok(late.stability>short.stability);assert.ok(R.recall(old,T+10*DAY)<R.recall(old,T+DAY));
 for(const grade of ['again','hard','good','easy']){
  const failed=R.rate(old,grade,T+10*DAY,'new',false);
  assert.equal(failed.phase,'relearning');assert.ok(failed.stability<=old.stability);assert.equal(failed.dueAt,T+10*DAY+RETRY);assert.equal(failed.lapses,old.lapses+1);
 }
 const manyLapses=R.rate({...old,lapses:6},'good',T+10*DAY,'new');assert.ok(manyLapses.stability<late.stability);
});
test('records are immutable, history is bounded, and impossible timestamps are rejected',()=>{
 const original=reviewed(),before=copy(original);let next=original;
 for(let i=1;i<65;i++)next=R.rate(next,'good',T+i*20*DAY,'s'+i);
 assert.deepEqual(original,before);assert.equal(next.history.length,40);assert.ok(Number.isFinite(next.dueAt));assert.ok(next.stability<=3650);
 assert.equal(R.normalize({...original,dueAt:Infinity}),null);assert.equal(R.normalize({...original,lastReviewAt:-1}),null);assert.equal(R.normalize({...original,dueAt:9e15}),null);
});
test('legacy migration keeps notes, bookmarks, calendar dates, and a first short check for seen-only cards',()=>{
 const p={note:'My note',bookmark:true,seenAt:'2026-10-01T12:00:00Z',lastReviewed:'2026-10-03',reviewAt:'2026-10-07',interval:4};
 const migrated=R.migrateLegacy(p,T);assert.equal(migrated.note,p.note);assert.equal(migrated.bookmark,true);assert.equal(migrated.reviewAt,p.reviewAt);assert.equal(migrated.memory.dueAt,Date.parse(p.reviewAt+'T00:00:00'));assert.equal(migrated.memory.history.length,0);
 const seen=R.migrateLegacy({seenAt:p.seenAt,note:p.note},T);assert.equal(seen.memory.reps,0);assert.equal(R.rate(seen.memory,'good',T,'s').dueAt,T+RETRY);
});
test('queues enforce count/time caps, skip unseen/future cards, and prioritize overdue weaker memories',()=>{
 const cards=Array.from({length:50},(_,i)=>({id:'c'+i,minutes:10})),progress=Object.fromEntries(cards.map(c=>[c.id,{memory:reviewed({dueAt:T-1})}]));
 progress.c0.memory=reviewed({lastReviewAt:T-20*DAY,dueAt:T-19*DAY,stability:.5});progress.c1.memory=reviewed({dueAt:T+DAY});delete progress.c2;
 assert.equal(R.queue(cards,progress,T,{limit:999}).length,20);assert.equal(R.queue(cards,progress,T,{limit:20,minutes:5}).length,2);
 const q=R.queue(cards,progress,T,{limit:20});assert.equal(q[0].id,'c0');assert.ok(!q.some(c=>['c1','c2'].includes(c.id)));
 assert.equal(R.queue(cards,progress,T,{limit:0}).length,0);assert.equal(R.queue(cards,progress,T,{minutes:0}).length,0);
});
test('real recall UI reveals no answer before recall, in either language',()=>{
 const x=harness();x.set('atlasRecallState',{ids:[x.card.id],index:0,revealed:false,results:[]});
 for(const lang of ['zh','en']){
  x.evaluate(`state.lang='${lang}'`);const hidden=x.evaluate('renderRecallSession()');
  for(const secret of ['直觉答案标记','例子答案标记','自测答案标记','INTUITION_SECRET','FORMULA_SECRET','EXAMPLE_SECRET','QUIZ_SECRET'])assert.ok(!hidden.includes(secret));
  assert.ok(hidden.includes('data-adaptive="reveal"'));assert.ok(!hidden.includes('data-adaptive="grade"'));
 }
 x.evaluate('atlasRecallState.revealed=true');const shown=x.evaluate('renderRecallSession()');assert.match(shown,/INTUITION_SECRET/);assert.match(shown,/FORMULA_SECRET/);assert.equal((shown.match(/data-adaptive="grade"/g)||[]).length,4);
});
test('real grading handler uses the current quiz and saves one atomic memory; repeated reader clicks create no sync operation',()=>{
 const x=harness();x.set('atlasRecallState',{ids:[x.card.id],index:0,revealed:true,choice:0,results:[]});
 const button={dataset:{adaptive:'grade',rating:'easy'}};x.elements.set('[data-adaptive]',[button]);x.evaluate('bindAdaptiveReview()');button.onclick();
 const m=x.evaluate('state.cards["m01-c01"].memory');assert.equal(m.lapses,1);assert.equal(m.dueAt,T+RETRY);assert.equal(x.patches.length,1);assert.equal(x.patches[0][1].quizCorrect,false);assert.ok(x.patches[0][1].memory);
 x.evaluate('atlasRateReader("m01-c01","easy",true)');assert.equal(x.patches.length,1);assert.equal(x.evaluate('state.cards["m01-c01"].memory.reps'),1);
});
test('local backup import preserves differing whole memory and note versions until explicit resolution',async()=>{
 const x=harness(),old=reviewed(),incoming=reviewed({stability:9,reps:8,history:[{at:T,rating:'easy'}]});x.set('state.cards',{[x.card.id]:{memory:old,note:'current note'}});
 const raw={format:'econometrics-atlas-v1',state:{cards:{[x.card.id]:{memory:incoming,note:'imported note',bookmark:true}}}};
 x.context.file={size:200,text:async()=>JSON.stringify(raw)};await x.evaluate('importProgress(file)');
 assert.deepEqual(copy(x.evaluate('state.cards["m01-c01"].memory')),old);assert.equal(x.evaluate('state.cards["m01-c01"].note'),'current note');assert.equal(x.evaluate('state.cards["m01-c01"].bookmark'),true);
 assert.equal(x.evaluate('Object.keys(state.importConflicts).length'),2);assert.match(x.evaluate('importConflictPanel()'),/imported note/);
 x.evaluate('resolveImportConflict("m01-c01:memory","incoming")');assert.deepEqual(copy(x.evaluate('state.cards["m01-c01"].memory')),copy(R.normalize(incoming)));assert.equal(x.evaluate('state.cards["m01-c01"].note'),'current note');
});
test('imports are validated before mutation and cannot replace a pending imported draft',()=>{
 const x=harness();x.set('state.cards',{[x.card.id]:{note:'current'}});x.context.records={[x.card.id]:{note:'draft'}};x.evaluate('mergeImportedProgress(records)');
 x.context.records={[x.card.id]:{bookmark:true,note:'different'}};assert.throws(()=>x.evaluate('mergeImportedProgress(records)'),/pending/);assert.equal(x.evaluate('state.cards["m01-c01"].bookmark'),undefined);
 x.context.records={[x.card.id]:{bookmark:true,memory:{dueAt:Infinity,lastReviewAt:T}}};assert.throws(()=>x.evaluate('sanitizeImportedProgress(records)'),/invalid/);assert.equal(x.evaluate('state.cards["m01-c01"].bookmark'),undefined);
 x.context.records={[x.card.id]:{note:'only a note'}};assert.equal(x.evaluate('sanitizeImportedProgress(records)["m01-c01"].memory'),undefined);
});
test('connected imports use the cloud merge path and do not bypass CAS with direct patches',async()=>{
 const x=harness();x.setSync({connected:true});x.context.file={size:100,text:async()=>JSON.stringify({format:'econometrics-atlas-v1',state:{cards:{[x.card.id]:{memory:reviewed(),note:'backup'}}}})};
 await x.evaluate('importProgress(file)');assert.equal(x.merges.length,1);assert.equal(x.patches.length,0);assert.deepEqual(x.merges[0][x.card.id].memory,copy(R.normalize(reviewed())));
 x.context.AtlasSync.merge=()=>{throw Error('pending');};await x.evaluate('importProgress(file)');assert.match(x.events.at(-1),/resolve existing drafts/);
});
test('switching study spaces while a file is read cannot import into the new space',async()=>{
 const x=harness();let release;x.context.file={size:10,text:()=>new Promise(r=>release=r)};
 const task=x.evaluate('importProgress(file)');x.setSync({connected:true},'another');release(JSON.stringify({format:'econometrics-atlas-v1',state:{cards:{[x.card.id]:{note:'private'}}}}));await task;
 assert.equal(x.merges.length,0);assert.equal(x.evaluate('state.cards["m01-c01"]'),undefined);assert.match(x.events.at(-1),/space changed/);
});
test('async cloud conflicts redraw sync UI while busy-only status preserves a typed form',async()=>{
 const x=harness();x.context.location.hash='#sync';let s=x.setSync({connected:true});x.context.snapshot=s;x.evaluate('handleAtlasSyncChange(snapshot,{})');await x.flush();x.events.length=0;
 s=x.setSync({busy:true});x.context.snapshot=s;x.evaluate('handleAtlasSyncChange(snapshot,null)');await x.flush();assert.equal(x.events.length,0);
 s=x.setSync({conflicts:{'m01-c01:note':{cardId:x.card.id,field:'note',local:'local draft',remote:'cloud draft'}}});x.context.snapshot=s;x.evaluate('handleAtlasSyncChange(snapshot,null)');await x.flush();assert.deepEqual(x.events,['render']);assert.match(x.evaluate('syncPage()'),/local draft/);assert.match(x.evaluate('syncPage()'),/cloud draft/);
});
test('incoming progress refreshes review overview, preserves an active recall, and resets it on a vault switch',async()=>{
 const x=harness();x.context.snapshot=x.setSync({connected:true},'a');x.evaluate('handleAtlasSyncChange(snapshot,{})');await x.flush();x.events.length=0;
 x.context.incoming={[x.card.id]:{memory:reviewed()}};x.evaluate('handleAtlasSyncChange(snapshot,incoming)');await x.flush();assert.deepEqual(x.events,['render']);
 x.events.length=0;x.set('atlasRecallState',{ids:[x.card.id],index:0,revealed:false,results:[]});x.context.incoming={[x.card.id]:{memory:reviewed({stability:10})}};x.evaluate('handleAtlasSyncChange(snapshot,incoming)');await x.flush();assert.equal(x.events.length,0);assert.ok(x.evaluate('atlasRecallState'));
 x.context.snapshot=x.setSync({connected:true},'b');x.evaluate('handleAtlasSyncChange(snapshot,{})');await x.flush();assert.equal(x.evaluate('atlasRecallState'),null);assert.deepEqual(copy(x.evaluate('state.cards')),{});assert.deepEqual(x.events,['render']);
});
test('synced notes update stale text without replacing a locally edited textarea',()=>{
 const x=harness();x.context.location.hash='#card/'+x.card.id;x.set('state.cards',{[x.card.id]:{note:'old'}});
 const note={dataset:{id:x.card.id},value:'old',selectionStart:1,selectionEnd:1,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};x.elements.set('#card-note',note);x.context.document.activeElement=note;
 x.context.snapshot=x.setSync({connected:true});x.context.incoming={[x.card.id]:{note:'remote'}};x.evaluate('handleAtlasSyncChange(snapshot,incoming)');assert.equal(note.value,'remote');assert.equal(note.selectionStart,1);
 note.value='unsaved DOM draft';x.context.incoming={[x.card.id]:{note:'newer remote'}};x.evaluate('handleAtlasSyncChange(snapshot,incoming)');assert.equal(note.value,'unsaved DOM draft');
});
