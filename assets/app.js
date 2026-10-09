'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr=()=>new Date().toDateString();
const LEVEL_NAMES={1:'Easy',2:'Medium',3:'Hard'};
const LETTERS=['A','B','C','D'];
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const groupName=g=>(GROUPS.find(x=>x[0]===g)||[g,g])[1];

// ---------------- State ----------------
const STORE='hhist_v1';
const S={
  panel:'practice',currentQ:null,currentTopic:'random',currentDiff:'mixed',answered:false,
  questionNum:1,notepadContent:'',recent:[],
  stats:{answered:0,correct:0,streak:0,bestStreak:0,dailyCount:0,dailyDate:'',dayStreak:0,lastStudyDate:''},
  topicStats:{},settings:{name:'',goal:10,accent:'saltire',mode:'system'},
  timerScores:[],mockScores:[],fcIdx:0,fcCards:[]
};
try{
  const p=JSON.parse(localStorage.getItem(STORE)||'null');
  if(p){
    if(p.stats)Object.assign(S.stats,p.stats);
    if(p.topicStats)S.topicStats=p.topicStats;
    if(p.notepadContent)S.notepadContent=p.notepadContent;
    if(p.questionNum)S.questionNum=p.questionNum;
    if(p.settings)Object.assign(S.settings,p.settings);
    if(p.timerScores)S.timerScores=p.timerScores;
    if(p.mockScores)S.mockScores=p.mockScores;
  }
}catch(e){}

function save(){
  try{localStorage.setItem(STORE,JSON.stringify({stats:S.stats,topicStats:S.topicStats,notepadContent:S.notepadContent,questionNum:S.questionNum,settings:S.settings,timerScores:S.timerScores,mockScores:S.mockScores}));}catch(e){}
}
function rollDay(){
  const t=todayStr();
  if(S.stats.dailyDate!==t){S.stats.dailyCount=0;S.stats.dailyDate=t;}
  if(S.stats.lastStudyDate){
    const y=new Date();y.setDate(y.getDate()-1);
    if(S.stats.lastStudyDate!==t&&S.stats.lastStudyDate!==y.toDateString())S.stats.dayStreak=0;
  }
}
function recordStudy(){
  rollDay();
  const t=todayStr();
  if(S.stats.lastStudyDate!==t){S.stats.dayStreak=(S.stats.dayStreak||0)+1;S.stats.lastStudyDate=t;}
}

let toastTimer;
function toast(msg){
  const el=$('toast');el.textContent=msg;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}

// Days until the exam (date stored in data.js)
function examCountdown(){
  const [y,m,d]=EXAM_DATE.split('-').map(Number);
  const exam=new Date(y,m-1,d),now=new Date();now.setHours(0,0,0,0);
  return Math.round((exam-now)/86400000);
}

// ---------------- Navigation ----------------
const PANELS=['practice','topics','worksheets','flashcards','mock','timer','skills','essays','notepad','progress','resources','shop','settings'];
const SITE='Higher History Revision';
function showPanel(id,{focus=false}={}){
  if(!PANELS.includes(id))id='practice';
  document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!=='panel-'+id);
  document.querySelectorAll('[data-nav]').forEach(a=>{
    if(a.dataset.nav===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  const panel=$('panel-'+id);
  $('page-title').textContent=panel.dataset.title;
  document.title=id==='practice'?'Free Higher History Revision — Scotland':panel.dataset.title+' — '+SITE;
  S.panel=id;
  closeSheet();
  if(id==='progress')renderProg();
  if(id==='topics')renderTopics();
  if(id==='worksheets')closeWS();
  if(id==='notepad')$('notepad-text').value=S.notepadContent;
  if(id==='mock'&&!mock.active)renderMockHome();
  if(focus)window.scrollTo(0,0);
}
function route(){showPanel((location.hash||'#practice').slice(1),{focus:true});}
window.addEventListener('hashchange',route);
function go(id){if(location.hash==='#'+id)route();else location.hash=id;}

function openSheet(){$('more-sheet').hidden=false;$('sheet-backdrop').hidden=false;$('more-btn').setAttribute('aria-expanded','true');}
function closeSheet(){$('more-sheet').hidden=true;$('sheet-backdrop').hidden=true;$('more-btn').setAttribute('aria-expanded','false');}
$('more-btn').addEventListener('click',()=>$('more-sheet').hidden?openSheet():closeSheet());
$('sheet-backdrop').addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});

// ---------------- Topic pickers ----------------
const topicKeys=group=>Object.keys(TOPICS).filter(k=>!group||TOPICS[k].group===group);
function fillTopicSelect(sel,{smart=true}={}){
  const top=document.createElement('optgroup');top.label='Mixed';
  top.append(new Option('Random mix — all topics','random'));
  if(smart)top.append(new Option('Smart Mix — focuses on your weakest topics','smart'));
  sel.append(top);
  GROUPS.forEach(([g,label])=>{
    const og=document.createElement('optgroup');og.label=label;
    const keys=topicKeys(g);
    if(keys.length>1)og.append(new Option('Random mix — '+label,'random_'+g));
    keys.forEach(k=>og.append(new Option(TOPICS[k].name,k)));
    sel.append(og);
  });
}

