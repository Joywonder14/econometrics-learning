'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='econometrics-atlas-v1';
let state={lang:'zh',cards:{},pace:25},storageOK=true,modules=[],cards=[],coverage={chapters:[]},freshQuiz={},lab='ols',labValues={slope:1,noise:2,n:40,confound:1,tau:3,trend:0};
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object'){state={...state,...saved};if(!state.cards||typeof state.cards!=='object')state.cards={};if(!['zh','en'].includes(state.lang))state.lang='zh';}}catch{storageOK=false;}
const t=(zh,en)=>state.lang==='zh'?zh:en;
const v=x=>typeof x==='object'&&x!==null?(x[state.lang]??x.zh??x.en??''):x;
const h=x=>escapeHTML(v(x));
const pFor=id=>state.cards[id]||{};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({...state,cards:AtlasSync.status().connected?guestProgress():state.cards}));}catch{storageOK=false;}};
const update=(id,patch)=>{state.cards[id]={...pFor(id),...patch};save();AtlasSync.patch(id,patch);};
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day=()=>localDay(new Date());
const dayAfter=n=>{const d=new Date();d.setDate(d.getDate()+n);return localDay(d);};
const due=c=>AtlasReview.isDue(atlasMemory(c.id),Date.now());
const done=c=>(atlasMemory(c.id)?.reps||0)>0;
const inModule=id=>cards.filter(c=>c.module===id);
const moduleBy=id=>modules.find(m=>m.id===id);
const nextCard=()=>cards.find(c=>!done(c)&&(c.prerequisites||[]).every(id=>done({id})))||cards.find(c=>!done(c))||cards[0];
const route=()=>{const [path,qs='']=(location.hash.slice(1)||'home').split('?');return{path,params:new URLSearchParams(qs)};};
const icons={home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-8h6v8"/>',map:'<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2z"/><path d="M9 3v15m6-12v15"/>',cards:'<rect x="4" y="6" width="14" height="15" rx="2"/><path d="M8 3h12v14M8 11h6m-6 4h5"/>',lab:'<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/>',review:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6m2-3v6l4 2"/>',books:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 6-6 12 0 18 6-6 6-12 0-18"/>',back:'<path d="M20 12H5m6-6-6 6 6 6"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'};
const icon=(name,size=17)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.chart}</svg>`;
const stages=[
 {zh:'数学与统计基础',en:'Mathematics & statistics',sub:{zh:'先理解符号、概率、抽样与不确定性',en:'Build intuition for notation, probability and uncertainty'}},
 {zh:'回归分析',en:'Regression analysis',sub:{zh:'从一条拟合线，到估计、推断与解释',en:'From a fitted line to estimation, inference and interpretation'}},
 {zh:'应用计量方法',en:'Applied econometric methods',sub:{zh:'异方差、时间序列、面板与非线性模型',en:'Heteroskedasticity, time series, panels and nonlinear models'}},
 {zh:'因果推断',en:'Causal inference',sub:{zh:'实验、匹配、工具变量、DID 与 RD',en:'Experiments, matching, IV, DID and RD'}},
 {zh:'实证研究设计',en:'Empirical research design',sub:{zh:'把问题、识别、数据和证据连接起来',en:'Connect the question, design, data and evidence'}}
];
const navItems=[['home','home','学习总览','Overview'],['map','map','知识地图','Learning path'],['cards','cards','知识卡片','Knowledge cards'],['lab','lab','直觉实验室','Intuition lab'],['review','review','我的复习','My review'],['books','books','教材与术语','Books & glossary'],['sync','globe','设备同步','Device sync']];
const pageName=path=>{const n=navItems.find(x=>x[0]===path.split('/')[0]);return n?t(n[2],n[3]):path==='coverage'?t('教材覆盖核对','Textbook coverage'):t('知识卡片','Knowledge cards');};
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('toast');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('toast'),2600);}
function shell(content,path){const active=path.startsWith('card/')?'cards':path;return `<div class="shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#home"><span class="brandmark">β</span><span><strong>${t('计量学习地图','Econometrics Atlas')}</strong><small>LEARN. REASON. DISCOVER.</small></span></a><div class="navlabel">${t('你的学习空间','YOUR LEARNING SPACE')}</div><nav class="nav" aria-label="${t('主导航','Main navigation')}">${navItems.map(([key,i,zh,en])=>`<a href="#${key}" class="${active===key?'active':''}" ${active===key?'aria-current="page"':''}>${icon(i)}<span>${t(zh,en)}</span>${key==='cards'?`<span class="count">${cards.length}</span>`:''}${key==='review'&&cards.filter(due).length?`<span class="count">${cards.filter(due).length}</span>`:''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note"><strong>${icon('spark',14)} ${t('按自己的节奏学习','Learn at your own pace')}</strong>${t('先有直觉，再读公式。<br>让每一个结论，都有条件。','Intuition before equations.<br>Every conclusion has assumptions.')}<div style="margin-top:13px"><span class="status-dot"></span>${t('入门路线 · 从基础开始','Beginner path · Start small')}</div></div><div class="sidebar-credit"><span>ECONOMETRICS ATLAS</span><span>v2.0</span></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="mobile-menu" data-action="menu" aria-label="${t('展开导航','Open navigation')}" aria-expanded="false">${icon('menu',20)}</button><span class="root-crumb">${t('学习空间','Learning space')}</span><span class="root-crumb">/</span><strong>${pageName(path)}</strong></div><div class="top-actions"><a class="top-search" href="#cards?focus=search" aria-label="${t('搜索知识','Search knowledge')}">${icon('search',16)}<span>${t('搜索知识','Search')}</span></a><div class="lang-switch" role="group" aria-label="${t('切换语言','Language')}"><button data-lang="zh" class="${state.lang==='zh'?'selected':''}" aria-pressed="${state.lang==='zh'}">中</button><button data-lang="en" class="${state.lang==='en'?'selected':''}" aria-pressed="${state.lang==='en'}">EN</button></div><a class="sync-top" href="#sync" id="sync-top-status">${syncLabel()}</a><div class="avatar" title="${t('个人学习空间','Personal learning space')}">β</div></div></header>${!storageOK?`<div class="storage-warning">${t('浏览器储存暂不可用，进度仅在当前页面保留。请使用导出备份。','Browser storage is unavailable. Progress lasts for this session; export a backup.')}</div>`:''}<main class="main" id="main" tabindex="-1">${content}<footer class="footer"><span>${t('以教材为起点，以理解为目的。','Grounded in textbooks. Built for understanding.')}</span><span>${t('原创学习讲解 · 支持同步码同步','Original study explanations · Sync codes supported')}</span></footer></main></div></div>`;}
function heading(zh,en,subzh,suben,eyebrow='YOUR ECONOMETRICS JOURNEY'){return`<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${t(zh,en)}</h1><p>${t(subzh,suben)}</p></div><span class="date-pill">${icon('globe',12)} ${t('中 / EN · 双语学习','中 / EN · Bilingual learning')}</span></div>`;}
function moduleTile(m){const list=inModule(m.id),n=list.filter(done).length;return`<a href="#cards?module=${m.id}" class="module-tile"><div class="module-top"><span class="module-icon">${icon(['spark','chart','lab','map','books'][m.stage],19)}</span><span class="module-num">${m.id.toUpperCase()}</span></div><h3>${h(m.title)}</h3><p>${h(m.description)}</p><div class="module-bottom"><span>${list.length} ${t('张卡片','cards')} · ${t('阶段','Stage')} ${m.stage+1}</span><div class="progress-track tile-progress" aria-label="${n}/${list.length}"><div style="width:${n/list.length*100||0}%"></div></div>${icon('arrow',14)}</div></a>`;}
function heroArt(){return`<div class="hero-art"><svg viewBox="0 0 440 260" role="img" aria-label="${t('数据、模型、识别与证据的学习关系图','Learning diagram connecting data, models, identification and evidence')}"><defs><pattern id="dots" width="19" height="19" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#8b9e7940"/></pattern><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5" fill="none" stroke="#9eaf7b"/></marker></defs><rect x="0" y="0" width="440" height="260" fill="url(#dots)"/><g fill="none" stroke="#9eaf7b" stroke-width="1.1" marker-end="url(#arrowhead)"><path d="M115 158Q145 80 213 77"/><path d="M256 76Q314 75 345 135"/><path d="M327 166Q256 210 146 179"/><path d="M239 101 236 147" stroke-dasharray="4 5"/></g><circle cx="99" cy="172" r="35" fill="#385849" stroke="#718666"/><circle cx="235" cy="74" r="33" fill="#cddd9d"/><circle cx="357" cy="162" r="36" fill="#344f43" stroke="#80966b"/><rect x="200" y="152" width="76" height="38" rx="19" fill="#254235" stroke="#6f8660"/><g text-anchor="middle" font-family="system-ui" font-size="12"><text x="99" y="177" fill="#deebc7">${t('数据','Data')}</text><text x="235" y="79" fill="#2a4631">${t('模型','Model')}</text><text x="357" y="167" fill="#deebc7">${t('识别','Design')}</text><text x="238" y="176" fill="#b1c393" font-size="10">${t('证据','Evidence')}</text></g><g fill="#88a571" opacity=".55"><circle cx="126" cy="49" r="2"/><circle cx="307" cy="228" r="2"/><circle cx="391" cy="68" r="3"/></g><text x="25" y="228" fill="#829871" font-family="Georgia" font-size="13" font-style="italic">y = β₀ + β₁x + u</text></svg><span class="art-caption">FROM DATA TO UNDERSTANDING</span></div>`;}
function overview(){const next=nextCard(),completed=cards.filter(done).length,current=moduleBy(next.module).stage;return`${heading('把计量经济学，学得有条理。','Make sense of econometrics.','不急着记公式。我们从一个好问题、一个小直觉开始。','Start with a good question and a small intuition.')}<section class="hero"><div class="hero-copy"><div class="eyebrow">A SMALL STEP. A CLEARER PICTURE.</div><h2>${t('从看懂数据，<br>到解释因果。','Read the data.<br>Reason about causes.')}</h2><p>${t('沿着两部经典教材，把复杂的知识拆成清晰的小卡片。<br>从零打好统计基础，逐步建立自己的实证思维。','A guided path through two classic textbooks, one clear concept at a time. Build your statistical foundations and learn to reason with evidence.')}</p><div class="hero-actions"><a class="btn btn-lime" href="#card/${next.id}">${t(completed?'继续学习':'开始学习',completed?'Continue learning':'Start your first card')}${icon('arrow',15)}</a><a class="btn-dark-outline" href="#map">${t('看看学习路线','Explore the path')} ↗</a></div></div>${heroArt()}</section><div class="metrics">${[[t('知识模块','Learning modules'),modules.length,t('循序渐进','step by step'),'map'],[t('双语知识卡片','Bilingual cards'),cards.length,t('概念 + 自测','learn + practice'),'cards'],[t('已复习','Reviewed'),completed,`/ ${cards.length}`,'check'],[t('待复习','Due for review'),cards.filter(due).length,t('让理解更牢固','make it stick'),'review']].map(([title,num,suffix,i])=>`<div class="metric"><div class="metric-head"><span>${title}</span>${icon(i,15)}</div><strong>${num}</strong><small>${suffix}</small></div>`).join('')}</div><div class="dashboard-columns"><section><div class="section-head" style="margin-top:0"><div><h2>${t('你的学习路线','Your learning path')}</h2><p>${t('为入门者设计 · 按知识依赖顺序前进','Designed for beginners · Concepts build on one another')}</p></div><a class="text-link" href="#map">${t('完整地图','Full map')}${icon('arrow',14)}</a></div><div class="journey">${stages.map((s,i)=>{const sc=cards.filter(c=>moduleBy(c.module).stage===i);return`<a class="journey-row ${i===current?'current':''}" href="#map?stage=${i}"><span class="step-dot">${String(i+1).padStart(2,'0')}</span><span class="journey-text"><strong>${h(s)}</strong><small>${h(s.sub)}</small></span><span class="tag ${i>1?'orange':''}">${i===current?t('正在这里','You are here'):`${sc.filter(done).length} / ${sc.length}`}</span>${icon('chevron',12)}</a>`;}).join('')}</div></section><section><div class="section-head" style="margin-top:0"><h2>${t('今天，从这里开始','Your next small step')}</h2><span class="tag">${t('为你推荐','UP NEXT')}</span></div><div class="next-card"><div class="eyebrow">${h(moduleBy(next.module).title)}</div><h3>${h(next.title)}</h3><p>${h(next.question)}</p><div class="card-meta">${icon('clock',13)} ${next.minutes} ${t('分钟','min')}<span>·</span><span>${t('含例子与自测','Example & self-check')}</span></div><a class="btn btn-primary" href="#card/${next.id}">${t('打开这张卡片','Open this card')}${icon('arrow',15)}</a></div><div class="quote-strip"><strong>${t('一个值得一直追问的问题','A question to keep asking')}</strong>${t('“这个结论，需要什么条件才成立？”','“Under which assumptions does this conclusion hold?”')}</div></section></div><section><div class="section-head"><div><h2>${t('先把基础，搭稳一点','Build a stronger foundation')}</h2><p>${t('数学不熟也没关系，先从直觉和例子进入。','Start with intuition and examples, even if the math feels unfamiliar.')}</p></div><a href="#cards" class="text-link">${t('全部卡片','All cards')}${icon('arrow',14)}</a></div><div class="module-grid">${modules.slice(0,6).map(moduleTile).join('')}</div></section>`;}
function cardReaderHref(card, context=route()) {
  const params=context.params, q=new URLSearchParams(), m=moduleBy(card.module);
  if(params.get('from')==='map'){
    q.set('from','map');q.set('stage',String(m.stage));q.set('module',m.id);
    if(params.get('advanced')==='1'||m.level==='extension'||card.level==='extension')q.set('advanced','1');
  }else if(context.path==='cards'||params.get('from')==='cards'){
    q.set('from','cards');
    for(const key of ['q','module','status'])if(params.get(key))q.set(key,params.get(key));
  }
  return '#card/'+card.id+(q.size?'?'+q:'');
}
function readerNavigation(card) {
  const context=route(), params=context.params, m=moduleBy(card.module), q=new URLSearchParams();
  if(params.get('from')==='map'){
    q.set('stage',String(m.stage));q.set('module',m.id);
    if(params.get('advanced')==='1'||m.level==='extension'||card.level==='extension')q.set('advanced','1');
    return {backHref:'#map?'+q,backLabel:m.title,cardHref:c=>cardReaderHref(c,context)};
  }
  if(params.get('from')==='cards'){
    for(const key of ['q','module','status'])if(params.get(key))q.set(key,params.get(key));
    return {backHref:'#cards'+(q.size?'?'+q:''),backLabel:t('筛选后的卡片库','Filtered card library'),cardHref:c=>cardReaderHref(c,context)};
  }
  return {backHref:'#cards?module='+m.id,backLabel:m.title,cardHref:c=>cardReaderHref(c,context)};
}
function cardTile(c,notes=false){const p=pFor(c.id);return`<article class="knowledge-card"><div class="kc-top"><span class="tag">${h(moduleBy(c.module).title)}</span><button class="bookmark ${p.bookmark?'saved':''}" data-action="bookmark" data-id="${c.id}" aria-label="${t(p.bookmark?'取消收藏':'收藏卡片',p.bookmark?'Remove bookmark':'Bookmark card')}" aria-pressed="${!!p.bookmark}">${icon('bookmark',16)}</button></div><a class="card-link" href="${h(cardReaderHref(c))}"><h3>${h(c.title)}</h3><p>${h(c.question)}</p></a>${notes&&p.note?`<div class="note-preview">${escapeHTML(p.note)}</div>`:''}<div class="kc-bottom"><span>${icon('clock',12)} ${c.minutes} ${t('分钟','min')} · ${done(c)?`<span class="badge-finished">${t('已复习','Reviewed')}</span>`:p.seenAt?t('学习中','In progress'):t('未开始','New')}</span><a href="${h(cardReaderHref(c))}" aria-label="${h(c.title)}">${icon('arrow',16)}</a></div></article>`;}
function cardFilter(params){let list=cards;const query=(params.get('q')||'').trim().toLowerCase(),mod=params.get('module')||'',status=params.get('status')||'';if(mod)list=list.filter(c=>c.module===mod);if(status==='new')list=list.filter(c=>!pFor(c.id).seenAt);if(status==='mastered')list=list.filter(done);if(status==='saved')list=list.filter(c=>pFor(c.id).bookmark);if(status==='due')list=list.filter(due);if(query)list=list.filter(c=>JSON.stringify(c).toLowerCase().includes(query));return list;}
function cardsPage(params){const list=cardFilter(params),mod=moduleBy(params.get('module'));return`${heading(mod?v(mod.title):'每一个概念，都值得弄明白。',mod?v(mod.title):'Make every concept clear.',mod?v(mod.description):'卡片是理解的入口；章节出处帮助你回到教材深入阅读。',mod?v(mod.description):'Cards are a starting point; chapter references lead you back to the textbooks.','THE CARD LIBRARY')}<div class="filters"><label class="searchbox">${icon('search',17)}<input id="card-search" type="search" placeholder="${t('搜索概念、公式或中英文术语…','Search concepts, equations or terms in either language…')}" value="${escapeHTML(params.get('q')||'')}" aria-label="${t('搜索卡片','Search cards')}"></label><select id="module-filter" aria-label="${t('按模块筛选','Filter by module')}"><option value="">${t('全部模块','All modules')}</option>${modules.map(m=>`<option value="${m.id}" ${params.get('module')===m.id?'selected':''}>${m.id.toUpperCase()} · ${h(m.title)}</option>`).join('')}</select><select id="status-filter" aria-label="${t('按状态筛选','Filter by status')}">${[['','全部状态','All states'],['new','未开始','New'],['mastered','已复习','Reviewed'],['saved','已收藏','Bookmarked'],['due','待复习','Due for review']].map(([key,z,e])=>`<option value="${key}" ${params.get('status')===key?'selected':''}>${t(z,e)}</option>`).join('')}</select></div>${mod&&mod.prerequisites?.length?`<p class="warning-inline">${t('建议先学：','Suggested prerequisites: ')}${mod.prerequisites.map(id=>moduleBy(id)?`<a class="link-under" href="#cards?module=${id}">${h(moduleBy(id).title)}</a>`:'').join(' · ')}</p>`:''}<div class="section-head"><p id="result-count">${t(`找到 ${list.length} 张知识卡片`,`Found ${list.length} knowledge cards`)}</p><a class="text-link" href="#map">${t('按路线学习','Follow the learning path')}${icon('map',13)}</a></div><div id="card-results">${cardResults(list)}</div>`;}
function cardResults(list){return list.length?`<div class="card-grid">${list.map(c=>cardTile(c)).join('')}</div>`:`<div class="empty"><h2>${t('还没有符合条件的卡片','No matching cards')}</h2><p>${t('试试更短的关键词，或清除模块与状态筛选。','Try a shorter keyword or clear the filters.')}</p><a class="btn btn-ghost" href="#cards">${t('查看全部','Show all cards')}</a></div>`;}
const bookLabels={'wooldridge-en':{zh:'Wooldridge · 英文第 5 版',en:'Wooldridge · English 5th ed.'},'wooldridge-zh':{zh:'伍德里奇 · 中文第 6 版',en:'Wooldridge · Chinese 6th ed.'},'mhe-en':{zh:'Mostly Harmless Econometrics · 2009',en:'Mostly Harmless Econometrics · 2009'},'mhe-zh':{zh:'基本无害的计量经济学 · 中文扫描本',en:'Mostly Harmless Econometrics · Chinese scan'}};
function refsHTML(refs){return refs.map(r=>`<p>${h(bookLabels[r.book]||{zh:r.book,en:r.book})}${r.chapter?` · ${t('章/附录','Chapter / appendix')} ${escapeHTML(r.chapter)}`:''}${r.section?`<br>${h(r.section)}`:''}${r.pdfPage?` · PDF ${t('第','page')} ${r.pdfPage} ${t('页','')}`:''}${r.url&&/^https:\/\//.test(r.url)?`<br><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer">${t('查看原始论文 ↗','Read the original paper ↗')}</a>`:''}</p>`).join('');}
function reader(id){const c=cards.find(x=>x.id===id);if(!c)return`<div class="empty"><h2>${t('没有找到这张卡片','Card not found')}</h2><a class="btn btn-primary" href="#cards">${t('返回卡片库','Back to cards')}</a></div>`;const m=moduleBy(c.module),navigation=readerNavigation(c),p=pFor(id),index=cards.indexOf(c),sectionLabels=[['intuition','直觉先行','Start with intuition'],['explanation','把逻辑展开','Follow the reasoning'],['formula','读懂公式','Read the equation'],['example','用例子理解','Work through an example'],['pitfall','避开一个误区','Avoid the common pitfall'],['quiz','检验你的理解','Check your understanding'],['notes','留下你的思考','Your own notes'],['sources','回到教材','Back to the textbooks']];return`<a href="${h(navigation.backHref)}" class="backlink">${icon('back',14)} ${t('返回上一级：','Back to parent: ')}${h(navigation.backLabel)}</a><div class="reading-layout"><article class="article"><span class="tag">${c.id.toUpperCase()} · ${t('阶段','Stage')} ${m.stage+1}</span><h1>${h(c.title)}</h1><p class="lead-question">${h(c.question)}</p><div class="article-meta"><span>${icon('clock',13)} ${c.minutes} ${t('分钟建议阅读','min suggested reading')}</span><span>·</span><span>${t('中英文内容同步切换','Switch languages without losing your place')}</span><button class="bookmark ${p.bookmark?'saved':''}" data-action="bookmark" data-id="${id}" aria-label="${t('收藏卡片','Bookmark card')}" aria-pressed="${!!p.bookmark}">${icon('bookmark',15)}</button></div><section class="reading-section" id="intuition"><h2><span class="section-number">01</span>${t('直觉先行','Start with intuition')}</h2><div class="intuition-box"><p>${h(c.intuition)}</p></div></section><section class="reading-section" id="explanation"><h2><span class="section-number">02</span>${t('把逻辑展开','Follow the reasoning')}</h2>${(v(c.explanation)||[]).map(x=>`<p>${escapeHTML(x)}</p>`).join('')}</section><section class="reading-section" id="formula"><h2><span class="section-number">03</span>${t('读懂公式','Read the equation')}</h2><div class="formula">${h(c.formula)}</div><p class="symbol-note">${h(c.symbols)}</p></section><section class="reading-section" id="example"><h2><span class="section-number">04</span>${t('用例子理解','Work through an example')}</h2><div class="example-box"><p>${h(c.example)}</p></div></section><section class="reading-section" id="pitfall"><h2><span class="section-number">05</span>${t('避开一个误区','Avoid the common pitfall')}</h2><div class="pitfall-box"><p>${h(c.pitfall)}</p></div></section><section class="reading-section" id="quiz"><h2><span class="section-number">06</span>${t('检验你的理解','Check your understanding')}</h2><p class="quiz-question">${h(c.quiz.question)}</p><div id="quiz-area">${quizHTML(c)}</div></section><div class="mastery"><h3>${t('现在，合上答案试着解释一遍。','Now try explaining it without the answer.')}</h3><p>${t('选择真实的掌握程度，系统会安排下一次复习。答对一道题不等于掌握整个概念。','Rate your understanding to schedule your next review. One correct answer does not establish mastery.')}</p><div class="mastery-actions">${[['again','没想起来','Missed'],['hard','费力想起','Hard'],['good','基本想起','Good'],['easy','轻松解释','Easy']].map(([rating,z,e])=>`<button class="btn ${rating==='good'?'btn-primary':'btn-ghost'}" data-action="rate" data-id="${id}" data-rating="${rating}">${t(z,e)}</button>`).join('')}</div><p id="review-date" style="margin-top:12px;margin-bottom:0">${atlasMemory(id)?t('下次复习：','Next check: ')+atlasDate(atlasMemory(id).dueAt):t('尚未安排复习','No review scheduled yet')}</p></div><section class="reading-section" id="notes"><h2><span class="section-number">07</span>${t('留下你的思考','Your own notes')}</h2><textarea class="notes" id="card-note" data-id="${id}" placeholder="${t('用自己的话解释；记下条件、疑问，或一个反例…','Explain it in your own words. Note an assumption, a question or a counterexample…')}" aria-label="${t('学习笔记','Study notes')}">${escapeHTML(p.note||'')}</textarea><div class="notes-status" id="notes-status">${t('已在本机保存；启用同步码后会自动同步，也可导出备份。','Saved locally; enabling a sync code adds automatic sync. You can also export a backup.')}</div></section><section class="reading-section source-list" id="sources"><h2><span class="section-number">08</span>${t('回到教材','Back to the textbooks')}</h2>${refsHTML(c.refs)}<p>${t('卡片为原创学习讲解，例子除明确说明外均为教学示例。版本与使用范围见教材索引。','Cards contain original explanations. Examples are illustrative unless stated otherwise. See Books & glossary for editions and scope.')}</p></section><nav class="card-pager">${index>0?`<a href="${h(navigation.cardHref(cards[index-1]))}">← ${h(cards[index-1].title)}</a>`:'<span></span>'}${index<cards.length-1?`<a href="${h(navigation.cardHref(cards[index+1]))}">${h(cards[index+1].title)} →</a>`:`<a href="#review">${t('回顾已学知识','Review your learning')} →</a>`}</nav></article><aside class="reader-aside"><div class="aside-box toc"><h3>${t('这张卡片的结构','Inside this card')}</h3>${sectionLabels.map(([target,z,e],i)=>`<a href="#" data-scroll="${target}">${String(i+1).padStart(2,'0')} &nbsp; ${t(z,e)}</a>`).join('')}</div><div class="aside-box"><h3>${t('学习小提醒','A learning reminder')}</h3><p>${t('不理解时先退回直觉与例子。弄清“什么条件下成立”，比记住一句结论更重要。','Return to the intuition and example when stuck. Understanding the assumptions matters more than memorizing the conclusion.')}</p><a class="btn btn-ghost" href="#lab">${icon('lab',14)}${t('去实验室试一试','Try an experiment')}</a></div>${c.prerequisites?.length?`<div class="aside-box"><h3>${t('先修知识','Prerequisites')}</h3>${c.prerequisites.map(pid=>{const pc=cards.find(x=>x.id===pid);return pc?`<p><a class="link-under" href="${h(navigation.cardHref(pc))}">${h(pc.title)}</a></p>`:'';}).join('')}</div>`:''}</aside></div>`;}
function quizHTML(c){const chosen=pFor(c.id).quizChoice,answered=Number.isInteger(chosen);return`<div class="quiz-options">${c.quiz.options.map((opt,i)=>`<button class="quiz-option ${answered?(i===c.quiz.correct?'correct':i===chosen?'wrong':''):''}" data-action="quiz" data-id="${c.id}" data-choice="${i}" aria-pressed="${i===chosen}"><span class="letter">${String.fromCharCode(65+i)}.</span><span>${h(opt)}</span></button>`).join('')}</div>${answered?`<div class="quiz-feedback" role="status"><strong>${chosen===c.quiz.correct?t('答对了，继续检查你的理由。','Correct. Now check your reasoning.'):t('再想一步：','Take another look: ')}</strong>${h(c.quiz.explanation)}</div>`:''}`;}
function reviewPage(params){return renderAdaptiveReview(params);}
const glossary=[
 ['总体 / 样本','Population / Sample','总体是研究对象的全体；样本是实际观测到的一部分。','The population is the full group of interest; a sample is the observed subset.'],
 ['参数 / 估计量','Parameter / Estimator','参数描述总体；估计量是把样本映射为参数估计的方法。','A parameter describes a population; an estimator is a rule for estimating it from data.'],
 ['误差 / 残差','Error / Residual','误差属于总体模型、一般不可观测；残差是样本中实际值减拟合值。','An error belongs to the population model; a residual is an observed value minus its fitted value.'],
 ['标准差 / 标准误','Standard deviation / Standard error','标准差描述变量的离散；标准误估计一个估计量在重复抽样中的波动。','A standard deviation describes dispersion; a standard error estimates sampling variability of an estimator.'],
 ['外生性','Exogeneity','解释变量与误差满足特定正交或条件均值限制；条件随模型和方法而变化。','An orthogonality or conditional-mean restriction connecting regressors and errors; its form depends on the model.'],
 ['内生性','Endogeneity','解释变量与误差存在方法不允许的关联，可能来自遗漏变量、反向因果或测量误差。','A regressor–error association that violates the estimator’s conditions, possibly due to omitted variables, simultaneity or measurement error.'],
 ['识别','Identification','在明确假设下，能否从可观测数据的分布唯一确定目标参数。','Whether the observable data distribution and assumptions uniquely determine the target parameter.'],
 ['无偏 / 一致','Unbiasedness / Consistency','无偏讨论重复抽样的平均；一致讨论样本量增大时向真值靠近。','Unbiasedness concerns a repeated-sampling average; consistency concerns convergence as sample size grows.'],
 ['混杂因素','Confounder','同时影响处理与结果、从而混淆因果比较的因素；不是所有相关变量都应控制。','A factor affecting both treatment and outcome that can confound a causal comparison; not every correlated variable should be controlled.'],
 ['反事实','Counterfactual','同一个对象在未实际经历的处理状态下会出现的结果。','The outcome a unit would have under a treatment state it did not actually experience.'],
 ['异方差','Heteroskedasticity','给定解释变量后，误差方差并非常数；它与误差条件均值不为零是不同问题。','The conditional error variance is not constant; this differs from a nonzero conditional error mean.'],
 ['统计显著性','Statistical significance','数据在某个原假设与统计模型下呈现多大不相容性；不等于效应大或有因果性。','Evidence of incompatibility with a null hypothesis under a statistical model; it does not establish a large or causal effect.']
];
function booksPage(){return`${heading('带着问题，回到经典。','Return to the classics with a question.','卡片负责连接概念，教材负责完整论证与更多练习。','Cards connect ideas; textbooks supply the full development and more exercises.','THE READING DESK')}<div class="book-grid"><article class="book-card"><div class="book-cover">Introductory<br>Econometrics<small>J. M. WOOLDRIDGE<br>5th / 6th edition</small></div><div><h3>${t('计量经济学导论：现代观点','Introductory Econometrics')}</h3><p>Jeffrey M. Wooldridge</p><p>${t('主线教材：从基础统计、回归、推断，到时间序列、面板数据和实证研究。','The main course: foundations, regression and inference, followed by time series, panels and empirical research.')}</p><span class="tag">${t('英文第 5 版 · 中文第 6 版','English 5th ed. · Chinese 6th ed.')}</span></div></article><article class="book-card"><div class="book-cover">Mostly<br>Harmless<br>Econometrics<small>ANGRIST & PISCHKE<br>2009</small></div><div><h3>${t('基本无害的计量经济学','Mostly Harmless Econometrics')}</h3><p>Joshua D. Angrist & Jörn-Steffen Pischke</p><p>${t('进阶教材：围绕因果问题理解回归、工具变量、DID、RD、分位数回归与推断。','The causal companion: regression, IV, DID, RD, quantile regression and inference through the lens of research design.')}</p><span class="tag">${t('英文 2009 版 · 中文扫描本','English 2009 edition · Chinese scan')}</span></div></article></div><div class="source-note">${t('版本核验：books 中的英文伍德里奇为第 5 版（2013），中文为第 6 版（2018）。卡片引用明确标注版本，不将两版页码视为一致。《基本无害》中文扫描本无法可靠提取正文，因此实质核对以英文原书为主。网站呈现原创讲解与章节导读；教材全文保留在你的 books 文件夹中。','Edition check: the English Wooldridge file is the 5th edition (2013); the Chinese translation is the 6th edition (2018). References distinguish these editions; pagination is not interchangeable. The Chinese MHE scan does not provide reliable extractable text, so substantive checks primarily use the English original. This site provides original explanations and chapter guides; full textbooks remain in your books folder.')}</div><section><div class="section-head"><h2>${t('模块与教材对应','Where each module belongs')}</h2><span class="tag">${t('章节导航','CHAPTER GUIDE')}</span></div><div class="table-wrap"><table class="source-table"><thead><tr><th>${t('学习模块','Module')}</th><th>${t('教材','Textbook')}</th><th>${t('章 / 附录','Chapters / appendices')}</th></tr></thead><tbody>${modules.map(m=>{const refs=inModule(m.id).flatMap(c=>c.refs);const books=[...new Set(refs.map(r=>r.book))];return`<tr><td><a href="#cards?module=${m.id}">${m.id.toUpperCase()} · ${h(m.title)} ↗</a></td><td>${books.map(b=>h(bookLabels[b]||b)).join('<br>')}</td><td>${[...new Set(refs.map(r=>r.chapter).filter(Boolean))].map(escapeHTML).join(' / ')}</td></tr>`;}).join('')}</tbody></table></div></section><a class="btn btn-primary" href="#coverage">${t('查看逐章覆盖核对','View chapter coverage audit')} ${icon('arrow',14)}</a><div class="intro-panel"><h2>${t('如何理解“覆盖”','How to read the scope')}</h2><p>${t('这条路线覆盖两书的主要知识领域，并补充入门所需的数学语言。卡片解释核心思想、公式、条件与误区，不是逐页替代教材。矩阵推导、长证明和大量习题仍应回到原书；现代分期 DID 等超出原版教材的内容，在对应卡片中标注为补充并提供原始论文。','The route covers the books’ main topic areas and adds a mathematical on-ramp. Cards explain the central ideas, formulas, assumptions and pitfalls; they are not a page-by-page replacement. Use the books for matrix derivations, extended proofs and exercise practice. Material beyond the original editions, such as modern staggered DID, is labeled as supplementary and linked to primary papers.')}</p></div><section><div class="section-head"><div><h2>${t('一眼分清，常用术语','Keep the vocabulary clear')}</h2><p>${t('切换语言，建立同一个概念的中英文连接。','Switch languages to connect the terminology.')}</p></div></div><div class="glossary-grid">${glossary.map(([z,e,dz,de])=>`<article class="term"><strong>${t(z,e)}</strong><small>${t(e,z)}</small><p>${t(dz,de)}</p></article>`).join('')}</div></section>`;}
function seeded(seed){return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return(seed+.5)/4294967296;};}
function normal(rng){return Math.sqrt(-2*Math.log(rng()))*Math.cos(2*Math.PI*rng());}
function moments(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n,sxx=x.reduce((s,a)=>s+(a-mx)**2,0),sxy=x.reduce((s,a,i)=>s+(a-mx)*(y[i]-my),0),b=sxy/sxx,a=my-b*mx,sse=x.reduce((s,x,i)=>s+(y[i]-a-b*x)**2,0),sst=y.reduce((s,y)=>s+(y-my)**2,0);return{a,b,se:Math.sqrt(sse/(n-2)/sxx),r2:1-sse/sst};}
function labPage(){return`${heading('把公式，变成看得见的直觉。','Turn equations into intuition.','拖动一个参数，观察变化，再解释背后的原因。','Change one parameter, observe what happens, then explain why.','THE INTUITION LAB')}<div class="lab-tabs" role="group" aria-label="${t('选择实验','Choose an experiment')}">${[['ols','回归与噪声','Regression & noise'],['ovb','遗漏变量偏误','Omitted variable bias'],['did','双重差分','Difference-in-differences']].map(([key,z,e])=>`<button data-lab="${key}" class="${lab===key?'active':''}" aria-pressed="${lab===key}">${t(z,e)}</button>`).join('')}</div><div id="lab-content">${labContent()}</div><div class="source-note">${t('这里的数据均为教学模拟，不是教材中的实证结果。实验只改变展示的参数；看起来“拟合很好”不能替代识别假设。','All data here are teaching simulations, not empirical results from the textbooks. The experiments change the displayed parameters; a good-looking fit is no substitute for identification assumptions.')}</div>`;}
const slider=(key,label,min,max,step,value)=>`<div><label for="slider-${key}"><span>${label}</span><output id="value-${key}">${value}</output></label><input id="slider-${key}" data-slider="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
function plot({xs,ys,lines=[],xLabel='x',yLabel='y',did=false}){const w=620,ht=370,l=58,r=24,top=25,bottom=50;let xmin=Math.min(...xs,...lines.flatMap(a=>a.points.map(p=>p[0]))),xmax=Math.max(...xs,...lines.flatMap(a=>a.points.map(p=>p[0]))),ymin=Math.min(...ys,...lines.flatMap(a=>a.points.map(p=>p[1]))),ymax=Math.max(...ys,...lines.flatMap(a=>a.points.map(p=>p[1])));const pad=(ymax-ymin)*.15||1;ymin-=pad;ymax+=pad;if(did){xmin=-.15;xmax=1.15;}const X=x=>l+(x-xmin)/(xmax-xmin)*(w-l-r),Y=y=>ht-bottom-(y-ymin)/(ymax-ymin)*(ht-top-bottom);let svg=`<svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="${t('可交互的教学图表','Interactive teaching chart')}">`;for(let i=0;i<5;i++){const value=ymin+(ymax-ymin)*i/4,y=Y(value);svg+=`<path d="M${l} ${y}H${w-r}" stroke="#e9eee2"/><text x="${l-10}" y="${y+4}" fill="#93a185" font-size="10" text-anchor="end">${value.toFixed(1)}</text>`;}svg+=`<path d="M${l} ${top}V${ht-bottom}H${w-r}" fill="none" stroke="#c4cfb9"/>`;for(let i=0;i<(did?2:5);i++){const x=did?i:xmin+(xmax-xmin)*i/4;svg+=`<text x="${X(x)}" y="${ht-bottom+21}" fill="#93a185" font-size="10" text-anchor="middle">${did?t(i?'政策后':'政策前',i?'After':'Before'):x.toFixed(1)}</text>`;}svg+=`<text x="${w-r}" y="${ht-8}" fill="#829772" font-size="11" text-anchor="end">${escapeHTML(xLabel)}</text><text x="${l}" y="14" fill="#829772" font-size="11">${escapeHTML(yLabel)}</text>`;svg+=xs.map((x,i)=>`<circle cx="${X(x)}" cy="${Y(ys[i])}" r="${did?4.5:3.6}" fill="#91a871" opacity="${did?1:.5}"/>`).join('');lines.forEach(line=>{svg+=`<path d="${line.points.map(([x,y],i)=>`${i?'L':'M'}${X(x)} ${Y(y)}`).join(' ')}" fill="none" stroke="${line.color}" stroke-width="2.3" ${line.dash?'stroke-dasharray="6 5"':''}/>`;});return svg+'</svg>';}
function labContent(){if(lab==='ols'){const rng=seeded(4561),x=[],y=[];for(let i=0;i<labValues.n;i++){const xi=rng()*8;x.push(xi);y.push(2+labValues.slope*xi+labValues.noise*normal(rng));}const fit=moments(x,y);return`<div class="lab-layout"><section class="chart-box"><h2>${t('一条线，能从噪声里看出什么？','What can a line reveal through noise?')}</h2><p>${t('固定随机种子 · 改变噪声时保留同一组随机扰动','Fixed random seed · The same random draws are reused as noise changes')}</p>${plot({xs:x,ys:y,lines:[{points:[[0,2],[8,2+labValues.slope*8]],color:'#c49a68',dash:true},{points:[[0,fit.a],[8,fit.a+fit.b*8]],color:'#315a46'}]})}<div class="legend"><span><i style="background:#315a46"></i>${t('样本拟合线','Sample OLS fit')}</span><span><i style="background:#c49a68"></i>${t('总体条件均值（已知）','Known population conditional mean')}</span></div><p class="chart-caption">${t('噪声增大，点会散开，斜率估计的标准误通常增大。增加样本量通常提高精度，但单次样本的统计量不必单调变化。置信区间使用 n−2 自由度的 t 临界值（模型中误差为独立正态且同方差）。','More noise spreads the points and usually raises the slope’s standard error. More observations usually improve precision, though individual sample statistics need not change monotonically. The interval uses a t critical value with n−2 degrees of freedom under the independent, normal, homoskedastic simulation errors.')}</p></section><aside class="controls-box"><h3>${t('调整你的数据生成过程','Adjust the data-generating process')}</h3>${slider('slope',t('真实斜率 β₁','True slope β₁'),-1,3,.1,labValues.slope)}${slider('noise',t('误差标准差 σ','Error standard deviation σ'),.5,5,.5,labValues.noise)}${slider('n',t('样本量 n','Sample size n'),20,150,10,labValues.n)}<div class="result-stat"><span>${t('估计斜率 / 真实斜率','Estimated / true slope')}</span><strong>${fit.b.toFixed(2)}</strong><small>/ ${labValues.slope.toFixed(1)}</small></div><div class="result-stat"><span>${t('斜率标准误','Slope standard error')}</span><strong>${fit.se.toFixed(3)}</strong></div><div class="result-stat"><span>${t('95% 置信区间','95% confidence interval')}</span><strong style="font-size:20px">[${(fit.b-tCritical(labValues.n-2)*fit.se).toFixed(2)}, ${(fit.b+tCritical(labValues.n-2)*fit.se).toFixed(2)}]</strong></div><p style="margin-top:18px">${t('试一试：固定样本量，调高噪声；再固定噪声，增加样本。区分“效应大小”和“估计精度”。','Try increasing noise at a fixed sample size, then increase the sample size. Distinguish effect size from precision.')}</p></aside></div>`;}
if(lab==='ovb'){const a=labValues.confound;return`<div class="lab-layout"><section class="chart-box"><h2>${t('遗漏变量，如何悄悄改变斜率？','How does omission change the slope?')}</h2><p>${t('总体示意：教育 x、未观测能力 z、结果 y','Population illustration: education x, unobserved ability z and outcome y')}</p>${plot({xs:[],ys:[],lines:[{points:[[0,2],[5,7]],color:'#315a46'},{points:[[0,2],[5,2+(1+2*a)*5]],color:'#bd8659'}],xLabel:t('教育 x（任意单位）','Education x (arbitrary units)'),yLabel:t('模型中的平均结果','Expected outcome in the model')})}<div class="legend"><span><i style="background:#315a46"></i>${t('控制 z 后：β₁ = 1','Controlling z: β₁ = 1')}</span><span><i style="background:#bd8659"></i>${t('遗漏 z 的总体回归斜率','Population slope omitting z')}</span></div><p class="chart-caption">${t('教学设定：y = 2 + x + 2z + u，z = αx + v，E[v|x] = 0，E[u|x,z] = 0。因此短回归的斜率等于 1 + 2α。固定的 β₁ = 1 是控制 z 后的效应。图中不含抽样噪声。','Teaching setup: y = 2 + x + 2z + u, z = αx + v, E[v|x] = 0 and E[u|x,z] = 0. The short-regression slope is 1 + 2α. The fixed β₁ = 1 holds z constant. There is no sampling noise in this diagram.')}</p></section><aside class="controls-box"><h3>${t('让遗漏变量与 x 更相关','Change how z moves with x')}</h3>${slider('confound',t('z 对 x 的回归斜率 α','Regression slope α of z on x'),-1.5,1.5,.1,a)}<div class="result-stat"><span>${t('真实的 β₁','True β₁')}</span><strong>1.00</strong></div><div class="result-stat"><span>${t('遗漏后斜率：β₁ + β₂α','Omitted-variable slope: β₁ + β₂α')}</span><strong>${(1+2*a).toFixed(2)}</strong></div><div class="result-stat"><span>${t('总体偏误：β₂α','Population bias: β₂α')}</span><strong>${(2*a).toFixed(2)}</strong></div><p style="margin-top:18px">${t('试着让 α = −1：即使真实效应是正的，短回归斜率也可能变成负数。增加样本量不能消除这种遗漏偏误。','Try α = −1: a positive underlying effect can produce a negative short-regression slope. More data do not eliminate this omitted-variable bias.')}</p></aside></div>`;}
const tau=labValues.tau,g=labValues.trend;return`<div class="lab-layout"><section class="chart-box"><h2>${t('两次差分，减掉了什么？','What do the two differences remove?')}</h2><p>${t('两组、两期；处理组只在政策后接受处理','Two groups, two periods; treatment begins in the second period')}</p>${plot({xs:[0,1,0,1],ys:[5,7,8,10+g+tau],lines:[{points:[[0,5],[1,7]],color:'#7b9d60'},{points:[[0,8],[1,10+g+tau]],color:'#315a46'},{points:[[0,8],[1,10+g]],color:'#bc9265',dash:true}],xLabel:t('时期','Period'),yLabel:t('平均结果','Mean outcome'),did:true})}<div class="legend"><span><i style="background:#315a46"></i>${t('处理组实际结果','Treated: observed')}</span><span><i style="background:#7b9d60"></i>${t('对照组','Control')}</span><span><i style="background:#bc9265"></i>${t('处理组未处理反事实','Treated: untreated counterfactual')}</span></div><p class="chart-caption">${t('对照组自然增长 2，处理组无政策时自然增长 2 + g。DID = [(10 + g + τ) − 8] − (7 − 5) = τ + g。只有 g = 0（本设定中的平行趋势）时，DID 才等于真实处理效应 τ。反事实在真实数据中无法直接观测。','The control group grows by 2; without treatment, the treated group would grow by 2 + g. DID = [(10 + g + τ) − 8] − (7 − 5) = τ + g. Only g = 0, parallel trends in this setup, makes DID equal the true effect τ. The counterfactual is unobservable in real data.')}</p></section><aside class="controls-box"><h3>${t('检验识别假设的作用','See why assumptions matter')}</h3>${slider('tau',t('真实处理效应 τ','True treatment effect τ'),-3,6,.5,tau)}${slider('trend',t('未处理趋势差 g','Untreated trend difference g'),-3,3,.5,g)}<div class="result-stat"><span>${t('DID 估计的总体对应值','Population DID contrast')}</span><strong>${(tau+g).toFixed(1)}</strong></div><div class="result-stat"><span>${t('真实效应 / 偏误','True effect / bias')}</span><strong>${tau.toFixed(1)}</strong><small>/ ${g.toFixed(1)}</small></div><p style="margin-top:18px">${t('平行趋势允许两组初始水平不同。这里初始差距一直是 3；真正威胁识别的是两组无政策时的增长不同。','Parallel trends allows different initial levels. The initial gap here is always 3; the threat is a difference in how outcomes would grow without treatment.')}</p></aside></div>`;}
// Student-t 0.975 critical values for the sample sizes offered by the slider.
function tCritical(df){return({18:2.1009220402,28:2.0484071418,38:2.0243941639,48:2.0106347547,58:2.0017174841,68:1.995468907,78:1.990847069,88:1.987289865,98:1.984467455,108:1.982173483,118:1.980272249,128:1.978670851,138:1.977303542,148:1.976122494})[df]||1.96;}
function render(preserveScroll=false){const{path,params}=route();const y=scrollY;let content;switch(path){case'home':content=overview();break;case'map':content=learningMap(params);break;case'cards':content=cardsPage(params);break;case'review':content=reviewPage(params);break;case'coverage':content=coveragePage(params);break;case'sync':content=syncPage()+importConflictPanel();break;case'books':content=booksPage();break;case'lab':content=labPage();break;default:content=path.startsWith('card/')?reader(path.slice(5)):overview();}document.documentElement.lang=state.lang==='zh'?'zh-CN':'en';document.title=t('计量学习地图','Econometrics Atlas')+' · '+pageName(path);$('#app').innerHTML=shell(content,path);bindPage();if(preserveScroll)scrollTo(0,y);else{scrollTo(0,0);$('#main')?.focus({preventScroll:true});}if(path==='cards'&&params.get('focus')==='search')$('#card-search')?.focus();}
function bindPage(){$$('#app [data-lang]').forEach(el=>el.onclick=()=>{state.lang=el.dataset.lang;save();render(true);});$$('#app [data-action]').forEach(el=>el.onclick=()=>action(el));$$('[data-scroll]').forEach(el=>el.onclick=e=>{e.preventDefault();$('#'+el.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});});$$('[data-lab]').forEach(el=>el.onclick=()=>{lab=el.dataset.lab;render(true);});bindSliders();const input=$('#card-search');if(input)input.oninput=()=>{const r=route();r.params.set('q',input.value);history.replaceState(null,'','#cards?'+r.params.toString());const list=cardFilter(r.params);$('#card-results').innerHTML=cardResults(list);$('#result-count').textContent=t(`找到 ${list.length} 张知识卡片`,`Found ${list.length} knowledge cards`);$$('#card-results [data-action]').forEach(el=>el.onclick=()=>action(el));};['module','status'].forEach(key=>{const el=$('#'+key+'-filter');if(el)el.onchange=()=>{const r=route();el.value?r.params.set(key,el.value):r.params.delete(key);r.params.delete('focus');location.hash='cards?'+r.params.toString();};});const note=$('#card-note');if(note)note.oninput=()=>{update(note.dataset.id,{note:note.value});$('#notes-status').textContent=storageOK?t('已保存到当前浏览器','Saved in this browser'):t('仅在本次会话保留，请导出备份','Session only; please export a backup');};const imp=$('#import-progress');if(imp)imp.onchange=()=>importProgress(imp.files[0]);bindAdaptiveReview();bindSync();bindMap();}
function bindSliders(){$$('[data-slider]').forEach(el=>{el.oninput=()=>{const key=el.dataset.slider,value=Number(el.value);labValues[key]=value;$('#value-'+key).textContent=value;const updated=document.createElement('div');updated.innerHTML=labContent();$('#lab-content .chart-box').innerHTML=$('.chart-box',updated).innerHTML;const results=$$('.result-stat',updated);$$('#lab-content .result-stat').forEach((node,i)=>node.innerHTML=results[i].innerHTML);};});}
function action(el){const id=el.dataset.id;switch(el.dataset.action){case'menu':$('#sidebar').classList.toggle('open');el.setAttribute('aria-expanded',$('#sidebar').classList.contains('open'));break;case'bookmark':{const p=pFor(id);update(id,{bookmark:!p.bookmark});const y=scrollY;render(true);toast(t(!p.bookmark?'已收藏':'已取消收藏',!p.bookmark?'Bookmarked':'Bookmark removed'));break;}case'quiz':{const c=cards.find(c=>c.id===id),choice=Number(el.dataset.choice);update(id,{quizChoice:choice,quizCorrect:choice===c.quiz.correct});freshQuiz[id]=choice===c.quiz.correct;$('#quiz-area').innerHTML=quizHTML(c);$$('#quiz-area [data-action]').forEach(el=>el.onclick=()=>action(el));break;}case'rate':{atlasRateReader(id,el.dataset.rating,freshQuiz[id]);delete freshQuiz[id];break;}case'export':{const blob=new Blob([JSON.stringify({format:'econometrics-atlas-v1',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='econometrics-progress-'+day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('学习进度已导出','Progress exported'));break;}}}
function sanitizeImportedProgress(records) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw Error('invalid');
  const result = {};
  for (const c of cards) {
    const p=records[c.id]; if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const safe={};
    ['bookmark','mastered','quizCorrect'].forEach(k=>{if(typeof p[k]==='boolean')safe[k]=p[k];});
    ['reviewAt','lastReviewed','seenAt'].forEach(k=>{if(typeof p[k]==='string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(p[k]) && Number.isFinite(Date.parse(p[k])))safe[k]=p[k].slice(0,32);});
    if(typeof p.note==='string')safe.note=p.note.slice(0,50000);
    if(Number.isInteger(p.quizChoice)&&p.quizChoice>=0&&p.quizChoice<c.quiz.options.length)safe.quizChoice=p.quizChoice;
    for(const k of ['interval','previousInterval'])if(Number.isFinite(p[k])&&p[k]>=0&&p[k]<100000)safe[k]=p[k];
    if(p.memory){const memory=AtlasReview.normalize(p.memory);if(!memory)throw Error('invalid');safe.memory=memory;}
    // Only the imported record is migrated. An absent incoming memory must not
    // become a copy of the active record and silently overwrite its history.
    const migrated=AtlasReview.migrateLegacy(safe,Date.now());
    if(migrated.memory)safe.memory=migrated.memory;
    if(Object.keys(safe).length)result[c.id]=safe;
  }
  return result;
}
function mergeImportedProgress(records) {
  if(AtlasSync.status().connected){AtlasSync.merge(records);return;}
  const conflicts=state.importConflicts||{},next={...conflicts},changes={};
  // A second import cannot replace an unresolved imported version.
  for(const [id,p] of Object.entries(records))for(const [field,value] of Object.entries(p)){
    const k=id+':'+field;
    if(conflicts[k]&&JSON.stringify(conflicts[k].incoming)!==JSON.stringify(value))throw Error('pending');
  }
  for(const [id,p] of Object.entries(records))for(const [field,value] of Object.entries(p)){
    const current=pFor(id)[field],k=id+':'+field;
    if(current===undefined){changes[id]={...changes[id],[field]:value};}
    else if(JSON.stringify(current)!==JSON.stringify(value))next[k]={cardId:id,field,incoming:value};
  }
  for(const [id,p] of Object.entries(changes))state.cards[id]={...pFor(id),...p};
  state.importConflicts=next;save();
}
async function importProgress(file){
  if(!file)return;
  // Reading a file is asynchronous. Never import it into a different learning
  // space if a connection or disconnect occurs while that read is pending.
  const identity=AtlasSync.code();
  try{
    if(file.size>2000000)throw Error('invalid');
    const raw=JSON.parse(await file.text());
    if(identity!==AtlasSync.code())throw Error('superseded');
    if(raw.format!=='econometrics-atlas-v1')throw Error('invalid');
    const records=sanitizeImportedProgress(raw.state?.cards);
    mergeImportedProgress(records);
    const conflicts=AtlasSync.status().connected?Object.keys(AtlasSync.status().conflicts).length:Object.keys(state.importConflicts||{}).length;
    save();render(true);
    if(conflicts){location.hash='sync';toast(t('不同版本已保留，请选择要使用的版本。','Both versions are kept. Choose which version to use.'));}
    else toast(t(`已合并 ${Object.keys(records).length} 张卡片的学习进度`,`Merged progress for ${Object.keys(records).length} cards`));
  }catch(e){toast(e.message==='pending'?syncError('pending'):e.message==='superseded'?t('学习空间已切换，请在当前空间重新导入。','The study space changed. Import again in the current space.'):t('无法导入：请选择本站导出的有效 JSON 备份','Import failed: choose a valid JSON backup exported by this site'));}
}
function importConflictPanel(){
  if(AtlasSync.status().connected)return '';
  const entries=Object.entries(state.importConflicts||{}).filter(([,c])=>cards.some(card=>card.id===c.cardId));
  if(!entries.length)return '';
  return '<section class="intro-panel"><h2>'+t('备份中的不同版本','Different versions in your backup')+' ('+entries.length+')</h2><p>'+t('当前记录与导入记录均保留在此浏览器。复习记忆按整份记录选择，不会拼接两个学习历史。','Current and imported versions are kept in this browser. Choose a complete review record; two learning histories are never spliced together.')+'</p>'+entries.map(([key,c])=>'<div class="sync-conflict"><h3>'+h(cards.find(x=>x.id===c.cardId)?.title||c.cardId)+' · '+escapeHTML(c.field)+'</h3><div class="sync-comparison"><div><strong>'+t('当前记录','Current record')+'</strong><pre>'+escapeHTML(conflictText(pFor(c.cardId)[c.field],c.field))+'</pre><button class="btn btn-ghost" data-import-resolve="'+escapeHTML(key)+'" data-choice="current">'+t('保留当前记录','Keep current')+'</button></div><div><strong>'+t('导入记录','Imported record')+'</strong><pre>'+escapeHTML(conflictText(c.incoming,c.field))+'</pre><button class="btn btn-ghost" data-import-resolve="'+escapeHTML(key)+'" data-choice="incoming">'+t('使用导入记录','Use imported')+'</button></div></div></div>').join('')+'</section>';
}
function resolveImportConflict(key,choice){
  if(AtlasSync.status().connected)return;
  const c=state.importConflicts?.[key];if(!c)return;
  if(choice==='incoming')state.cards[c.cardId]={...pFor(c.cardId),[c.field]:c.incoming};
  else if(choice!=='current')return;
  delete state.importConflicts[key];save();render(true);
}
/*
 * GRAFT INTO app.js (inside the same scope as cards/state/pFor/update/t/h/render).
 * 1. Load public/review-engine.js before app.js in study.html.
 * 2. reviewPage(params) => renderAdaptiveReview(params).
 * 3. Call bindAdaptiveReview() at the END of bindPage().
 * 4. due(c) => AtlasReview.isDue(atlasMemory(c.id), Date.now()).
 * 5. Reader rate handler => atlasRateReader(id, rating, freshQuizCorrect).
 *    Pass quiz correctness only from the CURRENT attempt, not an old stored answer.
 * 6. Keep notes/bookmarks unchanged. Import/export and cloud sync must preserve
 *    memory as an atomic field; use AtlasReview.normalize for imported memory.
 *    migrateLegacy returns all existing progress fields plus memory.
 * 7. Do not call "one correct answer" mastery. For overview, "Reviewed"/"已复习"
 *    can use memory.reps>0. atlasIsStable() is an explicit heuristic, not proof.
 * No daily streak, fixed daily quota, or fixed 1/3/7-day schedule.
 */
let atlasRecallState = null;
let atlasLocalSession = '';

function atlasSessionId() {
  if (atlasLocalSession) return atlasLocalSession;
  try {
    atlasLocalSession = sessionStorage.getItem('atlas-review-session-v2') || '';
    if (!atlasLocalSession) {
      atlasLocalSession = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'atlas-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('atlas-review-session-v2', atlasLocalSession);
    }
  } catch { atlasLocalSession = 'atlas-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  return atlasLocalSession;
}

function atlasMemory(id, now = Date.now()) {
  return AtlasReview.migrateLegacy(pFor(id), now).memory || null;
}
function atlasIsStable(id, now = Date.now()) {
  const m = atlasMemory(id, now);
  return !!m && m.phase === 'review' && m.stability >= 7 && AtlasReview.recall(m, now) >= 0.8;
}
function atlasInterval(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes <= 1) return t('现在', 'now');
  if (minutes < 60) return t(minutes + ' 分钟后', 'in ' + minutes + ' min');
  if (minutes < 1440) { const hours = Math.round(minutes / 6) / 10; return t(hours + ' 小时后', 'in ' + hours + ' hours'); }
  const days = Math.round(minutes / 144) / 10;
  return t(days + ' 天后', 'in ' + days + ' days');
}
function atlasDate(ms) {
  return new Date(ms).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function atlasRateReader(id, rating, freshQuizCorrect) {
  const now = Date.now(), before = atlasMemory(id, now);
  const memory = AtlasReview.rate(before, rating, now, atlasSessionId(), freshQuizCorrect);
  if(memory.lastReviewAt!==before?.lastReviewAt)update(id, { memory });
  render(true);
  toast(memory.lastReviewAt === before?.lastReviewAt
    ? t('刚刚已记录；短时间重复练习不会延长复习间隔。', 'Already recorded. Immediate practice does not extend the interval.')
    : t('下次检查：', 'Next check: ') + atlasInterval(memory.dueAt - now));
  return memory;
}

function atlasReviewTabs(filter) {
  return '<div class="review-toolbar"><div class="chips" style="margin:0">' +
    [['due','主动回忆','Recall'],['saved','已收藏','Bookmarked'],['notes','我的笔记','My notes'],['mastered','记得较稳','More stable']].map(([key,z,e]) =>
      '<a class="chip ' + (filter === key ? 'active' : '') + '" href="#review?tab=' + key + '">' + t(z,e) + '</a>').join('') +
    '</div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-ghost" data-action="export">' + icon('download',14) + t('导出进度','Export') +
    '</button><label class="btn btn-ghost import-label">' + t('导入进度','Import') + '<input type="file" id="import-progress" accept="application/json,.json"></label></div></div>';
}
function renderAdaptiveReview(params = new URLSearchParams()) {
  if (atlasRecallState) return renderRecallSession(params);
  const now = Date.now(), filter = params.get('tab') || 'due';
  const summary = AtlasReview.stats(cards, state.cards, now);
  const intro = '<div class="page-heading"><div><div class="eyebrow">RECALL AT YOUR PACE</div><h1>' + t('有空时，做一轮有效回忆。','Make the most of the time you have.') +
    '</h1><p>' + t('不要求每天登录。按实际间隔与回忆表现，先找最值得复习的知识。','No daily attendance needed. Prioritize concepts using elapsed time and recall performance.') + '</p></div></div>';
  const tabs = atlasReviewTabs(filter);
  if (filter !== 'due') {
    const list = cards.filter(c => filter === 'saved' ? pFor(c.id).bookmark : filter === 'notes' ? pFor(c.id).note : atlasIsStable(c.id, now));
    return intro + tabs + (filter === 'mastered' ? '<p class="source-note">' + t('“记得较稳”是基于已记录回忆的估计，不代表永久掌握。','“More stable” estimates recorded retention; it does not mean permanent mastery.') + '</p>' : '') +
      (list.length ? '<div class="card-grid">' + list.map(c => cardTile(c, filter === 'notes')).join('') + '</div>' : '<div class="empty"><h2>' + t('这里暂时没有卡片','No cards here yet') + '</h2></div>');
  }
  const ready = AtlasReview.queue(cards, state.cards, now, { limit: 5 });
  const disabled = summary.due ? '' : ' disabled';
  const choices = '<section class="intro-panel"><h2>' + t('这次想复习多少？','How much would you like to review?') +
    '</h2><p>' + t('选择张数，或选择可用时间。到期卡片按紧迫程度排序，一次最多 20 张；时间为估计值。','Choose a card count or a time budget. Due cards are ordered by urgency, with at most 20 per batch; time is approximate.') +
    '</p><div class="mastery-actions" aria-label="' + t('按卡片数量开始','Start by card count') + '">' +
    [5,10,20].map(n => '<button class="btn ' + (n === 10 ? 'btn-primary' : 'btn-ghost') + '" data-adaptive="start" data-limit="' + n + '"' + disabled + '>' + n + t(' 张',' cards') + '</button>').join('') +
    '</div><div class="mastery-actions" style="margin-top:10px" aria-label="' + t('按时间开始','Start by time budget') + '">' +
    [5,15,30].map(n => '<button class="btn btn-ghost" data-adaptive="start" data-minutes="' + n + '"' + disabled + '>' + icon('clock',14) + n + t(' 分钟',' min') + '</button>').join('') + '</div></section>';
  const metrics = '<div class="metrics">' +
    [[summary.due,t('适合现在复习','Ready now')],[summary.relearning,t('需要重新巩固','Relearning')],[summary.learned,t('已接触的知识','Started cards')],[summary.stable,t('记得较稳','More stable')]].map(([n,label]) =>
      '<div class="metric"><div class="metric-head">' + label + '</div><strong>' + n + '</strong></div>').join('') + '</div>';
  const preview = ready.length
    ? '<section><div class="section-head"><h2>' + t('优先放进下一轮','First in your next batch') + '</h2></div><div class="journey">' +
      ready.map(c => { const m = atlasMemory(c.id,now); return '<div class="journey-row"><span class="journey-text"><strong>' + h(c.title) +
        '</strong><small>' + t(m.phase === 'relearning' ? '上次未能回忆，先巩固' : '根据间隔与历史表现优先安排',m.phase === 'relearning' ? 'Recall missed last time; strengthen it first' : 'Prioritized by spacing and previous recall') +
        '</small></span><span class="tag">' + AtlasReview.reviewMinutes(c) + t(' 分钟',' min') + '</span></div>'; }).join('') + '</div></section>'
    : '<div class="empty"><h2>' + t('当前没有到期的卡片','Nothing is due right now') + '</h2><p>' +
      (summary.nextDueAt ? t('最近一次检查：','Next check: ') + h(atlasDate(summary.nextDueAt)) : t('从一张新卡片开始，读完后记录这次理解。','Start a new card and record your understanding after reading.')) +
      '</p>' + (summary.learned ? '<button class="btn btn-ghost" data-adaptive="practice">' + t('提前练习 5 张','Practice 5 early') + '</button>' : '<a class="btn btn-primary" href="#cards">' + t('浏览知识卡片','Explore cards') + '</a>') + '</div>';
  const explanation = '<details class="intro-panel" style="margin-top:24px"><summary>' + t('复习计划怎样调整？','How does scheduling adapt?') +
    '</summary><p style="margin-top:12px">' + t('系统使用实际间隔、回忆难度、过去失误和本次自测，调整每张卡的检查时间。首次学习或忘记后，先在约 10 分钟后检查；同一轮短时间反复看答案，不会让长期间隔不断变长。错过日期不扣分，回来后按当前需要重新排序。','The schedule uses elapsed time, recall difficulty, past misses, and the current quiz. First learning or forgetting starts with a check after about 10 minutes. Immediate repetition does not keep stretching long-term intervals. Missed dates carry no penalty; priorities update when you return.') +
    '</p><p>' + t('这是可解释的启发式安排，尚未用你的长期数据校准，也不宣称是经过验证的 FSRS 或真实记忆概率。','This is a transparent heuristic, not calibrated to your long-term data or claimed to be validated FSRS or a measured probability of recall.') + '</p></details>';
  return intro + metrics + tabs + choices + preview + explanation;
}

function renderRecallSession() {
  const s = atlasRecallState;
  if (!s) return renderAdaptiveReview(new URLSearchParams());
  const c = cards.find(c => c.id === s.ids[s.index]);
  if (!c) {
    return '<div class="intro-panel"><div class="eyebrow">SESSION COMPLETE</div><h1>' + t('这一轮，先到这里。','That is a good place to stop.') +
      '</h1><p>' + t('已主动回忆 ','You recalled ') + s.results.length + t(' 张。每张卡的下次时间已按本次表现更新。',' cards. Each next check reflects this attempt.') +
      '</p><div class="journey">' + s.results.map(r => '<div class="journey-row"><span class="journey-text"><strong>' +
        h(cards.find(c => c.id === r.id)?.title || r.id) + '</strong><small>' + (r.recorded ? t('下次检查：','Next check: ') + h(atlasDate(r.dueAt)) : t('短间隔练习，原计划保留','Early practice; existing schedule kept')) +
        '</small></span></div>').join('') + '</div><button class="btn btn-primary" style="margin-top:20px" data-adaptive="close">' +
      t('回到复习总览','Back to review') + '</button></div>';
  }
  const now = Date.now(), m = atlasMemory(c.id,now);
  const correct = Number.isInteger(s.choice) ? s.choice === c.quiz.correct : undefined;
  const top = '<div class="page-heading"><div><div class="eyebrow">' + t('主动回忆','ACTIVE RECALL') + ' · ' + (s.index+1) + ' / ' + s.ids.length +
    '</div><h1>' + h(c.title) + '</h1><p>' + t('先离开答案想一想；不确定也可以据实记录。','Think before seeing the answer. It is fine to be unsure.') +
    '</p></div><button class="btn btn-ghost" data-adaptive="close">' + t('结束这一轮','End this batch') + '</button></div>';
  const question = '<section class="intro-panel"><h2>' + h(c.question) + '</h2><p>' + t('尝试用自己的话说出直觉、关键条件，以及一个例子。','Try to explain the intuition, the key assumptions, and an example in your own words.') + '</p></section>';
  const quiz = '<section class="reading-section"><h2>' + t('也可以先做这道自测','Optional self-check before revealing') + '</h2><p class="quiz-question">' + h(c.quiz.question) +
    '</p><div class="quiz-options">' + c.quiz.options.map((option,i) => '<button class="quiz-option ' +
      (s.revealed ? (i===c.quiz.correct ? 'correct' : i===s.choice ? 'wrong' : '') : '') +
      '" data-adaptive="choice" data-choice="' + i + '" aria-pressed="' + (i===s.choice) + '"' + (s.revealed ? ' disabled' : '') +
      '><span class="letter">' + String.fromCharCode(65+i) + '.</span><span>' + h(option) + '</span></button>').join('') + '</div></section>';
  if (!s.revealed) return top + question + quiz + '<button class="btn btn-primary" data-adaptive="reveal">' + t('我想好了，查看答案','Reveal after recalling') + '</button>';
  const answer = '<section class="reading-section"><h2>' + t('对照你的回忆','Compare with your recall') + '</h2><div class="intuition-box"><p>' + h(c.intuition) +
    '</p></div><div class="formula" style="white-space:pre-wrap">' + h(c.formula) + '</div><p>' + h(c.symbols) +
    '</p><div class="example-box"><p>' + h(c.example) + '</p></div><div class="quiz-feedback" role="status">' +
    (correct === false ? '<strong>' + t('本次自测未答对，会先安排短检查。','This quiz was missed; a short check comes first.') + '</strong>' : '') + h(c.quiz.explanation) +
    '</div><a class="text-link" href="#card/' + c.id + '">' + t('打开完整讲解','Open the full explanation') + ' →</a></section>';
  const grade = '<section class="mastery"><h3>' + t('不看答案时，你记起了多少？','How much did you recall before seeing the answer?') +
    '</h3><p>' + t('按实际回忆评分。自测答错时，本轮会先安排短检查。','Rate actual recall. A missed quiz schedules a short check first.') + '</p><div class="mastery-actions">' +
    [['again','没想起来','Missed'],['hard','费力想起','Hard'],['good','基本想起','Good'],['easy','轻松解释','Easy']].map(([rating,z,e]) => {
      const next = AtlasReview.rate(m,rating,now,atlasSessionId(),correct);
      return '<button class="btn ' + (rating==='good' ? 'btn-primary' : 'btn-ghost') + '" data-adaptive="grade" data-rating="' + rating +
        '"><span>' + t(z,e) + '<small style="display:block;font-size:10px;opacity:.8">' + h(atlasInterval(next.dueAt-now)) + '</small></span></button>';
    }).join('') + '</div></section>';
  return top + question + quiz + answer + grade;
}

function bindAdaptiveReview() {
  document.querySelectorAll('[data-adaptive]').forEach(el => {
    el.onclick = () => {
      const action = el.dataset.adaptive;
      if (action === 'start' || action === 'practice') {
        const opts = action === 'practice' ? {limit:5,practice:true} :
          {limit:el.dataset.limit ? Number(el.dataset.limit) : 20, minutes:el.dataset.minutes ? Number(el.dataset.minutes) : undefined};
        const selected = AtlasReview.queue(cards,state.cards,Date.now(),opts);
        if (!selected.length) { toast(t('当前没有合适的复习卡片。','No review cards fit right now.')); return; }
        atlasRecallState = {ids:selected.map(c=>c.id),index:0,revealed:false,choice:undefined,results:[]};
        render();
        return;
      }
      if (action === 'close') { atlasRecallState=null; render(); return; }
      const s=atlasRecallState;
      if (!s || s.busy) return;
      if (action === 'choice' && !s.revealed) { s.choice=Number(el.dataset.choice); render(true); return; }
      if (action === 'reveal') { s.revealed=true; render(true); return; }
      if (action === 'grade' && s.revealed) {
        s.busy=true;
        const card=cards.find(c=>c.id===s.ids[s.index]),now=Date.now();
        if (!card) { s.busy=false; return; }
        const before=atlasMemory(card.id,now),quizCorrect=Number.isInteger(s.choice)?s.choice===card.quiz.correct:undefined;
        const memory=AtlasReview.rate(before,el.dataset.rating,now,atlasSessionId(),quizCorrect);
        const patch=memory.lastReviewAt!==before?.lastReviewAt?{memory}:{};
        if (Number.isInteger(s.choice)) { patch.quizChoice=s.choice; patch.quizCorrect=quizCorrect; }
        if(Object.keys(patch).length)update(card.id,patch);
        s.results.push({id:card.id,dueAt:memory.dueAt,recorded:memory.lastReviewAt!==before?.lastReviewAt});
        s.index++;s.revealed=false;s.choice=undefined;s.busy=false;
        render();
      }
    };
  });
}


/* XMind-style concept map. Graft learningMap/bindMap into app.js and call bindMap
 * after each map render. No dependencies; SVG edges + native HTML controls. */
/* XMind-style concept map. Graft learningMap/bindMap into app.js and call bindMap
 * after each map render. No dependencies; SVG edges + native HTML controls. */
function learningMap(params) {
  const advanced = params.get('advanced') === '1';
  const visible = modules.filter(m => advanced || m.level !== 'extension');
  const chosen = visible.find(m => m.id === params.get('module'));
  const rawStage = chosen ? chosen.stage : params.has('stage') ? Number(params.get('stage')) : null;
  const selected = Number.isInteger(rawStage) && rawStage >= 0 && rawStage < stages.length ? rawStage : null;
  const link = (stage = null, mod = null, extra = advanced) => {
    const q = new URLSearchParams();
    if (stage !== null) q.set('stage', stage);
    if (mod) q.set('module', mod);
    if (extra) q.set('advanced', '1');
    return '#map' + (q.size ? '?' + q : '');
  };
  const list = m => inModule(m.id).filter(c => advanced || c.level !== 'extension');
  const colors = ['#3c8277', '#5e75ad', '#bb7a3f', '#9970a4', '#729044'];
  const nodes = [], edges = [];
  const root = { id: 'root', kind: 'root', x: 0, y: 0, w: 230, h: 108, color: '#315a46', label: t('计量经济学', 'Econometrics'),
    html: `<span class="xm-root-symbol">β</span><strong>${t('计量经济学', 'Econometrics')}</strong><small>${t('概念 · 方法 · 实证', 'Concepts · Methods · Evidence')}</small>`, href: link(), expanded: selected !== null };
  nodes.push(root);
  const branches = stages.map((s, i) => {
    const ms = visible.filter(m => m.stage === i);
    const children = selected === i ? ms.map(m => ({ m, cs: chosen?.id === m.id ? list(m) : [], height: chosen?.id === m.id ? Math.max(92, list(m).length * 96 - 8) : 92 })) : [];
    return { i, s, ms, children, side: i < 3 ? 1 : -1, height: children.length ? children.reduce((a, c) => a + c.height, 0) + (children.length - 1) * 14 : 104 };
  });
  for (const side of [-1, 1]) {
    const group = branches.filter(b => b.side === side);
    let y = -(group.reduce((n, b) => n + b.height, 0) + (group.length - 1) * 32) / 2;
    for (const b of group) {
      const cy = y + b.height / 2, color = colors[b.i % colors.length];
      const stage = { id: 'stage-' + b.i, kind: 'stage', stage: b.i, x: side * 338, y: cy, w: 230, h: 88, color, label: h(b.s),
        html: `<span class="xm-node-kicker">${String(b.i + 1).padStart(2, '0')} · ${t('知识领域', 'FIELD')}</span><strong>${h(b.s)}</strong><small>${b.ms.length} ${t('个模块', 'modules')} <span class="xm-expand">${selected === b.i ? '−' : '+'}</span></small>`,
        href: link(selected === b.i ? null : b.i), expanded: selected === b.i };
      nodes.push(stage); edges.push({ from: root, to: stage, color, side, level: 1 });
      let my = y;
      for (const child of b.children) {
        const m = child.m, mcy = my + child.height / 2, mc = list(m), n = mc.filter(done).length;
        const module = { id: 'module-' + m.id, kind: 'module', stage: b.i, module: m.id, x: side * 670, y: mcy, w: 252, h: 88, color, label: h(m.title),
          html: `<span class="xm-node-kicker">${h(m.id.toUpperCase())}${m.level === 'extension' ? ' · ' + t('拓展', 'EXTENSION') : ''}</span><strong>${h(m.title)}</strong><small>${n} / ${mc.length} ${t('已学习', 'learned')} <span class="xm-expand">${chosen?.id === m.id ? '−' : '+'}</span></small>`,
          href: link(b.i, chosen?.id === m.id ? null : m.id), expanded: chosen?.id === m.id };
        nodes.push(module); edges.push({ from: stage, to: module, color, side, level: 2 });
        child.cs.forEach((c, ci) => {
          const q = new URLSearchParams({ from: 'map', stage: String(b.i), module: m.id });
          if (advanced) q.set('advanced', '1');
          const card = { id: 'card-' + c.id, card: c.id, kind: 'card', stage: b.i, module: m.id, x: side * 1030, y: mcy - (child.cs.length - 1) * 96 / 2 + ci * 96, w: 284, h: 88, color, label: h(c.title),
            html: `<span class="xm-node-kicker">${t('知识卡片', 'KNOWLEDGE CARD')} ${String(ci + 1).padStart(2, '0')}${done(c) ? ' · ✓' : ''}</span><strong>${h(c.title)}</strong><small>${c.minutes || 10} ${t('分钟', 'min')} <span aria-hidden="true">↗</span></small>`, href: '#card/' + c.id + '?' + q };
          nodes.push(card); edges.push({ from: module, to: card, color, side, level: 3 });
        });
        my += child.height + 14;
      }
      y += b.height + 32;
    }
  }
  const minX = Math.min(...nodes.map(n => n.x - n.w / 2)) - 55, minY = Math.min(...nodes.map(n => n.y - n.h / 2)) - 55;
  nodes.forEach(n => { n.x -= minX; n.y -= minY; });
  const width = Math.max(...nodes.map(n => n.x + n.w / 2)) + 55, height = Math.max(...nodes.map(n => n.y + n.h / 2)) + 55;
  const signature = [selected, chosen?.id || '', advanced, state.lang].join('|');
  learningMap.model = { nodes, width, height, selected, chosen, advanced, signature, parent: chosen ? link(selected) : link(), link };
  const paths = edges.map(e => {
    const x1 = e.from.x + e.side * e.from.w / 2, x2 = e.to.x - e.side * e.to.w / 2;
    const dx = (x2 - x1) * .52;
    return `<path d="M ${x1} ${e.from.y} C ${x1 + dx} ${e.from.y}, ${x2 - dx} ${e.to.y}, ${x2} ${e.to.y}" stroke="${e.color}" stroke-width="${e.level === 1 ? 4 : e.level === 2 ? 2.6 : 1.6}" opacity="${e.level === 1 ? .9 : .68}"/>`;
  }).join('');
  const controls = nodes.map(n => {
    const attrs = `class="xm-node xm-${n.kind}${(n.kind === 'stage' && n.stage === selected) || (n.kind === 'module' && n.module === chosen?.id) ? ' is-expanded' : ''}" data-xm-id="${n.id}" style="left:${n.x - n.w / 2}px;top:${n.y - n.h / 2}px;width:${n.w}px;height:${n.h}px;--branch:${n.color}"`;
    return n.kind === 'card' ? `<a ${attrs} href="${h(n.href)}">${n.html}</a>` : `<button type="button" ${attrs} data-xm-go="${h(n.href)}" aria-expanded="${n.expanded}" title="${n.expanded ? t('点击收起此分支', 'Collapse this branch') : t('点击展开此分支', 'Expand this branch')}">${n.html}</button>`;
  }).join('');
  const toggleModule = chosen && chosen.level !== 'extension' ? chosen.id : null;
  return `<div class="page-heading xm-heading"><div><div class="eyebrow">ECONOMETRICS CONCEPT MAP</div><h1>${t('计量经济学知识导图', 'Econometrics concept map')}</h1><p>${t('从中心主题出发，逐级展开知识领域、模块与卡片。', 'Explore fields, modules and cards from one central topic.')}</p></div></div>
  <section class="xm-section" aria-label="${t('交互式知识导图', 'Interactive concept map')}">
    <div class="xm-toolbar"><div class="xm-search-wrap"><label class="xm-search">${icon('search', 17)}<input type="search" id="xm-search" autocomplete="off" placeholder="${t('搜索模块或知识卡片', 'Find a module or card')}" aria-label="${t('搜索并定位知识节点', 'Search and locate a concept')}" aria-controls="xm-search-results"></label><div id="xm-search-results" class="xm-search-results" hidden></div><span class="xm-sr" id="xm-search-status" aria-live="polite"></span></div><a class="xm-extension ${advanced ? 'active' : ''}" href="${h(link(selected, toggleModule, !advanced))}" aria-label="${t(advanced ? '隐藏进阶拓展' : '显示进阶拓展', advanced ? 'Hide extensions' : 'Show extensions')}"><span aria-hidden="true">${advanced ? '✓' : '+'}</span>${t('进阶拓展', 'Extensions')}</a><a class="xm-coverage" href="#coverage">${t('教材覆盖', 'Coverage')} ↗</a></div>
    <div class="xm-pathbar"><nav aria-label="${t('当前知识层级', 'Current concept level')}"><a href="${h(link())}" ${selected === null ? 'aria-current="page"' : ''}>${t('中心主题', 'Central topic')}</a>${selected !== null ? `<span aria-hidden="true">›</span><a href="${h(link(selected))}" ${!chosen ? 'aria-current="page"' : ''}>${h(stages[selected])}</a>` : ''}${chosen ? `<span aria-hidden="true">›</span><span aria-current="page">${h(chosen.title)}</span>` : ''}</nav>${selected !== null ? `<a class="xm-back" href="${h(chosen ? link(selected) : link())}">${icon('back', 14)}${t('返回上一级', 'Up one level')}</a>` : ''}</div>
    <div class="xm-viewport" id="xm-viewport" tabindex="0" role="region" aria-label="${t('知识导图画布。方向键移动，加减号缩放，数字零显示全图。', 'Concept canvas. Arrow keys pan, plus and minus zoom, zero fits the map.')}" aria-describedby="xm-help"><div class="xm-world" id="xm-world" style="width:${width}px;height:${height}px"><svg class="xm-edges" width="${width}" height="${height}" aria-hidden="true"><g fill="none" stroke-linecap="round">${paths}</g></svg>${controls}</div><div class="xm-canvas-tools" aria-label="${t('画布控制', 'Canvas controls')}"><button type="button" data-xm-tool="out" aria-label="${t('缩小', 'Zoom out')}">−</button><output id="xm-zoom" aria-label="${t('缩放比例', 'Zoom level')}">100%</output><button type="button" data-xm-tool="in" aria-label="${t('放大', 'Zoom in')}">+</button><span></span><button type="button" data-xm-tool="fit">${t('全图', 'Fit all')}</button><button type="button" data-xm-tool="focus">${t('当前分支', 'Focus')}</button></div></div>
    <div class="xm-caption" id="xm-help"><span>${t('点击节点展开 · 拖动画布 · 双指缩放', 'Click to expand · Drag to pan · Pinch to zoom')}</span><span>${t('由浅入深：01 → 02 → 03 → 04 → 05', 'Suggested order: 01 → 02 → 03 → 04 → 05')}</span></div>
  </section>`;
}

function bindMap() {
  const viewport = document.getElementById('xm-viewport'), world = document.getElementById('xm-world'), model = learningMap.model;
  if (!viewport || !world || !model) return;
  const query = s => viewport.querySelector(s);
  let scale = 1, tx = 0, ty = 0, drag = null, moved = false;
  const pointers = new Map();
  const apply = () => { world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; document.getElementById('xm-zoom').textContent = Math.round(scale * 100) + '%'; };
  const bound = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function fit(nodes = model.nodes) {
    const left = Math.min(...nodes.map(n => n.x - n.w / 2)) - 36, right = Math.max(...nodes.map(n => n.x + n.w / 2)) + 36;
    const top = Math.min(...nodes.map(n => n.y - n.h / 2)) - 36, bottom = Math.max(...nodes.map(n => n.y + n.h / 2)) + 36;
    scale = bound(Math.min((viewport.clientWidth - 22) / (right - left), (viewport.clientHeight - 66) / (bottom - top)), .2, 1);
    tx = viewport.clientWidth / 2 - (left + right) / 2 * scale;
    ty = (viewport.clientHeight - 46) / 2 - (top + bottom) / 2 * scale; apply();
  }
  function branch() { fit(model.selected === null ? model.nodes : model.nodes.filter(n => n.kind === 'root' || n.stage === model.selected)); }
  function zoom(next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    next = bound(next, .2, 2); const ratio = next / scale;
    tx = x - (x - tx) * ratio; ty = y - (y - ty) * ratio; scale = next; apply();
  }
  function point(event) { const r = viewport.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function navigate(href) { if (location.hash === href) render(true); else location.hash = href; }
  viewport.querySelectorAll('[data-xm-go]').forEach(el => el.onclick = () => navigate(el.dataset.xmGo));
  viewport.querySelectorAll('[data-xm-tool]').forEach(el => el.onclick = () => {
    const action = el.dataset.xmTool;
    if (action === 'fit') fit(); else if (action === 'focus') branch(); else zoom(scale * (action === 'in' ? 1.2 : 1 / 1.2));
  });
  viewport.addEventListener('wheel', e => {
    // The canvas owns the wheel only while focused or with a zoom modifier;
    // normal page scrolling remains available when just passing over the map.
    if (!e.ctrlKey && !e.metaKey && document.activeElement !== viewport) return;
    e.preventDefault(); const p = point(e);
    if (e.ctrlKey || e.metaKey) zoom(scale * Math.exp(-e.deltaY * .007), p.x, p.y);
    else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
  }, { passive: false });
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button,a,input')) return;
    e.preventDefault(); viewport.focus({ preventScroll: true }); viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, point(e)); moved = false;
    const p = [...pointers.values()];
    drag = p.length === 2 ? { type: 'pinch', distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), scale, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, tx, ty } : { type: 'pan', x: p[0].x, y: p[0].y, tx, ty };
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !drag) return;
    pointers.set(e.pointerId, point(e)); const p = [...pointers.values()];
    if (p.length === 2 && drag.type === 'pinch') {
      const next = bound(drag.scale * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / Math.max(1, drag.distance), .2, 2), ratio = next / drag.scale;
      tx = (p[0].x + p[1].x) / 2 - (drag.cx - drag.tx) * ratio; ty = (p[0].y + p[1].y) / 2 - (drag.cy - drag.ty) * ratio; scale = next; moved = true; apply();
    } else if (p.length === 1 && drag.type === 'pan') {
      const dx = p[0].x - drag.x, dy = p[0].y - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      tx = drag.tx + dx; ty = drag.ty + dy; apply();
    }
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) { drag = null; viewport.classList.remove('is-dragging'); }
    else { const p = [...pointers.values()][0]; drag = { type: 'pan', x: p.x, y: p.y, tx, ty }; }
  };
  viewport.addEventListener('pointerup', end); viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('click', e => { if (moved && e.target === viewport) e.preventDefault(); });
  viewport.addEventListener('keydown', e => {
    if (e.target !== viewport) return;
    const moves = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (moves[e.key]) { e.preventDefault(); tx += moves[e.key][0]; ty += moves[e.key][1]; apply(); }
    else if (['+', '=', '-'].includes(e.key)) { e.preventDefault(); zoom(scale * (e.key === '-' ? 1 / 1.2 : 1.2)); }
    else if (e.key === '0') { e.preventDefault(); fit(); }
    else if (e.key === 'Escape' && model.selected !== null) { e.preventDefault(); navigate(model.parent); }
  });
  viewport.addEventListener('focusin', e => {
    const el = e.target.closest('[data-xm-id]'); if (!el) return;
    const n = model.nodes.find(n => n.id === el.dataset.xmId); if (!n) return;
    const left = tx + (n.x - n.w / 2) * scale, right = left + n.w * scale, top = ty + (n.y - n.h / 2) * scale, bottom = top + n.h * scale;
    if (left < 16) tx += 16 - left; else if (right > viewport.clientWidth - 16) tx -= right - viewport.clientWidth + 16;
    if (top < 16) ty += 16 - top; else if (bottom > viewport.clientHeight - 70) ty -= bottom - viewport.clientHeight + 70;
    viewport.scrollLeft = 0; viewport.scrollTop = 0; apply();
  });
  const search = document.getElementById('xm-search'), results = document.getElementById('xm-search-results'), status = document.getElementById('xm-search-status');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.hidden = true; results.innerHTML = ''; status.textContent = ''; return; }
    const ms = modules.filter(m => JSON.stringify([m.id, m.title]).toLowerCase().includes(q)).map(m => ({ m, c: null }));
    const cs = cards.filter(c => JSON.stringify([c.id, c.title, c.question]).toLowerCase().includes(q)).map(c => ({ m: moduleBy(c.module), c })).filter(x => x.m);
    const matches = [...ms, ...cs].slice(0, 10);
    results.hidden = false; status.textContent = t(`找到 ${matches.length} 个节点`, `${matches.length} matching nodes`);
    results.innerHTML = matches.length ? matches.map(({ m, c }) => `<a href="${h(model.link(m.stage, m.id, model.advanced || m.level === 'extension' || c?.level === 'extension'))}" data-xm-target="${c ? 'card-' + c.id : 'module-' + m.id}"><span>${h(c ? c.title : m.title)}</span><small>${c ? h(m.title) : t('知识模块', 'Module')}${m.level === 'extension' || c?.level === 'extension' ? ' · ' + t('拓展', 'Extension') : ''}</small></a>`).join('') : `<p>${t('没有找到对应知识节点', 'No matching concepts')}</p>`;
    results.querySelectorAll('a').forEach(el => el.onclick = e => { e.preventDefault(); learningMap.pendingFocus = el.dataset.xmTarget; navigate(el.getAttribute('href')); });
  };
  search.onkeydown = e => { if (e.key === 'Escape') { results.hidden = true; search.value = ''; } else if (e.key === 'ArrowDown' && !results.hidden) { e.preventDefault(); results.querySelector('a')?.focus(); } };
  results.onkeydown = e => { if (e.key === 'Escape') { results.hidden = true; search.focus(); } };
  branch();
  if (learningMap.pendingFocus) {
    const node = model.nodes.find(n => n.id === learningMap.pendingFocus), el = query(`[data-xm-id="${learningMap.pendingFocus}"]`);
    if (node && el) { scale = Math.min(1, Math.max(.8, viewport.clientWidth / (node.w + 80))); tx = viewport.clientWidth / 2 - node.x * scale; ty = (viewport.clientHeight - 46) / 2 - node.y * scale; apply(); el.classList.add('is-found'); requestAnimationFrame(() => { if (el.isConnected) el.focus({ preventScroll: true }); }); }
    learningMap.pendingFocus = null;
  }
  // Route renders replace this element; the observer disconnects on removal.
  let observedWidth = viewport.clientWidth, observedHeight = viewport.clientHeight;
  const observer = new ResizeObserver(() => {
    if (!viewport.isConnected) { observer.disconnect(); return; }
    if (observedWidth !== viewport.clientWidth || observedHeight !== viewport.clientHeight) { observedWidth = viewport.clientWidth; observedHeight = viewport.clientHeight; branch(); }
  });
  observer.observe(viewport);
}

const chapterZh=['','计量经济学与经济数据','简单回归模型','多元回归：估计','多元回归：推断','OLS 的渐近性质','多元回归：深入专题','虚拟变量与定性信息','异方差','模型设定与数据问题','时间序列回归基础','时间序列 OLS 的深入问题','序列相关与时间序列异方差','混合横截面与简单面板方法','高级面板数据方法','工具变量与两阶段最小二乘','联立方程模型','受限因变量与样本选择','高级时间序列专题','实证研究项目'];
const mheZh=['','研究问题与研究设计','理想实验','回归的解释与识别','工具变量的应用','固定效应、DID 与面板数据','断点回归设计','分位数回归','标准误与统计推断'];
function coverageTitle(c){if(c.book==='mhe-en')return t(mheZh[Number(c.chapter)]||c.title,c.title);if(c.chapter.startsWith('Appendix'))return t({'Appendix A':'数学工具','Appendix B':'概率基础','Appendix C':'数理统计基础','Appendix D':'矩阵代数','Appendix E':'线性回归的矩阵形式'}[c.chapter]||c.title,c.title);return t(chapterZh[Number(c.chapter)]||'中英文版本对照',c.book==='wooldridge-zh'?(chapterZh[Number(c.chapter)]?c.title:'Chinese 6th / English 5th edition comparison'):c.title);}
function coveragePage(params){
 const book=params.get('book')||'wooldridge-en',list=(coverage.chapters||[]).filter(c=>c.book===book);
 return `${heading('教材覆盖与拓展学习','Textbook coverage & further study','逐章核对已有讲解、内容提及与需要回原书学习的主题。','Inspect chapter coverage, introductory mentions, and topics requiring textbook study.','CURRICULUM AUDIT')}<div class="intro-panel"><h2>${t('主要领域已覆盖，部分专题仍需深入','Main fields are represented; some topics require further study')}</h2><p>${t('本次按教材目录与相关正文检查原有 96 张卡片，并补充 18 张专题卡片。下表保留原有核心卡片的小节覆盖结果，新增专题另列链接；一张新增卡片并不等于整章已完整讲解。','This audit checks the original 96 cards against textbook contents and relevant text, then adds 18 topic cards. Below, section-level results describe the core cards; additions are linked separately. Adding one card does not establish complete chapter coverage.')}</p><p>${t('核对基于英文伍德里奇第 5 版、中文第 6 版差异，以及《基本无害》英文原版。中文《基本无害》扫描本无法可靠提取正文，未据此声称逐页核验。','The audit uses English Wooldridge 5th edition, differences in the Chinese 6th edition, and the English MHE original. The Chinese MHE scan could not be reliably extracted and is not claimed to be checked page by page.')}</p></div><div class="chips">${['wooldridge-en','mhe-en','wooldridge-zh'].map(b=>`<a class="chip ${book===b?'active':''}" href="#coverage?book=${b}">${h(bookLabels[b])}</a>`).join('')}</div><p class="map-caption">${t('小节名称保留教材原文，方便查找。状态针对核心卡片；“教材选读”目前没有专门卡片。','Section names retain the textbook wording for lookup. Status describes core cards; “Textbook study” indicates no dedicated card yet.')}</p><div class="coverage-list">${list.map(c=>{const added=cards.filter(card=>card.level==='extension'&&card.refs.some(r=>r.book===c.book&&(String(r.chapter)===c.chapter||String(r.chapter).split(/[;,/]/).map(s=>s.trim()).includes(c.chapter))));return`<details class="coverage-chapter"><summary><span><small>${t('章 / 附录','Chapter / appendix')} ${escapeHTML(c.chapter)}</small><strong>${escapeHTML(coverageTitle(c))}</strong></span><span class="tag">${c.sections.length} ${t('个核对条目','audit entries')} ${added.length?'· +'+added.length:''}</span></summary><div class="coverage-body">${added.length?`<div class="coverage-additions"><strong>${t('本次补充的专题讲解','Added topic explanations')}</strong>${added.map(card=>`<a href="#card/${card.id}">${h(card.title)} ↗</a>`).join('')}</div>`:''}${c.sections.map(s=>{const full=['substantive','covered'].includes(s.status),missing=s.status==='missing';return`<div class="coverage-section"><div><strong>${escapeHTML(s.section)}</strong><span class="tag ${missing?'orange':''}">${full?t('核心已展开','Core explained'):missing?t('教材选读','Textbook study'):t('已有导读，需深入','Introduction; study further')}</span></div>${s.cards.length?`<p>${s.cards.map(id=>{const card=cards.find(x=>x.id===id);return card?`<a href="#card/${id}">${h(card.title)}</a>`:'';}).join(' · ')}</p>`:`<p>${t('请按该小节标题回到原书学习。','Return to this section in the textbook.')}</p>`}</div>`;}).join('')}</div></details>`;}).join('')}</div><div class="source-note">${t('进一步阅读重点：概率与矩阵推导、渐近证明、广义 LATE、弱工具变量的更多方法、动态模型、预测区间与原书习题。它们仍属于完整教材学习的一部分。','Further reading includes probability and matrix derivations, asymptotic proofs, generalized LATE, further weak-instrument methods, dynamic models, forecast intervals, and textbook exercises. These remain part of a full textbook course.')}</div>`;
}
function syncLabel(){const s=AtlasSync.status();return s.error?t('同步待恢复','Sync needs attention'):s.busy?t('同步中','Syncing'):!s.connected?t('本机模式','Local mode'):Object.keys(s.conflicts).length?t('有待处理的冲突','Conflicts to resolve'):s.pending?t('等待同步','Pending sync'):t('已同步','Synced');}
function syncError(e){return t({pending:'请先同步或解决当前草稿冲突，再重新合并。',code:'同步码无效，请检查后重试。',rate:'尝试过于频繁，请稍后再试。',storage:'本机储存不可用，请导出备份。',busy:'正在同步，请完成后重试。',server:'同步服务暂不可用，进度保留在本机。',offline:'网络暂不可用，进度已保留，联网后重试。'}[e]||'连接未完成，请稍后重试。',{pending:'Sync or resolve existing drafts before merging again.',code:'Invalid sync code. Please check it.',rate:'Too many attempts. Please try again later.',storage:'Local storage is unavailable. Export a backup.',busy:'Sync is running. Try again when it finishes.',server:'Sync is temporarily unavailable. Progress remains on this device.',offline:'Network unavailable. Your progress is kept locally; retry when online.'}[e]||'Could not connect. Please retry.');}
function syncPage(){const s=AtlasSync.status(),conflicts=Object.entries(s.conflicts);return`${heading('设备同步','Device sync','通过同一个同步码，在手机和电脑之间同步学习记录。','Use the same sync code to share learning progress between your phone and computer.','YOUR STUDY RECORDS')}<div class="sync-layout"><section class="intro-panel"><span class="tag" id="sync-status">${syncLabel()}</span><h2 style="margin-top:16px">${s.connected?t(s.role==='admin'?'管理员学习空间':'个人学习空间',s.role==='admin'?'Administrator study space':'Personal study space'):t('启用同步码','Enable a sync code')}</h2>${s.connected?`<p>${t('在另一台设备打开此网站，输入同一个同步码即可继续。同步码是访问记录的凭证，请自行保管。','Open this site on another device and enter the same code. The code grants access to your records; keep it private.')}</p><label class="sync-field">${t('当前同步码','Current sync code')}<input id="current-sync-code" type="password" readonly autocomplete="off" aria-label="${t('当前同步码','Current sync code')}"></label><div class="mastery-actions"><button class="btn btn-ghost" data-sync="copy">${t('复制同步码','Copy code')}</button><button class="btn btn-ghost" data-sync="reveal">${t('显示 / 隐藏','Show / hide')}</button><button class="btn btn-primary" data-sync="retry">${t('立即同步','Sync now')}</button></div><p class="sync-detail" id="sync-detail">${syncDetails(s)}</p><div class="sync-divider"></div><button class="btn btn-ghost" data-sync="merge">${t('合并本机模式的学习记录','Merge local-mode progress')}</button><button class="btn btn-ghost" data-sync="disconnect">${t('断开此设备','Disconnect this device')}</button><p class="sync-small">${t('断开后回到本机模式；云端记录与此设备的同步缓存保留。共享设备请退出后清理网站数据。','Disconnecting returns to local mode. Cloud records and this device’s vault cache remain. On shared devices, clear site data after disconnecting.')}</p>`:`<p>${t('首次使用可自动生成专属同步码。已有同步码时，直接在下方输入，无需注册或关联 OpenAI 账号。','Generate your own code on first use, or enter an existing code below. No registration or OpenAI account is needed.')}</p><button class="btn btn-primary" style="margin:18px 0" data-sync="create">${t('生成同步码并同步本机进度','Generate code & sync local progress')}</button><div class="sync-divider"></div><form id="sync-connect"><label class="sync-field">${t('已有同步码','Existing sync code')}<input id="sync-code-input" type="password" required maxlength="200" autocomplete="off" placeholder="${t('输入同步码','Enter your code')}"></label><label class="sync-checkbox"><input type="checkbox" id="sync-merge-first">${t('连接后合并本机模式的学习记录','Merge local-mode progress after connecting')}</label><button class="btn btn-ghost" type="submit">${t('连接学习记录','Connect my records')}</button></form>`}<p class="warning-inline" id="sync-error" role="status">${s.error?syncError(s.error):''}</p></section><aside><div class="intro-panel"><h2>${t('同步哪些内容？','What is synced?')}</h2><p>${t('卡片学习记录、复习安排、收藏、笔记与自测结果。语言偏好留在当前设备。','Card progress, review schedules, bookmarks, notes, and quiz results. Language preferences stay on each device.')}</p><p>${t('联网时自动同步；暂时断网可以继续学习，恢复网络后上传。两台设备同时修改同一项时，会保留两份内容供选择。','Updates sync when online. Keep studying offline and upload when connectivity returns. If devices edit the same field concurrently, both versions are kept for you to choose.')}</p></div><div class="intro-panel"><h2>${t('备份与恢复','Backup & recovery')}</h2><p>${t('请保存同步码。没有邮箱或账号找回流程；进度导出可作为额外备份。','Save your code. There is no email or account recovery; exported progress provides an extra backup.')}</p><button class="btn btn-ghost" data-action="export">${icon('download',14)}${t('导出当前进度','Export current progress')}</button></div></aside></div>${conflicts.length?`<section class="intro-panel"><h2>${t('选择要保留的版本','Choose which version to keep')} (${conflicts.length})</h2><p>${t('另一个设备已修改相同内容。以下两份记录均已保留在此设备，选择后才会继续同步。','Another device changed the same field. Both versions are preserved on this device until you choose.')}</p>${conflicts.map(([key,c])=>`<div class="sync-conflict"><h3>${h(cards.find(x=>x.id===c.cardId)?.title||c.cardId)} · ${t({note:'笔记',memory:'复习记录',bookmark:'收藏',seenAt:'阅读时间',quizChoice:'自测选择',quizCorrect:'自测结果'}[c.field]||c.field,c.field)}</h3><div class="sync-comparison"><div><strong>${t('本机修改','Local edit')}</strong><pre>${escapeHTML(conflictText(c.local,c.field))}</pre><button class="btn btn-ghost" data-sync-resolve="${escapeHTML(key)}" data-choice="local">${t('保留本机版本','Keep local')}</button></div><div><strong>${t('云端版本','Cloud version')}</strong><pre>${escapeHTML(conflictText(c.remote,c.field))}</pre><button class="btn btn-ghost" data-sync-resolve="${escapeHTML(key)}" data-choice="remote">${t('使用云端版本','Use cloud')}</button></div></div></div>`).join('')}</section>`:''}`;}
function syncDetails(s){return t('上次同步：','Last synced: ')+(s.lastSync?new Date(s.lastSync).toLocaleString(state.lang==='zh'?'zh-CN':'en-US'):t('尚未完成','not yet'))+t(' · 待上传：',' · Pending: ')+s.pending;}
function conflictText(value,field){if(value==null)return t('无记录','No record');if(field==='memory')return t('上次回忆：','Last recall: ')+atlasDate(value.lastReviewAt)+'\n'+t('下次复习：','Next check: ')+atlasDate(value.dueAt)+'\n'+t('回忆次数：','Attempts: ')+value.reps+t('；失误：','; misses: ')+value.lapses+'\n'+t('稳定度（天）：','Stability (days): ')+Number(value.stability).toFixed(2)+t('；难度：','; difficulty: ')+Number(value.difficulty).toFixed(1);return typeof value==='string'?value:JSON.stringify(value,null,2);}
function guestProgress(){try{return JSON.parse(localStorage.getItem(KEY)||'{}').cards||{};}catch{return{};}}
let atlasSyncIdentity='',atlasSyncStructure='',atlasSyncRenderQueued=false;
function queueSyncRender(){
  if(atlasSyncRenderQueued)return;
  atlasSyncRenderQueued=true;
  Promise.resolve().then(()=>{atlasSyncRenderQueued=false;render(true);});
}
function handleAtlasSyncChange(status,progress){
  const identity=status.connected?AtlasSync.code():'',identityChanged=identity!==atlasSyncIdentity;
  const structure=JSON.stringify([identity,status.role,status.conflicts]);
  const structureChanged=structure!==atlasSyncStructure;
  const previous=state.cards,changed=!!progress&&JSON.stringify(previous)!==JSON.stringify(progress);
  atlasSyncIdentity=identity;atlasSyncStructure=structure;
  if(identityChanged){atlasRecallState=null;freshQuiz={};}
  if(progress){state.cards=progress;save();}
  const label=syncLabel();
  for(const selector of ['#sync-top-status','#sync-status']){const el=$(selector);if(el)el.textContent=label;}
  if($('#sync-detail'))$('#sync-detail').textContent=syncDetails(status);
  if($('#sync-error'))$('#sync-error').textContent=status.error?syncError(status.error):'';
  // Input events are saved immediately. Only replace a textarea if it still
  // matches the previous saved value; pending edits are protected by sync.js.
  const note=$('#card-note');
  if(changed&&note&&note.value===(previous[note.dataset.id]?.note||'')){
    const incoming=pFor(note.dataset.id).note||'';
    if(note.value!==incoming){
      const start=note.selectionStart,end=note.selectionEnd;note.value=incoming;
      if(document.activeElement===note)note.setSelectionRange?.(Math.min(start,incoming.length),Math.min(end,incoming.length));
      if($('#notes-status'))$('#notes-status').textContent=t('已从同步记录更新','Updated from synced records');
    }
  }
  const path=route().path;
  // Status-only notifications must not discard a typed sync code or interrupt
  // an active recall. Structural changes must display new conflicts immediately.
  if(identityChanged||(path==='sync'&&structureChanged)||(changed&&(path==='home'||(path==='review'&&!atlasRecallState))))queueSyncRender();
}
function handleAtlasSyncDisconnect(){
  state.cards=guestProgress();atlasRecallState=null;freshQuiz={};queueSyncRender();
}
function bindSync(){
 const current=$('#current-sync-code');if(current)current.value=AtlasSync.code();
 $$('[data-import-resolve]').forEach(el=>el.onclick=()=>resolveImportConflict(el.dataset.importResolve,el.dataset.choice));
 async function run(fn){try{$$('#main [data-sync],#sync-connect button').forEach(el=>el.disabled=true);await fn();render(true);}catch(e){if(e.message==='superseded')return;const err=$('#sync-error');if(err)err.textContent=syncError(e.message);else toast(syncError(e.message));$$('#main [data-sync],#sync-connect button').forEach(el=>el.disabled=false);}}
 $$('#main [data-sync]').forEach(el=>el.onclick=()=>{const a=el.dataset.sync;if(a==='reveal'){current.type=current.type==='password'?'text':'password';return;}if(a==='copy'){navigator.clipboard.writeText(AtlasSync.code()).then(()=>toast(t('同步码已复制','Sync code copied'))).catch(()=>{current.type='text';current.select();toast(t('请手动复制同步码','Select and copy the code manually'));});return;}if(a==='disconnect'){AtlasSync.disconnect();atlasRecallState=null;render();return;}run(async()=>{if(a==='create')await AtlasSync.create(state.cards);if(a==='retry')await AtlasSync.sync();if(a==='merge'){AtlasSync.merge(guestProgress());await AtlasSync.sync();}});});
 const form=$('#sync-connect');if(form)form.onsubmit=e=>{e.preventDefault();const code=$('#sync-code-input').value,seed=$('#sync-merge-first').checked?guestProgress():null;run(()=>AtlasSync.connect(code,seed));};
 $$('[data-sync-resolve]').forEach(el=>el.onclick=()=>{AtlasSync.resolve(el.dataset.syncResolve,el.dataset.choice);render(true);});
}
window.addEventListener('hashchange',()=>{freshQuiz={};const{path}=route();if(path.startsWith('card/')){const id=path.slice(5);if(cards.some(c=>c.id===id)&&!pFor(id).seenAt)update(id,{seenAt:new Date().toISOString()});}render();});
function closeMobileNav(){const sidebar=$('#sidebar');if(sidebar)sidebar.classList.remove('open');$('#app [data-action="menu"]')?.setAttribute('aria-expanded','false');}
document.addEventListener('click',e=>{if(innerWidth<=700&&$('#sidebar.open')&&!e.target.closest('.sidebar')&&!e.target.closest('[data-action="menu"]'))closeMobileNav();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sidebar.open')){closeMobileNav();$('#app [data-action="menu"]')?.focus();}});
$('.skip').addEventListener('click',e=>{e.preventDefault();$('#main')?.focus();$('#main')?.scrollIntoView();});
Promise.all(['primer','foundations','applied','causal','extensions','coverage'].map(file=>fetch(`data/${file}.json?v=20261008-v2`).then(r=>{if(!r.ok)throw Error(file);return r.json();}))).then(parts=>{coverage=parts.pop();modules=parts.flatMap(p=>p.modules).sort((a,b)=>a.stage-b.stage||a.id.localeCompare(b.id));const ordering=Object.fromEntries(modules.map((m,i)=>[m.id,i]));cards=parts.flatMap(p=>p.cards).sort((a,b)=>ordering[a.module]-ordering[b.module]||a.id.localeCompare(b.id));for(const [id,p] of Object.entries(state.cards))state.cards[id]=AtlasReview.migrateLegacy(p,Date.now());save();AtlasSync.init({onChange:handleAtlasSyncChange,onDisconnect:handleAtlasSyncDisconnect});const{path}=route();if(path.startsWith('card/')){const id=path.slice(5);if(cards.some(c=>c.id===id)&&!pFor(id).seenAt)update(id,{seenAt:new Date().toISOString()});}render();}).catch(error=>{$('#app').innerHTML=`<main class="loading"><h1>学习内容未能加载 / Content could not load</h1><p>请刷新页面重试。 / Please refresh to retry.</p><button class="btn btn-primary" onclick="location.reload()">重新加载 / Reload</button></main>`;console.error('Content load failed',error);});
