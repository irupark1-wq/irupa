// 성격 카드 첫 4종 G-PERS-1(PO-HAND-016 §3, PO-PERS-002 v1.1, PERS-SYS-001 v1.0 시험안). 범위: 저장·합성·후보 점수·생활 선택 비교(로컬 시뮬레이션).
// 화면 장면(PERS-C01~12 의 실제 장면)은 브라우저 증거로 따로 기록한다. 새 행동(G-PERS-2)은 아직 없다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,STORE_KEY,CARD_IDS,nextCards} from '../prototype/store.js';
import {cardDelta,candidates,initialLife,actorState,CARD_SCORES,CARD_RULE_ACTIVE} from '../prototype/life.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
const disk=()=>{const m=new Map();let fail=false;return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{if(fail&&k===STORE_KEY){fail=false;throw Error('disk.full');}m.set(k,v);},failNext:()=>fail=true,m};};
const KINDS=[...Object.keys(CARD_SCORES),'record','read_board','deliver','correct_record'];
const subsets=(xs)=>xs.reduce((a,x)=>a.concat(a.map(s=>[...s,x])),[[]]);
const perms=(xs)=>xs.length<2?[xs]:xs.flatMap((x,i)=>perms([...xs.slice(0,i),...xs.slice(i+1)]).map(p=>[x,...p]));
const rel=()=>({affection:100,conflict:0,respect:300,trust:300});
const P=(id,cards)=>({id,trait:{axis_values:DEFAULT_AXES},cards:cards?nextCards(null,cards,1):undefined});
function world(cards=[null,null,null],step=1){const d=disk(),s=createLocalStore(d);for(let i=0;i<3;i++)s.createPawn('pc-'+i,['모래','밤','노을'][i],art,DEFAULT_AXES,undefined,cards[i]);s.lifePause('pc-go',false);if(step)s.lifeStep(1);return {s,d,ids:s.read().pawns.map(p=>p.id)};}
function chosenKinds(s,id,ticks){const seen=new Set(),count={};for(let t=s.life().tick+1;t<=ticks;t++){s.lifeStep(t);for(const e of s.life().trace)if(e.actor===id&&!seen.has(e.intent_id)){seen.add(e.intent_id);count[e.chosen.kind]=(count[e.chosen.kind]||0)+1;}}return count;}
const total=(c)=>Object.values(c).reduce((x,y)=>x+y,0);

test('PERS-C06 합성: 명세 예시값, 15세트 모두 순서와 무관, ±14 상한, 표에 없는 후보는 0',()=>{
 assert.equal(cardDelta(['kind','independent'],'meet'),-5); // -8 + 6/2
 assert.equal(cardDelta(['kind','hot_tempered','stubborn'],'credit_check'),14); // 12 + 3/2 + 3/4 = 14.25 → 14
 assert.equal(cardDelta(['independent'],'rest'),12);
 assert.equal(cardDelta(['kind','independent'],'social'),-3); // -5 + 4/2
 assert.equal(cardDelta([],'rest'),0);assert.equal(cardDelta(null,'meet'),0);
 const sets=subsets(CARD_IDS).filter(s=>s.length<=3);assert.equal(sets.length,15);
 for(const set of sets)for(const kind of KINDS){const v=cardDelta(set,kind);assert.ok(Number.isInteger(v)&&Math.abs(v)<=14,set+' '+kind);for(const p of perms(set))assert.equal(cardDelta(p,kind),v,'order '+p+' '+kind);}
 for(const kind of ['record','read_board','deliver','correct_record'])assert.equal(cardDelta(CARD_IDS.slice(0,3),kind),0);
});

test('PERS-C06 저장: 0~3장, 중복·4장·미지원 거절, 정렬 저장, 같은 세트면 버전 유지',()=>{
 assert.throws(()=>nextCards(null,['kind','kind'],1),/cards.invalid/);
 assert.throws(()=>nextCards(null,CARD_IDS,1),/cards.invalid/);
 assert.throws(()=>nextCards(null,['sociable'],1),/cards.invalid/);
 const c=nextCards(null,['stubborn','kind'],5);assert.deepEqual(c.card_ids,['kind','stubborn']);assert.equal(c.active,true);assert.equal(c.rule_version,CARD_RULE_ACTIVE);assert.equal(c.effective_from_order,5);
 assert.equal(nextCards(c,['kind','stubborn'],9),c,'same set keeps version');
 const off=nextCards(c,[],9);assert.equal(off.active,false);assert.equal(off.profile_version,2);
 const {s}=world([['kind','independent'],[],null],0);const ps=s.read().pawns;
 assert.deepEqual(ps[0].cards.card_ids,['independent','kind']);assert.equal(ps[0].cards.active,true);
 assert.deepEqual(ps[1].cards.card_ids,[]);assert.deepEqual(ps[2].cards.card_ids,[],'no automatic cards');
});

