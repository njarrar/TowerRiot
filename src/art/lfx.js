// @ts-nocheck
/* TowerRiot art library: canvas painters for towers, the Hollow, Wren and terrain.
   Two passes per object: "base" paints matter, "emit" paints things that glow. */
export const LFX=(function(){
const TAU=Math.PI*2;
function rng(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
// value noise
function makeNoise(seed){const r=rng(seed),p=new Float32Array(256*256);for(let i=0;i<p.length;i++)p[i]=r();
 const f=t=>t*t*(3-2*t);
 function n(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=f(x-xi),yf=f(y-yi);const g=(a,b)=>p[((b&255)<<8)|(a&255)];
  const a=g(xi,yi),b=g(xi+1,yi),c=g(xi,yi+1),d=g(xi+1,yi+1);return a+(b-a)*xf+(c-a)*yf+(a-b-c+d)*xf*yf;}
 return function fbm(x,y,o){o=o||4;let s=0,amp=.5,fr=1;for(let i=0;i<o;i++){s+=amp*n(x*fr,y*fr);amp*=.5;fr*=2.03;}return s;};}
const N=makeNoise(7);
const mix=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function hex(c){c=c.replace('#','');return[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];}
function rgb(a,al){return al==null?`rgb(${a[0]|0},${a[1]|0},${a[2]|0})`:`rgba(${a[0]|0},${a[1]|0},${a[2]|0},${al})`;}
function shade(c,k){const a=hex(c);return rgb(a.map(v=>clamp(v*k,0,255)));}

/* ---------- shared painting tools ---------- */
function poly(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();}
function shadow(ctx,x,y,rx,ry,a){ctx.save();const g=ctx.createRadialGradient(x,y,0,x,y,rx);g.addColorStop(0,`rgba(0,0,0,${a||.7})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.translate(-x,-y);ctx.beginPath();ctx.arc(x,y,rx,0,TAU);ctx.fill();ctx.restore();}
function glow(ctx,x,y,r,col,a){const c=hex(col);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgb(c,a));g.addColorStop(.35,rgb(c,a*.45));g.addColorStop(1,rgb(c,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
// stone courses inside a clip polygon. light: 1 lit face, .6 front, .35 side
function masonry(ctx,clip,x0,y0,x1,y1,base,light,seed,opt){opt=opt||{};const r=rng(seed);ctx.save();poly(ctx,clip);ctx.clip();
 const b=hex(base);ctx.fillStyle=rgb(b.map(v=>v*light*.55));ctx.fillRect(x0-2,y0-2,x1-x0+4,y1-y0+4);
 const ch=opt.ch||9;let row=0;
 for(let y=y1;y>y0-ch;y-=ch,row++){let x=x0-r()*14;while(x<x1){const w=(opt.bw||16)*(0.7+r()*0.7);const k=light*(0.78+r()*0.4);
   ctx.fillStyle=rgb(b.map(v=>v*k));const g=1;ctx.fillRect(x+g,y-ch+g,w-g*2,ch-g*2);
   // top lip catches moonlight
   ctx.fillStyle=`rgba(190,205,230,${0.07*light})`;ctx.fillRect(x+g,y-ch+g,w-g*2,1);
   // chips and pits
   if(r()<.35){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x+g+r()*(w-6),y-ch+g+r()*(ch-4),2,1.5);}
   if(r()<.12){ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.moveTo(x+w-2,y-ch+1);ctx.lineTo(x+w-2-r()*6,y-ch+1);ctx.lineTo(x+w-2,y-ch+1+r()*6);ctx.fill();}
   x+=w;}}
 // grime from the ground up and soot
 const gg=ctx.createLinearGradient(0,y1,0,y0);gg.addColorStop(0,'rgba(10,12,8,.55)');gg.addColorStop(.4,'rgba(10,12,8,0)');ctx.fillStyle=gg;ctx.fillRect(x0-2,y0-2,x1-x0+4,y1-y0+4);
 if(opt.moss){for(let i=0;i<opt.moss;i++){const mx=x0+r()*(x1-x0),my=y1-Math.pow(r(),2)*(y1-y0)*.45;ctx.fillStyle=`rgba(${60+r()*20},${78+r()*20},${50},${.25+r()*.3})`;ctx.beginPath();ctx.ellipse(mx,my,1+r()*3,0.8+r()*1.6,0,0,TAU);ctx.fill();}}
 ctx.restore();}
function planks(ctx,clip,x0,y0,x1,y1,base,light,seed,vertical){const r=rng(seed);ctx.save();poly(ctx,clip);ctx.clip();const b=hex(base);
 ctx.fillStyle=rgb(b.map(v=>v*light*.5));ctx.fillRect(x0,y0,x1-x0,y1-y0);
 if(vertical){for(let x=x0;x<x1;){const w=4+r()*3;ctx.fillStyle=rgb(b.map(v=>v*light*(0.75+r()*.35)));ctx.fillRect(x+.6,y0,w-1.2,y1-y0);
   ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=.5;for(let k=0;k<3;k++){const gx=x+1+r()*(w-2);ctx.beginPath();ctx.moveTo(gx,y0);ctx.lineTo(gx+r()-.5,y1);ctx.stroke();}x+=w;}}
 else{for(let y=y0;y<y1;){const h=3+r()*2;ctx.fillStyle=rgb(b.map(v=>v*light*(0.75+r()*.35)));ctx.fillRect(x0,y+.5,x1-x0,h-1);y+=h;}}
 ctx.restore();}
function frostDust(ctx,x0,y0,x1,y1,n,seed,topBias){const r=rng(seed);for(let i=0;i<n;i++){const x=x0+r()*(x1-x0);const t=topBias?Math.pow(r(),2.2):r();const y=y0+t*(y1-y0);ctx.fillStyle=`rgba(${200+r()*40},${225+r()*30},255,${.25+r()*.5})`;ctx.fillRect(x,y,1+r()*1.6,1+r()*1.2);}}
function icicle(ctx,x,y,len,w){const g=ctx.createLinearGradient(x,y,x,y+len);g.addColorStop(0,'rgba(220,240,255,.9)');g.addColorStop(1,'rgba(150,200,235,.2)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-w,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w*.2,y+len);ctx.closePath();ctx.fill();}
function bolt(ctx,x0,y0,x1,y1,seed,spread,width,col){const r=rng(seed);const pts=[[x0,y0]];const n=12;for(let i=1;i<n;i++){const t=i/n;pts.push([mix(x0,x1,t)+(r()-.5)*spread,mix(y0,y1,t)+(r()-.5)*spread]);}pts.push([x1,y1]);
 const path=()=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);pts.forEach(p=>ctx.lineTo(p[0],p[1]));};
 ctx.save();ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
 ctx.strokeStyle=col||'rgba(150,135,255,.18)';ctx.lineWidth=width*6;path();ctx.stroke();
 ctx.strokeStyle='rgba(185,175,255,.45)';ctx.lineWidth=width*2.2;path();ctx.stroke();
 ctx.strokeStyle='rgba(250,248,255,.95)';ctx.lineWidth=width*.8;path();ctx.stroke();
 // forks
 for(let k=0;k<3;k++){const i=2+Math.floor(r()*(n-4));let [fx,fy]=pts[i];ctx.beginPath();ctx.moveTo(fx,fy);for(let j=0;j<4;j++){fx+=(r()-.3)*spread*.9;fy+=(r()-.2)*spread*.9;ctx.lineTo(fx,fy);}ctx.strokeStyle='rgba(200,190,255,.5)';ctx.lineWidth=width*.6;ctx.stroke();}
 ctx.restore();}

/* ---------- TOWERS (origin = base centre on the ground, s = scale) ---------- */
// 1. Watch tower with ballista. Replaces the bolt spire.
function watchTower(ctx,x,y,s,pass,seed){seed=seed||11;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const bw=30,tw=25,h=118,dep=13;
 if(pass==='base'){
  shadow(ctx,14,4,58,16,.75);
  // rubble at the foot
  const r=rng(seed);for(let i=0;i<9;i++){const rx=-40+r()*80,ry=-2+r()*8,rw=3+r()*6;ctx.fillStyle=shade('#4a4a4c',.5+r()*.5);ctx.beginPath();ctx.ellipse(rx,ry,rw,rw*.55,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(160,175,200,.12)';ctx.fillRect(rx-rw*.6,ry-rw*.5,rw,1);}
  // right side face (dark)
  masonry(ctx,[[bw,0],[bw+dep,-dep*.7],[tw+dep,-h-dep*.7],[tw,-h]],bw-2,-h-dep,bw+dep+2,2,'#6b6862',.34,seed+1,{ch:9,bw:9});
  // front face
  masonry(ctx,[[-bw,0],[bw,0],[tw,-h],[-tw,-h]],-bw,-h,bw,0,'#6b6862',.78,seed+2,{ch:9,moss:40});
  // left edge catches moon
  ctx.strokeStyle='rgba(170,190,220,.18)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-bw,0);ctx.lineTo(-tw,-h);ctx.stroke();
  // string course ledge
  ctx.fillStyle='#3a3936';ctx.fillRect(-tw-4,-h*.52,tw*2+8+dep*.6,5);ctx.fillStyle='rgba(180,195,220,.16)';ctx.fillRect(-tw-4,-h*.52,tw*2+8,1);
  // arrow slit, deep
  ctx.fillStyle='#050608';ctx.fillRect(-2.5,-h*.4,5,20);ctx.fillRect(-6,-h*.4+7,12,3);
  // soot above slit
  const sg=ctx.createLinearGradient(0,-h*.4,0,-h*.4-26);sg.addColorStop(0,'rgba(0,0,0,.45)');sg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sg;ctx.fillRect(-6,-h*.4-26,12,26);
  // timber hoarding
  const hy=-h, hh=24, hw=38;
  // struts
  ctx.strokeStyle='#2a1f16';ctx.lineWidth=3;[-hw+4,-8,8,hw-4].forEach(sx=>{ctx.beginPath();ctx.moveTo(sx*.62,hy+16);ctx.lineTo(sx,hy);ctx.stroke();});
  planks(ctx,[[-hw,hy],[hw,hy],[hw,hy-hh],[-hw,hy-hh]],-hw,hy-hh,hw,hy,'#7a5a3c',.62,seed+3,true);
  planks(ctx,[[hw,hy],[hw+dep,hy-dep*.7],[hw+dep,hy-hh-dep*.7],[hw,hy-hh]],hw,hy-hh-dep,hw+dep,hy,'#7a5a3c',.3,seed+4,true);
  // iron band and nails on hoarding
  ctx.fillStyle='#1b1c1f';ctx.fillRect(-hw,hy-hh+5,hw*2,2.4);ctx.fillRect(-hw,hy-5,hw*2,2.4);
  ctx.fillStyle='rgba(200,200,210,.35)';for(let i=-hw+4;i<hw;i+=8){ctx.fillRect(i,hy-hh+5.3,1,1);ctx.fillRect(i,hy-4.7,1,1);}
  // top deck (seen from above)
  planks(ctx,[[-hw,hy-hh],[hw,hy-hh],[hw+dep,hy-hh-dep*.7],[-hw+dep,hy-hh-dep*.7]],-hw,hy-hh-dep,hw+dep,hy-hh,'#8a6a48',.9,seed+5,false);
  // crenel posts
  [-hw,-hw+18,hw-18,hw-4].forEach((px,i)=>{ctx.fillStyle='#2e231a';ctx.fillRect(px,hy-hh-12,5,12);ctx.fillStyle='rgba(220,190,150,.18)';ctx.fillRect(px,hy-hh-12,5,1.2);});
  // ballista
  ctx.save();ctx.translate(4,hy-hh-10);ctx.rotate(-.32);
  ctx.fillStyle='#3a2a1c';ctx.fillRect(-26,-3,52,6);ctx.fillStyle='rgba(230,200,150,.2)';ctx.fillRect(-26,-3,52,1);
  // bow arms (iron, recurved)
  ctx.strokeStyle='#26272b';ctx.lineWidth=3.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(14,0);ctx.quadraticCurveTo(8,-14,-2,-24);ctx.moveTo(14,0);ctx.quadraticCurveTo(8,14,-2,24);ctx.stroke();
  ctx.strokeStyle='rgba(190,200,215,.35)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(13,-1);ctx.quadraticCurveTo(7,-14,-2,-23);ctx.stroke();
  ctx.strokeStyle='rgba(210,200,180,.6)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-2,-24);ctx.lineTo(-14,0);ctx.lineTo(-2,24);ctx.stroke();
  // bolt
  ctx.strokeStyle='#5a4630';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(30,0);ctx.stroke();ctx.fillStyle='#1d1e22';poly(ctx,[[30,-3],[38,0],[30,3]]);ctx.fill();
  ctx.fillStyle='#1d1e22';ctx.fillRect(-6,-5,8,10);
  ctx.restore();
  // lantern bracket + lantern frame
  ctx.strokeStyle='#18191c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-hw+2,hy-6);ctx.lineTo(-hw-12,hy-6);ctx.lineTo(-hw-12,hy+2);ctx.stroke();
  ctx.fillStyle='#16171a';ctx.fillRect(-hw-17,hy+2,10,14);ctx.fillStyle='#24180c';ctx.fillRect(-hw-15,hy+4,6,10);
  poly(ctx,[[-hw-18,hy+2],[-hw-12,hy-2],[-hw-6,hy+2]]);ctx.fillStyle='#16171a';ctx.fill();
 } else {
  const hy=-h,hw=38;
  // lantern flame and slit glow
  glow(ctx,-hw-12,hy+9,40,'#ff9a3a',.35);
  ctx.fillStyle='#ffd08a';ctx.fillRect(-hw-14.5,hy+5,5,8);ctx.fillStyle='#fff1cf';ctx.fillRect(-hw-13,hy+7,2,4);
  ctx.strokeStyle='#16171a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-hw-12,hy+3);ctx.lineTo(-hw-12,hy+15);ctx.stroke();
  glow(ctx,0,-h*.4+10,16,'#ff8a2a',.35);ctx.fillStyle='rgba(255,150,60,.75)';ctx.fillRect(-1,-h*.4+3,2,14);
  // warm spill on the wall under the lantern
  ctx.globalCompositeOperation='lighter';const wg=ctx.createRadialGradient(-hw+4,hy+10,0,-hw+4,hy+10,40);wg.addColorStop(0,'rgba(255,140,50,.22)');wg.addColorStop(1,'rgba(255,140,50,0)');ctx.fillStyle=wg;ctx.fillRect(-hw-10,hy-30,70,80);ctx.globalCompositeOperation='source-over';
 }
 ctx.restore();}

// 2. Frost bell. Replaces the frost obelisk.
function frostBell(ctx,x,y,s,pass,seed){seed=seed||21;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const pw=40,ph=26,dep=14,colW=11,colH=84,top=-ph-colH;
 if(pass==='base'){
  // frost creeping over the ground
  const r=rng(seed);ctx.save();ctx.translate(0,2);ctx.scale(1,.32);const fg=ctx.createRadialGradient(0,0,0,0,0,80);fg.addColorStop(0,'rgba(170,205,230,.28)');fg.addColorStop(1,'rgba(170,205,230,0)');ctx.fillStyle=fg;ctx.beginPath();ctx.arc(0,0,80,0,TAU);ctx.fill();ctx.restore();
  for(let i=0;i<160;i++){const a=r()*TAU,d=Math.sqrt(r())*76;ctx.fillStyle=`rgba(210,232,250,${.15+r()*.35})`;ctx.fillRect(Math.cos(a)*d,2+Math.sin(a)*d*.32,1.2,1);}
  shadow(ctx,14,3,58,15,.7);
  // plinth
  masonry(ctx,[[pw,0],[pw+dep,-dep*.7],[pw+dep,-ph-dep*.7],[pw,-ph]],pw,-ph-dep,pw+dep,0,'#5d6168',.32,seed+1,{ch:8,bw:8});
  masonry(ctx,[[-pw,0],[pw,0],[pw,-ph],[-pw,-ph]],-pw,-ph,pw,0,'#5d6168',.74,seed+2,{ch:8,bw:20,moss:12});
  masonry(ctx,[[-pw,-ph],[pw,-ph],[pw+dep,-ph-dep*.7],[-pw+dep,-ph-dep*.7]],-pw,-ph-dep,pw+dep,-ph,'#5d6168',.95,seed+3,{ch:5,bw:22});
  frostDust(ctx,-pw,-ph-dep*.7,pw+dep,-ph,50,seed+4,false);
  // two columns
  [[-pw+3],[pw-colW-3]].forEach(([cx],i)=>{
   masonry(ctx,[[cx+colW,-ph-4],[cx+colW+6,-ph-8],[cx+colW+6,top-6],[cx+colW,top-2]],cx+colW,top-8,cx+colW+6,-ph,'#5d6168',.3,seed+10+i,{ch:8,bw:6});
   masonry(ctx,[[cx,-ph-4],[cx+colW,-ph-4],[cx+colW,top-2],[cx,top-2]],cx,top-2,cx+colW,-ph-4,'#5d6168',.72,seed+12+i,{ch:8,bw:11});
   frostDust(ctx,cx,top,cx+colW,-ph,14,seed+20+i,true);});
  // arch of voussoirs
  const ax=0,ay=top+2,R1=pw-3,R2=pw+9;const nv=9;
  for(let i=0;i<nv;i++){const a0=Math.PI+i*Math.PI/nv,a1=Math.PI+(i+1)*Math.PI/nv;const k=.6+((i*37)%10)/40;
   poly(ctx,[[ax+Math.cos(a0)*R1,ay+Math.sin(a0)*R1*.82],[ax+Math.cos(a0)*R2,ay+Math.sin(a0)*R2*.82],[ax+Math.cos(a1)*R2,ay+Math.sin(a1)*R2*.82],[ax+Math.cos(a1)*R1,ay+Math.sin(a1)*R1*.82]]);
   ctx.fillStyle=shade('#5d6168',k);ctx.fill();ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1;ctx.stroke();}
  // keystone
  poly(ctx,[[-5,ay-R1*.82],[5,ay-R1*.82],[7,ay-R2*.82-3],[-7,ay-R2*.82-3]]);ctx.fillStyle=shade('#5d6168',.85);ctx.fill();
  frostDust(ctx,-R2,ay-R2*.82-4,R2,ay-R1*.6,35,seed+5,true);
  // beam and yoke
  ctx.fillStyle='#2b2018';ctx.fillRect(-pw+6,top+6,pw*2-12,6);ctx.fillStyle='rgba(220,200,170,.15)';ctx.fillRect(-pw+6,top+6,pw*2-12,1);
  ctx.fillStyle='#17181b';ctx.fillRect(-6,top+11,12,6);
  // bell: dark iron, rim catches moonlight
  const by=top+17,bh=46;
  ctx.beginPath();ctx.moveTo(-6,by);ctx.bezierCurveTo(-16,by+2,-17,by+20,-20,by+bh-8);ctx.quadraticCurveTo(-24,by+bh,-25,by+bh+2);ctx.lineTo(25,by+bh+2);ctx.quadraticCurveTo(24,by+bh,20,by+bh-8);ctx.bezierCurveTo(17,by+20,16,by+2,6,by);ctx.closePath();
  const bg=ctx.createLinearGradient(-25,0,25,0);bg.addColorStop(0,'#4a5560');bg.addColorStop(.3,'#2b3138');bg.addColorStop(.75,'#14171b');bg.addColorStop(1,'#0c0e10');ctx.fillStyle=bg;ctx.fill();
  // verdigris patches and engraved band
  ctx.save();ctx.clip();const vr=rng(seed+6);for(let i=0;i<40;i++){ctx.fillStyle=`rgba(${70+vr()*30},${110+vr()*30},${105+vr()*20},${.12+vr()*.18})`;ctx.beginPath();ctx.ellipse(-20+vr()*40,by+vr()*bh,1+vr()*4,1+vr()*2,0,0,TAU);ctx.fill();}
  ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-19,by+bh-14);ctx.quadraticCurveTo(0,by+bh-11,19,by+bh-14);ctx.stroke();ctx.strokeStyle='rgba(170,190,205,.18)';ctx.beginPath();ctx.moveTo(-19,by+bh-13);ctx.quadraticCurveTo(0,by+bh-10,19,by+bh-13);ctx.stroke();
  // the crack
  ctx.strokeStyle='#050607';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(8,by+bh+2);ctx.lineTo(10,by+bh-6);ctx.lineTo(7,by+bh-13);ctx.lineTo(11,by+bh-22);ctx.stroke();
  // rime on the shoulder
  frostDust(ctx,-16,by,16,by+14,40,seed+7,true);ctx.restore();
  ctx.fillStyle='rgba(160,185,210,.35)';ctx.fillRect(-25,by+bh+1,50,1.2);
  // clapper
  ctx.fillStyle='#0b0c0e';ctx.beginPath();ctx.arc(-3,by+bh+5,4,0,TAU);ctx.fill();
  // icicles under the beam and arch
  const ir=rng(seed+8);for(let i=0;i<14;i++){const ix=-pw+8+ir()*(pw*2-16);if(Math.abs(ix)<9)continue;icicle(ctx,ix,top+12,5+ir()*12,1+ir()*1.2);}
  for(let i=0;i<8;i++){const ix=-pw+ir()*pw*2;icicle(ctx,ix,-ph,3+ir()*7,.8+ir());}
 } else {
  const by=top+17,bh=46;
  // cold light from inside the bell mouth, and breath of mist
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.save();ctx.translate(0,by+bh+2);ctx.scale(1,.3);const mg=ctx.createRadialGradient(0,0,0,0,0,28);mg.addColorStop(0,'rgba(170,225,255,.55)');mg.addColorStop(1,'rgba(170,225,255,0)');ctx.fillStyle=mg;ctx.beginPath();ctx.arc(0,0,28,0,TAU);ctx.fill();ctx.restore();
  glow(ctx,0,by+bh+6,46,'#7cc8ef',.22);
  ctx.restore();
 }
 ctx.restore();}

// 3. Storm pylon. Replaces the spark coil.
function stormPylon(ctx,x,y,s,pass,seed,target){seed=seed||31;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const pw=30,ph=20,dep=12,mh=118;
 if(pass==='base'){
  shadow(ctx,16,3,52,14,.75);
  masonry(ctx,[[pw,0],[pw+dep,-dep*.7],[pw+dep,-ph-dep*.7],[pw,-ph]],pw,-ph-dep,pw+dep,0,'#57575a',.3,seed+1,{ch:7,bw:8});
  masonry(ctx,[[-pw,0],[pw,0],[pw,-ph],[-pw,-ph]],-pw,-ph,pw,0,'#57575a',.72,seed+2,{ch:7,bw:18,moss:10});
  masonry(ctx,[[-pw,-ph],[pw,-ph],[pw+dep,-ph-dep*.7],[-pw+dep,-ph-dep*.7]],-pw,-ph-dep,pw+dep,-ph,'#57575a',.9,seed+3,{ch:5,bw:20});
  // scorch on top of plinth
  const sg=ctx.createRadialGradient(6,-ph-4,0,6,-ph-4,26);sg.addColorStop(0,'rgba(0,0,0,.6)');sg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sg;ctx.fillRect(-24,-ph-20,60,24);
  // lattice mast: two rails tapering, X bracing
  const b0=-ph-4, t0=b0-mh, lw0=17, lw1=6, ox=6;
  const L=t=>[-lw0+(lw0-lw1)*t+ox*t, b0+(t0-b0)*t], Rr=t=>[lw0-(lw0-lw1)*t+ox*t, b0+(t0-b0)*t];
  ctx.lineCap='round';
  const rail=(f,w,c)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();for(let i=0;i<=20;i++){const p=f(i/20);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.stroke();};
  // bracing
  ctx.strokeStyle='#1e1f22';ctx.lineWidth=1.6;for(let i=0;i<8;i++){const a=i/8,b=(i+1)/8;const pa=L(a),pb=Rr(b),pc=Rr(a),pd=L(b);ctx.beginPath();ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pb[0],pb[1]);ctx.moveTo(pc[0],pc[1]);ctx.lineTo(pd[0],pd[1]);ctx.stroke();
   ctx.beginPath();ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pc[0],pc[1]);ctx.stroke();}
  rail(L,3.4,'#2a2b2f');rail(Rr,3.4,'#141517');rail(L,1,'rgba(180,195,215,.3)');
  // rivets
  ctx.fillStyle='rgba(200,205,215,.4)';for(let i=0;i<=8;i++){const p=L(i/8),q=Rr(i/8);ctx.fillRect(p[0]-.6,p[1]-.6,1.3,1.3);ctx.fillRect(q[0]-.6,q[1]-.6,1.3,1.3);}
  // copper coil around the middle
  for(let i=0;i<16;i++){const t=.36+i*.012;const p=L(t),q=Rr(t);const cx=(p[0]+q[0])/2,w=(q[0]-p[0])/2+4;
   ctx.strokeStyle=i%2?'#3a2414':'#52321c';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(cx,p[1],w,2.2,0,0,Math.PI);ctx.stroke();
   ctx.strokeStyle='rgba(255,180,120,.22)';ctx.lineWidth=.5;ctx.beginPath();ctx.ellipse(cx,p[1],w,2.2,0,Math.PI*.6,Math.PI*.85);ctx.stroke();}
  // ceramic insulators near the top
  for(let i=0;i<4;i++){const t=.86+i*.035;const p=L(t),q=Rr(t);const cx=(p[0]+q[0])/2;const w=9-i*1.2;
   const g=ctx.createLinearGradient(cx-w,0,cx+w,0);g.addColorStop(0,'#9a958a');g.addColorStop(.4,'#5e5a52');g.addColorStop(1,'#25241f');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cx,p[1],w,3,0,0,TAU);ctx.fill();
   ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(cx,p[1]+1.5,w*.9,1.2,0,0,TAU);ctx.fill();}
  // crown rod and ring
  const tp=L(1),tq=Rr(1),cx=(tp[0]+tq[0])/2;
  ctx.strokeStyle='#1a1b1e';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(cx,tp[1]);ctx.lineTo(cx,tp[1]-20);ctx.stroke();
  ctx.strokeStyle='#3a2a20';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(cx,tp[1]-14,8,2.6,0,0,TAU);ctx.stroke();
  // stay cables to the plinth
  ctx.strokeStyle='rgba(20,20,22,.9)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(cx,tp[1]-4);ctx.lineTo(-pw+2,-ph);ctx.moveTo(cx,tp[1]-4);ctx.lineTo(pw+dep-2,-ph-dep*.7);ctx.stroke();
 } else {
  const b0=-ph-4,t0=b0-mh, cx=6, topY=t0-14;
  ctx.save();ctx.globalCompositeOperation='lighter';glow(ctx,cx,topY,46,'#9d8fff',.3);glow(ctx,cx,topY,10,'#f2efff',.7);ctx.restore();
  // hum on the coil
  ctx.save();ctx.globalCompositeOperation='lighter';glow(ctx,4,b0-mh*.4,24,'#ff8a40',.12);ctx.restore();
  if(target){bolt(ctx,cx,topY,(target[0]-x)/s,(target[1]-y)/s,seed+9,22,2.2);}
  else{bolt(ctx,cx,topY,cx+50,topY-22,seed+9,12,1.2);bolt(ctx,cx,topY,cx-38,topY+6,seed+12,10,1);}
 }
 ctx.restore();}

/* ---------- THE HOLLOW (origin = ground under the body) ---------- */
// Grub: eyeless segmented larva. Glow lives in its seams, not in a face.
// ph is the walk phase in radians; left out, the grub stands still (menu icons).
function grub(ctx,x,y,s,pass,seed,face,ph){seed=seed||41;face=face||1;const walk=ph!=null;ph=ph||0;ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);
 const segs=[];const n=9;for(let i=0;i<n;i++){const t=i/(n-1);const px=-48+t*92;const py=-10-Math.sin(t*Math.PI)*6+Math.sin(t*9+seed)*1.2+(walk?Math.sin(ph-t*5)*1.8:0);const r=6+Math.sin(t*Math.PI)*9-Math.max(0,(t-.75)*8);segs.push([px,py,r]);}
 if(pass==='base'){
  // slime trail behind
  ctx.save();ctx.translate(-70,0);ctx.scale(1,.25);const tg=ctx.createLinearGradient(-50,0,40,0);tg.addColorStop(0,'rgba(20,30,28,0)');tg.addColorStop(1,'rgba(20,34,30,.75)');ctx.fillStyle=tg;ctx.beginPath();ctx.ellipse(0,0,50,14,0,0,TAU);ctx.fill();ctx.restore();
  ctx.fillStyle='rgba(150,190,180,.12)';ctx.fillRect(-100,-1,60,1);
  shadow(ctx,6,1,62,10,.8);
  // legs: hooked, many, under the body
  const r=rng(seed);ctx.strokeStyle='#0b0c0d';ctx.lineWidth=1.6;ctx.lineCap='round';
  // Walking, a ripple runs down the legs from tail to head, each one reaching forward then planting.
  segs.forEach(([px,py,rr],i)=>{if(i==0||i==n-1)return;for(const side of[-1,1]){const lx=px+side*2,q=ph*2-i*1.1+(side>0?Math.PI:0),fx=walk?Math.sin(q)*3.5:0,fy=walk?Math.max(0,Math.cos(q))*2.2:0;ctx.beginPath();ctx.moveTo(lx,py+rr*.5);ctx.quadraticCurveTo(lx+side*3+(r()-.5)*3+fx*.5,py+rr+3-fy,lx+side*5+fx,-.5-fy);ctx.stroke();}});
  // segments from tail to head
  segs.forEach(([px,py,rr],i)=>{
   const g=ctx.createRadialGradient(px-rr*.4,py-rr*.6,1,px,py,rr*1.3);g.addColorStop(0,'#3a3d3f');g.addColorStop(.5,'#191b1c');g.addColorStop(1,'#08090a');
   ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(px,py,rr*.95,rr,0,0,TAU);ctx.fill();
   // chitin ridge, rim light from lantern side (left top)
   ctx.strokeStyle='rgba(255,190,120,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(px,py,rr*.9,rr*.95,0,Math.PI*1.1,Math.PI*1.55);ctx.stroke();
   // pits and bristles
   ctx.fillStyle='rgba(0,0,0,.5)';for(let k=0;k<3;k++){ctx.fillRect(px-rr*.4+r()*rr*.8,py-rr*.3+r()*rr*.6,1.2,1.2);}
   ctx.strokeStyle='rgba(60,60,58,.8)';ctx.lineWidth=.6;for(let k=0;k<3;k++){const a=-Math.PI*.5+(r()-.5)*1.4;ctx.beginPath();ctx.moveTo(px+Math.cos(a)*rr,py+Math.sin(a)*rr);ctx.lineTo(px+Math.cos(a)*(rr+3),py+Math.sin(a)*(rr+3));ctx.stroke();}
  });
  // head: blunt wedge overlapping thorax, split mandibles, no eyes
  const [hx,hy,hr]=segs[n-1];
  ctx.fillStyle='#0d0e0f';ctx.beginPath();ctx.moveTo(hx-hr*1.6,hy-hr-1.5);ctx.quadraticCurveTo(hx+hr+6,hy-hr*.6,hx+hr+7,hy+1);ctx.quadraticCurveTo(hx+hr,hy+hr+.5,hx-hr*1.6,hy+hr+1);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#c9bfa8';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(hx+hr+4,hy-2);ctx.quadraticCurveTo(hx+hr+13,hy-6,hx+hr+15,hy+1);ctx.moveTo(hx+hr+4,hy+3);ctx.quadraticCurveTo(hx+hr+12,hy+7,hx+hr+13,hy+1.5);ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=.6;ctx.stroke();
 } else {
  // seams leak the Hollow
  ctx.save();ctx.globalCompositeOperation='lighter';
  const gr=rng(seed+2);for(let i=2;i<n-1;i++){if(gr()<.35)continue;const [px,py,rr]=segs[i];const sx=px-rr*.6;const a0=Math.PI*(.05+gr()*.15),a1=a0+Math.PI*(.15+gr()*.25);const al=.25+gr()*.4;
   ctx.strokeStyle=`rgba(59,224,184,${al*.25})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(sx,py,rr*.22,rr*.8,0,a0,a1);ctx.stroke();
   ctx.strokeStyle=`rgba(150,255,225,${al})`;ctx.lineWidth=.7;ctx.stroke();}
  // a sick light from under the belly
  ctx.save();ctx.translate(0,-2);ctx.scale(1,.2);glow(ctx,0,0,50,'#3be0b8',.12);ctx.restore();
  // drip from the mouth
  const [hx,hy,hr]=segs[n-1];glow(ctx,hx+hr+6,hy+3,5,'#3be0b8',.18);
  ctx.restore();
 }
 ctx.restore();}

// Moth: torn wings, vein glow, body hairs. Flies, so its shadow sits far below.
function moth(ctx,x,y,s,pass,seed,alt){seed=seed||51;alt=alt==null?60:alt;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const wing=(side,fore)=>{const k=side;ctx.beginPath();if(fore){ctx.moveTo(0,-6);ctx.bezierCurveTo(k*20,-30,k*58,-44,k*78,-36);ctx.bezierCurveTo(k*74,-20,k*62,-8,k*40,0);ctx.bezierCurveTo(k*22,4,k*8,2,0,0);}
   else{ctx.moveTo(0,2);ctx.bezierCurveTo(k*20,4,k*48,8,k*56,26);ctx.bezierCurveTo(k*44,40,k*20,34,k*6,18);ctx.closePath();}ctx.closePath();};
 if(pass==='base'){
  shadow(ctx,0,alt,46,8,.55);
  const r=rng(seed);
  for(const side of[-1,1]){for(const fore of[false,true]){
   ctx.save();wing(side,fore);
   const g=ctx.createLinearGradient(0,-30,side*70,20);g.addColorStop(0,'#4a4036');g.addColorStop(.55,'#2b241d');g.addColorStop(1,'#14110e');ctx.fillStyle=g;ctx.fill();
   ctx.clip();
   // dusty scale pattern
   for(let i=0;i<220;i++){const px=side*r()*78,py=-44+r()*80;ctx.fillStyle=`rgba(${70+r()*40},${60+r()*30},${50},${r()*.18})`;ctx.fillRect(px,py,1.4,1.4);}
   // dim false eyespot, rings only
   if(fore){ctx.strokeStyle='rgba(120,110,90,.35)';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(side*46,-22,7,5,side*.4,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(0,0,0,.6)';ctx.beginPath();ctx.ellipse(side*46,-22,3.5,2.5,side*.4,0,TAU);ctx.stroke();}
   // veins
   ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=.9;for(let v=0;v<5;v++){const a=fore?-.15-v*.13:.2+v*.18;ctx.beginPath();ctx.moveTo(0,fore?-3:4);ctx.quadraticCurveTo(side*30*Math.cos(a)+side*6,(fore?-3:4)+30*Math.sin(a)-4,side*80*Math.cos(a),(fore?-3:4)+80*Math.sin(a));ctx.stroke();}
   // torn edges: bite out notches
   ctx.globalCompositeOperation='destination-out';for(let i=0;i<7;i++){const tx=side*(30+r()*50),ty=fore?-40+r()*44:8+r()*32;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx+side*(4+r()*8),ty-3-r()*4);ctx.lineTo(tx+side*(2+r()*6),ty+3+r()*5);ctx.fill();}
   ctx.restore();
   // leading edge highlight
   if(fore){ctx.strokeStyle='rgba(200,180,150,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-6);ctx.bezierCurveTo(side*20,-30,side*58,-44,side*78,-36);ctx.stroke();}
  }}
  // body: furred thorax, segmented abdomen
  ctx.fillStyle='#120f0c';ctx.beginPath();ctx.ellipse(0,-2,6.5,9,0,0,TAU);ctx.fill();
  for(let i=0;i<60;i++){const a=r()*TAU,d=5+r()*3;ctx.strokeStyle=`rgba(${60+r()*40},${50+r()*30},40,.6)`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(Math.cos(a)*d*.7,-2+Math.sin(a)*d);ctx.lineTo(Math.cos(a)*(d+2.5)*.7,-2+Math.sin(a)*(d+2.5));ctx.stroke();}
  for(let i=0;i<6;i++){ctx.fillStyle=shade('#2a231c',1-i*.1);ctx.beginPath();ctx.ellipse(0,8+i*4.2,4.5-i*.5,2.6,0,0,TAU);ctx.fill();}
  // feathered antennae
  for(const side of[-1,1]){ctx.strokeStyle='#1a1612';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(side*2,-10);ctx.quadraticCurveTo(side*8,-22,side*16,-26);ctx.stroke();ctx.lineWidth=.5;for(let i=0;i<9;i++){const t=i/9;const ax=side*(2+t*14),ay=-10-t*16;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+side*3,ay-1);ctx.moveTo(ax,ay);ctx.lineTo(ax-side*1,ay-3.5);ctx.stroke();}}
  // dangling legs
  ctx.strokeStyle='#0d0b09';ctx.lineWidth=.9;[-1,1].forEach(sd=>{for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(sd*3,-2+i*4);ctx.lineTo(sd*8,4+i*5);ctx.lineTo(sd*7,10+i*5);ctx.stroke();}});
 } else {
  // the glow runs in a few wing veins and the body joint
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const side of[-1,1]){[[-.28,.9]].forEach(([a,len])=>{const fore=a<0;const ex=side*70*len*Math.cos(a),ey=(fore?-3:4)+70*len*Math.sin(a);
   ctx.strokeStyle='rgba(59,224,184,.08)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(side*3,fore?-3:4);ctx.quadraticCurveTo(side*26,(fore?-3:4)+20*Math.sin(a)-4,ex,ey);ctx.stroke();
   ctx.strokeStyle='rgba(140,250,220,.3)';ctx.lineWidth=.5;ctx.stroke();});}
  glow(ctx,0,4,9,'#3be0b8',.3);
  ctx.restore();
 }
 ctx.restore();}

// Shellback, frost adapted: a long, hunched plated beast seen from the side.
// Adaptation shows as rime on the plates and broken ice pushed out of the seams, mostly at the back.
// ph is the walk phase in radians; left out, it stands still.
function shellback(ctx,x,y,s,pass,seed,face,frost,ph){seed=seed||61;face=face||1;frost=frost==null?1:frost;const walk=ph!=null;ph=ph||0;ctx.save();ctx.translate(x,y);ctx.scale(s*face,s);
 const RX=54,RY=36,cy=-12,NB=8;
 const topY=px=>cy-RY*Math.sqrt(Math.max(0,1-(px/RX)*(px/RX)));
 const seamX=j=>-RX*.92+j*(RX*1.84/NB);
 const seam=j=>{const x0=seamX(j),pts=[];for(let k=0;k<=10;k++){const t=k/10;const xx=x0+Math.sin(t*Math.PI)*-4+t*x0*-.08;pts.push([xx,cy+(topY(xx)-cy)*t]);}return pts;};
 if(pass==='base'){
  shadow(ctx,10,2,74,12,.85);
  const r=rng(seed);
  // legs: thick, jointed, mostly in shadow
  // Walking, legs swing in diagonal pairs: one pair plants and pushes back while the other lifts and reaches.
  [-36,-16,6,26].forEach((lx,i)=>{const q=ph+(i%2)*Math.PI,fx=walk?Math.sin(q)*7:0,up=walk?Math.max(0,Math.cos(q))*4.5:0;ctx.fillStyle='#0a0b0c';poly(ctx,[[lx-6,cy+2],[lx+6,cy+2],[lx+8+fx*.5,-6-up*.6],[lx+10+fx,-up],[lx-2+fx,-up],[lx-4+fx*.5,-6-up*.6]]);ctx.fill();ctx.fillStyle='rgba(180,170,150,.14)';ctx.fillRect(lx-2+fx*.5,-7-up*.6,9,1);});
  // belly
  ctx.fillStyle='#0c0d0e';ctx.beginPath();ctx.ellipse(0,cy+2,RX*.98,9,0,0,TAU);ctx.fill();
  // head: low, armoured, tusks; tucked under the front plate
  ctx.fillStyle='#24252a';ctx.beginPath();ctx.moveTo(RX-14,cy-10);ctx.quadraticCurveTo(RX+16,cy-10,RX+20,cy+6);ctx.quadraticCurveTo(RX+8,cy+12,RX-12,cy+8);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(190,200,215,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(RX-10,cy-9);ctx.quadraticCurveTo(RX+10,cy-9,RX+16,cy-2);ctx.stroke();
  ctx.strokeStyle='#bdb3a0';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(RX+14,cy+7);ctx.quadraticCurveTo(RX+25,cy+9,RX+27,cy-2);ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=.8;ctx.stroke();
  // dome, painted band by band (back to front so each front plate laps the one behind)
  for(let j=0;j<NB;j++){const A=seam(j),B=seam(j+1);ctx.save();ctx.beginPath();ctx.moveTo(A[0][0],A[0][1]);A.forEach(p=>ctx.lineTo(p[0],p[1]));
   for(let k=0;k<=8;k++){const xx=mix(A[A.length-1][0],B[B.length-1][0],k/8);ctx.lineTo(xx,topY(xx)-1);}
   for(let k=B.length-1;k>=0;k--)ctx.lineTo(B[k][0],B[k][1]);ctx.closePath();ctx.clip();
   const tone=.85+r()*.3;const g=ctx.createLinearGradient(0,cy-RY,0,cy+2);g.addColorStop(0,shade('#57534c',tone));g.addColorStop(.55,shade('#2a2a2b',tone));g.addColorStop(1,'#0e0f10');ctx.fillStyle=g;ctx.fillRect(-RX-4,cy-RY-4,RX*2+8,RY+8);
   // stone grain, pits, a few cracks
   for(let k=0;k<70;k++){const px=-RX+r()*RX*2,py=cy-RY+r()*RY;ctx.fillStyle=r()<.55?`rgba(0,0,0,${.2+r()*.3})`:`rgba(185,180,170,${r()*.1})`;ctx.fillRect(px,py,1+r()*2,1+r()*1.4);}
   if(r()<.5){ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=.7;const sx=mix(A[5][0],B[5][0],.5);ctx.beginPath();ctx.moveTo(sx,cy-RY*.7);ctx.lineTo(sx+3,cy-RY*.45);ctx.lineTo(sx+1,cy-RY*.2);ctx.stroke();}
   // the plate's front lip is raised and catches light
   ctx.strokeStyle='rgba(200,195,185,.16)';ctx.lineWidth=1.4;ctx.beginPath();B.forEach((p,k)=>k?ctx.lineTo(p[0]-1.5,p[1]):ctx.moveTo(p[0]-1.5,p[1]));ctx.stroke();
   ctx.restore();
   // seam shadow
   ctx.strokeStyle='#050506';ctx.lineWidth=2;ctx.beginPath();B.forEach((p,k)=>k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(j<NB-1)ctx.stroke();}
  // dome outline, moon edge on the upper left
  ctx.strokeStyle='rgba(185,195,215,.24)';ctx.lineWidth=1.3;ctx.beginPath();for(let k=0;k<=20;k++){const xx=-RX*.92+k*(RX*.9/20);k?ctx.lineTo(xx,topY(xx)):ctx.moveTo(xx,topY(xx));}ctx.stroke();
  // tail plate
  ctx.fillStyle='#1a1a1b';ctx.beginPath();ctx.moveTo(-RX*.9,cy+2);ctx.quadraticCurveTo(-RX-12,cy,-RX-14,cy+8);ctx.quadraticCurveTo(-RX-2,cy+8,-RX*.8,cy+4);ctx.fill();
  if(frost){
   // rime: thick on the back half, thin toward the head
   for(let i=0;i<200;i++){const px=-RX*.9+Math.pow(r(),1.6)*RX*1.6;const ty=topY(px);const py=ty+Math.pow(r(),2.2)*RY*.7;ctx.fillStyle=`rgba(${205+r()*40},${228+r()*27},255,${.15+r()*.45})`;ctx.fillRect(px,py,1+r()*1.6,1+r());}
   // broken ice pushed out of seams, leaning back
   const sr=rng(seed+3);const shards=[];
   for(let j=1;j<NB-1;j++){const sx=seamX(j);const weight=1-(j/NB);const cnt=sr()<weight*1.4?1+Math.floor(sr()*2*weight+.3):0;
    for(let k=0;k<cnt;k++){const t=.75+sr()*.25;const px=sx-2+sr()*4;const py=cy+(topY(px)-cy)*t;shards.push([px,py,-.5-sr()*.7+(px/RX)*.5,(8+sr()*16)*(.6+weight*.6),2+sr()*3.5]);}}
   shards.forEach(([sx,sy,ang,len,w])=>{ctx.save();ctx.translate(sx,sy);ctx.rotate(ang);
    const g=ctx.createLinearGradient(-w,0,w,0);g.addColorStop(0,'rgba(230,245,255,.92)');g.addColorStop(.5,'rgba(150,195,225,.8)');g.addColorStop(1,'rgba(50,90,125,.9)');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-w,2);ctx.lineTo(-w*.6,-len*.6);ctx.lineTo(-w*.1,-len);ctx.lineTo(w*.5,-len*.7);ctx.lineTo(w,1);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-w*.1,-len);ctx.lineTo(-w*.2,1);ctx.stroke();ctx.restore();});
   // frozen drip along the belly line
   const ir=rng(seed+5);for(let i=0;i<9;i++){icicle(ctx,-RX*.8+ir()*RX*1.2,cy+3,3+ir()*6,.8+ir()*.8);}
  }
 } else {
  ctx.save();ctx.globalCompositeOperation='lighter';
  // the Hollow shows low in the seams, near the belly, broken up
  const gr=rng(seed+7);for(let j=1;j<NB;j++){if(gr()<.3)continue;const S=seam(j);const a=1+Math.floor(gr()*2),b=a+2+Math.floor(gr()*2);
   ctx.beginPath();for(let k=a;k<=b;k++)k===a?ctx.moveTo(S[k][0],S[k][1]):ctx.lineTo(S[k][0],S[k][1]);
   ctx.strokeStyle='rgba(59,224,184,.14)';ctx.lineWidth=3.5;ctx.stroke();ctx.strokeStyle='rgba(150,255,225,.5)';ctx.lineWidth=.8;ctx.stroke();}
  ctx.restore();
 }
 ctx.restore();}

// Wren in the field: a tall hooded keeper in slate-navy cloak and rust-red scarf with lantern and spear.
function wren(ctx,x,y,s,pass){ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 if(pass==='base'){shadow(ctx,4,1,16,4,.8);
  // Flowing rust-red scarf tail behind shoulder
  ctx.fillStyle='#96331e';poly(ctx,[[5,-28],[13,-20],[10,-14],[4,-22]]);ctx.fill();
  // Spear shaft and bright steel head
  ctx.strokeStyle='#5a4630';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(9,2);ctx.lineTo(14,-44);ctx.stroke();
  ctx.fillStyle='#dce6f0';poly(ctx,[[14,-44],[16.5,-53],[12.2,-45]]);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(14,-44);ctx.lineTo(16.2,-52.5);ctx.stroke();
  // Slate-navy traveller's cloak with warm lantern-lit edge
  const cg=ctx.createLinearGradient(-10,-38,10,0);cg.addColorStop(0,'#2c3346');cg.addColorStop(.6,'#1f2433');cg.addColorStop(1,'#141822');
  ctx.fillStyle=cg;ctx.beginPath();ctx.moveTo(0,-38);ctx.quadraticCurveTo(-8.5,-36,-8.5,-24);ctx.lineTo(-11.5,0);ctx.lineTo(10.5,0);ctx.lineTo(7.5,-24);ctx.quadraticCurveTo(7.5,-36,0,-38);ctx.fill();
  ctx.fillStyle='rgba(255,186,96,.38)';ctx.beginPath();ctx.moveTo(-8.5,-25);ctx.lineTo(-11.5,0);ctx.lineTo(-6.8,0);ctx.lineTo(-4.8,-25);ctx.fill();
  ctx.strokeStyle='rgba(190,205,230,.22)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(7.2,-25);ctx.lineTo(10.2,-1);ctx.stroke();
  // Signature rust-red scarf collar
  ctx.fillStyle='#b8442a';ctx.beginPath();ctx.moveTo(-7.5,-29);ctx.quadraticCurveTo(0,-25,7.2,-28.5);ctx.lineTo(6.5,-23.5);ctx.quadraticCurveTo(0,-20.5,-6.8,-24);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#df6848';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(-7,-28.5);ctx.quadraticCurveTo(0,-25,6.8,-28);ctx.stroke();
  // Hood and face shadow
  ctx.fillStyle='#23293a';ctx.beginPath();ctx.ellipse(0,-37,5.8,6.7,0,0,TAU);ctx.fill();
  ctx.fillStyle='#06080c';ctx.beginPath();ctx.ellipse(1.2,-35.5,3,3.6,0,0,TAU);ctx.fill();
  // Lantern arm and brass-capped lantern
  ctx.strokeStyle='#23293a';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-7,-22);ctx.lineTo(-13,-14);ctx.stroke();
  ctx.fillStyle='#22201d';ctx.fillRect(-16,-14,6,8);ctx.fillStyle='#9e7838';ctx.fillRect(-16.5,-15,7,1.8);ctx.fillRect(-16.5,-6.5,7,1.4);
 } else {glow(ctx,-13,-10,28,'#ffa040',.5);ctx.fillStyle='#ffe8b4';ctx.fillRect(-14.5,-12.2,3,4.8);}
 ctx.restore();}

