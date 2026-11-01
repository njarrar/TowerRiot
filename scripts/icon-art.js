// The app icon: Wren and the Keep on a morning hill. Chunky shapes and thick ink lines.
// Plain canvas code, run in a headless browser by scripts/make-icons.mjs.
const TAU=Math.PI*2;
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function glow(g,x,y,r,c,a){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(${c},${a})`);gr.addColorStop(.4,`rgba(${c},${a*.4})`);gr.addColorStop(1,`rgba(${c},0)`);g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();}
function sky(g){const s=g.createLinearGradient(0,0,0,1024);s.addColorStop(0,'#9fd0ee');s.addColorStop(.55,'#f6e6c6');s.addColorStop(1,'#f3d9a8');g.fillStyle=s;g.fillRect(0,0,1024,1024);
 glow(g,800,230,420,'255,226,160',.9);g.fillStyle='#fff3d6';g.beginPath();g.arc(800,230,70,0,TAU);g.fill();}
function hills(g){g.fillStyle='#8fb06a';g.beginPath();g.moveTo(0,760);g.bezierCurveTo(250,680,420,720,600,700);g.bezierCurveTo(780,680,900,640,1024,690);g.lineTo(1024,1024);g.lineTo(0,1024);g.fill();
 g.fillStyle='#6f9450';g.beginPath();g.moveTo(0,840);g.bezierCurveTo(300,780,700,820,1024,780);g.lineTo(1024,1024);g.lineTo(0,1024);g.fill();}
// cute chunky tower
function tower(g,cx,base,s){g.save();g.translate(cx,base);g.scale(s,s);
 g.fillStyle='rgba(30,25,20,.25)';g.beginPath();g.ellipse(20,0,190,36,0,0,TAU);g.fill();
 // body
 const w=150,h=360;const bg=g.createLinearGradient(-w,0,w,0);bg.addColorStop(0,'#8d8a83');bg.addColorStop(.6,'#77746d');bg.addColorStop(1,'#4c4a46');
 g.fillStyle=bg;rr(g,-w,-h,w*2,h,40);g.fill();g.lineWidth=14;g.strokeStyle='#261d16';g.stroke();
 // stones
 g.strokeStyle='rgba(38,29,22,.35)';g.lineWidth=7;for(let r=1;r<5;r++){g.beginPath();g.moveTo(-w+12,-r*72);g.lineTo(w-12,-r*72);g.stroke();for(let k=-1;k<=1;k++){const x=k*90+(r%2?45:0);if(Math.abs(x)<w-20){g.beginPath();g.moveTo(x,-r*72);g.lineTo(x,-r*72+72);g.stroke();}}}
 // crenels top
 g.fillStyle='#8d8a83';for(let k=-2;k<=2;k++){rr(g,k*64-26,-h-60,52,80,10);g.fill();g.lineWidth=14;g.strokeStyle='#261d16';g.stroke();}
 g.fillStyle='#8d8a83';g.fillRect(-w+8,-h-6,w*2-16,40);
 // banner rust
 g.fillStyle='#a43d29';g.beginPath();g.moveTo(-w-6,-h+40);g.lineTo(-w-70,-h+44);g.lineTo(-w-70,-h+170);g.lineTo(-w-38,-h+145);g.lineTo(-w-6,-h+170);g.closePath();g.fill();g.lineWidth=10;g.strokeStyle='#261d16';g.stroke();
 // window face: glowing
 glow(g,0,-210,170,'255,170,70',.75);
 g.fillStyle='#ffcf7a';rr(g,-62,-265,124,110,55);g.fill();g.lineWidth=14;g.strokeStyle='#261d16';g.stroke();
 g.fillStyle='#fff3cf';rr(g,-34,-245,68,60,30);g.fill();
 // door
 g.fillStyle='#3a2a1c';g.beginPath();g.moveTo(-50,0);g.lineTo(-50,-70);g.arc(0,-70,50,Math.PI,0);g.lineTo(50,0);g.closePath();g.fill();g.lineWidth=14;g.strokeStyle='#261d16';g.stroke();
 g.restore();}
// cute grub, dark, green seams, big glowing eyes? faceless rule: no eyes. use glowing seams + mandibles
function grub(g,x,y,s,face){g.save();g.translate(x,y);g.scale(s*face,s);
 g.fillStyle='rgba(30,25,20,.3)';g.beginPath();g.ellipse(0,8,150,24,0,0,TAU);g.fill();
 const segs=[[-110,-40,42],[-62,-62,58],[0,-78,72],[66,-70,64]];
 for(const [sx,sy,r] of segs){const gr=g.createRadialGradient(sx-r*.4,sy-r*.5,4,sx,sy,r*1.1);gr.addColorStop(0,'#4a4f52');gr.addColorStop(1,'#14171a');g.fillStyle=gr;g.beginPath();g.arc(sx,sy,r,0,TAU);g.fill();g.lineWidth=12;g.strokeStyle='#0b0d0f';g.stroke();}
 // seams glow
 g.save();g.globalCompositeOperation='lighter';for(const [sx,sy,r] of segs.slice(0,3)){glow(g,sx+r*.7,sy,r*.7,'59,224,184',.55);}g.restore();
 g.strokeStyle='#5ff0c8';g.lineWidth=9;g.lineCap='round';for(const [sx,sy,r] of segs.slice(0,3)){g.beginPath();g.arc(sx+r*.55,sy,r*.62,-1.1,1.1);g.stroke();}
 // head wedge + mandibles
 g.strokeStyle='#e9dfc6';g.lineWidth=12;g.beginPath();g.moveTo(118,-80);g.quadraticCurveTo(160,-96,166,-62);g.moveTo(118,-56);g.quadraticCurveTo(156,-40,160,-62);g.stroke();
 // tiny legs
 g.strokeStyle='#0b0d0f';g.lineWidth=11;for(let k=0;k<4;k++){const lx=-100+k*55;g.beginPath();g.moveTo(lx,-12);g.lineTo(lx+10,8);g.stroke();}
 g.restore();}
// chibi wren
function wren(g,x,y,s){g.save();g.translate(x,y);g.scale(s,s);
 g.fillStyle='rgba(30,25,20,.25)';g.beginPath();g.ellipse(0,6,120,22,0,0,TAU);g.fill();
 // spear
 g.strokeStyle='#4a3a28';g.lineWidth=16;g.lineCap='round';g.beginPath();g.moveTo(95,0);g.lineTo(150,-430);g.stroke();
 g.fillStyle='#dfe8f0';g.strokeStyle='#261d16';g.lineWidth=10;g.beginPath();g.moveTo(150,-430);g.lineTo(172,-520);g.lineTo(128,-440);g.closePath();g.fill();g.stroke();
 // cloak body
 g.fillStyle='#232733';g.beginPath();g.moveTo(0,-330);g.bezierCurveTo(-120,-320,-140,-120,-130,0);g.lineTo(125,0);g.bezierCurveTo(135,-120,120,-320,0,-330);g.fill();g.lineWidth=14;g.strokeStyle='#121318';g.stroke();
 // rust scarf
 g.fillStyle='#a43d29';rr(g,-95,-250,190,48,24);g.fill();g.lineWidth=10;g.strokeStyle='#121318';g.stroke();
 g.beginPath();g.moveTo(-60,-210);g.lineTo(-85,-120);g.lineTo(-40,-130);g.lineTo(-30,-210);g.fill();g.stroke();
 // big hood head
 g.fillStyle='#2b3040';g.beginPath();g.arc(0,-360,140,0,TAU);g.fill();g.lineWidth=14;g.strokeStyle='#121318';g.stroke();
 g.fillStyle='#0b0c10';g.beginPath();g.ellipse(14,-340,92,84,0,0,TAU);g.fill();
 // glowing eyes (cute)
 g.save();g.globalCompositeOperation='lighter';glow(g,-12,-345,60,'255,200,120',.5);glow(g,46,-345,60,'255,200,120',.5);g.restore();
 g.fillStyle='#ffe2a0';g.beginPath();g.ellipse(-12,-345,13,20,0,0,TAU);g.fill();g.beginPath();g.ellipse(46,-345,13,20,0,0,TAU);g.fill();
 // hood tip
 g.fillStyle='#2b3040';g.beginPath();g.moveTo(-60,-480);g.quadraticCurveTo(-150,-540,-170,-470);g.quadraticCurveTo(-120,-470,-100,-440);g.fill();g.lineWidth=12;g.strokeStyle='#121318';g.stroke();
 // lantern
 g.strokeStyle='#121318';g.lineWidth=10;g.beginPath();g.moveTo(-110,-170);g.lineTo(-150,-110);g.stroke();
 g.save();g.globalCompositeOperation='lighter';glow(g,-150,-60,230,'255,170,70',.6);g.restore();
 g.fillStyle='#16171a';rr(g,-185,-110,70,90,14);g.fill();g.fillStyle='#ffd27a';rr(g,-172,-96,44,62,10);g.fill();g.fillStyle='#fff6dc';rr(g,-160,-84,20,36,8);g.fill();
 g.restore();}

/** Paint the icon on a size x size canvas. `k` shrinks the figures toward the centre (Android's adaptive icon crops the edges). `round` cuts it to a circle. */
window.paintIcon=(size,k=1,round=false)=>{const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
 g.scale(size/1024,size/1024);
 if(round){g.beginPath();g.arc(512,512,512,0,TAU);g.clip();}sky(g);hills(g);
 g.translate(512,560);g.scale(k,k);g.translate(-512,-560);
 // Warm lantern light on the grass at Wren's feet.
 g.save();g.globalCompositeOperation='lighter';glow(g,250,870,260,'255,190,110',.28);g.restore();
 tower(g,690,790,.8);wren(g,400,925,1.15);
 return c.toDataURL('image/png');};