// ---------------- Question selection ----------------
function weightedPick(keys){
  const w=keys.map(k=>{const ts=S.topicStats[k];if(!ts||ts.total<3)return 2;return 0.5+3*(1-ts.correct/ts.total);});
  let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<keys.length;i++){r-=w[i];if(r<=0)return keys[i];}
  return keys[keys.length-1];
}
function pickTopic(t){
  if(t==='random'){const k=topicKeys();return k[Math.floor(Math.random()*k.length)];}
  if(t==='smart')return weightedPick(topicKeys());
  if(t.startsWith('random_')){const k=topicKeys(t.slice(7));return k[Math.floor(Math.random()*k.length)];}
  return TOPICS[t]?t:Object.keys(TOPICS)[0];
}
function pickQuestion(topic,filter){
  const all=TOPICS[topic].questions;
  let pool=all.filter(filter);if(!pool.length)pool=all;
  const fresh=pool.filter(q=>!S.recent.includes(q.q));
  if(fresh.length)pool=fresh;
  const q=pool[Math.floor(Math.random()*pool.length)];
  S.recent.push(q.q);if(S.recent.length>25)S.recent.shift();
  return q;
}

// ---------------- Multiple-choice options ----------------
// Renders shuffled options as buttons. onPick(isCorrect, chosenText, buttons) is called once.
function renderOptions(box,q,onPick){
  box.innerHTML='';
  const opts=shuffle([q.a,...q.w]);
  const btns=opts.map((text,i)=>{
    const b=document.createElement('button');b.type='button';b.className='opt';
    b.dataset.correct=text===q.a?'1':'';
    b.innerHTML=`<span class="opt-key">${LETTERS[i]}</span><span class="opt-text">${esc(text)}</span>`;
    b.addEventListener('click',()=>{
      if(box.dataset.locked)return;
      box.dataset.locked='1';
      const ok=text===q.a;
      btns.forEach(x=>{x.disabled=true;if(x.dataset.correct)x.classList.add('correct');});
      if(!ok)b.classList.add('wrong');
      onPick(ok,text,btns);
    });
    box.append(b);return b;
  });
  delete box.dataset.locked;
  return btns;
}
function pickByKey(box,key){
  const idx='1234'.indexOf(key)>=0?'1234'.indexOf(key):'abcd'.indexOf(key.toLowerCase());
  if(idx<0)return false;
  const b=box.querySelectorAll('.opt')[idx];
  if(b&&!b.disabled&&!b.hidden){b.click();return true;}
  return false;
}

// ---------------- Practice ----------------
function paperTag(el,topic){
  const t=TOPICS[topic];
  el.textContent=t.paper;
  el.className='tag '+(t.group==='scottish'?'tag-nocalc':t.group==='skills'?'tag-given':'tag-calc');
}
let practiceBtns=[];
function newQuestion(){
  const topic=pickTopic(S.currentTopic);
  const d=S.currentDiff;
  const q=pickQuestion(topic,d==='mixed'?()=>true:x=>x.level===+d);
  S.currentQ={...q,topic};S.answered=false;S.fiftyUsed=false;
  $('q-text').textContent=q.q;
  $('q-topic-label').textContent=TOPICS[topic].name;
  $('q-num').textContent=S.questionNum;
  const lv=$('q-level');lv.textContent=LEVEL_NAMES[q.level];lv.className='tag tag-lvl-'+q.level;
  paperTag($('paper-badge'),topic);
  $('feedback-area').innerHTML='';
  $('hint-btn').hidden=false;$('skip-btn').hidden=false;
  practiceBtns=renderOptions($('q-options'),q,markAnswer);
}
function markAnswer(ok,chosen){
  if(S.answered)return;
  S.answered=true;
  const q=S.currentQ;
  recordStudy();
  S.stats.answered++;S.stats.dailyCount++;
  const ts=S.topicStats[q.topic]||(S.topicStats[q.topic]={correct:0,total:0});
  ts.total++;
  $('hint-btn').hidden=true;$('skip-btn').hidden=true;
  let html;
  if(ok){
    S.stats.correct++;ts.correct++;S.stats.streak++;
    if(S.stats.streak>S.stats.bestStreak)S.stats.bestStreak=S.stats.streak;
    const run=S.stats.streak>=3?` <span class="muted">· ${S.stats.streak} in a row</span>`:'';
    html=`<div class="fb fb-ok"><div class="fb-head"><svg class="ico"><use href="#i-check"/></svg>Correct${run}</div>
      <div class="fb-exp"><b>Why:</b> ${esc(q.explain)}</div>
      <button class="btn btn-primary" id="next-btn">Next question<svg class="ico"><use href="#i-arrow"/></svg></button></div>`;
  }else{
    S.stats.streak=0;
    html=`<div class="fb fb-no"><div class="fb-head"><svg class="ico"><use href="#i-x"/></svg>Not quite</div>
      The answer is <span class="ans">${esc(q.a)}</span>.
      <div class="fb-exp"><b>Remember:</b> ${esc(q.explain)}</div>
      <button class="btn btn-primary" id="next-btn">Next question<svg class="ico"><use href="#i-arrow"/></svg></button></div>`;
  }
  $('feedback-area').innerHTML=html;
  $('next-btn').addEventListener('click',nextQuestion);
  $('next-btn').focus({preventScroll:true});
  S.questionNum++;save();updateHeader();
  if(ok&&S.stats.dailyCount===(S.settings.goal||10))toast('Daily goal reached — nice work');
  else if(ok&&S.stats.streak>0&&S.stats.streak%5===0)toast(S.stats.streak+' correct in a row');
}
function nextQuestion(){newQuestion();}
function skipQuestion(){if(S.answered)return;S.stats.streak=0;updateHeader();save();newQuestion();}
// Hint = 50:50 — removes two wrong answers
function getHint(){
  if(!S.currentQ||S.answered||S.fiftyUsed)return;
  S.fiftyUsed=true;
  const wrong=shuffle(practiceBtns.filter(b=>!b.dataset.correct)).slice(0,2);
  wrong.forEach(b=>{b.hidden=true;});
  $('feedback-area').innerHTML=`<div class="fb fb-hint"><div class="fb-head"><svg class="ico"><use href="#i-bulb"/></svg>50:50</div>Two wrong answers removed. Think about which one fits the period and the key issue.</div>`;
}
function updateHeader(){
  rollDay();
  const g=S.settings.goal||10,dc=S.stats.dailyCount||0,pct=Math.min(100,dc/g*100);
  $('hdr-days').textContent=S.stats.dayStreak||0;
  $('hdr-daily').textContent=dc;$('hdr-goal').textContent=g;
  $('goal-ring').setAttribute('stroke-dasharray',pct+' 100');
  document.querySelector('.chip-goal').classList.toggle('done',dc>=g);
  $('daily-count').textContent=dc;$('daily-goal-lbl').textContent=g;
  $('goal-fill').style.width=pct+'%';
  $('run-streak').textContent=S.stats.streak;$('best-streak').textContent=S.stats.bestStreak;
}
function setTopic(k){S.currentTopic=k;$('topic-select').value=k;newQuestion();}

