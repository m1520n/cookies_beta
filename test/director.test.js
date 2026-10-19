import test from 'node:test';import assert from 'node:assert/strict';
import {Director} from '../director.js';import {COURSES,courseEvents} from '../courses.js';import {makeObstacle,obstacleAt,OBSTACLES} from '../obstacles.js';
test('all schedules respect three hazards including warnings and all predicted shapes remain bounded',()=>{
 for(const course of COURSES){const events=courseEvents(course,42);for(let time=0;time<course.duration;time+=.05){
 const active=events.filter(event=>event.at<=time).map(event=>{const ball=makeObstacle(event);return {...ball,...obstacleAt(ball,time)};}).filter(ball=>ball.y<686&&ball.x>=-46&&ball.x<=400);
 assert.ok(active.length<=3,`${course.id} at ${time}: ${active.length}`);for(const ball of active){assert.ok(ball.radius<=21);assert.ok(ball.x>=-1e-6&&ball.x<=354+1e-6);}
 }}
});
test('a thousand marathon seeds preserve deterministic schedules independent of consumption',()=>{
 for(let seed=0;seed<1000;seed++){
 const a=new Director(COURSES[3],seed),b=new Director(COURSES[3],seed);
 const first=a.due(125),second=[...b.due(60),...b.due(125)];assert.deepEqual(first,second);assert.deepEqual(a.due(260),b.due(260));
 const events=a.events;for(let i=1;i<events.length;i++)assert.ok(events[i].at-events[i-1].at>=2-1e-7);
 }
});
test('ricochets have one reflected direction and pendulums have a predictable curved path',()=>{
 const r=makeObstacle({id:'r',kind:'ricochet',at:0,x:60});const p1=obstacleAt(r,2),p2=obstacleAt(r,3),p3=obstacleAt(r,3.5);
 assert.ok(p2.x>p1.x);assert.ok(p3.x<p2.x);const p=makeObstacle({id:'p',kind:'pendulum',at:0,x:88});assert.notEqual(obstacleAt(p,1.5).x,obstacleAt(p,2).x);
 assert.ok(OBSTACLES.ricochet.radius<OBSTACLES.heavy.radius);
});
