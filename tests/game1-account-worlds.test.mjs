// 계정 월드 저장 클라이언트(PO-AUTH-001 AUTH05~10 중 로컬 mock 범위). 가짜 서버는 SB-0004 규칙(본인 행·같은 지문 재전송·버전 충돌·3개 상한)을 흉내낸다.
// 실제 Supabase 통과가 아니다(SB-0004 적용·실기 시험은 별도).
import test from 'node:test';import assert from 'node:assert/strict';
import {createAccountWorlds,fingerprintOf,saveErrorKey,forgetAccountLinks,linkKey} from '../prototype/account-worlds.js';
import {createLocalStore,STORE_KEY} from '../prototype/store.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};

/** SB-0004 를 흉내내는 서버(사용자별 행) */
/** maxFormat: SB-0004 는 2, SB-0005 는 3 */
function server(maxFormat=3){
 const rows=[];let seq=0;const err=(m,details='')=>({data:null,error:{message:m,details}});
 const forUser=uid=>({
  async rpc(name,a={}){
   const mine=rows.filter(r=>r.user_id===uid);
   if(name==='game1_create_account_world'){
    const same=mine.find(r=>r.lineage_id===a.p_lineage);
    if(same)return same.fp===a.p_fingerprint?{data:[{world_id:same.world_id,version:same.version,created:false}],error:null}:err('save.world_exists',same.world_id);
    if(mine.length>=3)return err('save.world_limit');
    if((a.p_world.save_format||1)>maxFormat)return err('save.unsupported_format');
    const r={world_id:'w-'+(++seq),user_id:uid,lineage_id:a.p_lineage,title:a.p_title,version:1,fp:a.p_fingerprint,world:structuredClone(a.p_world)};rows.push(r);
    return {data:[{world_id:r.world_id,version:1,created:true}],error:null};}
   if(name==='game1_update_account_world'){
    const r=mine.find(r=>r.world_id===a.p_world_id);if(!r)return err('save.not_found');
    if(r.fp===a.p_fingerprint)return {data:r.version,error:null};
    if(r.version!==a.p_expected_version)return err('save.version_conflict',`expected ${a.p_expected_version}, current ${r.version}`);
    r.version++;r.fp=a.p_fingerprint;r.world=structuredClone(a.p_world);return {data:r.version,error:null};}
   if(name==='game1_list_account_worlds')return {data:mine.map(r=>({world_id:r.world_id,title:r.title,version:r.version,lineage_id:r.lineage_id,pawns:r.world.pawns.length})),error:null};
   throw Error('unknown rpc '+name);
  },
  from(){let id=null;const q={select(){return q;},delete(){q.del=true;return q;},eq(_,v){id=v;return q.del?q.run():q;},async single(){const r=rows.find(r=>r.user_id===uid&&r.world_id===id);return r?{data:{world:structuredClone(r.world),version:r.version,lineage_id:r.lineage_id},error:null}:{data:null,error:{code:'PGRST116',message:'0 rows'}};},
   async run(){const i=rows.findIndex(r=>r.user_id===uid&&r.world_id===id);if(i>=0)rows.splice(i,1);return {error:null};}};return q;},
 });
 return {rows,forUser};
}
const mem=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i],get length(){return m.size;},m};};
/** 한 기기: 로컬 저장소 + 게임 store + 계정 저장 모듈 */
function device(srv,uid,disk=mem()){
 let store=createLocalStore(disk);if(!store.read().pawns.length){store.createPawn('d-'+Math.random().toString(36).slice(2,8),'모래',art,DEFAULT_AXES);}
 let n=0;
 const api=()=>createAccountWorlds({client:srv.forUser(uid),storage:disk,userId:uid,storeKey:STORE_KEY,
  readLocal:()=>disk.getItem(STORE_KEY),lineage:fresh=>store.ensureLineage('lin-'+(++n)+'-'+Math.random().toString(36).slice(2,6),fresh),
  validate:text=>createLocalStore({getItem:()=>text,setItem(){}}),writeLocal:text=>{disk.setItem(STORE_KEY,text);store=createLocalStore(disk);}});
 return {disk,get store(){return store;},api,play:()=>store.lifeStep(store.life().tick+1)||store.lifePause('p'+Math.random().toString(36).slice(2,8),false)};
}