$('hint-btn').addEventListener('click',getHint);
$('skip-btn').addEventListener('click',skipQuestion);
$('topic-select').addEventListener('change',e=>setTopic(e.target.value));
$('diff-seg').addEventListener('click',e=>{
  const b=e.target.closest('[data-diff]');if(!b)return;
  S.currentDiff=b.dataset.diff;
  $('diff-seg').querySelectorAll('[data-diff]').forEach(x=>x.setAttribute('aria-checked',x===b));
  newQuestion();
});
// Keys 1–4 / A–D choose an answer; Enter moves on
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea'))return;
  if(S.panel==='practice'){
    if(!S.answered&&pickByKey($('q-options'),e.key)){e.preventDefault();return;}
    if(e.key==='Enter'&&S.answered&&document.activeElement?.id!=='next-btn'){e.preventDefault();nextQuestion();}
  }else if(S.panel==='timer'&&!$('timer-game').hidden){
    if(pickByKey($('timer-options'),e.key))e.preventDefault();
  }else if(S.panel==='mock'&&mock.active&&!mock.locked){
    if(pickByKey($('mock-options'),e.key))e.preventDefault();
  }
});

// ---------------- Topics ----------------
function accClass(pct,total){return !total?'':pct<50?'acc-low':pct<75?'acc-mid':'acc-high';}
function renderTopics(){
  const g=$('topic-grid');g.innerHTML='';
  GROUPS.forEach(([grp,label])=>{
    const sec=document.createElement('div');sec.className='topic-section';
    sec.innerHTML=`<h2 class="section-title">${esc(label)}</h2><div class="topic-grid"></div>`;
    const grid=sec.lastElementChild;
    topicKeys(grp).forEach(k=>{
      const t=TOPICS[k],ts=S.topicStats[k]||{correct:0,total:0};
      const pct=ts.total?Math.round(ts.correct/ts.total*100):0;
      const b=document.createElement('button');b.className='tile '+accClass(pct,ts.total);
      b.innerHTML=`<div class="tile-top"><span class="glyph">${esc(t.glyph)}</span><span class="tag ${t.group==='scottish'?'tag-nocalc':t.group==='skills'?'tag-given':'tag-calc'}">${esc(t.paper)}</span></div>
        <h3>${esc(t.name)}</h3>
        <div class="tile-meta">${ts.total?`${pct}% correct · ${ts.total} answered`:`${t.questions.length} questions · not started`}</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>`;
      b.addEventListener('click',()=>{setTopic(k);go('practice');});
      grid.append(b);
    });
    g.append(sec);
  });
}

