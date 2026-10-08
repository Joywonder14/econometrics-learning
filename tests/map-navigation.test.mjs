import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const store=new Map(), element={innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){}},setAttribute(){}};
const sandbox={console,crypto:webcrypto,AbortController,sessionStorage:{getItem(){return null;},setItem(){}},URLSearchParams,URL,Blob,Date,Math,JSON,setTimeout:()=>1,clearTimeout(){},scrollTo(){},scrollY:0,innerWidth:1440,location:{hash:'#home'},history:{replaceState(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},window:{addEventListener(){}},document:{getElementById(){return null;},documentElement:{lang:'zh-CN'},title:'',querySelector:s=>['#app','.skip','#toast','#quiz-area'].includes(s)?element:null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}})},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('public/'+url.split('?')[0],'utf8'))})};
sandbox.window=sandbox;sandbox.addEventListener=()=>{};vm.createContext(sandbox);
for(const file of ['review-engine','sync','app'])vm.runInContext(fs.readFileSync('public/'+file+'.js','utf8'),sandbox);
await new Promise(resolve=>setImmediate(resolve));
const inspect=code=>vm.runInContext(code,sandbox);
const parsed=html=>new URLSearchParams(html.split('?')[1]||'');

test('real data renders a non-overlapping curved tree for every branch, including extensions',()=>{
 const ids=inspect('modules.map(m=>m.id)');
 for(const lang of ['zh','en']){
  inspect(`state.lang=${JSON.stringify(lang)}`);
  for(const advanced of [false,true])for(const id of ['',...ids]){
   const query=new URLSearchParams({...id?{module:id}:{},...advanced?{advanced:'1'}:{}});
   const html=inspect(`learningMap(new URLSearchParams(${JSON.stringify(String(query))}))`), model=inspect('learningMap.model');
   assert.equal(model.nodes.filter(n=>n.kind==='root').length,1);
   assert.equal(model.nodes.filter(n=>n.kind==='stage').length,5);
   assert.equal((html.match(/<path d="M /g)||[]).length,model.nodes.length-1);
   assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
   assert.ok(!html.includes('NaN')&&!html.includes('undefined'));
   for(let i=0;i<model.nodes.length;i++)for(let j=i+1;j<model.nodes.length;j++){
    const a=model.nodes[i],b=model.nodes[j];
    assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.y-b.y)>=(a.h+b.h)/2,`${query}: ${a.id}/${b.id}`);
   }
   if(model.chosen){assert.ok(model.parent.includes('stage='+model.chosen.stage));assert.ok(!model.parent.includes('module='));}
  }
 }
});

test('default map collapses children and hides extensions; bad stage falls back safely',()=>{
 inspect("learningMap(new URLSearchParams())");assert.equal(inspect('learningMap.model.nodes.length'),6);
 const extension=inspect("modules.find(m=>m.level==='extension').id");
 inspect(`learningMap(new URLSearchParams('module=${extension}'))`);assert.equal(inspect('learningMap.model.chosen'),undefined);
 inspect(`learningMap(new URLSearchParams('module=${extension}&advanced=1'))`);assert.equal(inspect('learningMap.model.chosen.id'),extension);
 inspect("learningMap(new URLSearchParams('stage=invalid'))");assert.equal(inspect('learningMap.model.selected'),null);
});

test('reader map parent preserves extension toggle even in a core module',()=>{
 const c=inspect("cards.find(c=>moduleBy(c.module).level!=='extension')");
 sandbox.location.hash='#card/'+c.id+'?from=map&stage=4&module=other&advanced=1';
 const back=inspect(`readerNavigation(cards.find(c=>c.id==='${c.id}')).backHref`);
 const params=parsed(back);
 assert.ok(back.startsWith('#map?'));assert.equal(params.get('module'),c.module);assert.equal(params.get('advanced'),'1');
 assert.equal(params.get('stage'),String(inspect(`moduleBy('${c.module}').stage`)));
 const html=inspect(`reader('${c.id}')`);
 assert.match(html,/class="backlink"/);assert.ok(html.includes('advanced=1'));
});

test('pager and prerequisites retain map context and point to each destination parent',()=>{
 const current=inspect("cards.find(c=>c.prerequisites?.length)");
 const target=inspect("cards.find(c=>moduleBy(c.module).level==='extension')");
 sandbox.location.hash='#card/'+current.id+'?from=map';
 const href=inspect(`readerNavigation(cards.find(c=>c.id==='${current.id}')).cardHref(cards.find(c=>c.id==='${target.id}'))`);
 const params=parsed(href);assert.equal(params.get('from'),'map');assert.equal(params.get('module'),target.module);assert.equal(params.get('advanced'),'1');
 const html=inspect(`reader('${current.id}')`);
 for(const href of [...html.matchAll(/href="(#card\/[^\"]+)"/g)].map(m=>m[1]))assert.ok(href.includes('from=map'),href);
});

test('library search/module/status survive opening a card, paging and returning',()=>{
 const c=inspect('cards[0]');
 const filter=new URLSearchParams({q:'OLS & 估计 "条件"',module:c.module,status:'saved'});
 sandbox.location.hash='#cards?'+filter;
 const link=inspect(`cardReaderHref(cards[0])`), p=parsed(link);
 assert.equal(p.get('from'),'cards');for(const k of ['q','module','status'])assert.equal(p.get(k),filter.get(k));
 const tile=inspect('cardTile(cards[0])');assert.ok(tile.includes('from=cards'));assert.ok(!tile.includes('"条件"'));
 sandbox.location.hash=link;
 const before=inspect('JSON.stringify(state.cards)'), back=inspect('readerNavigation(cards[0]).backHref');
 for(const k of ['q','module','status'])assert.equal(parsed(back).get(k),filter.get(k));
 const next=inspect('readerNavigation(cards[0]).cardHref(cards[1])');for(const k of ['q','module','status'])assert.equal(parsed(next).get(k),filter.get(k));
 inspect('reader(cards[0].id)');assert.equal(inspect('JSON.stringify(state.cards)'),before,'Navigation rendering must not modify progress');
});