/* ---------- small ruin pieces for the map ---------- */
function block(ctx,x,y,w,h,d,seed,col){col=col||'#5a5852';masonry(ctx,[[x+w,y],[x+w+d,y-d*.7],[x+w+d,y-h-d*.7],[x+w,y-h]],x+w,y-h-d,x+w+d,y,col,.3,seed,{ch:7,bw:7});
 masonry(ctx,[[x,y],[x+w,y],[x+w,y-h],[x,y-h]],x,y-h,x+w,y,col,.7,seed+1,{ch:7,bw:13,moss:Math.floor(w/3)});
 masonry(ctx,[[x,y-h],[x+w,y-h],[x+w+d,y-h-d*.7],[x+d,y-h-d*.7]],x,y-h-d,x+w+d,y-h,col,.9,seed+2,{ch:4,bw:14});}
function ruinWall(ctx,x,y,len,seed){const r=rng(seed);let cx=x;const pieces=[];while(cx<x+len){const w=10+r()*14;const h=r()<.25?4+r()*6:12+r()*30;pieces.push([cx,w,h]);cx+=w;}
 shadow(ctx,x+len/2+12,y+3,len*.65,10,.6);pieces.forEach(([px,w,h],i)=>block(ctx,px,y,w,h,8,seed+i*7));
 // fallen stones
 for(let i=0;i<5;i++){const fx=x+r()*len,fy=y+4+r()*10;ctx.fillStyle=shade('#5a5852',.35+r()*.3);ctx.beginPath();ctx.ellipse(fx,fy,3+r()*4,2+r()*2,r(),0,TAU);ctx.fill();}}