// ---------------- Worksheets (quizzes) ----------------
function renderWS(){
  const el=$('sheet-list');el.innerHTML='';
  GROUPS.forEach(([grp,label])=>{
    const sheets=WORKSHEETS.map((ws,i)=>({ws,i})).filter(({ws})=>TOPICS[ws.topic].group===grp);
    if(!sheets.length)return;
    const h=document.createElement('h2');h.className='section-title';h.textContent=label;h.style.gridColumn='1/-1';el.append(h);
    sheets.forEach(({ws,i})=>{
      const t=TOPICS[ws.topic];
      const b=document.createElement('button');b.className='tile';
      b.innerHTML=`<div class="tile-top"><span class="glyph">${esc(t.glyph)}</span><span class="tag tag-topic">${ws.qs.length} questions</span></div>
        <h3>${esc(ws.title)}</h3><div class="tile-meta">${esc(t.paper)}</div>`;
      b.addEventListener('click',()=>openWS(i));el.append(b);
    });
  });
}
function openWS(idx){
  const ws=WORKSHEETS[idx],t=TOPICS[ws.topic];
  const qs=ws.qs.map(i=>t.questions[i]).filter(Boolean).map(q=>({...q,opts:shuffle([q.a,...q.w])}));
  $('ws-list').hidden=true;
  const av=$('ws-active');av.hidden=false;
  av.innerHTML=`<div class="card">
    <div class="ws-head">
      <div><h2 class="card-title" style="margin-bottom:6px">${esc(ws.title)}</h2>
        <span class="tag tag-topic">${esc(t.paper)}</span></div>
      <button class="btn btn-ghost btn-sm" data-ws-back><svg class="ico"><use href="#i-back"/></svg>All quizzes</button>
    </div>
    <form id="ws-form" autocomplete="off">
    ${qs.map((q,i)=>`<div class="ws-q"><p><span class="num">${i+1}</span>${esc(q.q)}</p>
      <div class="opts opts-sm" role="radiogroup" aria-label="Answers to question ${i+1}">
      ${q.opts.map((o,j)=>`<button type="button" class="opt" role="radio" aria-checked="false" data-q="${i}" data-j="${j}"><span class="opt-key">${LETTERS[j]}</span><span class="opt-text">${esc(o)}</span></button>`).join('')}
      </div>
      <div class="ws-fb" id="wsfb${i}"></div></div>`).join('')}
    <div class="btn-row" style="margin-top:16px">
      <button type="submit" class="btn btn-primary">Check all answers</button>
      <button type="button" class="btn btn-ghost" data-ws-reset>Start again</button>
      <span class="ws-score" id="ws-score"></span>
    </div></form></div>`;
  const form=$('ws-form');
  const chosen=new Array(qs.length).fill(null);
  form.addEventListener('click',e=>{
    const b=e.target.closest('.opt');if(!b||b.disabled)return;
    const i=+b.dataset.q;chosen[i]=+b.dataset.j;
    form.querySelectorAll(`.opt[data-q="${i}"]`).forEach(x=>{const on=x===b;x.setAttribute('aria-checked',on);x.classList.toggle('picked',on);});
  });
  form.addEventListener('submit',e=>{
    e.preventDefault();
    let n=0;
    qs.forEach((q,i)=>{
      const fb=$('wsfb'+i),btns=form.querySelectorAll(`.opt[data-q="${i}"]`);
      btns.forEach(x=>{x.disabled=true;x.classList.remove('picked');if(q.opts[+x.dataset.j]===q.a)x.classList.add('correct');});
      if(chosen[i]===null){fb.innerHTML=`<span class="muted">Not answered.</span> <span class="muted">${esc(q.explain)}</span>`;return;}
      const ok=q.opts[chosen[i]]===q.a;
      if(ok){n++;fb.innerHTML=`<span class="ok">Correct.</span> <span class="muted">${esc(q.explain)}</span>`;}
      else{btns[chosen[i]].classList.add('wrong');fb.innerHTML=`<span class="no">Answer: ${esc(q.a)}</span> <span class="muted">— ${esc(q.explain)}</span>`;}
      // quizzes count towards topic progress
      const ts=S.topicStats[ws.topic]||(S.topicStats[ws.topic]={correct:0,total:0});ts.total++;if(ok)ts.correct++;
    });
    recordStudy();save();updateHeader();
    $('ws-score').textContent=`${n} / ${qs.length} correct`;
    form.querySelector('[type=submit]').disabled=true;
  });
  av.querySelector('[data-ws-back]').addEventListener('click',closeWS);
  av.querySelector('[data-ws-reset]').addEventListener('click',()=>openWS(idx));
  window.scrollTo(0,0);
}
function closeWS(){$('ws-list').hidden=false;$('ws-active').hidden=true;$('ws-active').innerHTML='';}

// ---------------- Flashcards ----------------
function fillFCDecks(){const sel=$('fc-topic');FC_DECKS.forEach(([k,l])=>sel.append(new Option(l+' ('+FLASHCARDS[k].length+')',k)));}
function loadFC(){S.fcCards=[...(FLASHCARDS[$('fc-topic').value]||FLASHCARDS.all)];S.fcIdx=0;showFC();}
function showFC(){
  const c=S.fcCards[S.fcIdx];if(!c)return;
  $('flashcard').classList.remove('flipped');
  $('fc-term').textContent=c.term;$('fc-term-back').textContent=c.term;$('fc-def').textContent=c.def;
  $('fc-idx').textContent=S.fcIdx+1;$('fc-tot').textContent=S.fcCards.length;
}
function flipCard(){$('flashcard').classList.toggle('flipped');}
function stepFC(d){S.fcIdx=(S.fcIdx+d+S.fcCards.length)%S.fcCards.length;showFC();}
function shuffleFC(){S.fcCards=shuffle(S.fcCards);S.fcIdx=0;showFC();toast('Deck shuffled');}
$('fc-topic').addEventListener('change',loadFC);
$('flashcard').addEventListener('click',flipCard);
$('fc-prev').addEventListener('click',()=>stepFC(-1));
$('fc-next').addEventListener('click',()=>stepFC(1));
$('fc-shuffle').addEventListener('click',shuffleFC);
document.addEventListener('keydown',e=>{
  if(S.panel!=='flashcards'||e.target.closest('input,select,textarea'))return;
  if(e.key==='ArrowRight')stepFC(1);else if(e.key==='ArrowLeft')stepFC(-1);
  else if(e.key===' '&&e.target.id!=='flashcard'){e.preventDefault();flipCard();}
});

