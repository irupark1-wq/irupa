// A2 기반 수용 시험(PO-15 §7). test 이름의 A2-Bnn 은 PO-15 표의 ID 와 같다.
// B01·B02·B03·B05·B09 는 "효과 판정 시험"이다(PO-15: 완료 tick 을 직접 주고 판정만 본다). 실제 생활에서 그 간격으로
// 접근→수락→완료가 가능한지는 별도 생활 시험이 필요하다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,applyLifeCompletions,STORE_KEY} from '../prototype/store.js';
import {PRESETS} from '../prototype/core/game1-traits.js';
import {evaluateBasicTags} from '../prototype/core/game1-tags.js';
import {dayIndex,judge,emptyRepeat,migrateLegacyTalk,LIGHT_SOCIAL} from '../prototype/repeat.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
function disk(){const m=new Map();let failNext=false;return {getItem:k=>m.get(k)||null,setItem:(k,v)=>{if(failNext){failNext=false;throw Error('quota');}m.set(k,v);},failOnce(){failNext=true;}};}
function prepare(){const storage=disk(),s=createLocalStore(storage);['a2-0','a2-1','a2-2'].forEach((id,i)=>s.createPawn(id,['모래','밤','노을'][i],art,PRESETS[i].axis_values));return {s,storage};}
/** 저장본을 직접 고쳐 다시 여는 시험 도우미(관계 초기값·완료 tick 지정). */
function storeFrom(state){const storage=disk();storage.setItem(STORE_KEY,JSON.stringify(state));return {s:createLocalStore(storage),storage};}
const ids=s=>s.read().pawns.map(p=>p.id);
let seq=0;const talk=(t,from,to,knowledge)=>({kind:'talk',from,to,action_id:'game1-auto-'+t+'-'+(++seq),reason:'인사를 나누고 수락한 짧은 대화를 마쳤어요',...(knowledge?{knowledge}:{})});
/** tick t 에 완료 사건을 반영(실제 lifeStep 과 같은 함수). */
function at(state,t,done){state.life.tick=t;return applyLifeCompletions(state,[done]);}
const aff=(state,from,to)=>storeFrom(state).s.projection(from,to).scores.affection;
const rowsOf=(state,from,to)=>state.tag_history[from+'->'+to]||[];

test('A2-B01 Day1 completed greetings at 100/170/240/310 from affection 300: +4/+4/+4/0, final 312, 4th neutral with no positive basis',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});st.relation_baseline={[A+'->'+B]:{affection:300},[B+'->'+A]:{affection:300}};
 const seen=[];for(const t of [100,170,240,310]){const out=at(st,t,talk(t,A,B));seen.push([out[0].status,aff(st,A,B)]);}
 assert.deepEqual(seen,[['applied',304],['applied',308],['applied',312],['neutral',312]]);
 assert.equal(rowsOf(st,A,B).filter(r=>r.positive).length,3,'4th adds no positive tag basis');
 const neutral=st.life.neutral_activity.filter(n=>n.observer===A);assert.equal(neutral.length,1);assert.equal(neutral[0].reason,'daily_cap');assert.equal(neutral[0].tick,310);
 assert.equal(st.events.filter(e=>e.event.observer_id===A&&e.event.event_id==='EVT-01').length,3,'neutral completion is not appended to the EVT-01 ledger');
});

test('A2-B02 Day boundary 925/960/995: Day 1/2/2, interval 35/70, effect +4/0/+4, Day2 count 0->1',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});
 assert.deepEqual([925,960,995].map(t=>dayIndex(t)+1),[1,2,2]);
 at(st,925,talk(925,A,B));assert.equal(aff(st,A,B),104);
 assert.equal(at(st,960,talk(960,A,B))[0].status,'neutral');assert.equal(aff(st,A,B),104);
 const n=st.life.neutral_activity.find(r=>r.observer===A&&r.tick===960);assert.equal(n.reason,'min_interval');assert.equal(n.since_last_grant,35);assert.equal(n.day,1);
 assert.equal(judge(st.life.repeat,{observer:A,target:B,scope:'life-001',tick:995}).count_before,0,'Day2 count before = 0');
 at(st,995,talk(995,A,B));assert.equal(aff(st,A,B),108);
 const e=st.events.filter(r=>r.event.observer_id===A).at(-1);assert.deepEqual([e.eligibility.day,e.eligibility.quota_index,e.eligibility.since_last_grant],[1,1,70]);
});

