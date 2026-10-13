// A1 공간 정합(PO-14 §5) 자동 검사. 각 test 이름의 A1-NN 은 PO-14 표의 ID 와 같다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore} from '../prototype/store.js';
import {PRESETS} from '../prototype/core/game1-traits.js';
import {route,initialLife} from '../prototype/life.js';
import {evaluateLayout,connectivity,WALL_LIMIT} from '../prototype/layout.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
function disk(){const m=new Map();let failNext=false;return {getItem:k=>m.get(k)||null,setItem:(k,v)=>{if(failNext){failNext=false;throw Error('quota');}m.set(k,v);},failOnce(){failNext=true;}};}
function prepare(){const storage=disk(),s=createLocalStore(storage);const ids=['7c055526-e647-4059-85ca-cd0c91211941','9f76928c-009d-457e-9038-772fc02c43c2','ac8e4096-128e-4a78-b2e5-36f339a5950a'];for(let i=0;i<3;i++)s.createPawn(ids[i],['모래','밤','노을'][i],art,PRESETS[i].axis_values);return {s,storage};}
const snap=s=>JSON.stringify(s.read());
const place=(s,id)=>s.life().places.find(p=>p.id===id);
let n=0;const cmd=()=>'a1-cmd-'+(++n);

test('A1-01 initial layout: three open places reachable, pawns on free floor, no overlap',()=>{
 const {s}=prepare(),life=s.life();
 assert.deepEqual(life.places.map(p=>[p.id,p.x,p.y,p.blocked]),[['game1-rest',2,2,false],['game1-work',9,2,false],['game1-social',6,5,false]]);
 const standing=[{id:'a',x:3,y:6},{id:'b',x:5,y:6},{id:'c',x:7,y:6}];
 assert.equal(connectivity(life.places,life.walls,standing).ok,true);
 assert.equal(life.layout_version,0);
});

test('A1-02 preview then cancel leaves layout, save, relations and memories unchanged',()=>{
 const {s}=prepare();for(let t=1;t<=40;t++)s.lifeStep(t);const before=snap(s);
 const cell=[...Array(96).keys()].map(i=>({x:i%12,y:Math.floor(i/12)})).find(c=>s.previewLayout({kind:'move',id:'game1-work',...c}).action==='move');
 assert.ok(cell);const verdict=s.previewLayout({kind:'move',id:'game1-work',...cell});
 assert.equal(verdict.ok,true);assert.equal(verdict.action,'move');
 assert.equal(snap(s),before,'preview must not commit');
});

test('A1-03 moving the workbench applies the new route, stops work at the old spot without a completed event',()=>{
 const {s}=prepare();let t=0,worker=null;
 while(t<400&&!worker){s.lifeStep(++t);worker=Object.entries(s.life().actors).find(([,a])=>a.mode==='working'&&a.goal?.place==='game1-work');}
 assert.ok(worker,'a pawn starts working within 400 ticks');
 const [id]=worker,eventsBefore=s.read().events.length;
 const r=s.applyLayout(cmd(),{kind:'move',id:'game1-work',x:10,y:5},s.layoutVersion());
 assert.equal(r.action,'move');assert.ok(r.stopped.includes(id));
 const a=s.life().actors[id];assert.equal(a.mode,'idle');assert.equal(a.goal,null);
 assert.equal(s.read().events.length,eventsBefore,'stopping creates no relationship event');
 assert.ok(s.life().logs.some(l=>l.actor===id&&l.kind==='cancelled'));
 assert.equal(s.life().logs.filter(l=>l.tick===t&&l.actor===id&&l.kind==='completed').length,0);
 let reached=false;for(let i=0;i<400&&!reached;i++){s.lifeStep(++t);reached=Object.values(s.life().actors).some(a=>a.x===10&&a.y===5&&a.mode==='working');}
 assert.ok(reached,'pawns work at the new workbench cell');
});

