// 제3자 공동작업 기록 흐름(PO-HAND-005 v1.1). test 이름의 Q·SYS 번호는 정연우 SYS-CONF-001-Q01~10, 김시스템 REQ04-SYS-01~12.
// 두 QA 집합은 서로 다르며 번호를 합치지 않는다. 성공 분기(B 의 확인 의사·C 의 응답)는 fixture 로 통제한다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,applyLifeCompletions,STORE_KEY} from '../prototype/store.js';
import {creditHooks,CREDIT_RULE} from '../prototype/credit.js';
import {talkResponse} from '../prototype/accept.js';
import {actorState} from '../prototype/life.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
function world(n=3,baseline=true){const m=new Map(),s=createLocalStore({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 for(let i=0;i<n;i++)s.createPawn('cr-'+i,['모래','밤','노을'][i],art,DEFAULT_AXES);
 const st=s.read(),[A,B,C]=st.pawns.map(p=>p.id);if(baseline&&C)st.relation_baseline={[B+'->'+C]:{affection:420,trust:550,respect:600,reciprocity:500}};return {st,A,B,C};}
let n=0;const id=t=>'game1-auto-'+t+'-'+(++n);
const step=(st,t,done)=>{st.life.tick=t;return applyLifeCompletions(st,[done]);};
const view=(st,a,b)=>{const m=new Map([[STORE_KEY,JSON.stringify(st)]]);return createLocalStore({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}).projection(a,b);};
const axes8=s=>[s.affection,s.trust,s.respect,s.dependence,s.power,s.reciprocity,s.obligation,s.conflict];
/** 도움(A 작업·B 도움) → C 기록(B 미목격) → 반환: help/record id */
function helpAndRecord(st,A,B,C,{witnesses=[],ruleApplies=true}={}){const help=id(100);step(st,100,{kind:'help',from:A,to:B,action_id:help,reason:'x',witnesses});
 step(st,110,{kind:'record',from:C,help_id:help,action_id:id(110),...(ruleApplies?{}:{rule_applies:false})});return {help,record:'credit-log-'+help};}
const issueOf=(st,record,B)=>st.credit.issues['issue-'+record+'-'+B];

test('Q01 / SYS-01 omission is a fact, not intent: help source unchanged, record shows only A, no EVT-08/10, B→C unchanged, no conflict',()=>{
 const {st,A,B,C}=world();const before=axes8(view(st,B,C).scores);const {help,record}=helpAndRecord(st,A,B,C);
 const r=st.credit.records[record];assert.deepEqual(r.recorded,[A]);assert.deepEqual(r.omitted,[B]);assert.equal(r.intent,'unconfirmed');assert.deepEqual(r.true_contributors,[A,B]);
 assert.equal(st.events.filter(e=>e.event.evidence.action_id===help+'-'+A).length,1,'original help source stays');
 assert.equal(st.events.filter(e=>['EVT-08','EVT-10'].includes(e.event.event_id)).length,0);assert.deepEqual(axes8(view(st,B,C).scores),before);assert.equal(st.structures.conflicts.length,0);
});

test('Q02 / SYS-01 B reads the record later: knowledge of the omission, reason unknown, open issue allowed, no emotion change',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);const before=axes8(view(st,B,C).scores);
 step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const mem=st.memories.find(m=>m.id===record+'-'+B);assert.ok(mem);assert.equal(mem.reason_known,false);assert.equal(mem.to,C,'B→C, not B→A');
 assert.ok(['intends_request','observed'].includes(issueOf(st,record,B).state));assert.deepEqual(axes8(view(st,B,C).scores),before);
 assert.equal(step(st,230,{kind:'read',from:B,record_id:record,action_id:id(230)})[0].status,'duplicate','re-reading is not a new source');
});

test('Q03 no applicable attribution rule (personal note): observation only, no mismatch memory, no issue',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C,{ruleApplies:false});step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 assert.equal(st.memories.some(m=>m.id===record+'-'+B),false);assert.equal(issueOf(st,record,B),undefined);assert.equal(CREDIT_RULE.id,'CREDIT-RULE-workbench-v1');
});

