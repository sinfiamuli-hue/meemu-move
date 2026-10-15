const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const NEXT=['arrived','started','completed'];
const ISL=['Dhiggaru','Maduvvari','Raiymandhoo','Veyvah','Mulah','Muli','Naalaafushi','Kolhufushi'];
const hex=u=>[...new Uint8Array(u)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
// Sends an SMS. Returns true/false, or null when no provider is configured.
async function sms(env,to,text){
 if(env.TWILIO_SID&&env.TWILIO_TOKEN&&(env.TWILIO_FROM||env.TWILIO_MSG_SERVICE)){
  const f=new URLSearchParams({To:to,Body:text});
  if(env.TWILIO_MSG_SERVICE)f.set('MessagingServiceSid',env.TWILIO_MSG_SERVICE);else f.set('From',env.TWILIO_FROM);
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`,{method:'POST',headers:{authorization:'Basic '+btoa(env.TWILIO_SID+':'+env.TWILIO_TOKEN)},body:f});
  return r.ok}
 if(env.SMS_WEBHOOK_URL){ // any local SMS gateway that accepts JSON {to,text}
  const r=await fetch(env.SMS_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json',...(env.SMS_WEBHOOK_TOKEN?{authorization:'Bearer '+env.SMS_WEBHOOK_TOKEN}:{})},body:JSON.stringify({to,text})});
  return r.ok}
 return null}
const fareOf=(vt,A,B)=>{const R=Math.PI/180,dx=(B.lo-A.lo)*R*Math.cos((A.la+B.la)*R/2),dy=(B.la-A.la)*R;return Math.round(Math.max(vt.min_fare,vt.base+vt.per_km*Math.hypot(dx,dy)*6371*1.3))};
export default{async fetch(req,env){
const p=new URL(req.url).pathname,m=req.method,DB=env.DB;
if(!p.startsWith('/api/'))return J({error:'not found'},404);
let b={};if(m==='POST'){try{b=await req.json()}catch{return J({error:'bad json'},400)}}
const now=Date.now(),n=v=>Number.isFinite(+v)?+v:null,num=v=>typeof v==='number'&&Number.isFinite(v)?v:null,KEY=env.AUTH_SECRET||'';
const tokOf=()=>(req.headers.get('authorization')||'').replace('Bearer ','');
const who=async()=>{const t=tokOf();if(!t)return null;const s=await DB.prepare('SELECT phone FROM sessions WHERE token_hash=? AND created>?').bind(await sha(t),now-2592000000).first();return s?s.phone:null};

if(p.startsWith('/api/auth/')&&m==='POST'){
 if(!KEY)return J({error:'Server is missing AUTH_SECRET.'},500);
 const a=p.slice(10),ph=String(b.phone||'');
 if(a==='logout'){await DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(tokOf())).run();return J({ok:1})}
 if(!/^[79]\d{6}$/.test(ph))return J({error:'Enter a valid 7-digit mobile number.'},400);
 if(a==='send'){
  if(env.TURNSTILE_SECRET){
   const f=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:String(b.ts||''),remoteip:req.headers.get('cf-connecting-ip')||''});
   const v=await(await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:f})).json();
   if(!v.success)return J({error:'Bot check failed. Try again.'},403)}
  const o=await DB.prepare('SELECT sent,cnt FROM otps WHERE phone=?').bind(ph).first();
  if(o&&now-o.sent<60000)return J({error:'Wait a minute before asking for another code.'},429);
  const cnt=o&&now-o.sent<3600000?o.cnt+1:1;
  if(cnt>5)return J({error:'Too many codes. Try again in an hour.'},429);
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  const ok=await sms(env,'+960'+ph,`Meemu Move code: ${code}. It expires in 5 minutes.`);
  if(ok===null&&env.DEV_OTP!=='1')return J({error:'SMS is not set up yet.'},503);
  if(ok===false)return J({error:'Could not send the SMS. Try again.'},502);
  await DB.prepare('INSERT INTO otps(phone,hash,expires,tries,sent,cnt) VALUES(?,?,?,0,?,?) ON CONFLICT(phone) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,tries=0,sent=excluded.sent,cnt=excluded.cnt')
   .bind(ph,await sha(code+ph+KEY),now+300000,now,cnt).run();
  return J(ok===null?{ok:1,dev_code:code}:{ok:1})}
 if(a==='verify'){
  const o=await DB.prepare('SELECT * FROM otps WHERE phone=?').bind(ph).first();
  if(!o||o.expires<now||o.tries>=5)return J({error:'Code expired. Ask for a new one.'},400);
  if(await sha(String(b.code||'')+ph+KEY)!==o.hash){await DB.prepare('UPDATE otps SET tries=tries+1 WHERE phone=?').bind(ph).run();return J({error:'Wrong code.'},400)}
  await DB.prepare('UPDATE otps SET expires=0 WHERE phone=?').bind(ph).run();
  const token=hex(crypto.getRandomValues(new Uint8Array(24)));
  await DB.prepare('INSERT INTO sessions(token_hash,phone,created) VALUES(?,?,?)').bind(await sha(token),ph,now).run();
  return J({token})}
}

if(p==='/api/vehicle-types'&&m==='GET'){const {results}=await DB.prepare('SELECT id,name,seats,base,per_km,min_fare,mode FROM vtypes WHERE active=1 ORDER BY sort,name').all();return J({types:results})}
if(p==='/api/places'&&m==='GET'){const {results}=await DB.prepare('SELECT id,name,lat,lng,island FROM places WHERE lat IS NOT NULL ORDER BY sort,name').all();return J({places:results})}

if(p==='/api/register'&&m==='POST'){
 const ip=req.headers.get('cf-connecting-ip')||'x';
 if(env.TURNSTILE_SECRET){
  const f=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:String(b.ts||''),remoteip:ip});
  const v=await(await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:f})).json();
  if(!v.success)return J({error:'Bot check failed. Try again.'},403)}
 const s=(v,max)=>String(v==null?'':v).trim().slice(0,max);
 const role=b.role==='captain'?'captain':b.role==='driver'?'driver':'';
 const nm=s(b.name,60),ph=s(b.phone,7),isl=s(b.island,20),idn=s(b.id_no,20).toUpperCase(),lic=s(b.licence_no,30),lexp=s(b.licence_exp,10),make=s(b.make,40),plate=s(b.plate,20).toUpperCase(),note=s(b.note,300),seats=n(b.seats),ex=b.exp_years==null||b.exp_years===''?null:n(b.exp_years);
 if(!role)return J({error:'Choose Driver or Captain.'},400);
 if(nm.length<2)return J({error:'Enter your full name.'},400);
 if(!/^[79]\d{6}$/.test(ph))return J({error:'Enter a valid 7-digit mobile number.'},400);
 if(!ISL.includes(isl))return J({error:'Choose your island.'},400);
 if(!/^[A-Z0-9]{4,20}$/.test(idn))return J({error:'Enter your ID card number.'},400);
 if(lic.length<3)return J({error:'Enter your licence number.'},400);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(lexp)||!(new Date(lexp+'T23:59:59').getTime()>now))return J({error:'Licence expiry date must be in the future.'},400);
 const vt=await DB.prepare('SELECT mode FROM vtypes WHERE id=? AND active=1').bind(s(b.vtype,16)).first();
 if(!vt||(role==='captain')!==(vt.mode==='sea'))return J({error:'Choose a ride type that matches your role.'},400);
 if(make.length<2||plate.length<2)return J({error:'Enter the vehicle details.'},400);
 if(seats===null||seats<1||seats>40)return J({error:'Enter the number of passenger seats (1 to 40).'},400);
 if(ex!==null&&(ex<0||ex>60))return J({error:'Years of experience must be 0 to 60.'},400);
 const pho=b.photos||{},okp=x=>typeof x==='string'&&x.length<=450000&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(x);
 if(!okp(pho.person)||!okp(pho.licence)||!okp(pho.vehicle))return J({error:'Please add all three photos.'},400);
 if(b.consent!==true)return J({error:'Please tick the confirmation box.'},400);
 if(await DB.prepare('SELECT id FROM drivers WHERE id=? OR phone=?').bind(ph,ph).first())return J({error:'This number is already registered as a driver.'},409);
 if(await DB.prepare("SELECT id FROM applications WHERE phone=? AND status='pending'").bind(ph).first())return J({error:'An application for this number is already waiting for review.'},409);
 const cnt=await DB.prepare('SELECT COUNT(*) c FROM applications WHERE ip=? AND created>?').bind(ip,now-86400000).first();
 if(cnt&&cnt.c>=3)return J({error:'Too many applications from this connection today. Try again tomorrow.'},429);
 const id=hex(crypto.getRandomValues(new Uint8Array(4))).toUpperCase();
 await DB.prepare('INSERT INTO applications(id,role,name,phone,island,id_no,licence_no,licence_exp,vtype,make,plate,seats,exp_years,note,photo_person,photo_licence,photo_vehicle,status,created,ip) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,role,nm,ph,isl,idn,lic,lexp,s(b.vtype,16),make,plate,Math.round(seats),ex,note,pho.person,pho.licence,pho.vehicle,'pending',now,ip).run();
 return J({ok:1,ref:id})}
if(p.startsWith('/api/admin/')&&m==='POST'){
 if(!KEY||!env.ADMIN_KEY)return J({error:'Set AUTH_SECRET and ADMIN_KEY first.'},500);
 const ip=req.headers.get('cf-connecting-ip')||'x';
 const fl=await DB.prepare('SELECT n,t FROM admin_fails WHERE ip=?').bind(ip).first();
 if(fl&&fl.n>=10&&now-fl.t<900000)return J({error:'Too many wrong attempts. Wait 15 minutes.'},429);
 if(await sha(tokOf())!==await sha(env.ADMIN_KEY)){
  await DB.prepare('INSERT INTO admin_fails(ip,n,t) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET n=CASE WHEN ?-t>900000 THEN 1 ELSE n+1 END,t=?').bind(ip,now,now,now).run();
  return J({error:'Wrong admin key.'},401)}
 if(fl)await DB.prepare('DELETE FROM admin_fails WHERE ip=?').bind(ip).run();
 const a=p.slice(11);
 if(a==='drivers'){const {results}=await DB.prepare('SELECT id,name,car,plate,lat,lng,updated,vtype,phone,island,role FROM drivers ORDER BY name').all();return J({drivers:results})}
 if(a==='save'){
  const id=String(b.id||'').trim(),pin=String(b.pin||''),nm=String(b.name||'').trim().slice(0,40),car=String(b.car||'').trim().slice(0,30),plate=String(b.plate||'').trim().slice(0,12);
  if(!/^[\w-]{2,20}$/.test(id))return J({error:'ID: 2 to 20 letters, numbers, - or _.'},400);
  if(!nm)return J({error:'Name is required.'},400);
  const vt=String(b.vtype||'');
  if(!await DB.prepare('SELECT id FROM vtypes WHERE id=?').bind(vt).first())return J({error:'Choose a vehicle type.'},400);
  const ex=await DB.prepare('SELECT id FROM drivers WHERE id=?').bind(id).first();
  if((!ex||pin)&&!/^\d{4,8}$/.test(pin))return J({error:ex?'PIN must be 4 to 8 digits.':'New drivers need a 4 to 8 digit PIN.'},400);
  if(ex){await DB.prepare('UPDATE drivers SET name=?,car=?,plate=?,vtype=? WHERE id=?').bind(nm,car,plate,vt,id).run();
   if(pin)await DB.prepare('UPDATE drivers SET pin=? WHERE id=?').bind(await sha(pin+id+KEY),id).run()}
  else await DB.prepare('INSERT INTO drivers(id,name,car,plate,pin,vtype) VALUES(?,?,?,?,?,?)').bind(id,nm,car,plate,await sha(pin+id+KEY),vt).run();
  return J({ok:1})}
 if(a==='delete'){await DB.prepare('DELETE FROM drivers WHERE id=?').bind(String(b.id||'')).run();return J({ok:1})}
 if(a==='rides'){const {results}=await DB.prepare('SELECT r.id,r.rider,r.pn,r.dn,r.fare,r.opt,r.status,r.created,r.sched,r.note,d.name dname FROM rides r LEFT JOIN drivers d ON d.id=r.driver_id ORDER BY r.created DESC LIMIT 50').all();return J({rides:results})}
 if(a==='cancel'){await DB.prepare("UPDATE rides SET status='cancelled' WHERE id=? AND status IN ('requested','accepted','arrived','started')").bind(String(b.id||'')).run();return J({ok:1})}
 if(a==='vtypes'){const {results}=await DB.prepare('SELECT * FROM vtypes ORDER BY sort,name').all();return J({vtypes:results})}
 if(a==='vtype_save'){
  const nn=v=>v===''||v==null?null:n(v),id=String(b.id||'').trim().toLowerCase(),nm=String(b.name||'').trim().slice(0,30),seats=nn(b.seats),base=nn(b.base),pk=nn(b.per_km),mf=nn(b.min_fare),mo=b.mode==='sea'?'sea':'land';
  if(!/^[a-z0-9_-]{2,16}$/.test(id))return J({error:'ID: 2 to 16 lowercase letters or numbers.'},400);
  if(!nm||seats===null||seats<1||seats>40||[base,pk,mf].some(x=>x===null||x<0))return J({error:'Fill in name, seats and fares (numbers, 0 or more).'},400);
  await DB.prepare('INSERT INTO vtypes(id,name,seats,base,per_km,min_fare,active,mode) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,seats=excluded.seats,base=excluded.base,per_km=excluded.per_km,min_fare=excluded.min_fare,active=excluded.active,mode=excluded.mode').bind(id,nm,Math.round(seats),base,pk,mf,b.active?1:0,mo).run();
  return J({ok:1})}
 if(a==='apps'){const {results}=await DB.prepare("SELECT id,role,name,phone,island,make,plate,status,created FROM applications ORDER BY (status='pending') DESC,created DESC LIMIT 100").all();return J({apps:results})}
 if(a==='app'){const x=await DB.prepare('SELECT * FROM applications WHERE id=?').bind(String(b.id||'')).first();return x?J({app:x}):J({error:'not found'},404)}
 if(a==='app_approve'){
  const ap=await DB.prepare("SELECT * FROM applications WHERE id=? AND status='pending'").bind(String(b.id||'')).first();
  if(!ap)return J({error:'Application not found or already decided.'},404);
  if(await DB.prepare('SELECT id FROM drivers WHERE id=?').bind(ap.phone).first())return J({error:'A driver with this phone number already exists.'},409);
  if(!await DB.prepare('SELECT id FROM vtypes WHERE id=?').bind(ap.vtype).first())return J({error:'That ride type no longer exists. Re-create it in Vehicles first.'},409);
  const pin=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  await DB.batch([
   DB.prepare('INSERT INTO drivers(id,name,car,plate,pin,vtype,phone,island,role,licence_no,licence_exp,app_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(ap.phone,ap.name,ap.make,ap.plate,await sha(pin+ap.phone+KEY),ap.vtype,ap.phone,ap.island,ap.role,ap.licence_no,ap.licence_exp,ap.id),
   DB.prepare("UPDATE applications SET status='approved',decided=?,driver_id=? WHERE id=?").bind(now,ap.phone,ap.id)]);
  let sent=null;
  try{sent=await sms(env,'+960'+ap.phone,`Meemu Move: your ${ap.role==='captain'?'captain':'driver'} application is approved. Sign in at ${new URL(req.url).origin}/driver.html with ID ${ap.phone} and PIN ${pin}.`)}catch(e){sent=false}
  return J({ok:1,driver_id:ap.phone,pin,sms:sent})}
 if(a==='app_reject'){
  const ap=await DB.prepare("SELECT id,phone FROM applications WHERE id=? AND status='pending'").bind(String(b.id||'')).first();
  if(!ap)return J({error:'Application not found or already decided.'},404);
  const why=String(b.reason||'').trim().slice(0,140);
  await DB.prepare("UPDATE applications SET status='rejected',decided=?,reason=? WHERE id=?").bind(now,why,ap.id).run();
  try{await sms(env,'+960'+ap.phone,'Meemu Move: we could not approve your application.'+(why?' Reason: '+why:''))}catch(e){}
  return J({ok:1})}
 if(a==='app_delete'){await DB.prepare('DELETE FROM applications WHERE id=?').bind(String(b.id||'')).run();return J({ok:1})}
 if(a==='places'){const {results}=await DB.prepare('SELECT id,name,lat,lng,sort,island FROM places ORDER BY sort,name').all();return J({places:results})}
 if(a==='place_save'){
  const nz=v=>v==null||v===''?null:n(v),nm=String(b.name||'').trim().slice(0,60),la=nz(b.lat),lo=nz(b.lng),pid=nz(b.id),so=nz(b.sort),isl=String(b.island||'');
  if(!nm)return J({error:'Name is required.'},400);
  if(!ISL.includes(isl))return J({error:'Choose an island.'},400);
  if((la===null)!==(lo===null)||(la!==null&&(Math.abs(la)>90||Math.abs(lo)>180)))return J({error:'Set a valid location.'},400);
  try{if(pid)await DB.prepare('UPDATE places SET name=?,lat=?,lng=?,sort=?,island=? WHERE id=?').bind(nm,la,lo,so??0,isl,pid).run();
   else await DB.prepare('INSERT INTO places(name,lat,lng,sort,island) VALUES(?,?,?,?,?)').bind(nm,la,lo,so??100,isl).run()}
  catch(e){return J({error:'A place with that name already exists.'},409)}
  return J({ok:1})}
 if(a==='place_delete'){await DB.prepare('DELETE FROM places WHERE id=?').bind(n(b.id)).run();return J({ok:1})}
 return J({error:'not found'},404)}

if(p==='/api/rides'&&m==='POST'){
 const me=await who();if(!me)return J({error:'Please sign in.'},401);
 const vt=await DB.prepare('SELECT * FROM vtypes WHERE id=? AND active=1').bind(String(b.vtype||'')).first();
 if(!vt)return J({error:'Choose a ride type.'},400);
 const pl=async id=>id?await DB.prepare('SELECT name,lat,lng,island FROM places WHERE id=? AND lat IS NOT NULL').bind(n(id)).first():null;
 const pp=await pl(b.ppid),dp=await pl(b.dpid);
 const A=pp?{n:pp.name,la:pp.lat,lo:pp.lng}:{n:String(b.pn||'Pin').slice(0,60),la:num(b.plat),lo:num(b.plng)};
 const B=dp?{n:dp.name,la:dp.lat,lo:dp.lng}:{n:String(b.dn||'Pin').slice(0,60),la:num(b.dlat),lo:num(b.dlng)};
 if([A.la,A.lo,B.la,B.lo].some(x=>x===null))return J({error:'Invalid ride request'},400);
 if(pp&&dp&&pp.island&&dp.island){
  const cross=pp.island!==dp.island;
  if(cross&&vt.mode!=='sea')return J({error:'Vehicles stay on one island. Choose a boat for trips between islands.'},400);
  if(!cross&&vt.mode==='sea')return J({error:'Boats are for trips between islands.'},400)}
 const sched=b.sched==null?null:num(b.sched);
 if(b.sched!=null&&(sched===null||sched<now+540000||sched>now+2592000000))return J({error:'Pick a time between 10 minutes and 30 days from now.'},400);
 if(sched===null){
  const act=await DB.prepare("SELECT id FROM rides WHERE rider=? AND sched IS NULL AND status IN ('requested','accepted','arrived','started') AND created>?").bind(me,now-10800000).first();
  if(act)return J({error:'You already have an active ride.'},409)}
 else{
  const c=await DB.prepare("SELECT COUNT(*) c FROM rides WHERE rider=? AND sched>? AND status IN ('requested','accepted')").bind(me,now).first();
  if(c&&c.c>=5)return J({error:'You already have 5 upcoming bookings.'},409)}
 const id=crypto.randomUUID().replaceAll('-','').slice(0,12);
 await DB.prepare('INSERT INTO rides(id,rider,pn,plat,plng,dn,dlat,dlng,opt,fare,status,created,vtype,sched,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,me,A.n,A.la,A.lo,B.n,B.la,B.lo,vt.name.slice(0,30),fareOf(vt,A,B),'requested',now,vt.id,sched,String(b.note||'').trim().slice(0,140)).run();
 return J({id})}
if(p==='/api/my-rides'&&m==='GET'){
 const me=await who();if(!me)return J({error:'Please sign in.'},401);
 const {results}=await DB.prepare('SELECT r.id,r.status,r.pn,r.dn,r.fare,r.opt,r.sched,r.created,d.name dname FROM rides r LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.rider=? ORDER BY r.created DESC LIMIT 10').bind(me).all();
 return J({rides:results})}
const r=p.match(/^\/api\/rides\/(\w+)(\/cancel)?$/);
if(r){
 const me=await who();if(!me)return J({error:'Please sign in.'},401);
 const ride=await DB.prepare('SELECT * FROM rides WHERE id=? AND rider=?').bind(r[1],me).first();
 if(!ride)return J({error:'not found'},404);
 if(r[2]&&m==='POST'){
  if(!['requested','accepted'].includes(ride.status))return J({error:'Too late to cancel'},409);
  await DB.prepare("UPDATE rides SET status='cancelled' WHERE id=?").bind(ride.id).run();return J({ok:1})}
 if(m==='GET'){
  const driver=ride.driver_id?await DB.prepare('SELECT name,car,plate,lat,lng,updated FROM drivers WHERE id=?').bind(ride.driver_id).first():null;
  return J({ride:{id:ride.id,status:ride.status,fare:ride.fare,pn:ride.pn,dn:ride.dn,vtype:ride.vtype,opt:ride.opt,sched:ride.sched},driver})}
}
if(p.startsWith('/api/driver/')&&m==='POST'){
 if(!KEY)return J({error:'Server is missing AUTH_SECRET.'},500);
 const d=await DB.prepare('SELECT id,vtype FROM drivers WHERE id=? AND pin=?').bind(String(b.id||''),await sha(String(b.pin||'')+String(b.id||'')+KEY)).first();
 if(!d)return J({error:'Wrong driver ID or PIN'},401);
 const a=p.slice(12);
 if(a==='location'){const la=n(b.lat),lo=n(b.lng);if(la===null||lo===null)return J({error:'bad location'},400);
  await DB.prepare('UPDATE drivers SET lat=?,lng=?,updated=? WHERE id=?').bind(la,lo,now,d.id).run();return J({ok:1})}
 if(a==='requests'){
  const {results}=await DB.prepare("SELECT id,pn,plat,plng,dn,dlat,dlng,fare,opt,status,driver_id,sched,note FROM rides WHERE (status='requested' AND (vtype IS NULL OR vtype=?) AND ((sched IS NULL AND created>?) OR (sched IS NOT NULL AND sched>? AND sched<?))) OR (driver_id=? AND status IN ('accepted','arrived','started')) ORDER BY (sched IS NOT NULL),COALESCE(sched,-created) LIMIT 30").bind(d.vtype||'',now-600000,now-3600000,now+172800000,d.id).all();
  return J({rides:results})}
 if(a==='accept'){
  const x=await DB.prepare("UPDATE rides SET status='accepted',driver_id=? WHERE id=? AND status='requested' AND (vtype IS NULL OR vtype=?)").bind(d.id,String(b.ride||''),d.vtype||'').run();
  return x.meta.changes?J({ok:1}):J({error:'Ride already taken or cancelled'},409)}
 if(a==='status'&&NEXT.includes(b.status)){
  const x=await DB.prepare('UPDATE rides SET status=? WHERE id=? AND driver_id=?').bind(b.status,String(b.ride||''),d.id).run();
  return x.meta.changes?J({ok:1}):J({error:'Not your ride'},409)}
}
return J({error:'not found'},404)}}