function deadTree(ctx,x,y,s,seed,col){const r=rng(seed);ctx.save();ctx.translate(x,y);shadow(ctx,30*s,2,50*s,8*s,.5);ctx.strokeStyle=col||'#0c0b09';ctx.lineCap='round';
 const br=(bx,by,a,len,w,d)=>{if(d>6||len<3)return;const ex=bx+Math.cos(a)*len,ey=by+Math.sin(a)*len;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(bx,by);ctx.quadraticCurveTo((bx+ex)/2+(r()-.5)*len*.3,(by+ey)/2,ex,ey);ctx.stroke();
  const k=1+(r()<.7?1:0);for(let i=0;i<=k;i++)br(ex,ey,a+(r()-.5)*1.3,len*(.62+r()*.15),w*.62,d+1);};
 br(0,0,-Math.PI/2+(r()-.5)*.3,46*s,6*s,0);ctx.restore();}
/* a living tree for day maps: dark trunk, clustered crown lit from the upper right */
function leafyTree(ctx,x,y,s,seed,leaf){const r=rng(seed);leaf=leaf||'#4f7a3a';ctx.save();ctx.translate(x,y);
 shadow(ctx,26*s,3,48*s,10*s,.38);
 ctx.strokeStyle='#3a2c20';ctx.lineCap='round';ctx.lineWidth=6*s;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(2*s,-18*s,0,-34*s);ctx.stroke();
 ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(0,-22*s);ctx.lineTo(-10*s,-34*s);ctx.moveTo(1*s,-26*s);ctx.lineTo(11*s,-38*s);ctx.stroke();
 const blobs=[];for(let i=0;i<9;i++){const a=r()*TAU,d=r()*16*s;blobs.push([Math.cos(a)*d*1.2,-50*s+Math.sin(a)*d*.8,(11+r()*7)*s]);}
 blobs.sort((a,b)=>a[1]-b[1]);
 for(const[bx,by,br]of blobs){ctx.fillStyle=shade(leaf,.72);ctx.beginPath();ctx.arc(bx+1.5*s,by+2*s,br,0,TAU);ctx.fill();}
 for(const[bx,by,br]of blobs){const g=ctx.createRadialGradient(bx+br*.35,by-br*.4,br*.1,bx,by,br);g.addColorStop(0,shade(leaf,1.35));g.addColorStop(1,leaf);ctx.fillStyle=g;ctx.beginPath();ctx.arc(bx,by,br,0,TAU);ctx.fill();}
 for(let i=0;i<26;i++){const b=blobs[Math.floor(r()*blobs.length)];ctx.fillStyle=`rgba(255,250,210,${.12+r()*.15})`;ctx.fillRect(b[0]+(r()-.2)*b[2],b[1]-r()*b[2]*.8,1.6,1.2);}
 ctx.restore();}
