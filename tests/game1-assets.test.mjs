import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateDesignFixture,inspectPng} from '../scripts/game1_validate_design_assets.mjs';
test('design:ART-03/04 file-level six PNG hashes, RGBA decode, pivot and budget',()=>{
 const r=validateDesignFixture(fileURLToPath(new URL('../fixtures/game1-design-v07',import.meta.url)));
 assert.equal(r.layers.length,6);assert.equal(r.runtime_composited,false);assert.ok(r.total_bytes<8*1048576);
 assert.ok(r.layers.every(l=>l.transparent_pixels>0&&l.visible_pixels>0));assert.equal(r.decoded_rgba_bytes,6291456);
});
test('asset damaged PNG CRC and truncated data rejected before decode',()=>{
 const png=readFileSync(new URL('../fixtures/game1-design-v07/assets/six_layers/base_neutral.png',import.meta.url));
 const changed=Buffer.from(png);changed[40]^=1;assert.throws(()=>inspectPng(changed));assert.throws(()=>inspectPng(png.subarray(0,30)));assert.throws(()=>inspectPng(Buffer.alloc(2*1048576)));
});