test('PERS-C01 네 카드 각각 켜면 최소 1개 유효 후보의 점수가 달라진다(보정은 기본 점수 뒤)',()=>{
 for(const id of CARD_IDS)assert.ok(KINDS.some(k=>cardDelta([id],k)!==0),id);
 const L=initialLife();L.actors={a:{...actorState(0),x:2,y:2,tired:20,activity:60},b:{...actorState(1),x:6,y:2,mode:'working'}};
 const base=candidates(structuredClone(L),'a',[P('a'),P('b')],rel);
 for(const id of ['kind','independent']){const withCard=candidates(structuredClone(L),'a',[P('a',[id]),P('b')],rel);
  let changed=0;for(const c of withCard){const b=base.find(x=>x.kind===c.kind&&x.place===c.place&&x.target===c.target);assert.equal(c.base_score,b.score,'base score untouched');assert.equal(c.score,b.score+c.card_delta);if(c.card_delta)changed++;}
  assert.ok(changed>0,id);}
 assert.ok(base.every(c=>!('card_delta' in c)),'no-card candidates have no card fields');
 // 욱하는·고집 센: 지금 게임에서 바뀌는 후보는 '기록 확인 부탁'(본인이 누락을 알 때만 생김)
 const ask={checkFor:()=>({to:'b',issue_id:'issue-1'})};
 const noAsk=candidates(structuredClone(L),'a',[P('a',['hot_tempered']),P('b')],rel);assert.ok(!noAsk.some(c=>c.kind==='credit_check'),'no record known → no ask');
 const q=candidates(structuredClone(L),'a',[P('a',['hot_tempered']),P('b')],rel,ask).find(c=>c.kind==='credit_check');assert.equal(q.card_delta,12);
 const f=candidates(structuredClone(L),'a',[P('a',['stubborn']),P('b')],rel,ask).find(c=>c.kind==='credit_check');assert.equal(f.card_delta,3);
});

test('PERS-C05 카드는 부적격 후보를 살리지 않는다: 피곤하면 다정한 폰도 도움 후보 없음',()=>{
 const L=initialLife();L.actors={a:{...actorState(0),x:2,y:2,tired:80},b:{...actorState(1),x:6,y:2,mode:'working'}};
 assert.ok(!candidates(L,'a',[P('a',['kind']),P('b')],rel).some(c=>c.kind==='assist'));
 L.actors.a.tired=20;const ok=candidates(L,'a',[P('a',['kind']),P('b')],rel).find(c=>c.kind==='assist');assert.equal(ok.card_delta,11);
});

test('무카드 회귀: 카드 칸을 비워 만든 월드와 예전 방식 월드의 생활이 같다',()=>{
 const a=world([null,null,null]),b=world([[],[],[]]);
 for(let t=2;t<=400;t++){a.s.lifeStep(t);b.s.lifeStep(t);}
 assert.deepEqual(b.s.life().actors,a.s.life().actors);assert.deepEqual(b.s.life().trace,a.s.life().trace);
 assert.equal(JSON.stringify(b.s.read().events),JSON.stringify(a.s.read().events));
});

test('PERS-C01 생활 비교: 같은 월드·seed 에서 독립적인 카드만 켜면 혼자 쉬기·작업 비율이 늘고 만남·이야기는 늘지 않는다',()=>{
 const off=world([null,null,null]),on=world([['independent'],null,null]);
 const A=chosenKinds(off.s,off.ids[0],1500),B=chosenKinds(on.s,on.ids[0],1500);
 const solo=c=>(c.rest||0)+(c.work||0),social=c=>(c.meet||0)+(c.social||0);
 assert.ok(solo(B)/total(B)>solo(A)/total(A),JSON.stringify({A,B}));
 assert.ok(social(B)/total(B)<=social(A)/total(A),JSON.stringify({A,B}));
});

test('PERS-C08·C09 카드 바꾸기: 관계·기억·지난 기록은 그대로, 다음 선택부터 적용, 저장 실패면 전부 원래대로',()=>{
 const {s,d,ids}=world();for(let t=2;t<=300;t++)s.lifeStep(t);
 const before=s.read(),p=before.pawns[0],relBefore=JSON.stringify(s.projection(ids[0],ids[1]).scores),trace=JSON.stringify(s.life().trace);
 d.failNext();assert.throws(()=>s.updatePawn('pc-edit-fail',p.id,p.name,p.appearance,p.trait.axis_values,undefined,['hot_tempered']));
 assert.deepEqual(s.read(),before,'rollback');
 s.updatePawn('pc-edit',p.id,p.name,p.appearance,p.trait.axis_values,undefined,['hot_tempered','stubborn']);
 const after=s.read();assert.deepEqual(after.pawns[0].cards.card_ids,['hot_tempered','stubborn']);assert.equal(after.pawns[0].cards.profile_version,2);
 assert.ok(after.pawns[0].cards.effective_from_order>before.authority);
 assert.equal(JSON.stringify(s.projection(ids[0],ids[1]).scores),relBefore,'no relation change from a card edit');
 assert.equal(JSON.stringify(s.life().trace),trace,'past trace untouched');
 assert.deepEqual(after.events,before.events);assert.deepEqual(after.memories,before.memories);
 const re=createLocalStore(d);assert.deepEqual(re.read().pawns[0].cards,after.pawns[0].cards,'reload keeps cards');
 for(let t=301;t<=500;t++)s.lifeStep(t);const mine=s.life().trace.filter(e=>e.actor===p.id&&e.tick>300);
 assert.ok(mine.length&&mine.every(e=>e.cards?.card_ids.join()==='hot_tempered,stubborn'),'new choices carry the card snapshot');
});

test('PERS-C09 모르는 규칙 버전이나 맞지 않는 카드 칸이 든 저장본은 열지 않는다',()=>{
 const {d}=world([['kind'],null,null],0);const raw=JSON.parse(d.m.get(STORE_KEY));
 raw.pawns[0].cards.rule_version='game1-cards-score-v9';d.m.set(STORE_KEY,JSON.stringify(raw));assert.throws(()=>createLocalStore(d),/invalid_cards/);
 raw.pawns[0].cards.rule_version=CARD_RULE_ACTIVE;raw.pawns[0].cards.active=false;d.m.set(STORE_KEY,JSON.stringify(raw));assert.throws(()=>createLocalStore(d),/invalid_cards/);
});
