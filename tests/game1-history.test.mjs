// 이력·저장 보완(PO-DEC-005 §3). 원장 접기(§3-4), 구조 축 당시 문맥(§3-2), 저장 형식 보호(§3-3),
// 중립 압축과 재전송(§3-1), 공로 기록 보관 pinning(§3-5), 정정자 미인지 일치(§3-6).
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,applyLifeCompletions,rebuildTagHistory,foldLedger,configureHistory,STORE_KEY,SAVE_FORMAT,FOLD_AT,FOLD_KEEP} from '../prototype/store.js';
// 원장 재생 비용이 사건 수의 제곱이라 시험은 작은 기준(40/20)으로 같은 규칙을 검산한다. 게임 기본값은 아래 첫 시험에서 확인.
const AT=40,KEEP=20;configureHistory({foldAt:AT,foldKeep:KEEP});
test('game defaults: fold above 300 live events down to 150 (two Days of corrections fit easily)',()=>{assert.equal(FOLD_AT,300);assert.equal(FOLD_KEEP,150);});
import {emptyCredit} from '../prototype/credit.js';
import {memoryText} from '../prototype/relation-text.js';
import {t as T} from '../prototype/i18n.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
const disk=(init)=>{const m=new Map(init?[[STORE_KEY,init]]:[]);return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};
function world(){const d=disk(),s=createLocalStore(d);for(let i=0;i<3;i++)s.createPawn('h-'+i,['모래','밤','노을'][i],art,DEFAULT_AXES);const st=s.read();return {st,ids:st.pawns.map(p=>p.id)};}
const reopen=st=>createLocalStore(disk(JSON.stringify(st)));
const all=(st,ids)=>{const s=reopen(st),out={};for(const a of ids)for(const b of ids)if(a!==b)out[a+'>'+b]=s.projection(a,b).scores;return out;};
let n=0;const act=t=>'game1-auto-'+t+'-'+(++n);
/** 여러 Day 에 걸친 도움 완료를 쌓는다(도움은 한도 없이 원장에 들어감). 방향을 돌려 점수가 서로 다르게 움직이게 한다. */
function grow(st,ids,count,{start=100,gap=200}={}){const pairs=[[0,1],[1,2],[2,0],[1,0]];let t=start;const outs=[];
 for(let k=0;k<count;k++){const [a,b]=pairs[k%pairs.length];st.life.tick=t;outs.push(...applyLifeCompletions(st,[{kind:'help',from:ids[a],to:ids[b],action_id:act(t),reason:'x',witnesses:[]}]));t+=gap;}
 st.credit=emptyCredit();return {t,outs};}

test('§3-4 folding keeps every relation score identical and frees room; no completion is dropped past the old 490 cut',()=>{
 const {st,ids}=world();grow(st,ids,AT-1);assert.equal(st.events.length,AT-1,'below the fold line nothing is folded');
 const before=all(st,ids);const folded=foldLedger(st,true);
 assert.ok(folded>0&&st.events.length===KEEP,'folded down to the keep size');assert.deepEqual(all(st,ids),before,'scores unchanged by folding');
 const {outs}=grow(st,ids,520,{start:(AT-1)*200+100});
 assert.equal(outs.filter(o=>o.status==='ledger_full').length,0,'no silent or visible loss');assert.equal(outs.filter(o=>o.status==='applied').length,520);
 assert.ok(st.events.length<=AT);const total=st.events.length+Object.values(st.ledger_checkpoints).reduce((a,c)=>a+c.folded,0);assert.equal(total,AT-1+520,'every completion is either live or folded');
 const replay=all(st,ids);foldLedger(st,true);assert.deepEqual(all(st,ids),replay,'folding again changes nothing');
 assert.doesNotThrow(()=>reopen(st),'the folded save loads and validates');
});