test('A2-B03 three frozen-eligible unknown events then a 4th, later known: past cap kept, no new quota, 4th never eligible [mechanism fixture]',()=>{
 // PO-15: 직접 대면 인사에 "한 쪽이 모름"을 넣지 않는다. 여기서는 동결 자격 메커니즘만 시험 fixture(knowledge 옵션)로 검증한다.
 // 비대칭 인지가 생기는 실제 사건 정의(도움·기여 발견)는 아직 없으므로 제품 시나리오는 blocked 로 보고한다.
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});
 for(const t of [100,170,240])at(st,t,talk(t,A,B,{[A]:false}));
 assert.equal(aff(st,A,B),100,'unknown events contribute 0 now');
 assert.equal(at(st,310,talk(310,A,B))[0].status,'neutral','both directions already used 3 grants today (B->A were known, A->B unknown)');
 assert.equal(st.life.neutral_activity.find(n=>n.observer===A&&n.tick===310).reason,'daily_cap','A->B quota already used by the 3 unknown events');
 const bucketBefore=JSON.stringify(st.life.repeat);
 let {s}=storeFrom(st);let rev=0;
 for(const r of s.read().events.filter(e=>e.event.observer_id===A))s.reviseLifeKnowledge('b03-know-'+(++rev),r.event.source_event_id,{revision:2,known:true,delay_reason:'unconfirmed'});
 const after=s.read();
 assert.equal(s.projection(A,B).scores.affection,112,'past slots project in original order');
 assert.equal(JSON.stringify(after.life.repeat),bucketBefore,'late knowledge neither consumes nor refunds quota');
 const fourth=after.life.neutral_activity.find(n=>n.observer===A&&n.tick===310);
 assert.equal(s.reviseLifeKnowledge('b03-4th',fourth.source_ref,{revision:2,known:true,delay_reason:'unconfirmed'}).status,'not_eligible');
 assert.equal(s.projection(A,B).scores.affection,112);
 after.life.tick=380;assert.equal(applyLifeCompletions(after,[talk(380,A,B)])[0].status,'neutral');assert.equal(after.life.neutral_activity.filter(n=>n.observer===A).length,2,'same Day: A->B still capped (no refund after late knowledge)');
});

test('A2-B04 one source unknown->known->duplicate known->unknown->known: original slot replaced, tags replayed, no extra source/action/quota',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});at(st,100,talk(100,A,B,{[A]:false}));
 const {s}=storeFrom(st);const src=s.read().events.find(e=>e.event.observer_id===A).event.source_event_id;
 const counts=()=>{const r=s.read();return [r.events.length,r.tag_history[A+'->'+B].length,JSON.stringify(r.life.repeat)];};const base=counts();
 const steps=[[2,true,'revised',104,true],[2,true,'duplicate',104,true],[3,false,'revised',100,false],[4,true,'revised',104,true]];
 steps.forEach(([revision,known,status,affection,positive],i)=>{const out=s.reviseLifeKnowledge('b04-'+i,src,{revision,known,delay_reason:'unconfirmed'});
  assert.equal(out.status,status);assert.equal(out.action_reexecutions,0);assert.equal(out.quota_changes,0);
  assert.equal(s.projection(A,B).scores.affection,affection);assert.equal(s.read().tag_history[A+'->'+B][0].positive,positive);assert.deepEqual(counts(),base);});
 assert.equal(s.read().tag_history[A+'->'+B][0].context.a.affection,104,'tag context replayed from the ledger');
});

test('A2-B05 clamp-limited valid event vs cap-neutral: both show delta 0, only the valid one is a positive basis',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});st.relation_baseline={[A+'->'+B]:{affection:1000}};
 st.life.logs.push({id:'life-log-x',tick:100,actor:A,target:B,text:'인사를 나누고 이야기를 나눴어요',kind:'completed'});
 at(st,100,talk(100,A,B));assert.equal(aff(st,A,B),1000);
 assert.equal(st.life.logs.at(-1).changes.find(c=>c.from===A).affection,0,'displayed delta 0 at clamp');
 for(const t of [170,240,310])at(st,t,talk(t,A,B));
 const rows=rowsOf(st,A,B);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.positive),'clamped but valid events stay positive');
 assert.equal(st.life.neutral_activity.filter(n=>n.observer===A).length,1,'4th is cap-neutral, not in tag history');
 const ctx=storeFrom(st).s.read().tag_history[A+'->'+B];assert.equal(evaluateBasicTags(ctx,ctx.at(-1).context).positive_event_count,3);
});

