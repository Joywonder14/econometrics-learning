import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = fs.readFileSync(new URL('./public/sync.js', import.meta.url), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const flush = async () => { for (let i=0;i<80;i++) await Promise.resolve(); };
const response = (body,status=200) => ({ok:status>=200&&status<300,status,json:async()=>clone(body)});

function storage() {
  const values=new Map();
  return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),values};
}
function server() {
  const vaults={A:new Map(),B:new Map()}, calls=[];
  const s={vaults,calls,offline:false,intercept:null};
  s.write=(vault,id,field,value,opId='remote-'+randomUUID())=>{
    const key=id+':'+field,old=vaults[vault].get(key);
    const r={cardId:id,field,value:clone(value),version:(old?.version||0)+1,updatedAt:new Date().toISOString(),opId};
    vaults[vault].set(key,r);return clone(r);
  };
  s.fetch=async(path,options)=>{
    const code=(options.headers.Authorization||'').replace('Bearer ',''),body=options.body?JSON.parse(options.body):null;
    const req={path,code,method:options.method,body};calls.push(req);
    const next=async()=>{
      if(s.offline)throw new Error('Network unavailable');
      if(path==='/api/sync/create')return response({code:'A'});
      if(!vaults[code])return response({error:'Invalid capability'},401);
      if(path==='/api/session')return response({connected:true,vaultId:code,role:code==='A'?'admin':'learner'});
      if(options.method==='GET')return response({records:[...vaults[code].values()]});
      const results=body.patches.map(p=>{
        const k=p.cardId+':'+p.field,current=vaults[code].get(k);
        if(current?.opId===p.opId)return{...p,status:'duplicate',record:clone(current)};
        if((current?.version||0)!==p.baseVersion)return{...p,status:'conflict',record:current?clone(current):null};
        return{...p,status:'applied',record:s.write(code,p.cardId,p.field,p.value,p.opId)};
      });
      return response({results});
    };
    return s.intercept?s.intercept(req,next):next();
  };
  return s;
}
function client(s,store=storage()) {
  let currentCards={},currentStatus={};const jobs=new Map();let timerId=0;
  const win={addEventListener(){}},doc={visibilityState:'visible',addEventListener(){}};
  const context={window:win,document:doc,localStorage:store,crypto:{randomUUID},AbortController,
    fetch:s.fetch,Date,JSON,Math,Number,String,Object,Array,Set,console,
    setTimeout:(fn)=>{const id=++timerId;jobs.set(id,fn);return id;},clearTimeout:id=>jobs.delete(id)};
  vm.createContext(context);vm.runInContext(source,context);
  const api=win.AtlasSync;
  api.init({onChange:(status,cards)=>{currentStatus=clone(status);if(cards)currentCards=clone(cards);},onDisconnect:()=>{currentCards={};}});
  return{api,store,jobs,get cards(){return currentCards;},get status(){return currentStatus;},cache:vault=>JSON.parse(store.getItem('atlas-sync-vault-v2:'+vault))};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name);}

await test('offline drafts survive reload; refresh preserves conflict draft',async()=>{
  const s=server();s.write('A','m01-c01','note','cloud v1');const c=client(s);await c.api.connect('A');
  s.offline=true;c.api.patch('m01-c01',{note:'offline draft'});await c.api.sync();
  assert.equal(c.cache('A').cards['m01-c01'].note,'offline draft');assert.equal(c.api.status().pending,1);
  const restored=client(s,c.store);await flush();assert.equal(restored.api.status().pending,1);assert.equal(restored.cards['m01-c01'].note,'offline draft');
  s.offline=false;s.write('A','m01-c01','note','other device v2');await restored.api.sync();
  let conflict=restored.api.status().conflicts['m01-c01:note'];assert.equal(conflict.local,'offline draft');assert.equal(conflict.remote,'other device v2');
  s.write('A','m01-c01','note','other device v3');await restored.api.sync();conflict=restored.api.status().conflicts['m01-c01:note'];assert.equal(conflict.local,'offline draft');assert.equal(conflict.remote,'other device v3');
  restored.api.resolve('m01-c01:note','local');await restored.api.sync();assert.equal(s.vaults.A.get('m01-c01:note').value,'offline draft');assert.equal(restored.api.status().pending,0);
});

await test('edit arriving during POST remains visible and rebases on acknowledged version',async()=>{
  const s=server(),c=client(s);await c.api.connect('A');const arrived=deferred(),release=deferred();
  s.intercept=async(req,next)=>{const res=await next();if(req.method==='POST'){arrived.resolve();await release.promise;}return res;};
  c.api.patch('m01-c01',{note:'first'});const run=c.api.sync();await arrived.promise;
  c.api.patch('m01-c01',{note:'edited while saving'});release.resolve();await run;
  assert.equal(c.cards['m01-c01'].note,'edited while saving');assert.equal(c.cache('A').pending['m01-c01:note'].baseVersion,1);assert.equal(c.api.status().pending,1);
  s.intercept=null;await c.api.sync();assert.equal(s.vaults.A.get('m01-c01:note').value,'edited while saving');assert.equal(c.api.status().pending,0);
});

