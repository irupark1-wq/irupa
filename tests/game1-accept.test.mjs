// 행동별 수락(PO-HAND-005 §3A, 정연우 v1.2 §4 ACCEPT-01~06, AUTO-11/16/22).
// (a) 후보 자격·응답 자유 검증과 (b) 성공 분기를 통제한 원장 검산을 구분한다. 수치는 A 시험 정의(game1-rel-test-v041) 기준.
import test from 'node:test';import assert from 'node:assert/strict';
import {talkResponse,helpResponse,delegateResponse,joinResponse,ACCEPT_RULE} from '../prototype/accept.js';
import {candidates,actorState,initialLife} from '../prototype/life.js';
import {createLocalStore,applyLifeCompletions,STORE_KEY} from '../prototype/store.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const AX={...DEFAULT_AXES};
const rel=(o={})=>({affection:100,trust:300,respect:300,reciprocity:500,conflict:1,...o});
const idle=(o={})=>({...actorState(0),mode:'idle',tired:20,social:70,activity:50,...o});
const working=(o={})=>({...actorState(0),mode:'working',until:20,partner:null,tired:20,...o});

test('ACCEPT-01 low affection 180 / high respect 880 with a shared goal: cooperation is allowed; intimacy is not required',()=>{
 const r=rel({affection:180,respect:880,trust:700});
 const help=helpResponse(working(),AX,r,0.9,{tick:10});assert.equal(help.accepted,true,'respect drives cooperation, not affection');
 assert.ok(joinResponse(idle(),AX,r,0.9).accepted);
 const talk=talkResponse(idle(),AX,r,0.9);assert.equal(talk.accepted,false,'a light chat is not forced');assert.equal(talk.code,'declined_by_pawn');
 const life=initialLife();life.actors={p0:idle({x:5,y:3}),p1:working({x:9,y:2})};const all=[{id:'p0',trait:{axis_values:AX}},{id:'p1',trait:{axis_values:AX}}];
 assert.ok(candidates(life,'p0',all,()=>r).some(c=>c.kind==='assist'),'assist stays a candidate under low affection');
 assert.equal(ACCEPT_RULE,'game1-accept-a2-test-v1');
});

test('ACCEPT-02 affection 820 / trust 200 with social need: light chat likely, important delegation not granted',()=>{
 const r=rel({affection:820,trust:200});
 assert.equal(talkResponse(idle({social:80}),AX,r,0.5).accepted,true);
 const d=delegateResponse(idle(),AX,r,0.5,{});assert.equal(d.accepted,false);assert.ok(d.p<0.1,'delegation tendency follows trust, not affection');
});

test('ACCEPT-03 trust 200 and the recipient wants rest: delegation refused, no guaranteed greeting, no penalty',()=>{
 const resting=idle({mode:'resting'});
 assert.equal(delegateResponse(resting,AX,rel({trust:200}),0,{}).code,'declined_by_pawn');
 assert.equal(talkResponse(resting,AX,rel({trust:200}),0).accepted,false,'a short greeting is not guaranteed while resting');
});

test('ACCEPT-04 respect 880 and a shared goal, but blocked path or a tired worker: no acceptance, no effect',()=>{
 const r=rel({respect:880});
 assert.equal(helpResponse(working(),AX,r,0,{tick:10,blocked:true}).code,'no_path');
 assert.equal(helpResponse(working({tired:85}),AX,r,0,{tick:10}).accepted,false);
 assert.equal(helpResponse(working({until:11}),AX,r,0,{tick:10}).accepted,false,'not enough work left');
});

test('ACCEPT-05 trust 900 but private/other-owner information or no owner approval: refused, nothing disclosed',()=>{
 const r=rel({trust:900});
 for(const ctx of [{otherOwnerPrivate:true},{sensitive:true},{ownerApproved:false}]){const d=delegateResponse(idle(),AX,r,0,ctx);assert.equal(d.code,'not_shareable');assert.equal(JSON.stringify(d).includes('900'),false);}
 assert.equal(delegateResponse(idle(),AX,r,0.5,{ownerApproved:true}).accepted,true);
});