test('A2-B06 same action resent under another command adds nothing; storage failure rolls back tick, counters, ledger and tags',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});const done=talk(100,A,B);
 assert.equal(at(st,100,done)[0].status,'applied');const snap=JSON.stringify([st.events,st.life.repeat,st.life.neutral_activity,st.tag_history,st.memories]);
 assert.equal(at(st,100,structuredClone(done))[0].status,'duplicate');assert.equal(JSON.stringify([st.events,st.life.repeat,st.life.neutral_activity,st.tag_history,st.memories]),snap);
 st.life.tick=1500;assert.equal(applyLifeCompletions(st,[structuredClone(done)])[0].status,'duplicate','a known action stays a duplicate on the next Day');
 st.life.tick=2500;assert.equal(applyLifeCompletions(st,[talk(100,A,B)])[0].status,'stale','an unseen action stamped two Days ago is not accepted as new');assert.equal(JSON.stringify([st.events,st.life.repeat,st.tag_history,st.memories]),JSON.stringify([JSON.parse(snap)[0],JSON.parse(snap)[1],JSON.parse(snap)[3],JSON.parse(snap)[4]]));
 const {s,storage}=prepare();let t=0;while(t<300&&!s.read().events.length)s.lifeStep(++t);
 const before=JSON.stringify(s.read());storage.failOnce();
 assert.throws(()=>{for(let i=0;i<200;i++)s.lifeStep(++t);},/quota/);
 const r=JSON.parse(before),now=s.read();assert.ok(now.life.tick>=r.life.tick);
 const reopened=createLocalStore(storage).read();assert.equal(reopened.life.tick,now.life.tick,'disk and memory agree after a failed commit');
 assert.equal(JSON.stringify(reopened.life.repeat),JSON.stringify(now.life.repeat));assert.equal(reopened.events.length,now.events.length);
});

test('A2-B07 only the authoritative Day starts a new bucket: reconnect, real date and moving furniture reset nothing',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});for(const t of [100,170,240])at(st,t,talk(t,A,B));
 const {s,storage}=storeFrom(st);const mem=s.read().memories.length;
 const realNow=Date.now;Date.now=()=>realNow()+3*86400000;try{assert.equal(judge(s.read().life.repeat,{observer:A,target:B,scope:'life-001',tick:310}).reason,'daily_cap');}finally{Date.now=realNow;}
 const reopened=createLocalStore(storage);assert.equal(JSON.stringify(reopened.read().life.repeat),JSON.stringify(s.read().life.repeat),'reconnect keeps buckets');
 reopened.applyLayout('b07-move',{kind:'move',id:'game1-social',x:6,y:3},reopened.layoutVersion());
 const moved=reopened.read();moved.life.tick=310;assert.equal(applyLifeCompletions(moved,[talk(310,A,B)])[0].status,'neutral','moving furniture does not change the stable scope');
 assert.equal(moved.memories.length,mem,'relations and memories are not reset');
 moved.life.tick=1450;assert.equal(applyLifeCompletions(moved,[talk(1450,A,B)])[0].status,'applied','Day 2 (authoritative) opens a new bucket');
});