// ---------------- Timed challenge ----------------
const timer={interval:null,left:0,secs:0,score:0,topic:'random',q:null,token:0};
function startTimer(secs){
  timer.topic=$('timer-topic').value;timer.secs=secs;timer.left=secs;timer.score=0;
  $('timer-setup').hidden=true;$('timer-result').hidden=true;$('timer-game').hidden=false;
  $('timer-score-lbl').textContent='0';
  const d=$('timer-display');d.textContent=secs;d.classList.remove('urgent');
  newTimerQ();
  clearInterval(timer.interval);
  timer.interval=setInterval(()=>{
    timer.left--;d.textContent=timer.left;
    if(timer.left<=10)d.classList.add('urgent');
    if(timer.left<=0)endTimer();
  },1000);
}
function newTimerQ(){
  timer.token++;
  const t=pickTopic(timer.topic);
  timer.q=pickQuestion(t,q=>q.level<=2);
  $('timer-q').textContent=timer.q.q;
  renderOptions($('timer-options'),timer.q,ok=>{
    const fb=$('timer-fb'),tk=timer.token;
    if(ok){timer.score++;$('timer-score-lbl').textContent=timer.score;fb.innerHTML='<span class="ok">Correct</span>';setTimeout(()=>{if(tk===timer.token&&timer.interval)newTimerQ();},450);}
    else{fb.innerHTML=`<span class="no">Answer: ${esc(timer.q.a)}</span>`;setTimeout(()=>{if(tk===timer.token&&timer.interval)newTimerQ();},1600);}
  });
}
function endTimer(){
  clearInterval(timer.interval);timer.interval=null;timer.token++;
  $('timer-game').hidden=true;$('timer-result').hidden=false;$('timer-fb').textContent='';
  $('timer-final').textContent=timer.score+' correct';
  const best=S.timerScores.filter(s=>s.secs===timer.secs).reduce((m,s)=>Math.max(m,s.score),0);
  const mins=timer.secs/60;
  $('timer-msg').textContent=timer.score>best?`New personal best for the ${mins}-minute challenge.`:
    `Your best for ${mins} minute${mins>1?'s':''} is ${best}. `+(timer.score>=best*0.8?'Close!':'Keep practising.');
  S.timerScores.push({score:timer.score,secs:timer.secs,date:new Date().toLocaleDateString('en-GB')});
  if(S.timerScores.length>30)S.timerScores=S.timerScores.slice(-30);
  save();
}
function resetTimer(){clearInterval(timer.interval);timer.interval=null;timer.token++;$('timer-setup').hidden=false;$('timer-game').hidden=true;$('timer-result').hidden=true;}
document.querySelectorAll('#timer-setup [data-secs]').forEach(b=>b.addEventListener('click',()=>startTimer(+b.dataset.secs)));
$('timer-skip').addEventListener('click',()=>{$('timer-fb').textContent='';newTimerQ();});
$('timer-stop').addEventListener('click',endTimer);
$('timer-again').addEventListener('click',resetTimer);

