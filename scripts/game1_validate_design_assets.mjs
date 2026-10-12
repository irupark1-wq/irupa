// Read-only validation of supplied PNG fixtures, no asset modification.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
export function inspectPng(bytes) {
 if(!Buffer.isBuffer(bytes)||bytes.length>1048576||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('asset.invalid_png');
 const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 let offset=8,header=null,end=false;const compressed=[];
 while(offset<bytes.length){if(offset+12>bytes.length)throw Error('asset.truncated_chunk');const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),stop=offset+12+length;if(stop>bytes.length)throw Error('asset.truncated_chunk');
  if(crc(bytes.subarray(offset+4,stop-4))!==bytes.readUInt32BE(stop-4))throw Error('asset.invalid_crc');
  const data=bytes.subarray(offset+8,stop-4);
  if(!header&&type!=='IHDR')throw Error('asset.missing_header');
  if(type==='IHDR'){if(header||length!==13)throw Error('asset.invalid_header');header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),depth:data[8],color:data[9],compression:data[10],filter:data[11],interlace:data[12]};}
  if(type==='IDAT')compressed.push(data);
  if(type==='IEND'){if(length!==0||stop!==bytes.length)throw Error('asset.invalid_end');end=true;}
  offset=stop;
 }
 if(!end||!header||header.width!==512||header.height!==512||header.depth!==8||header.color!==6||header.compression!==0||header.filter!==0||header.interlace!==0||!compressed.length)throw Error('asset.unsupported_png');
 const stride=512*4,raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:512*(stride+1)});
 if(raw.length!==512*(stride+1))throw Error('asset.invalid_scanlines');
 const rgba=Buffer.alloc(512*stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<512;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('asset.invalid_filter');for(let x=0;x<stride;x++){const at=y*stride+x,left=x>=4?rgba[at-4]:0,up=y?rgba[at-stride]:0,corner=y&&x>=4?rgba[at-stride-4]:0;const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];rgba[at]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 let transparent=0,nonTransparent=0;
 for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)transparent++;else nonTransparent++;}
 return {width:512,height:512,format:'RGBA',decoded_bytes:rgba.length,transparent_pixels:transparent,visible_pixels:nonTransparent};
}
export function validateDesignFixture(root) {
 root=realpathSync(root);const manifest=JSON.parse(readFileSync(resolve(root,'sample_appearance_manifest.json'),'utf8'));
 const order=['back_hair','base','eyes_pair','mouth','front_hair','frame_accessory'];
 if(manifest.artifact_kind!=='DEMONSTRATION_FIXTURE_ONLY'||JSON.stringify(manifest.layer_order)!==JSON.stringify(order)||manifest.layers.length!==6||manifest.eyes_mode!=='pair')throw Error('asset.invalid_manifest');
 if(manifest.base_shape.nonuniform_scale_allowed!==false||manifest.base_shape.radius_px!==192||manifest.canvas.width!==512||manifest.canvas.height!==512)throw Error('asset.invalid_circle');
 const results=manifest.layers.map((layer,i)=>{
  if(layer.slot!==order[i]||layer.sort_order!==i||layer.width!==512||layer.height!==512||layer.pivot.x!==0.5||layer.pivot.y!==0.5)throw Error('asset.invalid_layer');
  const path=realpathSync(resolve(root,layer.path));if(!path.startsWith(root+sep))throw Error('asset.path_escape');
  const png=readFileSync(path),sha256=createHash('sha256').update(png).digest('hex');
  if(sha256!==layer.sha256||png.length!==layer.bytes)throw Error('asset.hash_or_size_mismatch');
  const t=layer.transform;if(t.scale.x!==1||t.scale.y!==1||t.rotation_deg!==0||t.position.x!==0.5||t.position.y!==0.5||t.visible!==true||t.mirror_x!==false)throw Error('asset.unsupported_sample_transform');
  return {slot:layer.slot,bytes:png.length,sha256,...inspectPng(png)};
 });
 const total=results.reduce((s,r)=>s+r.bytes,0);if(total>8*1048576)throw Error('asset.version_too_large');
 return {fixture_version:'design-v07',status:'file_validated',runtime_composited:false,total_bytes:total,decoded_rgba_bytes:6*512*512*4,layers:results};
}
