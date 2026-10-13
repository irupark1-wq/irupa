// 시작 화면(PO-START-001) 순수 규칙: 로컬 월드 유무로 첫 화면이 갈리고, 요약은 저장된 생활 시간만 쓴다(가짜 시각 없음).
import test from 'node:test';import assert from 'node:assert/strict';
import {startVariant,localSummary} from '../prototype/start.js';
test('START01/02 first visit vs returning: no pawns → first (start on this device), pawns → continue this device world',()=>{
 assert.equal(startVariant({localPawns:0}),'first');assert.equal(startVariant({}),'first');assert.equal(startVariant({localPawns:2}),'returning');
});
test('START02 local summary uses the saved world only: names, pawn count, Day and clock from the life tick',()=>{
 assert.deepEqual(localSummary({pawns:[{name:'모래'},{name:'밤'}],life:{tick:0}}),{pawns:2,title:'모래·밤',day:1,clock:'08:00'});
 assert.deepEqual(localSummary({pawns:[{name:'노을'}],life:{tick:1440*2+90}}),{pawns:1,title:'노을',day:3,clock:'09:30'});
 assert.equal(localSummary({}).title,'내 월드');
});