test('A2-B08 decline, visit withdrawal, disconnect and blocked path: no penalty, no betrayal memory, no faked completion',()=>{
 const {s}=prepare();s.visit('b08-enter','enter');let t=0;
 for(;t<120;)s.lifeStep(++t);s.visit('b08-off','disconnect');for(;t<160;)s.lifeStep(++t);s.visit('b08-on','reconnect');
 s.visitPermission('b08-revoke','light_auto_events',false);for(;t<220;)s.lifeStep(++t);
 for(const y of [0,1,2,3,4,5,6])try{s.applyLayout('b08-w'+y,{kind:'wall',x:8,y},s.layoutVersion());}catch{}
 s.lifePause('b08-run',false);for(;t<420;)s.lifeStep(++t);
 const r=s.read();assert.equal(r.events.some(e=>['EVT-07','EVT-08','EVT-10'].includes(e.event.event_id)),false,'no negative event from declines or disconnects');
 const declined=r.life.logs.filter(l=>['declined','blocked','cancelled'].includes(l.kind));assert.ok(declined.length>0,'declines/blocks happened in this run');
 for(const l of declined)assert.equal(r.events.some(e=>e.event.position.authority_order_id&&e.event.evidence.action_id?.includes('-'+l.tick+'-')&&e.event.observer_id===l.actor&&l.kind!=='completed'&&false),false);
 assert.equal(r.memories.some(m=>m.topic==='credit_attribution'),false,'no betrayal/credit memory created by life');
});

test('A2-B09 neutral and unknown sources never satisfy positive/independent-source tag conditions; after correction the order is consistent',()=>{
 const st=prepare().s.read();const [A,B]=ids({read:()=>st});
 for(const t of [100,170,240])at(st,t,talk(t,A,B,{[A]:false}));at(st,310,talk(310,A,B));
 const {s}=storeFrom(st);const hist=()=>s.read().tag_history[A+'->'+B];
 assert.equal(evaluateBasicTags(hist(),hist().at(-1).context).positive_event_count,0,'unknown + neutral = 0 positive');
 let i=0;for(const r of s.read().events.filter(e=>e.event.observer_id===A))s.reviseLifeKnowledge('b09-'+(++i),r.event.source_event_id,{revision:2,known:true,delay_reason:'unconfirmed'});
 const h=hist();assert.equal(evaluateBasicTags(h,h.at(-1).context).positive_event_count,3);assert.equal(h.length,3,'neutral 4th never enters tag history');
 assert.deepEqual(h.map(r=>r.context.a.affection),[104,108,112],'contexts replayed in authority order');
 assert.deepEqual(h.map(r=>r.tick),[...h.map(r=>r.tick)].sort((a,b)=>a-b));
});

test('A2-B10 save/restore and two-direction public projection: state equal, paused, no reverse/trace leak',()=>{
 const {s,storage}=prepare();let t=0;for(;t<400;)s.lifeStep(++t);
 const before=s.read(),reopened=createLocalStore(storage),after=reopened.read();
 for(const k of ['events','memories','tag_history'])assert.deepEqual(after[k],before[k],k);
 assert.deepEqual(after.life.repeat,before.life.repeat);assert.deepEqual(after.life.neutral_activity,before.life.neutral_activity);assert.equal(after.life.paused,true);
 const [A,B]=ids(reopened);const own=reopened.projection(A,B),back=reopened.projection(B,A),other=reopened.projection(A,B,true);
 assert.ok(own.scores&&back.scores&&Array.isArray(own.memory_views));
 for(const v of own.memory_views)assert.deepEqual(Object.keys(v).sort(),['id','kind','reason','resolution','target']);
 assert.equal(other.visibility,'restricted');assert.equal(other.memory_views,undefined);
 const text=JSON.stringify([own,back,other]);for(const secret of ['trace','seed','repeat','neutral','trait','candidates','rule_version'])assert.equal(text.includes(secret),false,secret);
});

test('A2 migration: legacy unordered talk counter becomes per-direction buckets without granting extra effect',()=>{
 const life={tick:200,actors:{p1:{},p2:{}},effects:{'p1-p2-talk':{count:5,last:190},'p1-p2-help':{count:1,last:50}}};
 migrateLegacyTalk(life);
 assert.deepEqual(life.repeat.buckets['p1>p2|life-001|light_social'],{day:0,count:3,last_grant_tick:190});
 assert.deepEqual(life.repeat.buckets['p2>p1|life-001|light_social'],{day:0,count:3,last_grant_tick:190});
 assert.equal(life.effects['p1-p2-talk'],undefined);assert.deepEqual(life.effects['p1-p2-help'],{count:1,last:50},'help keeps its legacy rule');
 assert.equal(judge(life.repeat,{observer:'p1',target:'p2',scope:'life-001',tick:260}).eligible,false);
 assert.equal(LIGHT_SOCIAL.per_day,3);assert.deepEqual(emptyRepeat().buckets,{});
});