test('AUTH05 (mock) first save copies the local world to the account; the local world is untouched and pawns/relations/memories match',async()=>{
 const srv=server(),d=device(srv,'user-A');const before=d.disk.getItem(STORE_KEY);
 const r=await d.api().save();assert.equal(r.key,'created');assert.equal(r.version,1);
 const row=srv.rows[0];assert.equal(row.user_id,'user-A');
 const local=JSON.parse(d.disk.getItem(STORE_KEY));assert.deepEqual(row.world.pawns,local.pawns);assert.deepEqual(row.world.memories,local.memories);assert.deepEqual(row.world.events,local.events);
 assert.equal(JSON.parse(before).pawns.length,local.pawns.length,'nothing lost locally');
 assert.equal((await d.api().status()).kind,'in_account');
});

test('AUTH06 (mock) resending the same snapshot or saving again never adds a world; a changed local world updates the same one',async()=>{
 const srv=server(),d=device(srv,'user-A'),a=d.api();
 await a.save();assert.equal((await a.save()).key,'saved');assert.equal(srv.rows.length,1,'same snapshot: no duplicate');
 d.store.lifePause('go',false);for(let t=1;t<=5;t++)d.store.lifeStep(t);
 assert.equal((await a.status()).kind,'account_older');
 const r=await a.save();assert.equal(r.version,2);assert.equal(srv.rows.length,1,'same lineage updates, never a second world');
 // 링크를 잃은 같은 기기(예: 연결 기록 삭제) — 같은 계보·같은 스냅샷 create 는 같은 월드로 돌아온다
 d.disk.removeItem(linkKey('user-A'));const again=await a.save();assert.equal(again.world_id,srv.rows[0].world_id);assert.equal(srv.rows.length,1);
});

test('AUTH07 (mock) another device saved first: no silent overwrite; choices are load the account world or save this one as a new world',async()=>{
 const srv=server(),one=device(srv,'user-A');await one.api().save();
 const twoDisk=mem();twoDisk.setItem(STORE_KEY,one.disk.getItem(STORE_KEY));twoDisk.setItem(linkKey('user-A'),one.disk.getItem(linkKey('user-A')));const two=device(srv,'user-A',twoDisk);
 one.store.lifePause('g1',false);for(let t=1;t<=3;t++)one.store.lifeStep(t);await one.api().save();
 two.store.lifePause('g2',false);for(let t=1;t<=4;t++)two.store.lifeStep(t);
 const clash=await two.api().save();assert.equal(clash.key,'version_conflict');assert.equal(srv.rows[0].version,2,'server copy unchanged by the late save');
 const asNew=await two.api().saveAsNew();assert.equal(asNew.key,'created');assert.equal(srv.rows.length,2,'saved as a separate world');
 assert.equal(srv.rows[0].version,2,'the first world is untouched');
 // 링크 없이 같은 계보·다른 스냅샷 → world_exists(갱신 명령 필요), 월드 id 를 알려 준다
 const three=mem();three.setItem(STORE_KEY,one.disk.getItem(STORE_KEY));const d3=device(srv,'user-A',three);d3.store.lifePause('g3',false);d3.store.lifeStep(d3.store.life().tick+1);
 const ex=await d3.api().save();assert.equal(ex.key,'world_exists');assert.equal(ex.world_id,srv.rows[0].world_id);
});

test('AUTH08 (mock) restore on another device: backup first, world opens paused, no offline catch-up; a broken/newer save is refused and the local world stays',async()=>{
 const srv=server(),one=device(srv,'user-A');one.store.lifePause('a',false);for(let t=1;t<=7;t++)one.store.lifeStep(t);await one.api().save();
 const other=device(srv,'user-A');const otherBefore=other.disk.getItem(STORE_KEY);
 const r=await other.api().load(srv.rows[0].world_id);assert.equal(r.key,'loaded');assert.equal(r.backup,true);
 assert.equal(other.disk.getItem(STORE_KEY+'.before-account-load'),otherBefore,'this device world kept as a backup');
 const opened=createLocalStore(other.disk).life();assert.equal(opened.paused,true);assert.equal(opened.tick,7,'no catch-up for time away');
 srv.rows[0].world.save_format=9;const bad=device(srv,'user-A'),keep=bad.disk.getItem(STORE_KEY);
 assert.equal((await bad.api().load(srv.rows[0].world_id)).key,'unsupported_format');assert.equal(bad.disk.getItem(STORE_KEY),keep,'local untouched');
});

