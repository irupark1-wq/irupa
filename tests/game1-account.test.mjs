// 로그인 로직(PO-AUTH-001 AUTH01~04·11·12 중 로컬 mock 으로 검산 가능한 부분). 범위: 로컬 mock — 실제 Google·메일 통과가 아니다.
import test from 'node:test';import assert from 'node:assert/strict';
import {createAccount,readAuthReturn,passwordProblem,errorKey,maskEmail} from '../prototype/account.js';
import {authReturnUrl} from '../prototype/supabase-client.js';
const RETURN='https://neinom.com/auth/';
function fake(o={}){
 const calls=[];let handler=null;
 const auth={
  onAuthStateChange(f){handler=f;return {data:{subscription:{unsubscribe(){}}}};},
  async getSession(){calls.push(['getSession']);return {data:{session:o.session||null},error:null};},
  async signInWithOAuth(a){calls.push(['oauth',a]);await new Promise(r=>setTimeout(r,5));return {error:o.oauthError||null};},
  async signUp(a){calls.push(['signUp',a]);return o.signUp?o.signUp(a):{data:{session:null,user:{id:'u-new'}},error:null};},
  async signInWithPassword(a){calls.push(['signIn',a]);return o.signIn(a);},
  async resend(a){calls.push(['resend',a]);return {error:null};},
  async resetPasswordForEmail(e,opt){calls.push(['reset',e,opt]);return {error:o.resetError||null};},
  async updateUser(a){calls.push(['updateUser',Object.keys(a)]);return {error:o.updateError||null};},
  async signOut(a){calls.push(['signOut',a]);return {error:null};},
 };
 return {client:{auth},calls,emit:(e,s)=>handler(e,s)};
}
const user={id:'uid-1',email:'player@example.com',app_metadata:{providers:['google']}};
const session={access_token:'SECRET-ACCESS',refresh_token:'SECRET-REFRESH',user};

test('AUTH01 (mock) Google: exact return URL, one request per double tap; cancel and failure come back as common keys',async()=>{
 const f=fake(),a=createAccount({client:f.client,returnUrl:RETURN});
 const [r1,r2]=await Promise.all([a.google(),a.google()]);
 assert.equal(f.calls.filter(c=>c[0]==='oauth').length,1,'busy blocks the duplicate');assert.equal(r2.key,'busy');assert.equal(r1.key,'redirecting');
 assert.deepEqual(f.calls.find(c=>c[0]==='oauth')[1],{provider:'google',options:{redirectTo:RETURN}});
 assert.deepEqual(readAuthReturn('?error=access_denied&error_description=user+cancelled'),{kind:'error',back:'cancelled'});
 assert.deepEqual(readAuthReturn('?error=server_error'),{kind:'error',back:'generic'});
 assert.deepEqual(readAuthReturn('','#error=access_denied&error_code=otp_expired'),{kind:'error',back:'link_expired'});
 assert.deepEqual(readAuthReturn('?code=abcDEF123_-xyz'),{kind:'code',code:'abcDEF123_-xyz'});
 assert.deepEqual(readAuthReturn('?code=<script>'),{kind:'none'},'odd codes are ignored');
});

test('AUTH02 (mock) email sign-up waits for confirmation; an existing address gets the same answer; weak passwords never leave the device',async()=>{
 const f=fake(),a=createAccount({client:f.client,returnUrl:RETURN});
 assert.equal((await a.signUp('new@example.com','short')).key,'password_short');assert.equal((await a.signUp('new@example.com','alllowercase1')).key,'password_mix');
 assert.equal(f.calls.filter(c=>c[0]==='signUp').length,0,'rule failures send nothing');
 const r=await a.signUp(' new@example.com ','GoodPass123');assert.equal(r.key,'check_email');assert.equal(a.state().status,'email_pending');
 assert.deepEqual(f.calls.find(c=>c[0]==='signUp')[1],{email:'new@example.com',password:'GoodPass123',options:{emailRedirectTo:RETURN}});
 // Supabase 는 이미 가입한 주소에도 같은 모양(세션 없음)으로 답한다 → 화면도 같은 문구
 const g=fake({signUp:()=>({data:{session:null,user:{id:'obfuscated',identities:[]}},error:null})}),b=createAccount({client:g.client,returnUrl:RETURN});
 assert.equal((await b.signUp('taken@example.com','GoodPass123')).key,'check_email');
});

