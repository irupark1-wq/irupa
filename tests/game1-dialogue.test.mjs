// 대화 말풍선 규칙(PO-REQ-001 §3): 기록 기반, 결정적 선택, 말투와 따뜻함 분리, 수치·내부값 미노출
import test from 'node:test';import assert from 'node:assert/strict';
import {speechTurns,toneOf,lineFor,ALL_LINES,DIALOGUE_SOURCE} from '../prototype/dialogue.js';
test('speech turns follow committed life logs: offer/response, decline reasons, completion, neutral; solo logs say nothing',()=>{
 assert.deepEqual(speechTurns({kind:'accepted',actor:'a',target:'b',text:'상대가 이야기를 수락했어요'}).map(t=>[t.speaker,t.situation]),[['a','greet_offer'],['b','greet_accept']]);
 assert.deepEqual(speechTurns({kind:'declined',actor:'a',target:'b',text:'지금은 쉬고 싶어요 · 관계 벌점 없음'}).map(t=>[t.speaker,t.situation]),[['a','greet_offer'],['b','decline_tired']]);
 assert.deepEqual(speechTurns({kind:'declined',actor:'a',target:'b',text:'지금 도움을 받기 어려워요 · 관계 벌점 없음'}).map(t=>t.situation),['help_offer','help_decline']);
 assert.deepEqual(speechTurns({kind:'completed',actor:'a',target:'b',text:'인사를 나누고 이야기를 나눴어요'}).map(t=>t.situation),['chat','chat_reply']);
 assert.deepEqual(speechTurns({kind:'neutral',actor:'a',target:'b',text:'둘은 잠깐 이야기를 나눴어요'}).map(t=>t.situation),['chat_neutral']);
 assert.deepEqual(speechTurns({kind:'move',actor:'a',target:'b',text:'다른 폰에게 다가가요'}),[],'approach alone is not a conversation');
 assert.deepEqual(speechTurns({kind:'completed',actor:'a',target:null,text:'작업을 마쳤어요'}),[],'no fake partner for solo activity');
});
test('tone separates manner (closeness) from warmth (affection/trust); same log and speaker always give the same line',()=>{
 assert.equal(toneOf({closeness_orientation:'low'},{affection:900,trust:900}),'reserved','blunt manner is not low affection');
 assert.equal(toneOf({closeness_orientation:'medium'},{affection:100,trust:300}),'plain');
 assert.equal(toneOf({closeness_orientation:'high'},{affection:200,trust:320}),'warm');
 assert.equal(toneOf(null,null),'plain','visitor/unknown speaker uses only public generic lines');
 assert.equal(lineFor('chat','warm','life-log-12|p1'),lineFor('chat','warm','life-log-12|p1'));
 assert.equal(DIALOGUE_SOURCE,'dev-provisional-v1');
 for(const l of ALL_LINES)assert.equal(/\d/.test(l),false,'no numbers in lines: '+l);
});
import {memoryView} from '../prototype/store.js';
import {josa} from '../prototype/i18n.js';
test('memory view keys: kind by event, reason/resolution only for conflict kinds; Korean particles follow the final consonant',()=>{
 const v=(id,extra={})=>memoryView({id,to:'b',reason_known:false,resolution:'open',...extra});
 assert.deepEqual([v('x-EVT-01').kind,v('x-EVT-04').kind,v('x-EVT-12').kind,v('x-EVT-09').kind,v('x-EVT-10').kind],['conversation','help','repair','correction','credit_gap']);
 assert.equal(v('x-EVT-01').reason,'not_applicable');assert.equal(v('x-EVT-10').reason,'unknown','unknown reason is shown as unknown, never as malice');
 assert.equal(v('x-EVT-10',{resolution:'resolved'}).resolution,'resolved');
 assert.equal(josa('모래이(가) 보는 밤과 밤와(과)'),'모래가 보는 밤과 밤과');assert.equal(josa('노을이(가) 작업대을(를)'),'노을이 작업대를');
});

test('credit flow speech (PO-HAND-005 §3B): ask/accept/pending/fixed/ack turns; no blame, intent or forgiveness words (정연우 DLG-05~08)',()=>{
 const t=(text,kind)=>speechTurns({actor:'B',target:'C',text,kind}).map(x=>x.speaker+':'+x.situation);
 assert.deepEqual(t('기록을 확인해 달라고 부탁했어요','accepted'),['B:credit_ask','C:credit_ask_accept']);
 assert.deepEqual(t('기록 확인을 부탁했지만 지금은 어렵대요 · 관계 벌점 없음','declined'),['B:credit_ask','C:credit_ask_pending']);
 assert.deepEqual(t('고친 기록을 전해 듣고 확인했어요','completed'),['C:credit_fixed','B:credit_ack']);
 assert.deepEqual(t('고쳐진 작업 기록을 확인했어요','completed'),[],'reading the board alone is not a conversation');
 for(const s of ['credit_ask','credit_ask_accept','credit_ask_pending','credit_fixed','credit_ack'])for(const tone of ['warm','plain','reserved'])for(const k of ['a','b','c']){
  const l=lineFor(s,tone,k);assert.ok(l);assert.doesNotMatch(l,/일부러|훔|용서|오해가 풀|왜 뺐|네 탓|잘못했/);}
});