// ---------------- Mock tests ----------------
// Each attempt draws a fresh set of questions from the paper's topic pools. Marks: Easy 1, Medium 2, Hard 3.
const mock={active:false,paper:null,questions:[],idx:0,answers:[],correct:[],score:0,total:0,left:0,interval:null,locked:false};
const fmtTime=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function buildMock(p){
  // spread questions evenly across the pools
  const per={};p.pools.forEach(k=>per[k]=shuffle(TOPICS[k].questions.map(q=>({...q,topicKey:k}))));
  const out=[];let i=0;
  while(out.length<Math.min(p.n,p.available)){
    const k=p.pools[i%p.pools.length];if(per[k].length)out.push(per[k].pop());i++;
  }
  return shuffle(out).map(q=>({...q,marks:q.level,topic:TOPICS[q.topicKey].name}));
}
function renderMockHome(){
  const el=$('mock-papers');el.innerHTML='';
  Object.entries(MOCK_PAPERS).forEach(([n,p])=>{
    const d=document.createElement('div');d.className='tile paper';
    d.innerHTML=`<div class="tile-top"><span class="glyph">T${n}</span></div>
      <h3>${esc(p.title)}</h3>
      <div class="paper-facts"><span class="tag">${p.n} questions</span><span class="tag">${p.duration/60} min</span><span class="tag tag-topic">${p.available} in the pool</span></div>
      <button class="btn btn-primary">Start test</button>`;
    d.querySelector('button').addEventListener('click',()=>startMock(+n));
    el.append(d);
  });
  const prev=$('mock-prev-scores');
  if(S.mockScores.length){prev.hidden=false;prev.innerHTML='<h2 class="card-title">Recent attempts</h2>'+mockHistoryHTML(5);}
  else prev.hidden=true;
}
function mockHistoryHTML(n){
  if(!S.mockScores.length)return '<p class="empty">No mock tests yet. Try one from the Mock tests page.</p>';
  return [...S.mockScores].slice(-n).reverse().map(s=>`<div class="list-row">
    <span class="rank">${esc(s.grade==='No Award'?'–':s.grade)}</span>
    <span class="grow">${esc((MOCK_PAPERS[s.paper]&&MOCK_PAPERS[s.paper].short)||'Test '+s.paper)} · ${s.score}/${s.total} (${s.pct}%)</span>
    <span class="muted small">${esc(s.date)}</span></div>`).join('');
}
function startMock(n){
  const p=MOCK_PAPERS[n],qs=buildMock(p);
  Object.assign(mock,{active:true,paper:n,questions:qs,idx:0,answers:new Array(qs.length).fill(''),correct:new Array(qs.length).fill(false),score:0,total:qs.reduce((a,q)=>a+q.marks,0),left:p.duration,locked:false});
  $('mock-home').hidden=true;$('mock-results').hidden=true;$('mock-exam').hidden=false;
  $('mock-paper-title').textContent=p.title;
  $('mock-total').textContent=mock.total;
  $('mock-marks-so-far').textContent='0';
  const clock=$('mock-timer-display');clock.textContent=fmtTime(mock.left);clock.classList.remove('low');
  clearInterval(mock.interval);mock.interval=setInterval(mockTick,1000);
  showMockQ();window.scrollTo(0,0);
}
function mockTick(){
  mock.left--;
  const clock=$('mock-timer-display');clock.textContent=fmtTime(Math.max(0,mock.left));
  if(mock.left<=120)clock.classList.add('low');
  if(mock.left<=0)endMock();
}
function showMockQ(){
  const q=mock.questions[mock.idx],total=mock.questions.length;
  mock.locked=false;
  $('mock-q-counter').textContent=`Question ${mock.idx+1} of ${total}`;
  $('mock-topic-label').textContent=q.topic;
  $('mock-marks-label').textContent=q.marks+(q.marks===1?' mark':' marks');
  $('mock-q-text').textContent=q.q;
  $('mock-fb').innerHTML='';$('mock-skip').disabled=false;
  $('mock-prog-bar').style.width=(mock.idx/total*100)+'%';
  renderOptions($('mock-options'),q,(ok,chosen)=>{
    if(!mock.active||mock.locked)return;
    mock.locked=true;
    mock.answers[mock.idx]=chosen;mock.correct[mock.idx]=ok;
    if(ok)mock.score+=q.marks;
    $('mock-marks-so-far').textContent=mock.score;
    $('mock-skip').disabled=true;
    $('mock-fb').innerHTML=ok
      ?`<div class="fb fb-ok"><div class="fb-head"><svg class="ico"><use href="#i-check"/></svg>Correct — ${q.marks} mark${q.marks>1?'s':''}</div></div>`
      :`<div class="fb fb-no"><div class="fb-head"><svg class="ico"><use href="#i-x"/></svg>Answer: ${esc(q.a)}</div>${esc(q.explain)}</div>`;
    const at=mock.idx;
    setTimeout(()=>{if(mock.active&&mock.idx===at)advanceMock();},ok?1000:3200);
  });
}
function advanceMock(){mock.idx++;if(mock.idx>=mock.questions.length)endMock();else showMockQ();}
function skipMockQ(){if(!mock.active||mock.locked)return;mock.answers[mock.idx]='';advanceMock();}
function endMock(){
  if(!mock.active)return;
  clearInterval(mock.interval);mock.interval=null;mock.active=false;
  $('mock-exam').hidden=true;$('mock-results').hidden=false;$('mock-review-section').hidden=true;
  const p=MOCK_PAPERS[mock.paper],total=mock.total,score=mock.score,pct=total?Math.round(score/total*100):0;
  let grade,msg;
  if(pct>=70){grade='A';msg='A-grade level knowledge. Now make sure you can use it in essays and source answers.';}
  else if(pct>=60){grade='B';msg='Solid knowledge. Review the questions you dropped to push towards an A.';}
  else if(pct>=50){grade='C';msg='A pass level. Target your weakest topics to move up.';}
  else if(pct>=40){grade='D';msg='Close. Use Smart Mix to work on the topics you found hardest.';}
  else{grade='No Award';msg='Not there yet — that is what practice is for. Review your answers, then try again.';}
  $('mock-grade-icon').textContent=grade==='No Award'?'–':grade;
  $('mock-grade-title').textContent=grade==='No Award'?'Keep practising':'Grade '+grade+' level';
  $('mock-score-display').textContent=`${score} / ${total}`;
  $('mock-grade-band').textContent=`${pct}% · ${p.title}`;
  $('mock-grade-msg').textContent=msg;
  S.mockScores.push({paper:mock.paper,score,total,pct,grade,date:new Date().toLocaleDateString('en-GB')});
  if(S.mockScores.length>50)S.mockScores=S.mockScores.slice(-50);
  // mock answers also count towards topic progress
  mock.questions.forEach((q,i)=>{if(mock.answers[i]==='')return;const ts=S.topicStats[q.topicKey]||(S.topicStats[q.topicKey]={correct:0,total:0});ts.total++;if(mock.correct[i])ts.correct++;});
  recordStudy();save();updateHeader();window.scrollTo(0,0);
}
function showMockReview(){
  const sec=$('mock-review-section');sec.hidden=false;
  $('mock-review-list').innerHTML=mock.questions.map((q,i)=>{
    const given=mock.answers[i],ok=mock.correct[i];
    return `<div class="review-item ${ok?'ok':'no'}">
      <div class="meta">${i+1}. ${esc(q.topic)} · ${q.marks} mark${q.marks>1?'s':''}</div>
      <div class="q">${esc(q.q)}</div>
      <div>Your answer: <b>${given?esc(given):'<span class="muted">blank</span>'}</b>${ok?'':` · Correct: <b>${esc(q.a)}</b>`}</div>
      ${ok?'':`<div class="exp">${esc(q.explain)}</div>`}</div>`;
  }).join('');
  sec.scrollIntoView({behavior:'smooth'});
}
function resetMock(){
  clearInterval(mock.interval);mock.interval=null;mock.active=false;
  $('mock-home').hidden=false;$('mock-exam').hidden=true;$('mock-results').hidden=true;
  renderMockHome();window.scrollTo(0,0);
}
$('mock-skip').addEventListener('click',skipMockQ);
$('mock-end').addEventListener('click',()=>{if(confirm('End the test now? Unanswered questions score zero.'))endMock();});
$('mock-review-btn').addEventListener('click',showMockReview);
$('mock-back').addEventListener('click',resetMock);
window.addEventListener('beforeunload',e=>{if(mock.active){e.preventDefault();e.returnValue='';}});