await test('lost POST response is recovered by opId without duplicate revision',async()=>{
  const s=server(),c=client(s);await c.api.connect('A');
  s.intercept=async(req,next)=>{const res=await next();if(req.method==='POST')throw new Error('response lost');return res;};
  c.api.patch('m01-c01',{note:'committed once'});await c.api.sync();assert.equal(c.api.status().pending,1);assert.equal(s.vaults.A.get('m01-c01:note').version,1);
  s.intercept=null;await c.api.sync();assert.equal(c.api.status().pending,0);assert.equal(s.vaults.A.get('m01-c01:note').version,1);
});

await test('stale GET cannot roll back an acknowledged cached version',async()=>{
  const s=server();const old=s.write('A','m01-c01','note','old');s.write('A','m01-c01','note','new');const c=client(s);await c.api.connect('A');
  s.intercept=(req,next)=>req.path==='/api/progress'&&req.method==='GET'?response({records:[old]}):next();
  await c.api.sync();assert.equal(c.cards['m01-c01'].note,'new');assert.equal(c.cache('A').versions['m01-c01:note'],2);
});

await test('last connection intent wins when authentication replies are reversed',async()=>{
  const s=server(),c=client(s),arrived=deferred(),release=deferred();
  s.write('A','m01-c01','note','private admin');s.write('B','m02-c01','note','learner');
  s.intercept=async(req,next)=>{if(req.path==='/api/session'&&req.code==='A'){arrived.resolve();await release.promise;}return next();};
  const first=c.api.connect('A').catch(e=>e.message);await arrived.promise;await c.api.connect('B');release.resolve();assert.equal(await first,'superseded');
  assert.equal(c.api.code(),'B');assert.equal(c.api.status().busy,false);assert.equal(c.cards['m02-c01'].note,'learner');assert.equal(c.cards['m01-c01'],undefined);
});

await test('disconnect cancels an in-flight connection intent',async()=>{
  const s=server(),c=client(s),arrived=deferred(),release=deferred();
  s.intercept=async(req,next)=>{if(req.path==='/api/session'){arrived.resolve();await release.promise;}return next();};
  const run=c.api.connect('A').catch(e=>e.message);await arrived.promise;c.api.disconnect();release.resolve();assert.equal(await run,'superseded');assert.equal(c.api.status().connected,false);assert.equal(c.store.getItem('atlas-sync-active-v2'),null);
});

await test('vault switch during GET isolates old response and does not leave busy stuck',async()=>{
  const s=server(),c=client(s);s.write('A','m01-c01','note','admin');s.write('B','m02-c01','note','learner');await c.api.connect('A');
  const arrived=deferred(),release=deferred();s.intercept=async(req,next)=>{const res=await next();if(req.path==='/api/progress'&&req.code==='A'&&req.method==='GET'){arrived.resolve();await release.promise;}return res;};
  const old=c.api.sync();await arrived.promise;await c.api.connect('B');release.resolve();await old;
  assert.equal(c.api.code(),'B');assert.equal(c.api.status().busy,false);assert.equal(c.cards['m01-c01'],undefined);assert.equal(c.cards['m02-c01'].note,'learner');assert.equal(c.cache('A').cards['m01-c01'].note,'admin');
});

await test('snapshot merge rejects overwriting pending drafts before any partial import',async()=>{
  const s=server(),c=client(s);await c.api.connect('A');s.offline=true;c.api.patch('m01-c01',{note:'pending local'});
  assert.throws(()=>c.api.merge({'m02-c01':{bookmark:true},'m01-c01':{note:'imported stale'}}),/pending/);
  assert.equal(c.cache('A').cards['m02-c01'],undefined);assert.equal(c.cache('A').pending['m01-c01:note'].value,'pending local');
});

await test('independent fields merge across devices while memory stays atomic',async()=>{
  const s=server(),a=client(s),b=client(s);await a.api.connect('B');await b.api.connect('B');
  a.api.patch('m01-c01',{note:'device A'});b.api.patch('m01-c01',{bookmark:true});await a.api.sync();await b.api.sync();await a.api.sync();assert.equal(a.cards['m01-c01'].note,'device A');assert.equal(a.cards['m01-c01'].bookmark,true);
  a.api.patch('m01-c01',{memory:{reps:3,stability:7}});b.api.patch('m01-c01',{memory:{reps:2,stability:2}});await a.api.sync();await b.api.sync();
  const conflict=b.api.status().conflicts['m01-c01:memory'];assert.deepEqual(conflict.local,{reps:2,stability:2});assert.deepEqual(conflict.remote,{reps:3,stability:7});
});

await test('restored conflict refresh updates only remote side; resolution preserves its chosen draft',async()=>{
  const s=server(),c=client(s);s.write('A','m01-c01','note','cloud');await c.api.connect('A');c.api.merge({'m01-c01':{note:'imported draft'}});
  const restored=client(s,c.store);await flush();assert.equal(restored.api.status().conflicts['m01-c01:note'].local,'imported draft');
  restored.api.resolve('m01-c01:note','local');await restored.api.sync();assert.equal(s.vaults.A.get('m01-c01:note').value,'imported draft');
});

console.log(`Client sync: ${passed} scenarios passed.`);