test('Q04 / Q05 / SYS-06 check request opens an issue; C busy or offline is pending, not conflict or intent; deltas zero; B may keep distance',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});const i=issueOf(st,record,B);
 i.state='observed';assert.equal(creditHooks(st).checkFor(B),null,'SYS-06: knowing without expressing opens no request');
 i.state='intends_request';const before=axes8(view(st,B,C).scores);
 step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:false,action_id:id(240)});
 assert.equal(i.state,'verification_pending');assert.equal(st.structures.conflicts.length,0);assert.deepEqual(axes8(view(st,B,C).scores),before);
 assert.equal(creditHooks(st).checkFor(B),null,'retry waits 35 ticks');st.life.tick=276;assert.ok(creditHooks(st).checkFor(B),'retry allowed later');
 assert.equal(talkResponse({...actorState(1),mode:'idle',tired:10,social:60},DEFAULT_AXES,view(st,B,C).scores,0.99).accepted,false,'B may decline an intimate talk without penalty');
});

test('Q06 independent dispute → real Conflict: blocked (definition pending); the flow never creates a Conflict',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 assert.equal(i.state,'verification_accepted');assert.equal(st.structures.conflicts.length,0,'blocked_definition_pending: no severity 180 applied');
});

test('Q07 / SYS-08 C verifies the help receipt, publishes a correction, B learns it and that C did it: B→C EVT-09 [420,550,615,1,500,518,1,1]; resend adds nothing',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-09'),false,'no EVT-09 before publishing');
 step(st,260,{kind:'correct',from:C,issue_id:i.issue_id,action_id:id(260)});const r=st.credit.records[record];
 assert.equal(r.revision,2);assert.deepEqual(r.recorded,[A,B]);assert.equal(r.corrected_by,C);assert.equal(i.state,'correction_published');
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-09'),false,'no EVT-09 before B knows');
 const deliver={kind:'deliver',from:C,to:B,record_id:record,issue_id:i.issue_id,action_id:id(280)};step(st,280,deliver);
 assert.deepEqual(axes8(view(st,B,C).scores),[420,550,615,1,500,518,1,1]);assert.equal(i.state,'resolved_record');
 assert.equal(step(st,281,structuredClone(deliver))[0].status,'duplicate');step(st,300,{kind:'read',from:B,record_id:record,action_id:id(300)});
 assert.equal(st.events.filter(e=>e.event.event_id==='EVT-09').length,1);assert.equal(st.events.filter(e=>e.event.event_id==='EVT-09'&&e.event.observer_id===A).length,0,'no B→A credit for C’s action');
});

test('Q08 B sees the corrected record but does not know who corrected it: knowledge updated, no EVT-09',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 step(st,260,{kind:'correct',from:C,issue_id:i.issue_id,action_id:id(260)});st.credit.records[record].corrected_by_visible=false;
 step(st,300,{kind:'read',from:B,record_id:record,action_id:id(300)});assert.equal(st.credit.records[record].readers[B].revision,2);
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-09'),false);
});

test('Q09 / SYS-09 after correction: omission and correction memories stay, no forced friendship, record issue closes, no conflict auto-resolution or EVT-12',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 step(st,260,{kind:'correct',from:C,issue_id:i.issue_id,action_id:id(260)});step(st,280,{kind:'deliver',from:C,to:B,record_id:record,issue_id:i.issue_id,action_id:id(280)});
 const omission=st.memories.find(m=>m.id===record+'-'+B),correction=st.memories.find(m=>m.id.endsWith('-EVT-09'));
 assert.ok(omission&&correction);assert.equal(omission.resolution,'resolved');assert.equal(view(st,B,C).scores.affection,420,'no forced affection');
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-12'),false);
});

test('Q10 / SYS-10 lineage: one help source, one omission record, one correction source; duplicate revisions add nothing; tags count the correction once',()=>{
 const {st,A,B,C}=world();const {help,record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 assert.equal(step(st,110,{kind:'record',from:C,help_id:help,action_id:id(110)})[0].status,'ignored','same help is recorded once');
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 const correctId=id(260);step(st,260,{kind:'correct',from:C,issue_id:i.issue_id,action_id:correctId});assert.equal(step(st,261,{kind:'correct',from:C,issue_id:i.issue_id,action_id:id(261)})[0].status,'ignored');
 step(st,280,{kind:'deliver',from:C,to:B,record_id:record,issue_id:i.issue_id,action_id:id(280)});
 assert.equal(Object.keys(st.credit.helps).length,1);assert.equal(Object.keys(st.credit.records).length,1);assert.equal(Object.keys(st.credit.issues).length,1);
 const ev=st.events.filter(e=>e.event.event_id==='EVT-09');assert.equal(ev.length,1);assert.equal(ev[0].event.evidence.action_id,correctId+'-'+B,'correction is its own source');
 assert.equal((st.tag_history[B+'->'+C]||[]).filter(r=>r.positive).length,1);
});

test('SYS-02 C witnessed B helping: B is in the record, no omission, no issue',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C,{witnesses:[]});st.credit.helps[st.credit.records[record].help_id].witnesses=[C];
 const w=world();const r2=helpAndRecord(w.st,w.A,w.B,w.C,{witnesses:[w.C]});assert.deepEqual(w.st.credit.records[r2.record].omitted,[]);
 step(w.st,220,{kind:'read',from:w.B,record_id:r2.record,action_id:id(220)});assert.equal(issueOf(w.st,r2.record,w.B),undefined);
});

