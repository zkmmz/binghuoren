// Platforms are one-way ledges; gates are solid walls. Both worlds share progress.
const LEVELS = [
 {name:"共生之桥",subtitle:"登台采集晶石，握拳为对方架桥",chargeTime:1.5,
  step:{x:100,y:370,w:90},altar:{x:185,y:320,w:80},bridge:{x:265,y:320,w:135},landing:{x:400,y:330,w:90},pool:{x:455,w:45},orbs:[]},
 {name:"错位回响",subtitle:"更窄的落脚点，避开巡游的能量球",chargeTime:1.9,
  step:{x:100,y:365,w:76},altar:{x:190,y:305,w:70},bridge:{x:260,y:315,w:140},landing:{x:400,y:325,w:75},pool:{x:445,w:60},orbs:[{x:470,y:370,range:35,speed:1.7,r:12}]},
 {name:"边界协奏",subtitle:"浮动的共生桥，双重巡游考验",chargeTime:2.3,
  step:{x:105,y:365,w:68},altar:{x:190,y:300,w:65},bridge:{x:255,y:315,w:145},landing:{x:400,y:320,w:70},pool:{x:435,w:75},orbs:[{x:320,y:267,range:35,speed:1.4,r:11},{x:475,y:370,range:30,speed:2,r:12}]}
];
