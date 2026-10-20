import test from 'node:test';import assert from 'node:assert/strict';
import {FactoryGame} from '../ascent-model.js';import {STEP} from '../game-model.js';
import {GATE_Y,GATE_HEIGHT,AscentDirector} from '../ascent-world.js';import {makeObstacle,obstacleAt} from '../obstacles.js';
import {findAscentWitness} from './helpers/ascent-reachability.js';
const start=options=>{const g=new FactoryGame({mode:'ascent',seed:42,...options});g.press();return g;};

test('world ascent keeps flap physics, camera follows at 40% and never moves back down',()=>{
 const g=start();g.update();assert.equal(g.bird.x,178);assert.equal(g.bird.y,283);assert.equal(g.bird.vy,-7.5);
 for(let i=0;i<20;i++){g.press();g.update();}assert.equal(g.bird.y+29-g.cameraTop,256);
 const top=g.cameraTop;g.bird.vy=4;g.update();assert.equal(g.cameraTop,top);
 g.paused=true;const bird={...g.bird},time=g.elapsed;g.press();g.update();assert.deepEqual(g.bird,bird);assert.equal(g.elapsed,time);
});
test('factory has no ceiling spikes; the sleeping gate blocks gently and a fall does not teleport the death',()=>{
 const g=start();g.bird.y=GATE_Y+30-29;g.bird.vy=-8;g.update();assert.equal(g.state,'playing');assert.equal(g.bird.y+29,GATE_Y+32);assert.equal(g.bird.vy,0);
 g.bird.y=g.cameraTop+700;g.bird.vy=1;g.update();assert.equal(g.state,'dying');assert.equal(g.cause,'fall');
 const y=g.bird.y;for(let i=0;i<7;i++)g.update();assert.ok(g.bird.y>y-10);assert.ok(g.bird.y>g.cameraTop+650);
});
test('six physical cookies awaken the press and a live frenzy hit opens it once and saves immediately',()=>{
 const discovered=[],g=start({onDiscover:f=>discovered.push(f)});
 for(let i=0;i<6;i++)g.collectCookie();assert.equal(g.machine.cookies,6);assert.equal(g.machine.awake,true);assert.equal(g.machine.broken,false);
 g.bird.x=172;g.bird.y=GATE_Y+45-29;g.bird.vy=0;g.update();assert.equal(g.machine.broken,true);assert.deepEqual(discovered,[2]);assert.equal(g.breakMachine(),false);
 for(let i=0;i<9;i++){g.press();g.update();}assert.equal(g.floor,2);assert.equal(g.state,'playing');
});
test('the feeder stays in the gate chamber and only offscreen pickups are replaced',()=>{
 const g=start();g.maxHeight=1100;g.cameraTop=-1036;g.bird.y=g.cameraTop+256-29;g.bird.vy=0;g.spawnCookie();const c=g.cookie;
 assert.ok(c.baseY>=GATE_Y+100&&c.baseY<=GATE_Y+250);g.update();assert.equal(g.cookie,c);
 c.baseY=g.cameraTop+800;c.y=c.baseY;g.update();assert.notEqual(g.cookie,c);assert.equal(g.collected,0);
 for(let i=0;i<15;i++){g.spawnCookie();assert.ok(g.cookie.y>=g.cameraTop&&g.cookie.y<g.cameraTop+640);g.collectCookie();}
 assert.ok(g.metrics.abilities>0);assert.equal(g.machine.cookies,6);
});
test('the world and cookie survive opening while existing trajectories keep their captured wind',()=>{
 const g=start();g.machine.awake=true;g.abilityRemaining=2;const c=g.cookie;
 const event={id:'wind',kind:'heavy',at:0,x:114,y:-1100,world:true,wind:1};const b=makeObstacle(event,2.2),plain=makeObstacle({...event,wind:0},2.2);
 g.balls=[b];assert.ok(Math.abs(b.x-plain.x-32)<1e-6);g.breakMachine();assert.equal(g.cookie,c);assert.equal(g.balls[0],b);assert.equal(b.wind,1);
 for(const time of [1,1.5,2,3,5]){const prediction=obstacleAt(b,time);assert.ok(prediction.x>=0&&prediction.x<=354);assert.equal(prediction.y,event.y+b.vy*Math.max(0,time-1)*60);}
});
test('height entrances cannot repeat or refill a destroyed slot and boss attacks retain their clock',()=>{
 const director=new AscentDirector(1,42),scene={maxHeight:800,cameraTop:-736,balls:[],elapsed:0,courseTime:0,machine:{awake:false,broken:false}};
 assert.ok(director.due(scene).length<=3);assert.deepEqual(director.due(scene),[]);
 scene.machine.awake=true;assert.deepEqual(director.due(scene),[]);scene.elapsed=1.2;scene.courseTime=1.2;assert.equal(director.due(scene).length,1);
 assert.deepEqual(director.due(scene),[]);scene.elapsed=3.6;assert.deepEqual(director.due(scene),[]);scene.elapsed=3.7;assert.equal(director.due(scene).length,1);
});
test('real input replay climbs, collects six cookies, breaks the core and reaches ventilation',()=>{
 const inputs=findAscentWitness(42),discoveries=[],g=start({onDiscover:f=>discoveries.push(f)});
 let top=g.cameraTop;
 for(const input of inputs){if(input)g.press();g.update();assert.equal(g.state,'playing');assert.ok(g.cameraTop<=top);top=g.cameraTop;assert.ok(g.balls.length<=3);}
 assert.equal(g.machine.broken,true);assert.equal(g.floor,2);assert.ok(g.maxHeight>GATE_HEIGHT);assert.deepEqual(discoveries,[2]);
 assert.ok(g.collected>=6);assert.ok(g.metrics.abilities>0);assert.ok(g.balls.some(b=>b.wind));
});
