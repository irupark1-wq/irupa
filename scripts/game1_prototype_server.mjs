import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../prototype/',import.meta.url));
const port=Number(process.env.GAME1_PROTOTYPE_PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid GAME1_PROTOTYPE_PORT');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);return res.end();}const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));if(!target.startsWith(root)||!['GET','HEAD'].includes(req.method)){res.writeHead(403);return res.end();}const actual=await realpath(target);if(!actual.startsWith(root)){res.writeHead(403);return res.end();}const data=await readFile(actual);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://yvsqivhdwzbshpapfcsy.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`게임1 로컬 테스트: http://127.0.0.1:${port} (종료: Ctrl+C)`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'4173 포트를 사용 중입니다. 기존 테스트 창을 확인하세요.':error.message);process.exitCode=1;});