// ---------------- Essay & exam question planner ----------------
const QTYPE={essay:['Paper 1 essay','22 marks'],evaluate:['Evaluate the usefulness','8 marks'],howfully:['How fully','10 marks'],explain:['Explain','8 marks'],howmuch:['Two-source: how much','10 marks']};
function renderEssays(){
  const f=$('essay-filter').value,list=$('essay-list');
  const items=ESSAYS.filter(e=>f==='all'||TOPICS[e.topic].group===f);
  list.innerHTML=items.map(e=>{const [tn,mk]=QTYPE[e.type];return `<div class="card essay-card">
    <div class="q-meta"><span class="tag tag-topic">${esc(TOPICS[e.topic].name)}</span><span class="tag">${esc(tn)}</span><span class="tag tag-given">${mk}</span></div>
    <p class="essay-q">${esc(e.q)}</p>
    <details class="howto essay-plan"><summary>Show a plan</summary><ul>${e.plan.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>
  </div>`;}).join('')||'<p class="empty">No questions for this filter yet.</p>';
}
$('essay-filter').addEventListener('change',renderEssays);

// ---------------- Progress ----------------
function renderProg(){
  rollDay();
  const st=S.stats,acc=st.answered?Math.round(st.correct/st.answered*100)+'%':'–';
  const days=examCountdown();
  $('stats-grid').innerHTML=[
    [st.answered,'Practice questions answered'],[acc,'Accuracy'],[st.dayStreak||0,'Day streak'],
    [st.bestStreak,'Best run in a row'],[st.dailyCount+' / '+(S.settings.goal||10),'Today'],[days>=0?days:'–','Days to the exam']
  ].map(([n,l])=>`<div class="stat"><div class="stat-num">${n}</div><div class="stat-lbl">${l}</div></div>`).join('');
  const rows=Object.entries(TOPICS).map(([k,t])=>{const ts=S.topicStats[k]||{correct:0,total:0};return {k,t,ts,pct:ts.total?Math.round(ts.correct/ts.total*100):null};});
  rows.sort((a,b)=>(a.pct===null)-(b.pct===null)||(a.pct??0)-(b.pct??0));
  const list=$('topic-prog');list.innerHTML='';
  rows.forEach(({k,t,ts,pct})=>{
    const r=document.createElement('div');r.className='prog-row '+accClass(pct??0,ts.total);
    r.innerHTML=`<div class="name">${esc(t.name)}<small>${esc(groupName(t.group))} · ${ts.total?`${ts.correct}/${ts.total} correct · ${pct}%`:'Not started'}</small></div>
      <div class="bar"><div class="bar-fill" style="width:${pct??0}%"></div></div>
      <button class="btn btn-ghost">Practise</button>`;
    r.querySelector('button').addEventListener('click',()=>{setTopic(k);go('practice');});
    list.append(r);
  });
  const lb=$('leaderboard');
  if(S.timerScores.length){
    lb.innerHTML=[...S.timerScores].sort((a,b)=>b.score-a.score).slice(0,5).map((s,i)=>`<div class="list-row">
      <span class="rank ${i===0?'r1':''}">${i+1}</span><span class="grow">${s.secs/60}-minute challenge</span>
      <b>${s.score}</b><span class="muted small">${esc(s.date)}</span></div>`).join('');
  }else lb.innerHTML='<p class="empty">No scores yet — try the Timed challenge.</p>';
  $('mock-history').innerHTML=mockHistoryHTML(8);
}
function resetProg(){
  if(!confirm('Reset all progress? This cannot be undone.'))return;
  S.stats={answered:0,correct:0,streak:0,bestStreak:0,dailyCount:0,dailyDate:todayStr(),dayStreak:0,lastStudyDate:''};
  S.topicStats={};S.questionNum=1;S.timerScores=[];S.mockScores=[];
  save();renderProg();updateHeader();toast('Progress reset');
}
$('reset-prog').addEventListener('click',resetProg);

// ---------------- Notepad ----------------
let noteTimer;
$('notepad-text').addEventListener('input',e=>{
  S.notepadContent=e.target.value;$('note-status').textContent='Saving…';
  clearTimeout(noteTimer);noteTimer=setTimeout(()=>{save();$('note-status').textContent='Saved on this device';},400);
});
$('note-clear').addEventListener('click',()=>{if(confirm('Clear all notes?')){$('notepad-text').value='';S.notepadContent='';save();}});
$('note-copy').addEventListener('click',()=>{
  const txt=$('notepad-text').value;
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('Notes copied'),()=>{$('notepad-text').select();toast('Press Ctrl+C to copy');});
});
$('note-download').addEventListener('click',()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([$('notepad-text').value],{type:'text/plain'}));
  a.download='higher-history-notes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

