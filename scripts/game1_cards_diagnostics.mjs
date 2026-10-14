// 성격 카드 진단(PO-HAND-016 G-PERS-1·3 증거용): 같은 월드·seed 에서 첫 폰의 카드만 바꿔 생활 선택 분포를 비교한다.
// 사용: node scripts/game1_cards_diagnostics.mjs [ticks=1500] [credit=0]
//  credit=1 이면 기록 흐름(credit.js) 변형을 켠 월드에서 비교한다(기록 확인 부탁 후보가 생길 수 있는 조건).
import {createLocalStore,CARD_IDS} from '../prototype/store.js';
import {DEFAULT_AXES} from '../prototype/core/game1-traits.js';
const ticks=Number(process.argv[2]||1500);
const art={layers:{base:'',eyes_pair:'',mouth:'',back_hair:'',front_hair:'',frame_accessory:''},transforms:{}};
const mem=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const subsets=CARD_IDS.reduce((a,x)=>a.concat(a.map(s=>[...s,x])),[[]]).filter(s=>s.length<=3);
const NAME={kind:'다정한',hot_tempered:'욱하는',stubborn:'고집 센',independent:'독립적인'};
const KINDS=['rest','work','social','meet','assist','repair','record','read_board','credit_check','correct_record','deliver'];
function run(cards){
 const s=createLocalStore(mem());for(let i=0;i<3;i++)s.createPawn('dg-'+i,['모래','밤','노을'][i],art,DEFAULT_AXES,undefined,i===0?cards:null);
 s.lifePause('dg-go',false);const id=s.read().pawns[0].id,seen=new Set(),count={},eligible={};
 for(let t=1;t<=ticks;t++){s.lifeStep(t);const L=s.life();
  for(const e of L.trace)if(e.actor===id&&!seen.has(e.intent_id)){seen.add(e.intent_id);count[e.chosen.kind]=(count[e.chosen.kind]||0)+1;for(const k of new Set(e.candidates.map(c=>c.kind)))eligible[k]=(eligible[k]||0)+1;}}
 const ev=s.read().events.length;return {count,eligible,ev};
}
const base=run([]);const pct=(c,k)=>{const n=Object.values(c).reduce((x,y)=>x+y,0)||1;return Math.round(((c[k]||0)/n)*100);};
console.log('ticks',ticks,'| 첫 폰만 카드 변경, 나머지 두 폰은 카드 없음 | 단위: 그 폰이 고른 행동 비율(%)');
const cond=(r,k)=>r.eligible[k]?Math.round(((r.count[k]||0)/r.eligible[k])*100)+'%('+r.eligible[k]+')':'-';
console.log(['카드'.padEnd(22),...KINDS.filter(k=>k!=='correct_record'&&k!=='deliver').map(k=>k.padStart(7)),'  선택수','  사건수'].join(''));
for(const set of subsets){const r=set.length?run(set):base;const label=set.length?set.map(x=>NAME[x]).join('+'):'(카드 없음)';
 console.log([label.padEnd(22-[...label].filter(ch=>ch>'ᄀ').length),...KINDS.filter(k=>k!=='correct_record'&&k!=='deliver').map(k=>String(pct(r.count,k)).padStart(7)),String(Object.values(r.count).reduce((x,y)=>x+y,0)).padStart(8),String(r.ev).padStart(8),'  | 후보였을 때 고른 비율: 도움 '+cond(r,'assist')+' 만남 '+cond(r,'meet')+' 쉬기 '+cond(r,'rest')+' 확인부탁 '+cond(r,'credit_check')].join(''));}
