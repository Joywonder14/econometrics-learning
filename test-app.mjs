import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const store=new Map(),element={innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){}},setAttribute(){}};
const sandbox={console,crypto:webcrypto,AbortController,sessionStorage:{getItem(){return null;},setItem(){}},URLSearchParams,URL,Blob,Date,Math,JSON,setTimeout:()=>1,clearTimeout(){},scrollTo(){},scrollY:0,innerWidth:1440,location:{hash:'#home'},history:{replaceState(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},window:{addEventListener(){}},document:{getElementById(){return null;},documentElement:{lang:'zh-CN'},title:'',querySelector:s=>['#app','.skip','#toast','#quiz-area'].includes(s)?element:null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}})},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('public/'+url.split('?')[0],'utf8'))})};
sandbox.window=sandbox; sandbox.addEventListener=()=>{};vm.createContext(sandbox);for(const file of ['review-engine','sync','app'])vm.runInContext(fs.readFileSync('public/'+file+'.js','utf8'),sandbox);
await new Promise(resolve=>setImmediate(resolve));
const inspect=code=>vm.runInContext(code,sandbox);
assert.equal(inspect('cards.length'),114);
let rendered=0;
for(const lang of ['zh','en']){
 inspect(`state.lang='${lang}'`);
 const report=inspect(`cards.map(c=>({id:c.id,html:reader(c.id)}))`);
 for(const {id,html} of report){assert(html.includes('quiz-area'),id);assert(!/\[object Object\]|>undefined<|NaN/.test(html),id);rendered++;}
 for(const page of ['overview()','learningMap(new URLSearchParams())','cardsPage(new URLSearchParams())','reviewPage(new URLSearchParams())','booksPage()','coveragePage(new URLSearchParams())','syncPage()'])assert(inspect(page).length>200);
 for(const lab of ['ols','ovb','did'])assert(!inspect(`lab='${lab}';labContent()`).includes('NaN'));
}
assert.equal(inspect(`cardFilter(new URLSearchParams('q=OLS')).length>0`),true);
assert.equal(inspect(`cardFilter(new URLSearchParams('q=不存在的唯一关键词xyz')).length`),0);
assert.equal(inspect(`cardFilter(new URLSearchParams('module=m00')).length`),6);
inspect(`action({dataset:{action:'rate',id:'m00-c01',rating:'good'}})`);
assert.equal(inspect(`pFor('m00-c01').memory.phase`),'learning');
const initialDue=inspect(`pFor('m00-c01').memory.dueAt`);
inspect(`action({dataset:{action:'rate',id:'m00-c01',rating:'good'}})`);
assert.equal(inspect(`pFor('m00-c01').memory.dueAt`),initialDue,'Immediate re-rating is idempotent');
const fit=inspect(`moments([1,2,3,4],[3,5,7,9])`);assert.equal(fit.a,1);assert.equal(fit.b,2);assert.equal(fit.se,0);
await inspect(`importProgress({size:500,text:async()=>JSON.stringify({format:'econometrics-atlas-v1',state:{cards:{'m00-c02':{note:'Imported test note',bookmark:true,mastered:true,quizChoice:99,interval:-1},unknown:{note:'Ignore'}}}})})`);
assert.equal(inspect(`pFor('m00-c02').note`),'Imported test note');
assert.equal(inspect(`pFor('m00-c02').bookmark`),true);
assert.equal(inspect(`pFor('m00-c02').quizChoice`),undefined,'Reject invalid quiz option');
assert.equal(inspect(`pFor('m00-c02').interval`),undefined,'Reject invalid interval');
assert.equal(inspect(`state.cards.unknown`),undefined,'Ignore unrecognized card IDs');
console.log(JSON.stringify({status:'PASS',bilingualCardViewsRendered:rendered,pages:14,labs:6,checks:['search','module filter','review memory integration','sample OLS algebra','markup completeness']},null,2));