test('§3-4 unknown or recent events are never folded, and they block folding behind them in that direction only',()=>{
 const {st,ids}=world();const [A,B,C]=ids;st.life.tick=150;
 applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:act(150),reason:'x',witnesses:[],knowledge:{[A]:false}}]);
 grow(st,ids,60,{start:400});const left=st.events.filter(e=>e.event.observer_id===A&&e.event.target_id===B);
 assert.equal(left[0].knowledge.known,false,'the unknown event stays');assert.ok(left.length>5,'events after it in A→B stay too');
 assert.ok(st.ledger_checkpoints[B+'->'+C]?.folded>0,'other directions fold');
 const today=Math.floor((480+st.life.tick)/1440),recent=Object.values(st.tag_history).flat().filter(r=>/game1-auto-(\d+)/.test(r.source_event_id)).filter(r=>Math.floor((480+Number(/game1-auto-(\d+)/.exec(r.source_event_id)[1]))/1440)>=today-1);
 assert.ok(recent.length>0);for(const r of recent)assert.ok(st.events.some(e=>e.event.source_event_id===r.source_event_id),'today and yesterday stay live');
});

test('§3-4 folded sources: tag rows freeze their context, knowledge revision says settled, re-sent old action is stale',()=>{
 const {st,ids}=world();const [A,B]=ids;const first=act(100);st.life.tick=100;applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:first,reason:'x',witnesses:[]}]);
 grow(st,ids,60,{start:300});const row=st.tag_history[A+'->'+B].find(r=>r.source_event_id===first+'-'+A+'-EVT-04');
 assert.equal(row.frozen,true);const ctx=JSON.stringify(row.context);rebuildTagHistory(st);assert.equal(JSON.stringify(row.context),ctx,'frozen rows are not recomputed');
 const d=disk(JSON.stringify(st)),s=createLocalStore(d);assert.equal(s.reviseLifeKnowledge('rev-folded',row.source_event_id,{revision:2,known:true,delay_reason:'unconfirmed'}).status,'settled');
 const again=applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:first,reason:'x',witnesses:[]}]);assert.equal(again[0].status,'stale','old action cannot be applied twice after folding');
});

test('§3-2 tag replay keeps structure axes from when the row was made, not today\'s',()=>{
 const {st,ids}=world();const [A,B]=ids;st.life.tick=100;applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:act(100),reason:'x',witnesses:[]}]);
 const row=st.tag_history[A+'->'+B][0],then={...row.context.a};
 st.structures.roles.push({from_pawn_id:A,to_pawn_id:B,id:'role-x',active:true,importance_permille:1000,share_permille:900});
 st.structures.conflicts.push({from_pawn_id:A,to_pawn_id:B,id:'c-x',active:true,scope_id:'life-001',topic:'goal',severity:600,state:'open'});
 rebuildTagHistory(st);for(const k of ['dependence','power','obligation','conflict'])assert.equal(row.context.a[k],then[k],k+' stays as it was');
 assert.equal(row.context.a.affection,then.affection,'emotion axes replayed from the ledger');
});

test('§3-3 save format: newer saves are refused untouched; older saves get a one-time backup before the format changes',()=>{
 const {st}=world();assert.equal(st.save_format,SAVE_FORMAT);
 const newer=JSON.stringify({...st,save_format:SAVE_FORMAT+1}),d1=disk(newer);assert.throws(()=>createLocalStore(d1),/save.newer_format/);assert.equal(d1.m.get(STORE_KEY),newer,'not overwritten');
 const old={...st};delete old.save_format;const raw=JSON.stringify(old),d2=disk(raw),s=createLocalStore(d2);
 assert.equal(d2.m.get(STORE_KEY+'.backup-f1'),raw,'original kept under the backup key');assert.deepEqual(s.read().migration,{from:1,to:SAVE_FORMAT,backup:true});
 s.lifePause('fmt-commit',true);assert.equal(JSON.parse(d2.m.get(STORE_KEY)).save_format,SAVE_FORMAT);
});