function standingStone(ctx,x,y,h,seed){const r=rng(seed);shadow(ctx,x+10,y+2,18,5,.6);const w=8+r()*5;
 poly(ctx,[[x-w,y],[x+w,y],[x+w*.7,y-h],[x-w*.4,y-h-4]]);const g=ctx.createLinearGradient(x-w,0,x+w,0);g.addColorStop(0,'#55565a');g.addColorStop(.5,'#34353a');g.addColorStop(1,'#16171a');ctx.fillStyle=g;ctx.fill();
 ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-2,y-h*.3);ctx.lineTo(x+1,y-h*.45);ctx.lineTo(x-1,y-h*.6);ctx.stroke();}
function plot(ctx,x,y,seed,empty){const r=rng(seed);
 // a pale paved pad set into the ground, flat, so it reads as "build here" and not as a loose slab
 shadow(ctx,x+2,y+3,46,13,.22);
 ctx.save();ctx.translate(x,y);
 ctx.fillStyle='#8a8172';ctx.beginPath();ctx.ellipse(0,0,40,17,0,0,TAU);ctx.fill();
 const g=ctx.createLinearGradient(0,-16,0,14);g.addColorStop(0,'#e3dac6');g.addColorStop(1,'#c7bca5');
 ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,-1.5,36,14,0,0,TAU);ctx.fill();
 ctx.save();ctx.beginPath();ctx.ellipse(0,-1.5,36,14,0,0,TAU);ctx.clip();
 ctx.strokeStyle='rgba(96,84,66,.32)';ctx.lineWidth=1;
 ctx.beginPath();ctx.ellipse(0,-1.5,20,7.6,0,0,TAU);ctx.stroke();
 for(let k=0;k<8;k++){const a=k/8*TAU+r()*.2;ctx.beginPath();ctx.moveTo(Math.cos(a)*20,-1.5+Math.sin(a)*7.6);ctx.lineTo(Math.cos(a)*38,-1.5+Math.sin(a)*15);ctx.stroke();}
 for(let k=0;k<14;k++){ctx.fillStyle=`rgba(${90+r()*30},${110+r()*30},${60+r()*20},.35)`;const a=r()*TAU,d=24+r()*12;ctx.fillRect(Math.cos(a)*d,-1.5+Math.sin(a)*d*.39,1.5+r()*2,1);}
 ctx.restore();
 ctx.strokeStyle='rgba(255,250,236,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-1.5,36,14,0,Math.PI*1.05,Math.PI*1.95);ctx.stroke();
 ctx.restore();}

