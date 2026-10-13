// 새 월드 시작 관계 편차(PO-DEC-004 §2): 애정·신뢰·존중만 ±20, 방향별, 한 번 생성·저장, 사건·기억·태그 없음, 기존 저장본 불변.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,STORE_KEY,INIT_RULE} from '../prototype/store.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
const disk=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),m};};
function make(opts){const d=disk(),s=createLocalStore(d,opts);for(let i=0;i<3;i++)s.createPawn('init-'+i,'p'+i,art,DEFAULT_AXES);return {s,d};}

test('new world: emotion axes start within ±20 per direction, structural axes stay default, no events/memories/tags',()=>{
 const {s}=make({initialSpread:true}),st=s.read(),ids=st.pawns.map(p=>p.id);
 assert.equal(st.init_rule,INIT_RULE);assert.equal(Object.keys(st.relation_baseline).length,6);
 for(const a of ids)for(const b of ids){if(a===b)continue;const sc=s.projection(a,b).scores;
  assert.ok(Math.abs(sc.affection-100)<=20&&Math.abs(sc.trust-300)<=20&&Math.abs(sc.respect-300)<=20);
  assert.deepEqual([sc.dependence,sc.power,sc.reciprocity,sc.obligation,sc.conflict],[1,500,500,1,1]);}
 assert.equal(st.events.length,0);assert.equal(st.memories.length,0);assert.deepEqual(st.tag_history,{});
 const values=new Set(Object.values(st.relation_baseline).map(v=>JSON.stringify(v)));assert.ok(values.size>1,'directions differ');
});
test('spread is generated once: reload, appearance/trait edits and Day changes do not re-draw it',()=>{
 const {s,d}=make({initialSpread:true}),before=JSON.stringify(s.read().relation_baseline),p=s.read().pawns[0];
 s.updatePawn('init-edit',p.id,'새이름',art,{...DEFAULT_AXES,closeness_orientation:'high'});for(let t=1;t<=5;t++)s.lifeStep(t);
 assert.equal(JSON.stringify(createLocalStore(d).read().relation_baseline),before);
});
test('existing saves and fixtures without the rule keep the old defaults',()=>{
 const {s}=make({}),st=s.read();assert.equal(st.init_rule,undefined);assert.equal(st.relation_baseline,undefined);
 const sc=s.projection(st.pawns[0].id,st.pawns[1].id).scores;assert.deepEqual([sc.affection,sc.trust,sc.respect],[100,300,300]);
 const raw=disk();raw.setItem(STORE_KEY,JSON.stringify(st));const reopened=createLocalStore(raw,{initialSpread:true});assert.equal(reopened.read().init_rule,undefined,'an existing world is not converted');
});