test('AUTH02 (mock) email log-in: wrong password and unknown account read the same; unconfirmed asks to confirm; success shows the account, not a world save',async()=>{
 const bad=fake({signIn:()=>({data:{},error:{code:'invalid_credentials',status:400,message:'Invalid login credentials'}})}),a=createAccount({client:bad.client,returnUrl:RETURN});
 const wrong=await a.signIn('player@example.com','WrongPass123'),unknown=await a.signIn('nobody@example.com','WrongPass123');
 assert.equal(wrong.key,'login_failed');assert.equal(unknown.key,wrong.key);assert.equal(a.state().status,'guest');
 const pending=fake({signIn:()=>({data:{},error:{code:'email_not_confirmed',status:400}})}),b=createAccount({client:pending.client,returnUrl:RETURN});
 assert.equal((await b.signIn('player@example.com','GoodPass123')).key,'email_not_confirmed');assert.equal(b.state().status,'email_pending');
 const ok=fake({signIn:()=>({data:{user:{...user,app_metadata:{providers:['email']}},session},error:null})}),c=createAccount({client:ok.client,returnUrl:RETURN});
 await c.signIn('player@example.com','GoodPass123');const s=c.state();
 assert.equal(s.status,'signed_in');assert.equal(s.message,'signed_in');assert.deepEqual(s.providers,['email']);assert.equal(s.email_masked,'pl***@example.com');
 assert.equal('world' in s||'world_saved' in s,false,'login state carries no world-save claim');
});

test('AUTH03 (mock) password reset: same answer whether or not the account exists; bad address and rate limit are explained without a lookup',async()=>{
 for(const resetError of [null,{code:'user_not_found',status:400}]){const f=fake({resetError}),a=createAccount({client:f.client,returnUrl:RETURN});assert.equal((await a.sendReset('who@example.com')).key,'reset_sent');}
 const f=fake(),a=createAccount({client:f.client,returnUrl:RETURN});assert.equal((await a.sendReset('not-an-email')).key,'email_format');assert.equal(f.calls.filter(c=>c[0]==='reset').length,0);
 const lim=fake({resetError:{code:'over_email_send_rate_limit',status:429}}),b=createAccount({client:lim.client,returnUrl:RETURN});assert.equal((await b.sendReset('who@example.com')).key,'rate_limited');
 assert.deepEqual(f.calls,[]);const g=fake(),c=createAccount({client:g.client,returnUrl:RETURN});await c.sendReset('who@example.com');assert.deepEqual(g.calls[0],['reset','who@example.com',{redirectTo:RETURN}]);
 assert.equal(passwordProblem('GoodPass123'),null);assert.equal(errorKey({code:'weak_password'}),'password_weak');
});

test('AUTH04 (mock) session ends on its own → "log in again" (local world untouched); user log-out → guest, this device only',async()=>{
 const f=fake({session}),a=createAccount({client:f.client,returnUrl:RETURN});await a.restore();assert.equal(a.state().status,'signed_in');
 f.emit('SIGNED_OUT',null);assert.equal(a.state().status,'expired');assert.equal(a.state().message,'session_expired');
 const g=fake({session}),b=createAccount({client:g.client,returnUrl:RETURN});await b.restore();
 const out=b.signOut();g.emit('SIGNED_OUT',null);await out;
 assert.equal(b.state().status,'guest');assert.equal(b.state().message,'signed_out');assert.deepEqual(g.calls.find(c=>c[0]==='signOut')[1],{scope:'local'});
});

test('AUTH11 (mock) no token or password ever appears in the account state',async()=>{
 const f=fake({session,signIn:()=>({data:{user,session},error:null})}),a=createAccount({client:f.client,returnUrl:RETURN});
 const seen=[];a.subscribe(s=>seen.push(JSON.stringify(s)));await a.restore();await a.signIn('player@example.com','GoodPass123');await a.updatePassword('NewerPass456');
 for(const s of seen)for(const secret of ['SECRET-ACCESS','SECRET-REFRESH','GoodPass123','NewerPass456'])assert.equal(s.includes(secret),false,secret);
 assert.deepEqual(f.calls.find(c=>c[0]==='updateUser')[1],['password']);
});

test('setup guard: only the two registered return addresses can log in; anything else is "unavailable" and sends nothing',async()=>{
 assert.equal(authReturnUrl('https://neinom.com'),'https://neinom.com/auth/');assert.equal(authReturnUrl('http://localhost:4199'),'http://localhost:4199/auth/');
 for(const o of ['http://127.0.0.1:4199','https://irupark1-wq.github.io','https://evil.example'])assert.equal(authReturnUrl(o),null,o);
 const a=createAccount({client:null,returnUrl:null});assert.equal(a.state().status,'unavailable');assert.equal((await a.google()).key,'unavailable');
 assert.equal(maskEmail('ab@x.com'),'ab***@x.com');
});

test('START (mock) a device with a stored session shows "checking" (not guest) until restore ends; no session → guest; slow check → notice, guest play stays open',async()=>{
 const f=fake({session}),a=createAccount({client:f.client,returnUrl:RETURN,checking:true});
 assert.equal(a.state().status,'checking');
 await a.restore();assert.equal(a.state().status,'signed_in');
 const g=fake(),b=createAccount({client:g.client,returnUrl:RETURN,checking:true});await b.restore();assert.equal(b.state().status,'guest');
 const h=fake(),c=createAccount({client:h.client,returnUrl:RETURN,checking:true});c.notice('auth_slow');assert.equal(c.state().status,'guest');assert.equal(c.state().message,'auth_slow');
});