/* ---------- vignette tiles: one subject on its own patch of ground ---------- */
function groundTile(ctx,W,H,seed,tint){const img=ctx.createImageData(W,H);const d=img.data;const nz=makeNoise(seed);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const n=nz(x/38,y/18,4),m=nz(x/9+50,y/5+50,3);let c=[mix(16,30,n),mix(17,28,n),mix(15,22,n)];
  if(tint==='frost'){const f=ss(.45,.7,n);c=[mix(c[0],52,f*.4),mix(c[1],62,f*.4),mix(c[2],72,f*.4)];}
  const k=.82+m*.35;const i=(y*W+x)*4;d[i]=c[0]*k;d[i+1]=c[1]*k;d[i+2]=c[2]*k;d[i+3]=255;}
 ctx.putImageData(img,0,0);}
const DKC={};function darkness(ctx,W,H,lights,amt){const key=W+'x'+H;if(!DKC[key]){const cc=document.createElement('canvas');cc.width=W;cc.height=H;DKC[key]=cc}const c=DKC[key];const x=c.getContext('2d');x.globalCompositeOperation='source-over';x.clearRect(0,0,W,H);
 const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,`rgba(6,9,16,${amt*.82})`);g.addColorStop(1,`rgba(3,4,8,${amt})`);x.fillStyle=g;x.fillRect(0,0,W,H);
 x.globalCompositeOperation='destination-out';lights.forEach(([lx,ly,r,s])=>{const gg=x.createRadialGradient(lx,ly,0,lx,ly,r);gg.addColorStop(0,`rgba(0,0,0,${s||1})`);gg.addColorStop(.5,`rgba(0,0,0,${(s||1)*.55})`);gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.beginPath();x.arc(lx,ly,r,0,TAU);x.fill();});
 ctx.drawImage(c,0,0);
 // warm colour where lanterns burn
 ctx.save();ctx.globalCompositeOperation='soft-light';lights.forEach(([lx,ly,r,s,col])=>{if(!col)return;const c2=hex(col);const gg=ctx.createRadialGradient(lx,ly,0,lx,ly,r);gg.addColorStop(0,rgb(c2,.55));gg.addColorStop(1,rgb(c2,0));ctx.fillStyle=gg;ctx.beginPath();ctx.arc(lx,ly,r,0,TAU);ctx.fill();});ctx.restore();}