test('A1-04 out of bounds, overlap and pawn cell are rejected with reasons and the save is unchanged',()=>{
 const {s}=prepare();s.lifeStep(1);s.applyLayout(cmd(),{kind:'wall',x:0,y:0},0);const before=snap(s),v=s.layoutVersion();
 const pawn=Object.values(s.life().actors)[0];
 for(const [edit,reason] of [
  [{kind:'move',id:'game1-work',x:12,y:2},'out_of_bounds'],[{kind:'move',id:'game1-work',x:-1,y:0},'out_of_bounds'],
  [{kind:'move',id:'game1-work',x:2,y:2},'overlap'],[{kind:'move',id:'game1-work',x:0,y:0},'overlap'],
  [{kind:'wall',x:6,y:5},'overlap'],[{kind:'move',id:'game1-work',x:pawn.x,y:pawn.y},'pawn_cell'],[{kind:'wall',x:pawn.x,y:pawn.y},'pawn_cell']]){
  assert.equal(s.previewLayout(edit).reason,reason,JSON.stringify(edit));
  assert.throws(()=>s.applyLayout(cmd(),edit,v),new RegExp('layout\\.'+reason));
 }
 assert.equal(snap(s),before);
});

test('A1-05 a wall that closes the passage is rejected; a wall that leaves a detour is accepted and changes the route',()=>{
 const {s}=prepare();let v=0;
 // x=8 column between the pawns(3..7) and the workbench(9,2): leave y=7 open
 for(let y=0;y<7;y++)s.applyLayout(cmd(),{kind:'wall',x:8,y},v++);
 const before=snap(s);
 assert.equal(s.previewLayout({kind:'wall',x:8,y:7}).reason,'path_blocked');
 assert.throws(()=>s.applyLayout(cmd(),{kind:'wall',x:8,y:7},v),/layout\.path_blocked/);
 assert.equal(snap(s),before);
 const life=s.life(),path=route(life,{x:7,y:2},{x:9,y:2});
 assert.ok(path&&path.length>2,'detour through y=7 is used');assert.ok(path.some(p=>p.y===7));
});

test('A1-05b trapping a pawn or isolating an open place is rejected; a pawn standing in a gap is not a wall',()=>{
 const {s}=prepare();let v=0;
 for(const [x,y] of [[2,6],[4,6],[3,5]])s.applyLayout(cmd(),{kind:'wall',x,y},v++);
 assert.throws(()=>s.applyLayout(cmd(),{kind:'wall',x:3,y:7},v),/layout\.path_blocked/);
 for(const [x,y] of [[1,2],[3,2],[2,1]])s.applyLayout(cmd(),{kind:'wall',x,y},v++);
 assert.throws(()=>s.applyLayout(cmd(),{kind:'wall',x:2,y:3},v),/layout\.path_blocked/);
 const p2=prepare().s;let w=0;
 for(const y of [0,1,2,3,4,5,7])p2.applyLayout(cmd(),{kind:'wall',x:5,y},w++);
 assert.equal(p2.life().walls.length,7,'the gap at (5,6) is occupied only by a pawn and still counts as a passage');
});

test('A1-06 closing a place stops the activity there without completion or penalty; reopening restores it',()=>{
 const {s}=prepare();let t=0,rester=null;
 while(t<400&&!rester){s.lifeStep(++t);rester=Object.entries(s.life().actors).find(([,a])=>['resting','moving'].includes(a.mode)&&a.goal?.place==='game1-rest');}
 assert.ok(rester);const [id]=rester,events=s.read().events.length,memories=s.read().memories.length;
 const r=s.applyLayout(cmd(),{kind:'close',id:'game1-rest',blocked:true},s.layoutVersion());
 assert.equal(r.action,'close');assert.ok(r.stopped.includes(id));assert.equal(s.life().actors[id].mode,'idle');
 for(let i=0;i<60;i++)s.lifeStep(++t);
 assert.equal(Object.values(s.life().actors).some(a=>a.mode==='resting'),false,'nobody rests at a closed place');
 assert.equal(s.read().events.slice(events).some(r=>r.event.observer_id===id&&r.event.event_id!=='EVT-01'&&r.event.event_id!=='EVT-04'),false);
 assert.ok(s.read().memories.length>=memories);
 assert.equal(s.applyLayout(cmd(),{kind:'close',id:'game1-rest',blocked:false},s.layoutVersion()).action,'open');
 assert.equal(place(s,'game1-rest').blocked,false);
});