test('ACCEPT-06 same relation and seed, only closeness/risk traits differ: tendencies and candidates change; hard gates and consent do not',()=>{
 const r=rel({affection:300}),low={...AX,closeness_orientation:'low',risk_aversion:'high'},high={...AX,closeness_orientation:'high',risk_aversion:'low'};
 assert.ok(talkResponse(idle(),high,r,0).p>talkResponse(idle(),low,r,0).p);
 assert.equal(talkResponse(idle({tired:80}),high,r,0).accepted,false,'fatigue gate is the same for every trait');
 assert.equal(delegateResponse(idle(),high,rel({trust:900}),0,{otherOwnerPrivate:true}).code,'not_shareable','privacy gate is the same');
 const life=initialLife();life.actors={p0:idle({x:3,y:6}),p1:idle({x:5,y:6})};
 const pick=t=>candidates(life,'p0',[{id:'p0',trait:{axis_values:t}},{id:'p1',trait:{axis_values:AX}}],()=>r).find(c=>c.kind==='meet').score;
 assert.ok(pick(high)>pick(low),'approach weight follows closeness');
});

/* (b) 성공 분기를 통제한 원장 검산 — 감정 4축(애정·신뢰·존중·호혜성). 구조 축(의존·권력·의무)은 이 fixture 로 만들 수 없어 대조하지 않는다. */
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
function pair(baseline,conflicts=[]){const m=new Map(),s=createLocalStore({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 s.createPawn('auto-a','모래',art,{...AX,closeness_orientation:'low'});s.createPawn('auto-b','밤',art,AX);
 const st=s.read(),[A,B]=st.pawns.map(p=>p.id);st.relation_baseline={[A+'->'+B]:baseline};st.structures.conflicts=conflicts.map(c=>({from_pawn_id:A,to_pawn_id:B,active:true,state:'open',...c}));return {st,A,B};}
const view=(st,a,b)=>{const m=new Map([[STORE_KEY,JSON.stringify(st)]]);return createLocalStore({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}).projection(a,b).scores;};
const four=s=>[s.affection,s.trust,s.respect,s.reciprocity];

test('AUTO-11 dislike but respect: cooperation candidate allowed; controlled completed help gives 모래→밤 [190,706,880,650]; 밤→모래 unchanged',()=>{
 const {st,A,B}=pair({affection:180,trust:700,respect:880,reciprocity:650},[{id:'C11',scope_id:'life-001',topic:'goal',severity:680}]);
 assert.ok(helpResponse(working(),{...AX,closeness_orientation:'low'},view(st,A,B),0.9,{tick:10}).accepted,'low affection does not remove cooperation');
 const backBefore=four(view(st,B,A));st.life.tick=50;applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:'game1-auto-50-1',reason:'x',witnesses:[]}]);
 assert.deepEqual(four(view(st,A,B)),[190,706,880,650]);assert.deepEqual(four(view(st,B,A)),backBefore);
 assert.equal(st.structures.conflicts[0].active,true,'cooperation is not reconciliation');
});

test('AUTO-16 distance after repair: controlled EVT-12 on C16 gives 모래→밤 trust 550 / reciprocity 568, C16 resolved, memory kept, 모래 may still decline',()=>{
 const {st,A,B}=pair({affection:320,trust:540,respect:630,reciprocity:550},[{id:'C16',scope_id:'life-001',topic:'credit_attribution',severity:180}]);
 st.life.tick=80;applyLifeCompletions(st,[{kind:'repair',from:A,to:B,conflict:{conflict_id:'C16',scope_id:'life-001',topic:'credit_attribution'},action_id:'game1-auto-80-1',reason:'x'}]);
 assert.deepEqual(four(view(st,A,B)),[320,550,630,568]);assert.equal(st.structures.conflicts[0].state,'resolved');
 assert.ok(st.memories.some(m=>m.from===A&&m.topic==='credit_attribution'),'memory is kept');
 const d=talkResponse(idle(),{...AX,closeness_orientation:'low'},view(st,A,B),0.95);assert.equal(d.accepted,false,'independent distancing stays possible');
 assert.equal(st.events.filter(e=>['EVT-07','EVT-08','EVT-10'].includes(e.event.event_id)).length,0,'distancing is not betrayal');
});

test('AUTO-22 cooperation during an open conflict is not reconciliation: help gives [260,506,820,420], C22 stays open; apology event is blocked (no definition)',()=>{
 const {st,A,B}=pair({affection:250,trust:500,respect:820,reciprocity:420},[{id:'C22',scope_id:'life-001',topic:'credit_attribution',severity:600}]);
 st.life.tick=90;applyLifeCompletions(st,[{kind:'help',from:A,to:B,action_id:'game1-auto-90-1',reason:'x',witnesses:[]}]);
 assert.deepEqual(four(view(st,A,B)),[260,506,820,420]);assert.equal(st.structures.conflicts[0].active,true);
 assert.equal(st.events.some(e=>e.event.event_id==='EVT-12'),false,'help is not EVT-12');
});