test('AUTH09 (mock) another account cannot see, update, load or delete the world; it reads as "not found"',async()=>{
 const srv=server(),a=device(srv,'user-A');await a.api().save();const id=srv.rows[0].world_id;
 const b=device(srv,'user-B'),api=b.api();
 assert.deepEqual((await api.list()).worlds,[]);assert.equal((await api.load(id)).key,'not_found');
 await api.remove(id);assert.equal(srv.rows.length,1,'delete by another account does nothing');
 b.disk.setItem(linkKey('user-B'),JSON.stringify({[b.store.ensureLineage('x')]:{world_id:id,version:1,fingerprint:'x'.repeat(43)}}));
 assert.equal((await api.save()).key,'not_found');assert.equal(srv.rows.find(r=>r.world_id===id).user_id,'user-A');
});

test('AUTH10 (mock) account switch/log-out: links are kept per account and other accounts\' links are cleared from this device',async()=>{
 const srv=server(),disk=mem(),d=device(srv,'user-A',disk);await d.api().save();
 disk.setItem(linkKey('user-B'),'{}');assert.equal(forgetAccountLinks(disk,'user-B'),1);
 assert.equal(disk.getItem(linkKey('user-A')),null,'A link removed when B is the active account');assert.notEqual(disk.getItem(linkKey('user-B')),null);
 assert.ok(disk.getItem(STORE_KEY),'the local world itself is never deleted');
});

test('limit and errors: 4th world is refused with the list kept; server errors map to fixed keys; fingerprints are stable',async()=>{
 const srv=server();for(let i=0;i<3;i++)await device(srv,'user-A').api().save();
 const r=await device(srv,'user-A').api().save();assert.equal(r.key,'world_limit');assert.equal(srv.rows.length,3);
 assert.equal(saveErrorKey({message:'save.version_conflict',details:'expected 1, current 2'}),'version_conflict');
 assert.equal(saveErrorKey({message:'TypeError: Failed to fetch'}),'network');assert.equal(saveErrorKey({message:'boom'}),'generic');
 assert.equal(await fingerprintOf('abc'),await fingerprintOf('abc'));assert.match(await fingerprintOf('abc'),/^[A-Za-z0-9_-]{43}$/);
});

test('AUTH10 (mock) PO-DEC-007 §4: a loaded account world is marked; another account cannot save it; "forget" restores the earlier device world, "keep" turns it into a device world',async()=>{
 const {readOrigin,forgetAccountCopy,keepAsDeviceWorld,ORIGIN_KEY}=await import('../prototype/account-worlds.js');
 const srv=server(),a=device(srv,'user-A');await a.api().save();
 const other=device(srv,'user-A');const mine=other.disk.getItem(STORE_KEY);
 await other.api().load(srv.rows[0].world_id);assert.deepEqual(readOrigin(other.disk)?.user_id,'user-A');
 // 같은 기기에서 B 로 로그인: A 의 사본을 B 계정에 올리지 않는다
 const asB=createAccountWorlds({client:srv.forUser('user-B'),storage:other.disk,userId:'user-B',storeKey:STORE_KEY,readLocal:()=>other.disk.getItem(STORE_KEY),lineage:()=>'lineage-x-0001',validate(){},writeLocal(){}});
 assert.equal((await asB.save()).key,'other_account');assert.equal(srv.rows.filter(r=>r.user_id==='user-B').length,0);
 assert.equal(forgetAccountCopy(other.disk,STORE_KEY),'restored_device_world');assert.equal(other.disk.getItem(STORE_KEY),mine,'the device world from before the load is back');
 assert.equal(other.disk.getItem(ORIGIN_KEY),null);assert.equal(srv.rows.length,1,'server copy untouched');
 const third=device(srv,'user-A');await third.api().load(srv.rows[0].world_id);keepAsDeviceWorld(third.disk);assert.equal(readOrigin(third.disk),null);assert.ok(third.disk.getItem(STORE_KEY));
 const empty=mem();empty.setItem(STORE_KEY,'{}');empty.setItem(ORIGIN_KEY,JSON.stringify({kind:'account',user_id:'u'}));assert.equal(forgetAccountCopy(empty,STORE_KEY),'emptied');assert.equal(empty.getItem(STORE_KEY),null);
});

test('deploy order guard: a format-3 client against a server still on SB-0004 (formats 1-2) is refused cleanly and the local world is untouched',async()=>{
 const srv=server(2),d=device(srv,'user-A'),before=d.disk.getItem(STORE_KEY);
 const r=await d.api().save();assert.equal(r.key,'unsupported_format');assert.equal(srv.rows.length,0);const now=JSON.parse(d.disk.getItem(STORE_KEY)),was=JSON.parse(before);assert.deepEqual(now.pawns,was.pawns);assert.deepEqual(now.life,was.life,'world content untouched (only the lineage id is added)');
});
