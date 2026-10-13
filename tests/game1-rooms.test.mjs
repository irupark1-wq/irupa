// 두 번째 방(PO-ROOM-001 ROOM01~09 중 저장소·시뮬레이션 범위). 화면(ROOM02·10)은 브라우저 확인으로 따로 기록한다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalStore,STORE_KEY,SAVE_FORMAT} from '../prototype/store.js';
import {roomOf,COZY_PLACES} from '../prototype/life.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
const disk=(init)=>{const m=new Map(init?[[STORE_KEY,init]]:[]);let fail=false;return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{if(fail&&k===STORE_KEY){fail=false;throw Error('disk.full');}m.set(k,v);},failNext:()=>fail=true,m};};
function world(n=3){const d=disk(),s=createLocalStore(d);for(let i=0;i<n;i++)s.createPawn('rm-'+i,['모래','밤','노을'][i],art,DEFAULT_AXES);s.lifePause('rm-go',false);s.lifeStep(1);return {s,d,ids:s.read().pawns.map(p=>p.id)};}
const rel=(s,a,b)=>JSON.stringify(s.projection(a,b).scores);

test('ROOM01 an old save gains the cozy room: pawns stay in the living room, nobody is copied, relations and cards untouched; format 3 with a backup',()=>{
 const {s,ids}=world();const st=s.read();delete st.life.rooms;for(const p of st.pawns)delete p.cards;st.save_format=2;const raw=JSON.stringify(st);
 const before=ids.map(a=>ids.filter(b=>b!==a).map(b=>rel(s,a,b))).flat();
 const d=disk(raw),s2=createLocalStore(d),now=s2.read();
 assert.equal(now.save_format,SAVE_FORMAT);assert.equal(d.m.get(STORE_KEY+'.backup-f2'),raw);
 assert.equal(now.pawns.length,3);for(const id of ids)assert.equal(roomOf(now.life.actors[id]),'living');
 assert.deepEqual(now.life.rooms.cozy.places.map(p=>p.id),COZY_PLACES.map(p=>p.id));assert.deepEqual(now.life.rooms.cozy.walls,[]);
 for(const p of now.pawns){assert.deepEqual(p.cards.card_ids,[],'no random cards');assert.equal(p.cards.active,false);}
 assert.deepEqual(ids.map(a=>ids.filter(b=>b!==a).map(b=>rel(s2,a,b))).flat(),before);
});

test('ROOM03 move preview/cancel/confirm: preview changes nothing; confirm is one commit; the pawn is in exactly one room',()=>{
 const {s,ids}=world();const v0=s.read().version;
 assert.equal(s.previewRoomMove(ids[0],'cozy',5,6).ok,true);assert.equal(s.read().version,v0,'preview saves nothing');
 const r=s.movePawnRoom('mv-1',ids[0],'cozy',5,6);assert.equal(r.status,'moved');assert.equal(s.read().version,v0+1);
 const a=s.life().actors[ids[0]];assert.equal(roomOf(a),'cozy');assert.deepEqual([a.x,a.y],[5,6]);
 assert.deepEqual(s.movePawnRoom('mv-1',ids[0],'cozy',5,6),r,'same command again: same receipt, no second move');
 assert.equal(s.previewRoomMove(ids[0],'cozy',4,6).reason,'same_room');
 s.movePawnRoom('mv-2',ids[0],'living',1,6);assert.equal(roomOf(s.life().actors[ids[0]]),'living');
});

test('ROOM04 each room keeps its own layout and version; fixed decoration cells are separate from the 30 user obstacles and cannot be removed or covered',()=>{
 const {s,d}=world();const st=s.read();st.life.rooms.cozy.fixed=[{x:0,y:0},{x:1,y:0}];d.setItem(STORE_KEY,JSON.stringify(st));const s2=createLocalStore(d);
 s2.applyLayout('w-c',{kind:'wall',x:4,y:4,room:'cozy'},0);assert.equal(s2.layoutVersion('cozy'),1);assert.equal(s2.layoutVersion('living'),0);
 assert.deepEqual(s2.life().rooms.cozy.walls,[{x:4,y:4}]);assert.deepEqual(s2.life().walls,[],'living room untouched');
 assert.equal(s2.previewLayout({kind:'wall',x:0,y:0,room:'cozy'}).reason,'fixed_decor','a fixed cell is neither removable nor a new wall');
 assert.equal(s2.previewLayout({kind:'move',id:'game1-cozy-rest',x:1,y:0,room:'cozy'}).reason,'fixed_decor');
 s2.applyLayout('m-c',{kind:'move',id:'game1-cozy-work',x:8,y:1,room:'cozy'},1);assert.deepEqual(s2.life().rooms.cozy.places.find(p=>p.kind==='work'),{id:'game1-cozy-work',kind:'work',label:'함께 만드는 작업대',x:8,y:1,blocked:false});
 assert.throws(()=>s2.applyLayout('stale',{kind:'wall',x:3,y:3,room:'cozy'},0),/layout.version_conflict/);
});