test('§3-1 neutral rows older than yesterday become counts; a re-sent old talk is stale and adds nothing',()=>{
 const {st,ids}=world();const [A,B]=ids;const talks=[];
 for(let k=0;k<5;k++){const t=100+k*61,id=act(t);talks.push(id);st.life.tick=t;applyLifeCompletions(st,[{kind:'talk',from:A,to:B,action_id:id,reason:'x'}]);}
 assert.ok(st.life.neutral_activity.length>0,'over the daily cap some talks are neutral');
 st.life.tick=100+1440*3;applyLifeCompletions(st,[]);assert.equal(st.life.neutral_activity.length,0);assert.ok(Object.values(st.life.neutral_summary).reduce((a,b)=>a+b,0)>0);
 const events=st.events.length;const r=applyLifeCompletions(st,[{kind:'talk',from:A,to:B,action_id:talks.at(-1),reason:'x'}]);assert.equal(r[0].status,'stale');assert.equal(st.events.length,events);
});

/* §3-5 / §3-6: 공로 기록 흐름 */
function creditWorld(){const {st,ids}=world();const [A,B,C]=ids;return {st,A,B,C};}
const step=(st,t,done)=>{st.life.tick=t;return applyLifeCompletions(st,[done]);};
test('§3-5 61+ helps and records: a live issue keeps its record and help, and the correction still works',()=>{
 const {st,A,B,C}=creditWorld();const help=act(100);step(st,100,{kind:'help',from:A,to:B,action_id:help,reason:'x',witnesses:[]});
 step(st,110,{kind:'record',from:C,help_id:help,action_id:act(110)});const record='credit-log-'+help;
 step(st,120,{kind:'read',from:B,record_id:record,action_id:act(120)});const issue=st.credit.issues['issue-'+record+'-'+B];issue.state='intends_request';
 for(let k=0;k<70;k++){const h=act(130+k);step(st,130+k,{kind:'help',from:A,to:C,action_id:h,reason:'x',witnesses:[B]});step(st,130+k,{kind:'record',from:B,help_id:h,action_id:act(130+k)});}
 assert.ok(Object.keys(st.credit.helps).length<=60&&Object.keys(st.credit.records).length<=60,'old closed entries are trimmed');
 assert.ok(st.credit.records[record]&&st.credit.helps[help],'pinned by the live issue');
 step(st,300,{kind:'credit_check',from:B,to:C,issue_id:issue.issue_id,accepted:true,action_id:act(300)});
 assert.equal(step(st,310,{kind:'correct',from:C,issue_id:issue.issue_id,action_id:act(310)})[0].status,'applied');
 assert.doesNotThrow(()=>reopen(st));
});

test('§3-6 corrector unknown: issue, memory and the public card all say "corrected, by someone unknown"; no EVT-09',()=>{
 const {st,A,B,C}=creditWorld();const help=act(100);step(st,100,{kind:'help',from:A,to:B,action_id:help,reason:'x',witnesses:[]});
 step(st,110,{kind:'record',from:C,help_id:help,action_id:act(110)});const record='credit-log-'+help;step(st,120,{kind:'read',from:B,record_id:record,action_id:act(120)});
 const issue=st.credit.issues['issue-'+record+'-'+B];issue.state='intends_request';step(st,130,{kind:'credit_check',from:B,to:C,issue_id:issue.issue_id,accepted:true,action_id:act(130)});
 step(st,140,{kind:'correct',from:C,issue_id:issue.issue_id,action_id:act(140)});st.credit.records[record].corrected_by_visible=false;step(st,150,{kind:'read',from:B,record_id:record,action_id:act(150)});
 assert.equal(issue.state,'resolved_record');assert.equal(issue.corrector_known,false);
 const mem=st.memories.find(m=>m.id===record+'-'+B);assert.equal(mem.resolution,'resolved');assert.equal(mem.corrector_known,false);
 const view=reopen(st).projection(B,C).memory_views.find(v=>v.id===mem.id);assert.equal(view.resolution,'corrected_by_unknown');assert.equal(memoryText(view,()=>'노을').resolution,T('기록은 고쳐졌어요. 누가 고쳤는지는 아직 몰라요.'),'same sentence in every language (CI runs in English)');
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-09'),false);
});