test('A1-07 wall count matches collisions, the 31st wall is rejected, removal restores the route',()=>{
 const {s}=prepare();let v=0;const cells=[];
 for(let y=0;y<8&&cells.length<WALL_LIMIT;y+=2)for(let x=0;x<12&&cells.length<WALL_LIMIT;x++){if(s.previewLayout({kind:'wall',x,y}).ok){s.applyLayout(cmd(),{kind:'wall',x,y},v++);cells.push([x,y]);}}
 assert.equal(s.life().walls.length,WALL_LIMIT);
 const free=[...Array(96).keys()].map(i=>({x:i%12,y:Math.floor(i/12)})).find(c=>!s.life().walls.some(w=>w.x===c.x&&w.y===c.y)&&!s.life().places.some(p=>p.x===c.x&&p.y===c.y)&&s.previewLayout({kind:'wall',...c}).reason!=='pawn_cell');
 assert.equal(s.previewLayout({kind:'wall',...free}).reason,'wall_limit');
 assert.throws(()=>s.applyLayout(cmd(),{kind:'wall',...free},v),/layout\.wall_limit/);
 const [x,y]=cells[0];assert.equal(s.applyLayout(cmd(),{kind:'wall',x,y},v++).action,'remove_wall');
 assert.equal(s.life().walls.length,WALL_LIMIT-1);
 assert.notEqual(route(s.life(),{x,y:y+1},{x,y}),null,'removed wall cell is walkable again');
});

test('A1-08 storage failure keeps the original, retry applies once; stale layout version is a conflict, never an overwrite',()=>{
 const {s,storage}=prepare();const before=snap(s),edit={kind:'move',id:'game1-social',x:6,y:3};
 storage.failOnce();
 assert.throws(()=>s.applyLayout('a1-retry',edit,0),/quota/);
 assert.equal(snap(s),before);assert.equal(s.layoutVersion(),0);
 const first=s.applyLayout('a1-retry',edit,0);assert.equal(first.layout_version,1);
 const again=s.applyLayout('a1-retry',edit,0);assert.deepEqual(again,first,'resend of the same command is not applied twice');
 assert.equal(s.layoutVersion(),1);
 const mid=snap(s);
 assert.throws(()=>s.applyLayout(cmd(),{kind:'move',id:'game1-social',x:6,y:4},0),/layout\.version_conflict/);
 assert.equal(snap(s),mid);
});

test('A1-09 saved layout restores after reopening, paused, without replaying events',()=>{
 const {s,storage}=prepare();let t=0;for(;t<30;)s.lifeStep(++t);
 s.applyLayout(cmd(),{kind:'move',id:'game1-work',x:10,y:1},0);s.applyLayout(cmd(),{kind:'wall',x:0,y:3},1);
 const saved=s.read();
 const reopened=createLocalStore(storage),r=reopened.read();
 assert.deepEqual(r.life.places,saved.life.places);assert.deepEqual(r.life.walls,saved.life.walls);
 assert.equal(r.life.paused,true);assert.equal(r.life.layout_version,2);
 assert.equal(r.events.length,saved.events.length);assert.deepEqual(r.life.actors,saved.life.actors);
});

test('A1-11 a non-owner cannot change the layout through the state function',()=>{
 const {s}=prepare();const before=snap(s);
 assert.throws(()=>s.applyLayout(cmd(),{kind:'wall',x:0,y:0},0,'local-visitor-owner'),/layout\.not_owner/);
 assert.throws(()=>s.applyLayout(cmd(),{kind:'close',id:'game1-rest',blocked:true},0,'local-visitor-owner'),/layout\.not_owner/);
 assert.equal(snap(s),before);
});

test('layout evaluator is pure and old saves without layout_version still load',()=>{
 const life=initialLife(),copy=JSON.stringify(life);
 evaluateLayout(life,{kind:'wall',x:1,y:1},[]);evaluateLayout(life,{kind:'move',id:'game1-rest',x:0,y:0},[]);
 assert.equal(JSON.stringify(life),copy);
 const {s,storage}=prepare();s.lifeStep(1);const raw=JSON.parse(storage.getItem('game1-local-a-v1'));delete raw.life.layout_version;
 const legacy=disk();legacy.setItem('game1-local-a-v1',JSON.stringify(raw));
 assert.equal(createLocalStore(legacy).layoutVersion(),0);
});
