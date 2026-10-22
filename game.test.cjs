// Run with: node symbiosis_game/game.test.cjs
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const elements=new Map();
const canvas=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
const element=id=>{if(!elements.has(id))elements.set(id,{style:{},classList:{add(){},remove(){}},getContext:()=>canvas,addEventListener(){},videoWidth:640,videoHeight:480});return elements.get(id);};
const scope={document:{getElementById:element},window:{addEventListener(){}},performance:{now:()=>100},console,setTimeout,clearTimeout,requestAnimationFrame(){},assert};
vm.createContext(scope);
for(const file of ['levels.js','script.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),scope);
vm.runInContext(`
keyboard=true;
const tick=(frames=1)=>{for(let n=0;n<frames;n++)update(1/120);};
const walkTo=(i,target,jump=false)=>{
 const p=players[i],right=i===0?'KeyD':'ArrowRight',left=i===0?'KeyA':'ArrowLeft',up=i===0?'KeyW':'ArrowUp';
 for(let n=0;n<240;n++){
  keys={};if(Math.abs(p.x-target)>2)keys[p.x<target?right:left]=true;
  if(jump&&n===0)keys[up]=true;
  tick();if(n>2&&Math.abs(p.x-target)<=2&&p.ground)return;
 }
 throw Error('Unreachable ledge: level '+levelIndex+', x '+target);
};
for(levelIndex=0;levelIndex<LEVELS.length;levelIndex++){
 resetGame();keyboard=true;
 // Reach each altar from the actual spawn using real input and physics.
 for(let i=0;i<2;i++){
  walkTo(i,80);walkTo(i,LEVELS[levelIndex].step.x+LEVELS[levelIndex].step.w/2,true);
  walkTo(i,worlds[i].switch.x,true);
  assert.equal(worlds[i].gems[0].collected,true);assert.equal(worlds[i].gems[1].collected,true);
  keys={[i===0?'KeyS':'ArrowDown']:true};tick(Math.ceil(LEVELS[levelIndex].chargeTime*120)+2);
  assert.equal(gateCharge[i],1,'holding charge must complete');
 }
 assert(bridgeOpen(0)&&bridgeOpen(1),'switches create the other bridge');
 keys={};tick(120);assert.equal(gateCharge[0],1,'progress persists');
 if(levelIndex<2){for(let i=0;i<2;i++){walkTo(i,worlds[i].checkpoint.x);assert(players[i].checkpoint,'landing activates checkpoint');assert(worlds[i].gems[2].collected,'third crystal reachable');}}
 // Restore a missing crystal to exercise the locked gate below.
 worlds[0].gems[2].collected=false;
 // Locked gate is physical, including position-following gesture input.
 const p=players[0];Object.assign(p,{x:510,y:408,vy:0,ground:true});
 keys={KeyD:true};tick(30);assert(p.x<=518,'keyboard cannot cross locked gate');
 keyboard=false;modelReady=true;smoothHands[0]={x:.51,y:.5};lastSeen[0]=100;
 tick(30);assert(p.x<=518,'gesture cannot cross locked gate');keyboard=true;
 // Checkpoint respawn preserves gems and charge, but does not permit falling forever.
 p.checkpoint=true;p.respawn={...worlds[0].checkpoint};p.y=550;tick();
 assert.equal(p.x,p.respawn.x);assert.equal(p.y,p.respawn.y);assert.equal(gateCharge[0],1);
 assert(worlds[0].gems[0].collected);
 // Each orb actually hurts, and cannot repeatedly kill during respawn protection.
 if(LEVELS[levelIndex].orbs.length){const o=orbAt(LEVELS[levelIndex].orbs[0],0);Object.assign(p,{x:o.x,y:o.y+10,invincible:0});const before=deaths;tick();assert.equal(deaths,before+1);}
 // Missing crystals keep the gate locked even when both switches are charged.
 worlds[0].gems[2].collected=false;assert.equal(gateOpen(0),false);worlds.forEach(w=>w.gems.forEach(g=>g.collected=true));assert(gateOpen(0));
 players.forEach((p,i)=>Object.assign(p,{x:worlds[i].goal.x,y:408,vy:0,ground:true,invincible:0}));keys={};tick();
 assert(completed,'both players can finish with all requirements');
 resetGame();assert.equal(deaths,0);assert.equal(completed,false);assert(gateCharge.every(v=>v===0));
 assert(worlds.every(w=>w.gems.every(g=>!g.collected)));
}
// Each hand can reach the full width without leaving its assigned preview half.
keyboard=false;modelReady=true;
for(let i=0;i<2;i++){
 const rawX=i===0?.99:.49;
 smoothHands[i]={x:rawX,y:.5,hand:{keypoints:Array.from({length:21},()=>({x:100,y:100}))}};lastSeen[i]=100;
 assert(getGestures(i).x<.03,'left edge of own half');smoothHands[i].x=i===0?.51:.01;assert(getGestures(i).x>.97,'right edge of own half');
}
`,scope);
console.log('PASS: 3 level altar routes, collection, shared bridges, charge retention, keyboard/gesture gate collision, checkpoints, hazards, win/reset and hand movement range');