function vignette(ctx,W,H,a){const g=ctx.createRadialGradient(W/2,H*.55,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${a})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
function fog(ctx,W,H,seed,t,a){const r=rng(seed);ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<14;i++){const fx=(r()*W*1.3+t*(6+r()*8))%(W*1.3)-W*.15,fy=r()*H,fr=120+r()*200;ctx.save();ctx.translate(fx,fy);ctx.scale(1,.35);const g=ctx.createRadialGradient(0,0,0,0,0,fr);g.addColorStop(0,`rgba(120,135,160,${a*(.5+r()*.5)})`);g.addColorStop(1,'rgba(120,135,160,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,fr,0,TAU);ctx.fill();ctx.restore();}ctx.restore();}

function setup(cv,W,H){const dpr=Math.min(2,window.devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return ctx;}

const SUBJECTS={
 watch:{W:300,H:300,draw:(c,p)=>watchTower(c,140,272,1.45,p),lights:[[60,140,170,.95,'#ff9a3a'],[150,170,150,.5]],tint:null},
 bell:{W:300,H:300,draw:(c,p)=>frostBell(c,142,270,1.55,p),lights:[[150,190,150,.9,'#8fd0ff'],[120,90,130,.45]],tint:'frost'},
 pylon:{W:300,H:300,draw:(c,p)=>stormPylon(c,136,276,1.45,p),lights:[[152,80,160,.9,'#a99cff'],[140,200,110,.5]],tint:null},
 grub:{W:300,H:300,draw:(c,p)=>grub(c,146,190,1.9,p),lights:[[70,120,170,.9,'#ff9a3a'],[170,180,110,.5]],tint:null,lamp:[40,110]},
 moth:{W:300,H:300,draw:(c,p)=>moth(c,150,120,1.75,p,51,80),lights:[[70,90,170,.9,'#ff9a3a'],[150,150,120,.5]],tint:null,lamp:[38,86]},
 shell:{W:300,H:300,draw:(c,p)=>shellback(c,138,214,1.9,p),lights:[[70,110,170,.9,'#ff9a3a'],[160,170,120,.55]],tint:'frost',lamp:[34,100]},
};
function paintSubject(cv,key){const S=SUBJECTS[key];const ctx=setup(cv,S.W,S.H);groundTile(ctx,S.W,S.H,key.length*13+5,S.tint);
 S.draw(ctx,'base');darkness(ctx,S.W,S.H,S.lights,.72);S.draw(ctx,'emit');
 if(S.lamp){/* off-frame lantern light hint */ctx.save();ctx.globalCompositeOperation='lighter';glow(ctx,S.lamp[0]-30,S.lamp[1]-10,70,'#ff9a3a',.12);ctx.restore();}
 vignette(ctx,S.W,S.H,.55);}

/* ---------- the map ---------- */
function catmull(pts,steps){const out=[];for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
 for(let k=0;k<steps;k++){const t=k/steps,t2=t*t,t3=t2*t;out.push([.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)]);}}
 out.push(pts[pts.length-1]);return out;}
function strokePts(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);}
function offset(pts,o,seed,jit){const r=makeNoise(seed);return pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let nx=-(b[1]-a[1]),ny=b[0]-a[0];const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;const j=(r(i*.15,3)-.5)*(jit||0);return[p[0]+nx*(o+j),p[1]+ny*(o+j)];});}

const MAP={W:1280,H:720};
MAP.road=catmull([[-30,190],[150,200],[290,300],[250,450],[400,560],[600,540],[700,430],[800,330],[950,300],[1060,390],[1180,430],[1300,420]],24);
MAP.river=catmull([[560,-30],[640,140],[760,300],[770,470],[690,620],[740,760]],24);
MAP.plots=[
 {x:150,y:330,t:'watch'},{x:430,y:440,t:'bell'},{x:560,y:330,t:null},{x:880,y:220,t:'pylon'},{x:990,y:520,t:'watch'},{x:1110,y:290,t:'bell'},{x:330,y:200,t:null}];
MAP.units=[{k:'grub',x:120,y:212,s:.6,f:1},{k:'grub',x:40,y:200,s:.55,f:1},{k:'grub',x:298,y:370,s:.6,f:-1},{k:'shell',x:262,y:446,s:.62,f:1},{k:'grub',x:530,y:556,s:.6,f:1},{k:'moth',x:740,y:220,s:.42,alt:70}];

function paintMap(cv,t){const W=MAP.W,H=MAP.H;const ctx=setup(cv,W,H);t=t||0;
 if(!MAP.bg){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');paintMapBase(x,W,H);MAP.bg=c;}
 ctx.drawImage(MAP.bg,0,0,W,H);
 // things that live above the ground, sorted by y so nearer things overlap farther ones
 const items=[];
 MAP.plots.forEach((p,i)=>{if(p.t)items.push({y:p.y,f:pass=>{if(p.t==='watch')watchTower(ctx,p.x,p.y-8,.62,pass,100+i);if(p.t==='bell')frostBell(ctx,p.x,p.y-8,.6,pass,100+i);if(p.t==='pylon')stormPylon(ctx,p.x,p.y-8,.6,pass,100+i,pass==='emit'?[742,232]:null);}});});
 MAP.units.forEach((u,i)=>{const wob=Math.sin(t*2+i)*1.2;items.push({y:u.y+(u.alt||0),f:pass=>{if(u.k==='grub')grub(ctx,u.x+wob,u.y,u.s,pass,40+i,u.f);if(u.k==='shell')shellback(ctx,u.x,u.y,u.s,pass,60+i,u.f,1);if(u.k==='moth')moth(ctx,u.x,u.y+Math.sin(t*3)*3,u.s,pass,50+i,u.alt);}});});
 items.push({y:500,f:pass=>wren(ctx,610,500,1.25,pass)});
 items.push({y:445,f:pass=>gate(ctx,1220,445,pass)});
 items.sort((a,b)=>a.y-b.y).forEach(it=>it.f('base'));
 const fl=1+Math.sin(t*7)*.03+Math.sin(t*13)*.02;
 darkness(ctx,W,H,[
  [150-24,330-90,190*fl,.95,'#ff9a3a'],[990-24,520-90,190*fl,.95,'#ff9a3a'],[598,488,150*fl,.95,'#ffa040'],[1220,400,240*fl,1,'#ffb050'],
  [430,410,150,.85,'#8fd0ff'],[262,430,110,.55],[1110,260,140,.8,'#8fd0ff'],[884,140,150,.85,'#a99cff'],[742,240,90,.5,'#a99cff'],[560,320,70,.3],[330,190,60,.25],[720,420,260,.35]],.8);
 items.forEach(it=>it.f('emit'));
 // frost pulse ring around the bell near the road
 ctx.save();ctx.globalCompositeOperation='lighter';const ph=(t*.6)%1;ctx.strokeStyle=`rgba(170,220,255,${.35*(1-ph)})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(430,436,40+ph*110,(40+ph*110)*.42,0,0,TAU);ctx.stroke();ctx.restore();
 // ballista bolt in flight from the tower to the grub, with a short trail
 ctx.save();ctx.globalCompositeOperation='lighter';const bx0=150,by0=262,bx1=300,by1=355,bt=(t*1.4)%1,bx=mix(bx0,bx1,bt),by=mix(by0,by1,bt);const tg=ctx.createLinearGradient(bx-(bx1-bx0)*.25,by-(by1-by0)*.25,bx,by);tg.addColorStop(0,'rgba(255,170,80,0)');tg.addColorStop(1,'rgba(255,210,150,.9)');ctx.strokeStyle=tg;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx-(bx1-bx0)*.25,by-(by1-by0)*.25);ctx.lineTo(bx,by);ctx.stroke();ctx.restore();
 fog(ctx,W,H,9,t*10,.05);
 vignette(ctx,W,H,.6);}

function gate(ctx,x,y,pass){ctx.save();ctx.translate(x,y);
 if(pass==='base'){shadow(ctx,10,6,120,24,.7);
  block(ctx,-90,0,40,110,18,301,'#5e5b55');block(ctx,40,0,40,110,18,305,'#5e5b55');
  // arch over the road
  masonry(ctx,[[-50,-70],[40,-70],[40,-110],[-50,-110]],-50,-110,40,-70,'#5e5b55',.7,309,{ch:8});
  ctx.fillStyle='#030406';ctx.beginPath();ctx.moveTo(-50,0);ctx.lineTo(-50,-50);ctx.quadraticCurveTo(-5,-86,40,-50);ctx.lineTo(40,0);ctx.fill();
  // iron portcullis teeth
  ctx.strokeStyle='#15161a';ctx.lineWidth=2;for(let i=-44;i<40;i+=9){ctx.beginPath();ctx.moveTo(i,-62);ctx.lineTo(i,-28);ctx.stroke();}
  // the great lantern on top
  ctx.fillStyle='#17181b';ctx.fillRect(-16,-140,22,30);poly(ctx,[[-20,-140],[-5,-156],[10,-140]]);ctx.fill();
 } else {glow(ctx,-5,-124,90,'#ffb050',.45);ctx.fillStyle='#ffd99a';ctx.fillRect(-12,-136,14,22);ctx.fillStyle='#fff4d8';ctx.fillRect(-8,-132,6,14);
  ctx.save();ctx.globalCompositeOperation='lighter';glow(ctx,-5,-30,70,'#ff9a3a',.18);ctx.restore();}
 ctx.restore();}

function paintMapBase(ctx,W,H){
 // 1. ground, roads and water as one per-pixel pass so edges stay ragged
 const mk=(fn)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');fn(x);return x.getImageData(0,0,W,H).data;};
 const roadM=mk(x=>{x.filter='blur(10px)';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.lineWidth=40;strokePts(x,MAP.road);x.stroke();const wn=makeNoise(91);for(let i=1;i<MAP.road.length;i++){x.lineWidth=36+wn(i*.06,2)*44;x.beginPath();x.moveTo(MAP.road[i-1][0],MAP.road[i-1][1]);x.lineTo(MAP.road[i][0],MAP.road[i][1]);x.stroke();}});
 const riverM=mk(x=>{x.filter='blur(14px)';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.lineWidth=74;strokePts(x,MAP.river);x.stroke();});
 const img=ctx.createImageData(W,H),d=img.data;const nA=makeNoise(3),nB=makeNoise(5);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;const n=nA(x/90,y/45,5),m=nB(x/7,y/3.5,3),q=nA(x/22+300,y/11,3);
  // earth, moss, bare stone
  let c=[mix(22,34,n),mix(21,31,n),mix(18,24,n)];const moss=ss(.5,.68,nB(x/60+20,y/30,4));c=[mix(c[0],26,moss),mix(c[1],36,moss),mix(c[2],22,moss)];
  const k=.78+m*.42;c=c.map(v=>v*k);
  // road: packed dirt, wheel ruts handled later, ragged edge from noise
  const ra=roadM[i+3]/255;const road=ss(.42,.62,ra+(q-.5)*.5);
  if(road>0){const rc=[mix(40,52,n)*(.85+m*.3),mix(37,46,n)*(.85+m*.3),mix(32,38,n)*(.85+m*.3)];c=c.map((v,j)=>mix(v,rc[j],road));}
  // river: black water, steep dark bank
  const wa=riverM[i+3]/255;const bank=ss(.25,.45,wa+(q-.5)*.3),water=ss(.55,.7,wa+(q-.5)*.2);
  if(bank>0)c=c.map(v=>v*(1-bank*.55));
  if(water>0){const sh=Math.pow(nB(x/40,y/9,2),2.4)*.9;const wc=[13+sh*34,17+sh*40,22+sh*50];c=c.map((v,j)=>mix(v,wc[j],water));}
  d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}
 ctx.putImageData(img,0,0);
 // 2. wheel ruts and hoof churn along the road
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 const rn=makeNoise(31);[[-10,1],[10,2],[-3,3]].forEach(([o,s],ri)=>{const p=offset(MAP.road,o,s,7);for(let i=1;i<p.length;i++){const v=rn(i*.08,ri*9);if(v<.42)continue;ctx.strokeStyle=`rgba(10,9,7,${ri==2?.18:(v-.42)*1.2})`;ctx.lineWidth=ri==2?7:3+v*2;ctx.beginPath();ctx.moveTo(p[i-1][0],p[i-1][1]);ctx.lineTo(p[i][0],p[i][1]);ctx.stroke();}});
 // puddles in the ruts reflect the sky
 const r=rng(77);for(let i=0;i<14;i++){const p=MAP.road[Math.floor(r()*MAP.road.length)];const o=(r()<.5?-11:11);ctx.fillStyle='rgba(30,40,55,.8)';ctx.beginPath();ctx.ellipse(p[0]+o*.3,p[1]+o*.3,5+r()*7,2+r()*2,r(),0,TAU);ctx.fill();ctx.fillStyle='rgba(140,160,190,.2)';ctx.fillRect(p[0]+o*.3-3,p[1]+o*.3-1,4,1);}
 // old flagstones left in places
 for(let i=0;i<120;i++){const idx=Math.floor(r()*MAP.road.length);const p=MAP.road[idx];if(nA(idx*.05,1)<.45)continue;const ox=(r()-.5)*36,oy=(r()-.5)*24;const w=5+r()*7;ctx.fillStyle=`rgba(${70+r()*20},${68+r()*18},${62+r()*15},.6)`;ctx.beginPath();ctx.moveTo(p[0]+ox,p[1]+oy);ctx.lineTo(p[0]+ox+w,p[1]+oy+r()*2);ctx.lineTo(p[0]+ox+w-1,p[1]+oy+w*.5);ctx.lineTo(p[0]+ox-1,p[1]+oy+w*.45);ctx.fill();ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(p[0]+ox,p[1]+oy+w*.45,w-1,1.2);}
 ctx.restore();
 // 3. river glints and reeds on the banks
 ctx.save();for(let i=0;i<70;i++){const p=MAP.river[Math.floor(r()*MAP.river.length)];ctx.fillStyle=`rgba(150,170,200,${.05+r()*.12})`;ctx.fillRect(p[0]+(r()-.5)*40,p[1]+(r()-.5)*20,6+r()*14,1);}
 const reedL=offset(MAP.river,-36,4,12),reedR=offset(MAP.river,36,6,12);
 [reedL,reedR].forEach(side=>{for(let i=0;i<side.length;i+=2){if(r()<.4)continue;const [px,py]=side[i];for(let k=0;k<4;k++){ctx.strokeStyle=`rgba(${30+r()*20},${36+r()*16},${22},.9)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px+k*2,py);ctx.quadraticCurveTo(px+k*2+(r()-.5)*6,py-6,px+k*2+(r()-.5)*8,py-10-r()*8);ctx.stroke();}}});
 ctx.restore();
 // 4. stone bridge where road meets river
 let best=[1e9,0,0];MAP.road.forEach((a,i)=>MAP.river.forEach(b=>{const dd=Math.hypot(a[0]-b[0],a[1]-b[1]);if(dd<best[0])best=[dd,i,0];}));
 const bi=best[1],ba=MAP.road[Math.max(0,bi-5)],bb=MAP.road[Math.min(MAP.road.length-1,bi+5)];const ang=Math.atan2(bb[1]-ba[1],bb[0]-ba[0]);const bc=MAP.road[bi];
 ctx.save();ctx.translate(bc[0],bc[1]);ctx.rotate(ang);
 shadow(ctx,4,18,70,12,.8);
 const bL=64,bW=26;masonry(ctx,[[-bL,-bW],[bL,-bW],[bL,bW],[-bL,bW]],-bL,-bW,bL,bW,'#5a5852',.75,401,{ch:6,bw:14});
 ctx.fillStyle='#2c2b28';ctx.fillRect(-bL,-bW-5,bL*2,5);ctx.fillRect(-bL,bW,bL*2,6);ctx.fillStyle='rgba(180,190,210,.18)';ctx.fillRect(-bL,-bW-5,bL*2,1);
 ctx.fillStyle='#141412';ctx.fillRect(-bL,bW+6,bL*2,5);
 ctx.restore();
 // 5. ruins, stones, trees
 ruinWall(ctx,40,600,150,501);ruinWall(ctx,860,640,190,511);ruinWall(ctx,470,120,90,521);
 standingStone(ctx,1010,180,34,1);standingStone(ctx,1035,190,26,2);standingStone(ctx,250,630,30,3);
 deadTree(ctx,40,120,1.1,7);deadTree(ctx,1180,150,1.3,8);deadTree(ctx,1220,640,1.0,9);deadTree(ctx,700,690,.9,10);deadTree(ctx,410,80,.8,11);
 MAP.plots.forEach((p,i)=>plot(ctx,p.x,p.y,600+i*3,!p.t));
}