// ---------------- Shop ----------------
const TAG='cazza09-21';
const SHOP=[
  ['Revision guides',[
    ['Higher History revision guide','Covers the SQA course with exam advice','higher+history+revision+guide+sqa'],
    ['Higher History practice papers','Exam-style papers with marking guidance','higher+history+practice+papers+sqa'],
    ['How to Pass Higher History','Popular Scottish exam-skills guide','how+to+pass+higher+history'],
  ]],
  ['Topic books',[
    ['Britain 1851–1951','Votes for women, the Liberal and Labour reforms','higher+history+britain+1851-1951'],
    ['Migration and Empire','Scottish emigration, immigration and empire','higher+history+migration+and+empire+1830-1939'],
    ['Germany, USA, Russia & Appeasement','Books for the European & World options','higher+history+germany+1815-1939'],
  ]],
  ['Stationery',[
    ['Revision flashcards','Make your own date and key-term cards','revision+flashcards+blank+cards'],
    ['Highlighters and pens','Colour-code factors in your essay plans','highlighter+pens+set+revision'],
    ['A4 lined pads','Practise timed essays by hand','a4+lined+refill+pad'],
  ]],
];
function renderShop(){
  $('shop-sections').innerHTML=SHOP.map(([title,items])=>`<div class="shop-section"><h2 class="section-title">${title}</h2><div class="grid-cards">
    ${items.map(([n,d,q])=>`<a class="tile shop-card" href="https://www.amazon.co.uk/s?k=${q}&tag=${TAG}" target="_blank" rel="noopener sponsored"><h3>${esc(n)}</h3><small>${esc(d)}</small><span class="cta">View on Amazon<svg class="ico"><use href="#i-external"/></svg></span></a>`).join('')}
  </div></div>`).join('');
}

// ---------------- Settings ----------------
function greetingText(){
  const days=examCountdown();
  const cd=days>0?`${days} day${days===1?'':'s'} until your Higher History exam (19 May 2027).`:days===0?'Exam day — good luck!':'';
  return (S.settings.name?`Hi ${S.settings.name} — `:'')+cd;
}
function setSeg(id,attr,val){$(id).querySelectorAll(`[data-${attr}]`).forEach(b=>b.setAttribute('aria-checked',b.dataset[attr]===String(val)));}
function applySettings(){
  const st=S.settings,root=document.documentElement;
  if(st.mode==='light'||st.mode==='dark')root.dataset.theme=st.mode;else delete root.dataset.theme;
  if(st.accent&&st.accent!=='saltire')root.dataset.accent=st.accent;else delete root.dataset.accent;
  setSeg('goal-seg','goal',st.goal||10);setSeg('mode-seg','mode',st.mode||'system');setSeg('accent-seg','accent',st.accent||'saltire');
  $('student-name').value=st.name||'';
  $('greeting').textContent=greetingText();
  const meta=document.querySelector('meta[name="theme-color"]');
  meta.content=getComputedStyle(root).getPropertyValue('--bg').trim()||'#0065bd';
  updateHeader();
}
$('student-name').addEventListener('input',e=>{S.settings.name=e.target.value.trim();save();$('greeting').textContent=greetingText();});
$('goal-seg').addEventListener('click',e=>{const b=e.target.closest('[data-goal]');if(!b)return;S.settings.goal=+b.dataset.goal;save();applySettings();});
$('mode-seg').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b)return;S.settings.mode=b.dataset.mode;save();applySettings();});
$('accent-seg').addEventListener('click',e=>{const b=e.target.closest('[data-accent]');if(!b)return;S.settings.accent=b.dataset.accent;save();applySettings();});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applySettings);

// ---------------- PWA ----------------
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;
  let dismissed=false;try{dismissed=localStorage.getItem('hhist_install_dismissed')==='1';}catch(_){}
  if(!dismissed)setTimeout(()=>{$('install-banner').hidden=false;},30000);
});
$('install-btn').addEventListener('click',()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();deferredPrompt.userChoice.finally(()=>{deferredPrompt=null;$('install-banner').hidden=true;});
});
$('dismiss-install').addEventListener('click',()=>{$('install-banner').hidden=true;try{localStorage.setItem('hhist_install_dismissed','1');}catch(_){}});
(function(){
  const ua=navigator.userAgent;
  const iOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  let dismissed=false;try{dismissed=localStorage.getItem('hhist_install_dismissed')==='1';}catch(_){}
  if(!iOS||standalone||dismissed)return;
  $('install-text').hidden=true;$('ios-text').hidden=false;
  $('install-btn').hidden=true;$('dismiss-install').textContent='Got it';
  setTimeout(()=>{$('install-banner').hidden=false;},20000);
})();

// ---------------- Init ----------------
fillTopicSelect($('topic-select'));
fillTopicSelect($('timer-topic'),{smart:false});
fillFCDecks();
renderWS();renderShop();loadFC();renderEssays();
rollDay();applySettings();save();
newQuestion();
route();