test('ROOM05 refused moves keep everything as it was: fixed decor, furniture, wall, another pawn, isolated cell, a visitor',()=>{
 const {s,d,ids}=world();const st=s.read();st.life.rooms.cozy.fixed=[{x:0,y:7}];st.life.rooms.cozy.walls=[{x:10,y:6},{x:11,y:5},{x:11,y:7}];d.setItem(STORE_KEY,JSON.stringify(st));const s2=createLocalStore(d);
 s2.movePawnRoom('in',ids[1],'cozy',4,6);const before=JSON.stringify(s2.read());
 const why=(x,y,id=ids[0])=>s2.previewRoomMove(id,'cozy',x,y).reason;
 assert.equal(why(0,7),'fixed_decor');assert.equal(why(2,2),'overlap');assert.equal(why(10,6),'overlap');assert.equal(why(4,6),'pawn_cell');assert.equal(why(11,6),'path_blocked');assert.equal(why(12,0),'out_of_bounds');
 assert.throws(()=>s2.movePawnRoom('bad',ids[0],'cozy',0,7),/room.fixed_decor/);assert.equal(JSON.stringify(s2.read()),before,'state unchanged');
 assert.equal(s2.previewRoomMove('game1-local-visitor','cozy',5,5).reason,'not_own_pawn');
 assert.throws(()=>s2.movePawnRoom('nv',ids[0],'cozy',5,5,'someone-else'),/room.not_owner/);
});

test('ROOM06 moving a pawn mid-activity: neutral cancel, the partner is freed, no completion or relation change, commitments stay',()=>{
 const {s,d,ids}=world();const st=s.read();const [A,B]=ids;
 Object.assign(st.life.actors[A],{mode:'talking',partner:B,until:10,goal:{kind:'meet',target:B}});Object.assign(st.life.actors[B],{mode:'listening',partner:A,until:10});
 st.structures.commitments=[{from_pawn_id:A,to_pawn_id:B,id:'c-1',active:true,accepted:true,burden:300}];d.setItem(STORE_KEY,JSON.stringify(st));
 const s2=createLocalStore(d),relBefore=rel(s2,A,B),events=s2.read().events.length;
 s2.movePawnRoom('mid',A,'cozy',5,6);const life=s2.life();
 assert.equal(life.actors[A].mode,'idle');assert.equal(life.actors[B].mode,'idle');assert.equal(life.actors[B].partner,null);
 assert.equal(s2.read().events.length,events,'no completion event');assert.equal(rel(s2,A,B),relBefore);
 assert.equal(s2.read().structures.commitments.length,1,'commitment kept');assert.ok(life.logs.some(l=>l.kind==='cancelled'&&l.actor===A));
});

test('ROOM07 one world clock: both rooms live on the same tick; pawns in different rooms never meet, help or witness each other',()=>{
 const {s,ids}=world();s.movePawnRoom('split',ids[2],'cozy',5,6);
 const t0=s.life().tick;for(let t=t0+1;t<=t0+1500;t++)s.lifeStep(t);
 const life=s.life();assert.equal(life.tick,t0+1500,'one clock');
 assert.ok(life.trace.some(x=>x.room==='cozy'),'the cozy room pawn kept living');
 const cross=s.read().events.filter(e=>[e.event.observer_id,e.event.target_id].includes(ids[2]));assert.equal(cross.length,0,'no shared events across rooms');
 assert.equal(life.logs.filter(l=>l.target===ids[2]||(l.actor===ids[2]&&l.target)).length,0,'no cross-room social logs');
 for(const h of Object.values(s.read().credit.helps))assert.ok(!h.witnesses.includes(ids[2]),'not a witness from another room');
});

test('ROOM08 quotas and relation scope are world-wide: changing rooms does not reset the daily light-social quota; reload opens paused',()=>{
 const {s,d,ids}=world(2);const [A,B]=ids;const buckets=JSON.stringify(s.life().repeat.buckets);
 s.movePawnRoom('q1',A,'cozy',5,6);s.movePawnRoom('q2',B,'cozy',6,6);assert.equal(JSON.stringify(s.life().repeat.buckets),buckets,'moving does not touch the quota buckets');
 for(let t=s.life().tick+1;t<=200;t++)s.lifeStep(t);const re=createLocalStore(d);assert.equal(re.life().paused,true);assert.equal(roomOf(re.life().actors[A]),'cozy');
});

test('ROOM09 a failed save during a move changes nothing; a repeated command adds nothing',()=>{
 const {s,d,ids}=world();const before=d.m.get(STORE_KEY);d.failNext();
 assert.throws(()=>s.movePawnRoom('f1',ids[0],'cozy',5,6),/disk.full/);assert.equal(d.m.get(STORE_KEY),before);assert.equal(roomOf(s.life().actors[ids[0]]),'living');
 s.movePawnRoom('f2',ids[0],'cozy',5,6);const v=s.read().version;s.movePawnRoom('f2',ids[0],'cozy',5,6);assert.equal(s.read().version,v);
});