/* ---------- new towers in the same style ---------- */
// Forge cannon: squat stone bastion, timber gun deck, iron mortar (barrel drawn live by cannonBarrel)
function forgeCannon(ctx,x,y,s,pass,seed){seed=seed||71;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const w=40,h=46,dep=16;
 if(pass==='base'){shadow(ctx,16,4,66,18,.75);
  masonry(ctx,[[w,0],[w+dep,-dep*.7],[w+dep-3,-h-dep*.7],[w-3,-h]],w-3,-h-dep,w+dep,2,'#5f5a52',.32,seed+1,{ch:9,bw:9});
  masonry(ctx,[[-w,0],[w,0],[w-3,-h],[-w+3,-h]],-w,-h,w,0,'#5f5a52',.78,seed+2,{ch:9,moss:30});
  // gun ports
  ctx.fillStyle='#050608';[-20,14].forEach(px=>{ctx.beginPath();ctx.moveTo(px,-12);ctx.lineTo(px,-24);ctx.quadraticCurveTo(px+5,-30,px+10,-24);ctx.lineTo(px+10,-12);ctx.fill()});
  // iron bands
  ctx.fillStyle='#1b1c1f';ctx.fillRect(-w,-h*.62,w*2,3);ctx.fillStyle='rgba(200,200,210,.3)';for(let i=-w+3;i<w;i+=9)ctx.fillRect(i,-h*.62+1,1,1);
  // gun deck
  planks(ctx,[[-w+3,-h],[w-3,-h],[w+dep-3,-h-dep*.7],[-w+dep+3,-h-dep*.7]],-w,-h-dep,w+dep,-h,'#7a5a3c',.85,seed+3,false);
  // sandbag / stone parapet on the back half
  for(let i=0;i<7;i++){const px=-w+10+i*11,py=-h-dep*.7-1;ctx.fillStyle=shade('#5a554c',.6+((i*37)%10)/25);ctx.beginPath();ctx.ellipse(px,py,6,3.4,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(190,200,220,.12)';ctx.fillRect(px-4,py-3,7,1)}
  // coal brazier for the fuse
  ctx.fillStyle='#16171a';ctx.fillRect(w-12,-h-dep*.7+2,10,7);
 } else {glow(ctx,w-7,-h-dep*.7+3,14,'#ff7a2a',.4);ctx.fillStyle='rgba(255,140,60,.8)';ctx.fillRect(w-10,-h-dep*.7+2,6,2)}
 ctx.restore();}
function cannonBarrel(ctx,x,y,s,aim,recoil,flash){ctx.save();ctx.translate(x,y-50*s);ctx.scale(s,s);
 const dx=Math.cos(aim),dy=Math.sin(aim)*.5,ang=Math.atan2(dy,dx);
 ctx.fillStyle='#1d1e22';ctx.beginPath();ctx.ellipse(0,4,14,6,0,0,TAU);ctx.fill();
 ctx.rotate(ang);const rc=-recoil*7;
 const g=ctx.createLinearGradient(0,-8,0,8);g.addColorStop(0,'#5a5d66');g.addColorStop(.45,'#2a2c32');g.addColorStop(1,'#0c0d10');
 ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(rc-6,-9);ctx.lineTo(rc+30,-7);ctx.lineTo(rc+30,7);ctx.lineTo(rc-6,9);ctx.closePath();ctx.fill();
 ctx.fillStyle='#16171a';ctx.fillRect(rc+4,-9,3,18);ctx.fillRect(rc+26,-8,5,16);ctx.fillStyle='rgba(200,205,215,.3)';ctx.fillRect(rc-6,-9,36,1);
 ctx.fillStyle='#020203';ctx.beginPath();ctx.ellipse(rc+31,0,2.4,5.5,0,0,TAU);ctx.fill();
 if(flash>0){ctx.globalCompositeOperation='lighter';const f=flash/.14;glow(ctx,rc+36,0,22,'#ffa040',.7*f);ctx.fillStyle=`rgba(255,230,180,${f})`;poly(ctx,[[rc+31,-5],[rc+50,0],[rc+31,5]]);ctx.fill()}
 ctx.restore();}
// Beacon: tall stone column with an iron fire cage. Fire drawn live by beaconFire.
function beaconTower(ctx,x,y,s,pass,seed){seed=seed||81;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const w=16,h=128,dep=10;
 if(pass==='base'){shadow(ctx,12,3,40,12,.75);
  block(ctx,-26,0,52,14,14,seed,'#5e5b55');
  masonry(ctx,[[w,-14],[w+dep,-14-dep*.7],[w+dep-2,-h-dep*.7],[w-2,-h]],w-2,-h-dep,w+dep,-12,'#66625b',.32,seed+3,{ch:8,bw:8});
  masonry(ctx,[[-w,-14],[w,-14],[w-2,-h],[-w+2,-h]],-w,-h,w,-14,'#66625b',.8,seed+4,{ch:8,bw:10,moss:16});
  ctx.fillStyle='#3a3936';ctx.fillRect(-w-3,-h*.55,w*2+6+dep*.5,4);
  // iron cage
  ctx.strokeStyle='#1a1b1e';ctx.lineWidth=2;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*5+2,-h-2);ctx.lineTo(i*6+3,-h-20);ctx.stroke()}
  ctx.beginPath();ctx.ellipse(3,-h-20,19,5,0,0,TAU);ctx.stroke();ctx.fillStyle='#120d08';ctx.beginPath();ctx.ellipse(3,-h-4,14,4,0,0,TAU);ctx.fill();
  // banner
  planks(ctx,[[-w,-h+10],[-w-2,-h+10],[-w-2,-h+52],[-w,-h+52]],-w-2,-h+10,-w,-h+52,'#3a2a1c',.6,seed+5,true);
  ctx.fillStyle='#5a1e14';ctx.beginPath();ctx.moveTo(-w-2,-h+12);ctx.lineTo(-w-22,-h+14);ctx.lineTo(-w-22,-h+44);ctx.lineTo(-w-12,-h+38);ctx.lineTo(-w-2,-h+44);ctx.fill();
  ctx.fillStyle='rgba(255,178,64,.25)';ctx.fillRect(-w-16,-h+22,6,10);
 }
 ctx.restore();}
function beaconFire(ctx,x,y,s,T){ctx.save();ctx.translate(x+3*s,y-140*s);ctx.scale(s,s);ctx.globalCompositeOperation='lighter';
 glow(ctx,0,-6,60,'#ff9a3a',.32);
 for(let i=0;i<9;i++){const ph=(T*1.8+i/9)%1,fx=Math.sin(i*2.3+T*3)*6*(1-ph),fy=-ph*34,fr=(10-ph*8);ctx.fillStyle=`rgba(255,${130+ph*90|0},${40+ph*50|0},${(1-ph)*.55})`;ctx.beginPath();ctx.arc(fx,fy,fr,0,TAU);ctx.fill()}
 ctx.fillStyle='rgba(255,240,200,.9)';ctx.beginPath();ctx.ellipse(0,-2,5,7,0,0,TAU);ctx.fill();
 ctx.restore();}
