const $=id=>document.getElementById(id);
const video=$("camera"), intro=$("intro"), game=$("game"), cameraBox=$("cameraBox"), handOverlay=$("handOverlay"), handCtx=$("handOverlay").getContext("2d"), handDebug=$("handDebug");
const cvs=[ $("iceCanvas"),$("fireCanvas") ], ctx=cvs.map(c=>c.getContext("2d"));
let handModel=null, detections=[], running=false, cameraOn=false, showCam=false, lastTime=0, detectionFrames=0, modelReady=false, lastDetectAt=0;
let keyboard=false, keys={}, starting=false, trackingMessage="手势识别尚未启动", trackingStartedAt=0, cameraSession=0;
const trackingStatus=$("trackingStatus");
function reportTracking(message){trackingMessage=message;trackingStatus.textContent=message;}
function withTimeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
async function loadHandLibrary(){
 if(window.ml5?.handPose)return;
 for(const url of ["https://cdn.jsdelivr.net/npm/ml5@1.3.1/dist/ml5.min.js","https://unpkg.com/ml5@1.3.1/dist/ml5.min.js"]){
  const script=document.createElement("script");script.src=url;
  try{await withTimeout(new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error("识别库下载失败"));document.head.appendChild(script);}),20000,"识别库下载超时");if(window.ml5?.handPose)return;}catch(error){script.remove();}
 }
 throw new Error("手部识别库加载失败，请检查网络后重试");
}
function stopCamera(){
 handModel?.detectStop?.();video.srcObject?.getTracks().forEach(track=>track.stop());video.srcObject=null;cameraOn=false;modelReady=false;detections=[];smoothHands=[null,null];
}
const W=640,H=480;
const players=[
 {x:92,y:390,vx:0,vy:0,color:"#79e4ff",glow:"#34bfff",name:"ICE",ground:false,skill:0,goal:false},
 {x:92,y:390,vx:0,vy:0,color:"#ffab68",glow:"#ff672f",name:"FIRE",ground:false,skill:0,goal:false}
];
let worlds=[],levelIndex=0,deaths=0;
let gateCharge=[0,0], completed=false, elapsed=0, prevGesture=[{},{}], smoothHands=[null,null], lastSeen=[0,0];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function setStatus(i,t){$(i===0?"iceState":"fireState").textContent=t;}
function makeWorld(i){
 const level=LEVELS[levelIndex],step=level.step,altar=level.altar,landing=level.landing;
 return {platforms:[{x:0,y:424,w:240,h:56},{x:400,y:424,w:240,h:56},...[step,altar,landing].map(p=>({...p,h:14}))],
  bridge:{...level.bridge,h:12},gate:{x:530,y:180,w:18,h:244},switch:{x:altar.x+altar.w/2,y:altar.y-18,r:20},
  goal:{x:595,y:398,r:24},checkpoint:{x:landing.x+landing.w/2,y:landing.y-16},
  gems:[step,altar,landing].map(p=>({x:p.x+p.w/2,y:p.y-30,collected:false})),
  pool:{...level.pool,y:424,type:i===0?"lava":"water"}};
}
function resetGame(){
 worlds=[makeWorld(0),makeWorld(1)];
 players.forEach(p=>Object.assign(p,{x:45,y:408,vx:0,vy:0,ground:true,skill:0,goal:false,coyote:.12,jumpBuffer:0,respawn:{x:45,y:408},checkpoint:false,invincible:0}));
 gateCharge=[0,0];prevGesture=[{},{}];keys={};completed=false;elapsed=0;deaths=0;lastTime=0;
 $("win").classList.add("hidden");$("levelTitle").textContent="CHAPTER 0"+(levelIndex+1)+" / "+LEVELS[levelIndex].name;
 $("levelObjective").textContent=LEVELS[levelIndex].subtitle;$("tip").textContent="登上台阶收集晶石，在圆形机关旁持续握拳，为另一侧架桥。";drawAll();
}
function bridgeOpen(i){return gateCharge[1-i]>=1;}
function gateOpen(i){return gateCharge.every(v=>v>=1)&&worlds[i].gems.every(g=>g.collected);}
function bridgeAt(i){const b=worlds[i].bridge;return {...b,y:b.y+(levelIndex===2?Math.sin(elapsed*1.2)*12:0)};}
function respawnPlayer(i){const p=players[i];Object.assign(p,{...p.respawn,vx:0,vy:0,ground:false,coyote:0,jumpBuffer:0,skill:0,invincible:.9});deaths++;}
function orbAt(orb,i){return {x:orb.x+Math.sin(elapsed*orb.speed+i*Math.PI)*orb.range,y:orb.y,r:orb.r};}
async function start(useKeyboard=false){
 if(starting&&!useKeyboard)return;
 const session=++cameraSession;
 keyboard=useKeyboard;intro.classList.add("hidden");game.classList.remove("hidden");resetGame();
 if(!running){running=true;lastTime=0;requestAnimationFrame(loop);}
 if(keyboard){starting=false;$("retryCamera").disabled=false;stopCamera();reportTracking("键盘模式：冰 A/D 移动、W 跳跃、S 持续充能；火 方向键移动、↑ 跳跃、↓ 持续充能。");setStatus(0,"键盘控制");setStatus(1,"键盘控制");return;}
 starting=true;$("retryCamera").disabled=true;
 try{
  stopCamera();lastDetectAt=0;detectionFrames=0;
  showCam=true;cameraBox.style.display="block";$("camToggle").textContent="隐藏摄像头";
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("浏览器无法访问摄像头，请通过 localhost 或 HTTPS 打开游戏");
  reportTracking("正在请求摄像头权限，请在浏览器中点击允许…");
  const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:"user"},audio:false});
  if(session!==cameraSession){stream.getTracks().forEach(track=>track.stop());return;}
  video.srcObject=stream;await withTimeout(video.play(),15000,"摄像头画面未就绪，请关闭占用摄像头的软件后重试");if(session!==cameraSession)return;cameraOn=true;
  handOverlay.width=video.videoWidth||W;handOverlay.height=video.videoHeight||H;
  reportTracking("摄像头已连接，正在下载手部识别模型，首次加载可能需要一些时间…");
  await loadHandLibrary();if(session!==cameraSession)return;
  if(!handModel){const loaded=await withTimeout(ml5.handPose({maxHands:2,flipped:false}),60000,"模型加载超时，请检查网络后重试");if(session!==cameraSession)return;handModel=loaded;}
  modelReady=true;trackingStartedAt=performance.now();
  handModel.detectStart(video,res=>{
   if(keyboard||!cameraOn)return;
   detections=Array.isArray(res)?res:[];detectionFrames++;lastDetectAt=performance.now();
   assignHands(detections);drawHandDebug();
  });
  reportTracking("模型已启动：请将完整手掌放入画面，距离摄像头约 40–80 厘米。");
 }catch(e){
  if(session!==cameraSession)return;
  console.error("Camera/HandPose init failed:",e);stopCamera();handModel=null;
  const messages={NotAllowedError:"摄像头权限被拒绝，请在地址栏的网站权限中允许摄像头后重试",NotFoundError:"未找到摄像头，请连接摄像头后重试",NotReadableError:"摄像头被占用，请关闭其他视频软件后重试"};
  reportTracking("启动失败："+(messages[e.name]||e.message||e));handDebug.textContent=trackingMessage;
 }finally{if(session===cameraSession){starting=false;$("retryCamera").disabled=false;}}
}
function getPoints(hand){
 // ml5 HandPose 通常返回 keypoints 数组；这里兼容具名关键点输出。
 if(Array.isArray(hand?.keypoints)) return hand.keypoints.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p);
 if(Array.isArray(hand?.landmarks)) return hand.landmarks.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p);
 const names=["wrist","thumb_cmc","thumb_mcp","thumb_ip","thumb_tip","index_finger_mcp","index_finger_pip","index_finger_dip","index_finger_tip","middle_finger_mcp","middle_finger_pip","middle_finger_dip","middle_finger_tip","ring_finger_mcp","ring_finger_pip","ring_finger_dip","ring_finger_tip","pinky_finger_mcp","pinky_finger_pip","pinky_finger_dip","pinky_finger_tip"];
 if(hand){const arr=names.map(n=>hand[n]);if(arr.every(Boolean))return arr;}
 return [];
}
function pointAt(hand,idx){const pts=getPoints(hand);return pts[idx]||null;}
function handCenter(h){const p=getPoints(h),arr=[p[0],p[5],p[9],p[13],p[17]].filter(k=>k&&Number.isFinite(k.x)&&Number.isFinite(k.y));if(!arr.length)return {x:W/2,y:H/2};return {x:arr.reduce((s,k)=>s+k.x,0)/arr.length,y:arr.reduce((s,k)=>s+k.y,0)/arr.length};}
function assignHands(res){
 const previous=smoothHands;smoothHands=[null,null];
 const valid=(Array.isArray(res)?res:[]).filter(h=>getPoints(h).length===21&&getPoints(h).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))
  .map(hand=>{const c=handCenter(hand);return {hand,x:clamp(c.x/(video.videoWidth||W),0,1),y:clamp(c.y/(video.videoHeight||H),0,1)};})
  .sort((a,b)=>b.x-a.x).slice(0,2);
 // Preview is mirrored: a larger source x appears on the left of the camera preview.
 // Two hands follow visual order; a single hand controls the side where it appears.
 if(valid.length===2){smoothHands[0]=valid[0];smoothHands[1]=valid[1];}
 else if(valid.length===1){smoothHands[valid[0].x>=.5?0:1]=valid[0];}
 for(let i=0;i<2;i++){
  const current=smoothHands[i],old=previous[i];
  if(current){if(old&&Math.abs(old.x-current.x)<.25){current.x=old.x*.35+current.x*.65;current.y=old.y*.35+current.y*.65;}lastSeen[i]=performance.now();setStatus(i,"已识别");}
  else setStatus(i,i===0?"等待画面左侧的手":"等待画面右侧的手");
 }
}
function drawHandDebug(){
 const c=handCtx,w=handOverlay.width,h=handOverlay.height;c.clearRect(0,0,w,h);
 const colors=["#77e8ff","#ffab68"];let n=0;
 for(const hand of detections){const pts=getPoints(hand);if(pts.length<9)continue;const slot=smoothHands.findIndex(item=>item?.hand===hand);const col=colors[slot>=0?slot:n%2];n++;
  // skeleton edges for wrist and finger chains
  const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  c.strokeStyle=col;c.lineWidth=3;c.beginPath();for(const [a,b] of edges){const p=pts[a],q=pts[b];if(p&&q&&Number.isFinite(p.x)&&Number.isFinite(q.x)){c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);}}c.stroke();
  pts.forEach((p,j)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;c.beginPath();c.arc(p.x,p.y,j===0?5:3,0,Math.PI*2);c.fillStyle=j===8?"#fff" :col;c.fill();});
 }
 const age=lastDetectAt?((performance.now()-lastDetectAt)/1000).toFixed(1)+"s":"—";
 handDebug.textContent=`HANDPOSE ${modelReady?"READY":"LOADING"}  |  检测到：${detections.length} 只手\n有效关键点：${n}  |  回调：${detectionFrames}  |  最近更新：${age}`;
}
function getGestures(i){
 if(keyboard){
  if(i===0)return {x:(keys.KeyD?1:0)-(keys.KeyA?1:0),jump:!!keys.KeyW,skill:!!keys.KeyS};
  return {x:(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),jump:!!keys.ArrowUp,skill:!!keys.ArrowDown};
 }
 const sh=smoothHands[i];if(!sh)return {x:0,jump:false,skill:false};
 if(performance.now()-lastSeen[i]>650)return {x:0,jump:false,skill:false};
 const h=sh.hand, points=getPoints(h);
 const wrist=points[0], indexTip=points[8], indexPip=points[6];
 if(!wrist||!indexTip)return {x:0,jump:false,skill:false};
 // Translate hand center across its own world width. Smooth control is derived from camera horizontal position.
 const previewX=1-sh.x;
 const x=clamp(i===0?previewX*2:(previewX-.5)*2,0,1);
 const thumb=points[4], middle=points[12], ring=points[16], pinky=points[20];
 const tips=[indexTip,middle,ring,pinky], pips=[points[6],points[10],points[14],points[18]];
 // Approximate fist: fingertips cluster near palm; raised index is a jump cue.
 const palm=points[9]||wrist;
 const avg=tips.reduce((s,p)=>s+Math.hypot(p.x-palm.x,p.y-palm.y),0)/tips.length;
 const palmWidth=Math.max(1,Math.hypot((points[5]?.x||0)-(points[17]?.x||0),(points[5]?.y||0)-(points[17]?.y||0)));
 const fist=avg/palmWidth<1.15;
 const jump=indexTip.y<indexPip.y-palmWidth*0.30 && Math.hypot(indexTip.x-wrist.x,indexTip.y-wrist.y)>Math.hypot(indexPip.x-wrist.x,indexPip.y-wrist.y)*1.12 && !fist;
 setStatus(i,fist?"握拳 · 充能":jump?"食指向上 · 跳跃":"已识别 · 移动手掌");
 return {x,jump,skill:fist};
}
function update(dt){
 if(completed||(!keyboard&&!modelReady))return;
 elapsed+=dt;
 for(let i=0;i<2;i++){
  const p=players[i],g=getGestures(i),world=worlds[i];
  if(p.goal)continue;
  p.invincible=Math.max(0,p.invincible-dt);
  const tracking=keyboard||smoothHands[i]&&performance.now()-lastSeen[i]<650;
  if(keyboard)p.vx=g.x*210;
  else p.vx=tracking?clamp((clamp(g.x*W,18,W-18)-p.x)*6,-210,210):0;
  p.coyote=p.ground ? .12 : Math.max(0,p.coyote-dt);
  p.jumpBuffer=g.jump&&!prevGesture[i].jump ? .16 : Math.max(0,p.jumpBuffer-dt);
  if(p.jumpBuffer>0&&p.coyote>0){p.vy=-430;p.jumpBuffer=0;p.coyote=0;p.ground=false;}
  prevGesture[i]={...g};
  p.skill=g.skill ? .22 : Math.max(0,p.skill-dt);
  const oldX=p.x,oldY=p.y;
  p.x=clamp(p.x+p.vx*dt,14,W-14);
  // Gates block both keyboard movement and gesture movement.
  const gate=world.gate;
  if(!gateOpen(i)&&p.y+16>gate.y&&p.y-32<gate.y+gate.h&&p.x+12>gate.x&&p.x-12<gate.x+gate.w){
   p.x=oldX<gate.x?gate.x-12:gate.x+gate.w+12;p.vx=0;
  }
  p.vy+=1050*dt;p.y+=p.vy*dt;p.ground=false;
  const platforms=[...world.platforms];if(bridgeOpen(i))platforms.push(bridgeAt(i));
  // Resolve the highest crossed ledge, rather than depending on array order.
  let landing=null;
  for(const pl of platforms){if(p.vy>=0&&p.x+12>pl.x&&p.x-12<pl.x+pl.w&&oldY+16<=pl.y+1&&p.y+16>=pl.y&&(!landing||pl.y<landing.y))landing=pl;}
  if(landing){p.y=landing.y-16;p.vy=0;p.ground=true;}
  const pool=world.pool;
  let hurt=p.y>H+40||p.x+10>pool.x&&p.x-10<pool.x+pool.w&&p.y+16>=pool.y;
  for(const orb of LEVELS[levelIndex].orbs){const o=orbAt(orb,i);if(Math.hypot(p.x-o.x,p.y-10-o.y)<o.r+12)hurt=true;}
  if(p.y>H+40||hurt&&p.invincible===0){respawnPlayer(i);continue;}
  for(const gem of world.gems)if(!gem.collected&&Math.hypot(p.x-gem.x,p.y-8-gem.y)<27)gem.collected=true;
  if(p.ground&&!p.checkpoint&&Math.hypot(p.x-world.checkpoint.x,p.y-world.checkpoint.y)<32){p.checkpoint=true;p.respawn={...world.checkpoint};}
  const sw=world.switch;
  if(p.ground&&Math.hypot(p.x-sw.x,p.y-sw.y)<37&&g.skill)gateCharge[i]=clamp(gateCharge[i]+dt/LEVELS[levelIndex].chargeTime,0,1);
  if(gateOpen(i)&&Math.hypot(p.x-world.goal.x,p.y-world.goal.y)<27){p.goal=true;p.vx=0;p.skill=0;}
 }
 $("iceMeter").style.width=gateCharge[0]*100+"%";$("fireMeter").style.width=gateCharge[1]*100+"%";
 const gems=worlds.map(w=>w.gems.filter(g=>g.collected).length);
 const seconds=Math.floor(elapsed);$("runStats").textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0")+" · 复位 "+deaths+" 次";
 $("levelObjective").textContent="第 "+(levelIndex+1)+" / "+LEVELS.length+" 关 · 冰晶 "+gems[0]+"/3 · 火晶 "+gems[1]+"/3";
 $("tip").textContent=!gateCharge.every(v=>v>=1)?"① 跳上台阶收集晶石 ② 在机关旁持续握拳，为对方架桥；离开机关不会丢失能量。":gems.some(n=>n<3)?"桥梁已连接！收齐各自的 3 枚晶石，出口闸门才会开启。旗帜是复活点，避开危险池和紫色能量球。":"出口已开启！跳过危险池，双方分别进入光环。已到达的一方会自动等候。";
 if(players.every(p=>p.goal)){
  completed=true;$("winTitle").textContent=levelIndex===LEVELS.length-1?"共生，不是相同。":LEVELS[levelIndex].name+" · 完成";
  $("winSummary").textContent="用时 "+seconds+" 秒 · 复位 "+deaths+" 次 · 6 枚晶石全部收集";
  $("nextBtn").textContent=levelIndex===LEVELS.length-1?"从第一关再挑战 ↗":"进入下一关 ↗";$("win").classList.remove("hidden");
 }
}
function drawAll(){for(let i=0;i<2;i++)drawWorld(i);}
function roundedRect(c,x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
function drawWorld(i){
 const c=ctx[i],p=players[i],world=worlds[i];c.clearRect(0,0,W,H);
 const ice=i===0;
 const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,ice?"#123b57":"#592b26");bg.addColorStop(1,ice?"#091b30":"#24151e");c.fillStyle=bg;c.fillRect(0,0,W,H);
 // distant scenery
 for(let n=0;n<12;n++){let x=n*65; c.fillStyle=ice?"#22506a":"#713b2e";c.globalAlpha=.36;c.beginPath();c.moveTo(x,420);c.lineTo(x+28,180+(n%3)*30);c.lineTo(x+66,420);c.fill();}c.globalAlpha=1;
 // stars/embers
 for(let n=0;n<42;n++){let x=(n*79+17)%W,y=(n*43+22)%330;c.fillStyle=ice?"#8feaff":"#ffb57b";c.globalAlpha=.18+(n%4)*.1;c.fillRect(x,y,2,2);}c.globalAlpha=1;
 // terrain
 for(const pl of world.platforms){roundedRect(c,pl.x,pl.y,pl.w,pl.h,3,ice?"#70cbe5":"#a9583b");c.fillStyle=ice?"#b9f1ff":"#ffc18a";c.fillRect(pl.x,pl.y,pl.w,4);}
 // The other player's switch creates this bridge.
 const bridge=bridgeAt(i);c.setLineDash(bridgeOpen(i)?[]:[7,5]);c.strokeStyle=bridgeOpen(i)?"#d3ffb3":"#8da0b877";c.lineWidth=2;c.strokeRect(bridge.x,bridge.y,bridge.w,bridge.h);c.setLineDash([]);
 if(bridgeOpen(i)){c.fillStyle="#91d7bd";c.fillRect(bridge.x,bridge.y,bridge.w,bridge.h);}
 c.font="10px sans-serif";c.textAlign="center";c.fillStyle="#d2eadf";c.fillText(bridgeOpen(i)?"共生桥已连接":i===0?"等待火机关充满":"等待冰机关充满",bridge.x+bridge.w/2,bridge.y+27);
 // Elemental pools and roaming hazards.
 const pool=world.pool;c.fillStyle=pool.type==="lava"?"#ff613e":"#4baaff";c.fillRect(pool.x,pool.y-5,pool.w,12);
 c.font="10px sans-serif";c.fillStyle="#f5eaff";c.fillText(pool.type==="lava"?"熔岩 · 跳过":"深水 · 跳过",pool.x+pool.w/2,pool.y+27);
 for(const orb of LEVELS[levelIndex].orbs){const o=orbAt(orb,i);c.strokeStyle="#df9cff55";c.beginPath();c.moveTo(orb.x-orb.range,orb.y);c.lineTo(orb.x+orb.range,orb.y);c.stroke();c.fillStyle="#d99aff";c.shadowColor="#bd62ff";c.shadowBlur=15;c.beginPath();c.arc(o.x,o.y,o.r,0,Math.PI*2);c.fill();c.shadowBlur=0;}
 for(const gem of world.gems){if(gem.collected)continue;c.save();c.translate(gem.x,gem.y+Math.sin(elapsed*3)*3);c.rotate(Math.PI/4);c.fillStyle=p.color;c.shadowColor=p.glow;c.shadowBlur=14;c.fillRect(-6,-6,12,12);c.shadowBlur=0;c.strokeStyle="#fff";c.strokeRect(-6,-6,12,12);c.restore();}
 const cp=world.checkpoint;c.strokeStyle=p.checkpoint?"#c7ffa6":"#91a0b8";c.lineWidth=2;c.beginPath();c.moveTo(cp.x,cp.y+16);c.lineTo(cp.x,cp.y-30);c.stroke();c.fillStyle=p.checkpoint?"#c7ffa6":"#64748b";c.fillRect(cp.x,cp.y-30,18,12);
 // switch pad
 const sw=world.switch;c.beginPath();c.arc(sw.x,sw.y,25,0,Math.PI*2);c.fillStyle=ice?"#2b9bc4":"#d76538";c.fill();c.strokeStyle=ice?"#a8f0ff":"#ffd2a1";c.lineWidth=2;c.stroke();
 c.fillStyle="#fff";c.font="bold 10px monospace";c.textAlign="center";c.fillText(gateCharge[i]>=1?"READY":Math.round(gateCharge[i]*100)+"%",sw.x,sw.y+4);
 c.font="10px sans-serif";c.fillText("握拳 · 为对方架桥",sw.x,sw.y-30);
 // gate
 const gate=world.gate,open=gateOpen(i);
 if(!open){c.fillStyle=ice?"#8beaff":"#ffb075";c.globalAlpha=.75;c.fillRect(gate.x,gate.y,gate.w,gate.h);c.globalAlpha=1;
  for(let y=gate.y;y<gate.y+gate.h;y+=14){c.strokeStyle="#fff9";c.beginPath();c.moveTo(gate.x,y);c.lineTo(gate.x+gate.w,y+8);c.stroke();}
 }else{c.strokeStyle="#e8ffca";c.lineWidth=3;c.shadowBlur=22;c.shadowColor="#c9ffed";c.strokeRect(gate.x,gate.y,gate.w,gate.h);c.shadowBlur=0;}
 // exit
 const goal=world.goal;c.beginPath();c.arc(goal.x,goal.y,goal.r,0,Math.PI*2);c.strokeStyle=open?"#e8ffb2":"#637387";c.lineWidth=4;c.stroke();c.beginPath();c.arc(goal.x,goal.y,goal.r-8,0,Math.PI*2);c.strokeStyle=open?"#e8ffb288":"#63738755";c.stroke();
 c.fillStyle="#dceeff";c.font="11px monospace";c.fillText("EXIT",goal.x,goal.y+4);
 // character glow
 c.save();if(p.invincible>0)c.globalAlpha=.45+.35*Math.sin(elapsed*30);c.shadowColor=p.glow;c.shadowBlur=25;c.fillStyle=p.color;
 c.beginPath();c.arc(p.x,p.y-20,12,0,Math.PI*2);c.fill();
 roundedRect(c,p.x-10,p.y-10,20,24,7,p.color);
 c.shadowBlur=0;c.fillStyle=ice?"#16425b":"#5c2b1e";c.beginPath();c.arc(p.x-4,p.y-21,1.8,0,7);c.arc(p.x+4,p.y-21,1.8,0,7);c.fill();
 // tiny flame/ice crown
 c.fillStyle=p.color;c.beginPath();c.moveTo(p.x-7,p.y-29);c.lineTo(p.x-3,p.y-38);c.lineTo(p.x+1,p.y-29);c.lineTo(p.x+6,p.y-36);c.lineTo(p.x+8,p.y-27);c.fill();
 c.restore();
 if(p.skill>0){c.strokeStyle=p.color;c.lineWidth=3;c.globalAlpha=.65;c.beginPath();c.arc(p.x,p.y-12,32+(1-p.skill/.22)*14,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
 // input pointer
 const hand=smoothHands[i];if(hand&&!keyboard){const previewX=1-hand.x;const x=clamp(i===0?previewX*2:(previewX-.5)*2,0,1)*W,y=hand.y*H;c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.fillStyle=p.color;c.fill();c.strokeStyle="#fff";c.stroke();}
 c.fillStyle="#eaf6ff";c.font="11px monospace";c.textAlign="right";c.fillText(`${p.name} / ${p.goal?"SAFE":"ACTIVE"}`,W-18,28);
}
function loop(now){if(!running)return;const dt=Math.min((now-(lastTime||now))/1000,.035);lastTime=now;update(dt);drawAll();if(cameraOn&&modelReady&&!keyboard){const age=now-(lastDetectAt||trackingStartedAt);if(age>8000)reportTracking("模型暂未返回结果，请点击重试手势，或切换键盘控制。");else if(lastDetectAt){const count=smoothHands.filter(Boolean).length;reportTracking(count?`已识别 ${count} 只手：左右移动控制位置，食指向上跳跃，持续握拳充能（充满后保留）。`:"暂未识别到手：请露出完整手掌，掌心朝向镜头，避免逆光和双手重叠。");}drawHandDebug();}requestAnimationFrame(loop);}
$("startBtn").addEventListener("click",()=>start(false));
$("keyboardBtn").addEventListener("click",()=>start(true));
$("restartBtn").addEventListener("click",resetGame);
$("againBtn").addEventListener("click",resetGame);
$("camToggle").addEventListener("click",()=>{showCam=!showCam;cameraBox.style.display=showCam?"block":"none";$("camToggle").textContent=showCam?"隐藏摄像头":"显示摄像头";});
window.addEventListener("keydown",e=>{keys[e.code]=true;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();});
window.addEventListener("keyup",e=>keys[e.code]=false);
resetGame();

$("retryCamera").addEventListener("click",()=>start(false));
$("switchKeyboard").addEventListener("click",()=>start(true));
window.addEventListener("blur",()=>{keys={};});
window.addEventListener("pagehide",stopCamera);

$("nextBtn").addEventListener("click",()=>{levelIndex=(levelIndex+1)%LEVELS.length;resetGame();});