test('SYS-03 / SYS-04 no completed help or no third pawn: no record, nothing fabricated',()=>{
 const {st,C}=world();assert.equal(step(st,110,{kind:'record',from:C,help_id:'game1-auto-1-999',action_id:id(110)})[0].status,'ignored');
 const two=world(2,false);step(two.st,100,{kind:'help',from:two.A,to:two.B,action_id:id(100),reason:'x',witnesses:[]});
 const h=creditHooks(two.st);assert.equal(h.recordableFor(two.A),null);assert.equal(h.recordableFor(two.B),null,'participants never record their own help');
});

test('SYS-05 B never reads the record: no knowledge, no resentment line, no issue',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);assert.equal(st.memories.some(m=>m.id===record+'-'+B),false);assert.equal(issueOf(st,record,B),undefined);
});

test('SYS-07 a failed save during correction rolls everything back: record revision, issue state, no EVT-09',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='verification_accepted';st.life.actors[C]={...actorState(2),mode:'correcting',until:st.life.tick+1,goal:{kind:'correct_record',issue_id:i.issue_id,place:'game1-work'}};
 let fail=false;const m=new Map([[STORE_KEY,JSON.stringify(st)]]),disk={getItem:k=>m.get(k)||null,setItem:(k,v)=>{if(fail){fail=false;throw Error('quota');}m.set(k,v);}};
 const s=createLocalStore(disk);s.lifePause('sys07-run',false);fail=true;
 assert.throws(()=>s.lifeStep(s.life().tick+1),/quota/);
 const after=createLocalStore(disk).read();assert.equal(after.credit.records[record].revision,1);assert.equal(after.credit.issues[i.issue_id].state,'verification_accepted');assert.equal(after.events.some(e=>e.event.event_id==='EVT-09'),false);
});

test('SYS-11 / SYS-12 knowledge replay and privacy: EVT-09 slot replays without re-execution; other-owner view gets no issues or private fields',()=>{
 const {st,A,B,C}=world();const {record}=helpAndRecord(st,A,B,C);step(st,220,{kind:'read',from:B,record_id:record,action_id:id(220)});
 const i=issueOf(st,record,B);i.state='intends_request';step(st,240,{kind:'credit_check',from:B,to:C,issue_id:i.issue_id,accepted:true,action_id:id(240)});
 step(st,1000,{kind:'correct',from:C,issue_id:i.issue_id,action_id:id(1000)});step(st,1001,{kind:'deliver',from:C,to:B,record_id:record,issue_id:i.issue_id,action_id:id(1001)});
 const m=new Map([[STORE_KEY,JSON.stringify(st)]]),s=createLocalStore({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 const src=s.read().events.find(e=>e.event.event_id==='EVT-09').event.source_event_id,records=JSON.stringify(s.read().credit.records);
 assert.equal(s.reviseLifeKnowledge('sys11-a',src,{revision:2,known:false,delay_reason:'unconfirmed'}).action_reexecutions,0);assert.equal(s.projection(B,C).scores.respect,600);
 s.reviseLifeKnowledge('sys11-b',src,{revision:3,known:true,delay_reason:'unconfirmed'});assert.equal(s.projection(B,C).scores.respect,615);assert.equal(JSON.stringify(s.read().credit.records),records,'record not re-executed');
 const own=s.projection(B,C),other=s.projection(B,C,true);assert.ok(Array.isArray(own.basis.open_issues));assert.equal(other.visibility,'restricted');
 for(const secret of ['true_contributors','witness','omitted','credit'])assert.equal(JSON.stringify(other).includes(secret),false,secret);
});