// Root garden: ring of old stones with a thorn tree whose seams glow green when it strikes
function rootGarden(ctx,x,y,s,pass,seed){seed=seed||91;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 const r=rng(seed);
 if(pass==='base'){shadow(ctx,14,3,62,16,.7);
  ctx.save();ctx.scale(1,.4);const sg=ctx.createRadialGradient(0,0,0,0,0,56);sg.addColorStop(0,'rgba(20,26,14,.9)');sg.addColorStop(1,'rgba(20,26,14,0)');ctx.fillStyle=sg;ctx.beginPath();ctx.arc(0,0,56,0,TAU);ctx.fill();ctx.restore();
  for(let i=0;i<9;i++){const a=Math.PI+i/8*Math.PI,px=Math.cos(a)*44,py=Math.sin(a)*15;block(ctx,px-7,py,14,8+r()*10,6,seed+i*5,'#57554f')}
  ctx.strokeStyle='#0d0f0a';ctx.lineCap='round';
  const br=(bx,by,a,len,w,d)=>{if(d>5||len<4)return;const ex=bx+Math.cos(a)*len,ey=by+Math.sin(a)*len;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(bx,by);ctx.quadraticCurveTo((bx+ex)/2+(r()-.5)*len*.4,(by+ey)/2,ex,ey);ctx.stroke();
   if(d>1&&r()<.6){ctx.fillStyle='#0d0f0a';poly(ctx,[[ex,ey],[ex+3,ey-6],[ex+1,ey+1]]);ctx.fill()}
   const k=1+(r()<.6?1:0);for(let i=0;i<=k;i++)br(ex,ey,a+(r()-.5)*1.2,len*(.66+r()*.12),w*.64,d+1)};
  br(0,0,-Math.PI/2,40,9,0);
  // surface roots
  for(let i=0;i<6;i++){const a=i/6*TAU+.4;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-2);ctx.quadraticCurveTo(Math.cos(a)*22,Math.sin(a)*6,Math.cos(a)*40,Math.sin(a)*13);ctx.stroke()}
  ctx.strokeStyle='rgba(120,160,90,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-6);ctx.lineTo(-2,-38);ctx.stroke();
 }
 ctx.restore();}
function rootPods(ctx,x,y,s,T,hot){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalCompositeOperation='lighter';
 [[-14,-52],[16,-60],[2,-78],[-22,-36],[20,-34]].forEach(([a,b],i)=>{const p=.35+.25*Math.sin(T*2+i)+hot*.5;glow(ctx,a,b,9,'#7fd06a',p*.5);ctx.fillStyle=`rgba(170,230,140,${Math.min(1,p)})`;ctx.beginPath();ctx.ellipse(a,b,2.4,3.2,0,0,TAU);ctx.fill()});
 ctx.restore();}

/* ---------- the battlefield base: several roads and waters ---------- */
function paintField(ctx,W,H,M){
 const mk=(fn)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');fn(x);return x.getImageData(0,0,W,H).data;};
 const roadM=mk(x=>{x.filter='blur(9px)';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';const wn=makeNoise(91);M.roads.forEach(R=>{for(let i=1;i<R.pts.length;i++){x.lineWidth=R.w*(.8+wn(i*.06,R.w)*.7);x.beginPath();x.moveTo(R.pts[i-1][0],R.pts[i-1][1]);x.lineTo(R.pts[i][0],R.pts[i][1]);x.stroke()}})});
 const waterM=mk(x=>{x.filter='blur(12px)';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';M.waters.forEach(Wt=>{x.lineWidth=Wt.w;strokePts(x,Wt.pts);x.stroke()})});
 const highM=mk(x=>{if(M.high&&M.high.length>2){x.fillStyle='#fff';poly(x,M.high);x.fill()}});
 const img=ctx.createImageData(W,H),d=img.data;const nA=makeNoise(3),nB=makeNoise(5);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;const n=nA(x/90,y/45,5),m=nB(x/7,y/3.5,3),q=nA(x/22+300,y/11,3);
  const P=M.pal;let c;
  if(P){const moss=ss(.5,.68,nB(x/60+20,y/30,4));c=[0,1,2].map(j=>mix(mix(P.grassLo[j],P.grassHi[j],n),P.moss[j],moss));
   if(highM[i+3]>0){const st=ss(.4,.7,nA(x/30,y/15,4));c=c.map((v,j)=>mix(v,P.high[j],st*.55));}
   const k=.9+m*.2;c=c.map(v=>v*k);}
  else{c=[mix(22,34,n),mix(21,31,n),mix(18,24,n)];const moss=ss(.5,.68,nB(x/60+20,y/30,4));c=[mix(c[0],26,moss),mix(c[1],36,moss),mix(c[2],22,moss)];
   if(highM[i+3]>0){const st=ss(.4,.7,nA(x/30,y/15,4));c=[mix(c[0],40,st*.6),mix(c[1],42,st*.6),mix(c[2],40,st*.6)];}
   const k=.78+m*.42;c=c.map(v=>v*k);}
  const ra=roadM[i+3]/255;const road=ss(.42,.62,ra+(q-.5)*.5);
  if(road>0){const rk=P?(.93+m*.12):(.85+m*.3);const rc=P?[0,1,2].map(j=>mix(P.roadLo[j],P.roadHi[j],n)*rk):[mix(40,52,n)*rk,mix(37,46,n)*rk,mix(32,38,n)*rk];c=c.map((v,j)=>mix(v,rc[j],road));}
  const wa=waterM[i+3]/255;const bank=ss(.25,.45,wa+(q-.5)*.3),water=ss(.55,.7,wa+(q-.5)*.2);
  if(bank>0)c=c.map(v=>v*(1-bank*(P?.3:.55)));
  if(water>0){const sh=Math.pow(nB(x/40,y/9,2),2.4)*.9;const wc=P?[P.water[0]+sh*50,P.water[1]+sh*55,P.water[2]+sh*50]:[13+sh*34,17+sh*40,22+sh*50];c=c.map((v,j)=>mix(v,wc[j],water));}
  d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}
 ctx.putImageData(img,0,0);
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';const rn=makeNoise(31),r=rng(77);
 M.roads.forEach((R,k)=>{if(R.w<40)return;[[-10,1],[10,2],[-3,3]].forEach(([o,sd],ri)=>{const p=offset(R.pts,o,sd+k*5,7);for(let i=1;i<p.length;i++){const v=rn(i*.08,ri*9+k*3);if(v<.42)continue;ctx.strokeStyle=M.pal?`rgba(120,92,60,${ri==2?.12:(v-.42)*.7})`:`rgba(10,9,7,${ri==2?.18:(v-.42)*1.2})`;ctx.lineWidth=ri==2?7:3+v*2;ctx.beginPath();ctx.moveTo(p[i-1][0],p[i-1][1]);ctx.lineTo(p[i][0],p[i][1]);ctx.stroke()}});
  for(let i=0;i<9;i++){const p=R.pts[Math.floor(r()*R.pts.length)];const o=(r()<.5?-11:11);ctx.fillStyle='rgba(30,40,55,.8)';ctx.beginPath();ctx.ellipse(p[0]+o*.3,p[1]+o*.3,5+r()*7,2+r()*2,r(),0,TAU);ctx.fill();ctx.fillStyle='rgba(140,160,190,.2)';ctx.fillRect(p[0]+o*.3-3,p[1]+o*.3-1,4,1)}
  for(let i=0;i<70;i++){const idx=Math.floor(r()*R.pts.length);const p=R.pts[idx];if(nA(idx*.05,1+k)<.45)continue;const ox=(r()-.5)*36,oy=(r()-.5)*24;const w=5+r()*7;const pb=M.pal?60:0;ctx.fillStyle=`rgba(${70+pb+r()*20},${68+pb+r()*18},${62+pb+r()*15},.6)`;ctx.beginPath();ctx.moveTo(p[0]+ox,p[1]+oy);ctx.lineTo(p[0]+ox+w,p[1]+oy+r()*2);ctx.lineTo(p[0]+ox+w-1,p[1]+oy+w*.5);ctx.lineTo(p[0]+ox-1,p[1]+oy+w*.45);ctx.fill();ctx.fillStyle=M.pal?'rgba(60,46,30,.3)':'rgba(0,0,0,.4)';ctx.fillRect(p[0]+ox,p[1]+oy+w*.45,w-1,1.2)}});
 // reeds
 M.waters.forEach((Wt,k)=>{const L=offset(Wt.pts,-Wt.w*.48,4+k,12),Rr=offset(Wt.pts,Wt.w*.48,6+k,12);[L,Rr].forEach(side=>{for(let i=0;i<side.length;i+=2){if(r()<.45)continue;const[px,py]=side[i];for(let j=0;j<4;j++){ctx.strokeStyle=`rgba(${30+r()*20},${36+r()*16},22,.9)`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px+j*2,py);ctx.quadraticCurveTo(px+j*2+(r()-.5)*6,py-6,px+j*2+(r()-.5)*8,py-10-r()*8);ctx.stroke()}}})});
 ctx.restore();
 // cliff face of the high ground
 const hp=M.high||[];for(let i=0;i<hp.length-1;i++){const[a,b]=hp[i],[e,f]=hp[i+1];if(b<4&&f<4)continue;if(a<=2&&e<=2)continue;if(a>=W-2&&e>=W-2)continue;const len=Math.hypot(e-a,f-b);if(len<2)continue;const n=Math.max(1,Math.ceil(len/14));for(let k=0;k<n;k++){const u=k/n,v=(k+1)/n,px=mix(a,e,u),py=mix(b,f,u),qx=mix(a,e,v),qy=mix(b,f,v);const pad=Math.abs(qx-px)<3?4:0;const pts=pad?[[px,py],[px+pad,py+2],[qx+pad,qy+24],[qx,qy+24]]:[[px,py],[qx,qy],[qx,qy+24],[px,py+24]];masonry(ctx,pts,Math.min(px,qx)-1,Math.min(py,qy),Math.max(px,qx)+pad+1,Math.max(py,qy)+25,'#4c4a45',.45+r()*.2,900+i*40+k,{ch:6,bw:7})}}
 if(hp.length>3){ctx.save();ctx.strokeStyle='rgba(170,190,220,.16)';ctx.lineWidth=1.4;poly(ctx,hp.slice(1,-1));ctx.stroke();ctx.restore();}
 // stone bridge
 M.bridges.forEach(([bx,by,ang,bl],bi)=>{ctx.save();ctx.translate(bx,by);ctx.rotate(ang);shadow(ctx,4,18,bl+10,12,.8);const bW=27;
  masonry(ctx,[[-bl,-bW],[bl,-bW],[bl,bW],[-bl,bW]],-bl,-bW,bl,bW,'#5a5852',.75,401+bi,{ch:6,bw:14});
  ctx.fillStyle='#2c2b28';ctx.fillRect(-bl,-bW-6,bl*2,6);ctx.fillRect(-bl,bW,bl*2,7);ctx.fillStyle='rgba(180,190,210,.18)';ctx.fillRect(-bl,-bW-6,bl*2,1);
  for(let x=-bl;x<bl;x+=22){ctx.fillStyle='#3a3936';ctx.fillRect(x,-bW-12,7,8);ctx.fillRect(x,bW-2,7,10)}
  ctx.fillStyle='#141412';ctx.fillRect(-bl,bW+7,bl*2,5);ctx.restore()});
 M.ruins.forEach(([x,y,l],i)=>ruinWall(ctx,x,y,l,501+i*10));
 M.stones.forEach(([x,y,h],i)=>standingStone(ctx,x,y,h,i+1));
 M.trees.forEach(([x,y,s],i)=>{if(M.pal&&M.pal.leafy&&i%3!==2)leafyTree(ctx,x,y,s,7+i,M.pal.leaf);else deadTree(ctx,x,y,s,7+i,M.pal?M.pal.bark:null);});
 M.plots.forEach(([x,y],i)=>plot(ctx,x,y,600+i*3,1));
}
const EXTRA={forgeCannon,cannonBarrel,beaconTower,beaconFire,rootGarden,rootPods,paintField};

return{watchTower,frostBell,stormPylon,grub,moth,shellback,wren,gate,block,ruinWall,deadTree,leafyTree,standingStone,plot,masonry,planks,shadow,glow,darkness,vignette,fog,makeNoise,rng,mix,ss,clamp,catmull,strokePts,offset,poly,bolt,shade,hex,rgb,groundTile,TAU,EXTRA:typeof EXTRA!=="undefined"?EXTRA:null};
})();
