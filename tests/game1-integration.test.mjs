import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,STORE_KEY} from '../prototype/store.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
import {TEST_READY} from '../prototype/core/game1-workshop.js';
import {evaluateBasicTags,BASIC_TAGS} from '../prototype/core/game1-tags.js';
import {readFileSync} from 'node:fs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const appearance={layers:{back_hair:'',base:'',eyes_pair:'',mouth:'',front_hair:'',frame_accessory:''},transforms:{}};
function prepare(){const disk=storage(),s=createLocalStore(disk);for(const [i,name]of ['모래','밤','노을'].entries())s.createPawn('create-'+i,name,appearance,DEFAULT_AXES);s.begin('begin-001');return {s,disk};}
const paths=JSON.parse(readFileSync(new URL('../fixtures/game1-workshop-design-v05.json',import.meta.url),'utf8')).nominal_paths;
for(const path of paths)test('local-pipeline:'+path.id+' persisted cost/ledger and reopen',()=>{
 const {s,disk}=prepare();path.selection_code.split('-').forEach((c,i)=>s.submit('path-'+i,c));const state=s.read();assert.deepEqual(createLocalStore(disk).read(),state);
 assert.deepEqual(s.workshop().test_balance,{work_time:5-path.nominal_cost_fixture_points.work_time,material:3-path.nominal_cost_fixture_points.material});
 assert.equal(state.events.some(r=>r.event.event_id==='EVT-10'||r.event.event_id==='EVT-12'),false);
 const before=s.read();s.submit('path-0',path.selection_code.split('-')[0]);assert.deepEqual(s.read(),before);
});
for(const [id,codes]of [['trait-rel:A-WRK-01',['C','H','P']],['trait-rel:A-WRK-02',['D','A','E']],['trait-rel:A-WRK-03',['V','R','S']]])test(id+' persisted pipeline not effects-only',()=>{
 const {s,disk}=prepare();codes.forEach((c,i)=>s.submit('action-'+i,c));const before=s.read(),reopened=createLocalStore(disk);assert.deepEqual(reopened.read(),before);
 const [a,b]=before.pawns;assert.deepEqual(reopened.projection(a.id,b.id),s.projection(a.id,b.id));assert.deepEqual(reopened.projection(b.id,a.id),s.projection(b.id,a.id));
 assert.equal(before.events.some(r=>r.event.event_id==='EVT-12'),false);
 if(codes[0]==='C'){assert.equal(before.events.length,2);assert.equal(s.projection(b.id,a.id).scores.respect,315);assert.equal(s.projection(a.id,b.id).scores.affection,110);}
 if(codes[1]==='A')assert.equal(s.projection(a.id,b.id).scores.dependence,241);
 if(codes[2]==='S')assert.equal(s.projection(a.id,b.id).scores.obligation,1);
});
test('trait-rel:A-SLICE-03/04/05/06 repair mutates only exact conflict and keeps memory',()=>{
 const {s,disk}=prepare();s.submit('correct','C');const before=s.read();const action=before.events[0].event.evidence.action_id;
 assert.throws(()=>s.repair('bad-duplicate',{action_id:action,accepted:true,executed:true}));assert.deepEqual(s.read(),before);
 assert.throws(()=>s.repair('bad-scope',{scope_id:'order-002',conflict_id:'credit-002',accepted:true,executed:true}));
 s.repair('repair-001',{accepted:true,executed:true});const next=s.read();assert.equal(next.structures.conflicts.find(c=>c.id==='credit-001').state,'resolved');
 assert.equal(next.structures.conflicts.find(c=>c.id==='credit-002').severity,500);assert.equal(next.memories.length,2);assert.equal(next.memories[0].resolution,'resolved');
 assert.deepEqual(createLocalStore(disk).read(),next);assert.equal(s.projection(next.pawns[1].id,next.pawns[0].id).scores.conflict,500); // Other order still open.
});
test('trait-rel:A-SAVE-01 storage failure atomic, command replay, conflict and trait snapshots',()=>{
 const {s,disk}=prepare();const before=s.read();const original=disk.setItem;disk.setItem=()=>{throw Error('disk-full');};assert.throws(()=>s.submit('correct','C'),/disk-full/);assert.deepEqual(s.read(),before);
 disk.setItem=original;const r=s.submit('correct','C');const committed=s.read();assert.deepEqual(s.submit('correct','C'),r);assert.deepEqual(s.read(),committed);
 const pawn=committed.pawns[1];const old=committed.events[0].event.trait_snapshot;s.saveTraits('traits-001',pawn.id,{...DEFAULT_AXES,fairness_sensitivity:'high'});
 assert.deepEqual(s.read().events[0].event.trait_snapshot,old);assert.equal(s.projection(pawn.id,committed.pawns[0].id).scores.reciprocity,518);
 const other=createLocalStore(disk);other.saveTraits('traits-002',pawn.id,DEFAULT_AXES);assert.throws(()=>s.submit('help','H'),/version_conflict/);
 assert.ok(disk.getItem(STORE_KEY));
});
test('trait-rel:A-PRIV-01 internal trace absent from display and persisted pause has no effect',()=>{
 const {s,disk}=prepare();const before=s.read();s.submit('paused','C',{...TEST_READY,connected:false});assert.equal(createLocalStore(disk).workshop().status,'paused');assert.deepEqual(s.read().events,before.events);
 const [a,b]=s.read().pawns;const dto=s.projection(a.id,b.id,true);assert.deepEqual(dto,{visibility:'restricted',scores:null,reason_key:'relationship.restricted',allowed_actions:[]});
 const own=s.projection(a.id,b.id);assert.equal(own.trace,undefined);assert.equal(own.trait_snapshot,undefined);assert.equal(own.revision,undefined);
});
const sc={affection:700,trust:700,respect:750,reciprocity:600,dependence:700,obligation:700,conflict:1};
const ctx=(changes={})=>({a:{...sc},b:{...sc},role:true,competition:true,major_betrayal:false,hostile:true,reverse_hostile:true,attachment:true,wound:true,repeat_reason:true,friend_history:true,related_conflict:false,blocked:false,...changes});
function history(c,n=3,positive=true){return Array.from({length:n},(_,i)=>({source_event_id:'event-'+i,tick:i+1,positive,context:c}));}
test('trait-rel:A-TAG-01/02 distinct source, same tick and three positives independently required',()=>{
 const c=ctx();assert.equal(evaluateBasicTags(history(c,2),c).tags.some(t=>t.tag_id==='comfortable_friend'),false);
 assert.equal(evaluateBasicTags(history(c,3),c).tags.some(t=>t.tag_id==='comfortable_friend'),true);
 const first=history(c,1);assert.equal(evaluateBasicTags([...first,...first],c).source_count,1);
 assert.equal(evaluateBasicTags([...first,{...first[0],source_event_id:'other'}],c).source_count,1);
});
test('trait-rel:A-TAG-03/04 role termination immediate, eight basics, experimental namespace excluded',()=>{
 const c=ctx(),h=history(c);const tags=evaluateBasicTags(h,c);assert.equal(BASIC_TAGS.length,8);assert.ok(tags.tags.some(t=>t.tag_id==='trusted_colleague'));
 const ended=evaluateBasicTags(h,{...c,role:false});assert.equal(ended.tags.some(t=>t.tag_id==='trusted_colleague'),false);assert.equal(ended.namespace,'v01_original');assert.deepEqual(h,history(c));
 assert.equal(evaluateBasicTags(h,{...c,blocked:true}).tags.length,0);
});
test('eight basic tag enter thresholds and two-source emotional exit',()=>{
 const examples=[ctx(),ctx(),ctx(),ctx({a:{...sc,affection:200}}),ctx({a:{...sc,affection:200}}),ctx({a:{...sc,conflict:700}}),ctx({a:{...sc,affection:200,conflict:700},b:{...sc,affection:200,conflict:700}}),ctx({a:{...sc,reciprocity:300},related_conflict:true})];
 BASIC_TAGS.forEach((id,i)=>{const c=examples[i],h=history(c,3);assert.ok(evaluateBasicTags(h,c).tags.some(t=>t.tag_id===id),id);const exit=ctx({a:{affection:450,trust:400,respect:500,reciprocity:600,dependence:1,obligation:1,conflict:1},b:{affection:450,trust:400,respect:500,reciprocity:600,dependence:1,obligation:1,conflict:1},hostile:false,wound:false,related_conflict:false});h.push({source_event_id:'exit-1',tick:4,positive:false,context:exit},{source_event_id:'exit-2',tick:5,positive:false,context:exit});assert.equal(evaluateBasicTags(h,exit).tags.some(t=>t.tag_id===id),false,id+' exit');});
 const c=ctx(),bad=ctx({a:{...sc,trust:400}}),h=history(c);h.push({source_event_id:'bad-1',tick:4,positive:false,context:bad});assert.ok(evaluateBasicTags(h,bad).tags.some(t=>t.tag_id==='comfortable_friend'));
 h.push({source_event_id:'bad-2',tick:5,positive:false,context:bad});assert.equal(evaluateBasicTags(h,bad).tags.some(t=>t.tag_id==='comfortable_friend'),false);
});
