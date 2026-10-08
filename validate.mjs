import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const files=['primer','foundations','applied','causal','extensions'];
const data=files.map(f=>JSON.parse(readFileSync(`public/data/${f}.json`,'utf8')));
const modules=data.flatMap(d=>d.modules),cards=data.flatMap(d=>d.cards);
const ids=new Set(cards.map(c=>c.id)),mods=new Set(modules.map(m=>m.id));
assert.equal(ids.size,cards.length,'Duplicate card IDs');
assert.equal(mods.size,modules.length,'Duplicate module IDs');
assert.equal(cards.length,114,'Expected 114 complete cards');
assert.equal(modules.length,23,'Expected 23 complete modules');
function bilingual(value,label){assert.equal(typeof value.zh,'string',label+' zh');assert.equal(typeof value.en,'string',label+' en');assert(value.zh.trim().length>0&&value.en.trim().length>0,label+' empty');}
for(const m of modules){bilingual(m.title,m.id);bilingual(m.description,m.id);assert(m.stage>=0&&m.stage<=4);for(const p of m.prerequisites||[])assert(mods.has(p),`${m.id} missing prerequisite ${p}`);assert.equal(cards.filter(c=>c.module===m.id).length,m.id==='m00'||m.id==='m19'?6:m.level==='extension'?4:5);}
let zhCharacters=0,enWords=0;
for(const c of cards){assert(mods.has(c.module));for(const field of ['title','question','intuition','symbols','example','pitfall'])bilingual(c[field],c.id+' '+field);for(const lang of ['zh','en']){assert(Array.isArray(c.explanation[lang])&&c.explanation[lang].length>=2,c.id+' explanation');assert(c.explanation[lang].every(p=>typeof p==='string'&&p.length>25));}assert(c.formula&&typeof c.formula==='string',c.id+' formula');assert(c.refs.length>0,c.id+' references');for(const ref of c.refs){assert(ref.book&&ref.section,c.id+' ref');if(ref.url)assert(ref.url.startsWith('https://'));if(ref.pdfPage)assert(Number.isInteger(ref.pdfPage)&&ref.pdfPage>0);}bilingual(c.quiz.question,c.id+' quiz');bilingual(c.quiz.explanation,c.id+' feedback');assert(c.quiz.options.length>=3);c.quiz.options.forEach(o=>bilingual(o,c.id+' option'));assert(Number.isInteger(c.quiz.correct)&&c.quiz.correct>=0&&c.quiz.correct<c.quiz.options.length,c.id+' correct');for(const p of c.prerequisites||[])assert(ids.has(p),`${c.id} missing prerequisite ${p}`);assert(c.minutes>0);zhCharacters+=c.explanation.zh.join('').length;enWords+=c.explanation.en.join(' ').split(/\s+/).length;}
for(const f of ['public/study.html','public/styles.css','public/app.js','public/review-engine.js','public/sync.js','.openai/hosting.json'])assert(existsSync(f));
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));assert(manifest.project_id);assert.equal(manifest.d1,'DB');
console.log(JSON.stringify({status:'PASS',modules:modules.length,cards:cards.length,explanationChineseCharacters:zhCharacters,explanationEnglishWords:enWords,quizAnswers:cards.reduce((acc,c)=>(acc[c.quiz.correct]=(acc[c.quiz.correct]||0)+1,acc),{})},null,2));
