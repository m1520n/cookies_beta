import test from 'node:test';
import assert from 'node:assert/strict';
import { Director, projected, largestVerticalGap } from '../director.js';

test('a thousand seeds preserve warnings, bounds, hazard limits and escape space',()=>{
    for(let seed=0;seed<1000;seed++){
        const director=new Director(seed); let previous;
        for(let sector=0;sector<9;sector++){
            const stage=director.configure(sector);
            assert.ok(stage.balls<=3); assert.ok(director.speed<=6.25);
            if(sector>=4)assert.notEqual(stage.pattern,previous);
            previous=stage.pattern;
            const balls=[];
            for(let i=0;i<stage.balls;i++)balls.push(director.create(i,balls,{x:172,y:100+(seed%400)},i*.8));
            for(const ball of balls){
                assert.ok(ball.wait>=.6);
                for(let t=0;t<7;t+=.1){const point=projected(ball,t);assert.ok(point.x>=-1e-8&&point.x<=354+1e-8);}
            }
            for(let t=0;t<7;t+=.05)assert.ok(largestVerticalGap(balls,t)>=140-1e-7);
        }
    }
});
test('new patterns are introduced with longer warnings and fallback is a delayed vertical drop',()=>{
    const director=new Director(1);director.configure(0);
    const first=director.create(0,[],{x:172,y:291});assert.ok(first.wait>=.9);
    const second=director.create(0,[],{x:172,y:291});assert.ok(second.wait>=.6);
    const d2=new Director(42);d2.configure(6);
    const existing=[0,1,2].map(i=>({...second,wait:0,y:50+i*180,vy:5}));
    const next=d2.create(3,existing,{x:172,y:291});
    assert.equal(next.pattern,'rain');assert.ok(next.wait>1);
});

test('a thousand mixed transitions and finale entries preserve old hazards and safe future spawns',()=>{
    for(let seed=0;seed<1000;seed++) {
        const director=new Director(seed), bird={x:172,y:291};director.configure(4);
        let balls=[];
        for(let i=0;i<3;i++)balls.push(director.create(i,balls,bird,i*.8));
        for(const [sector,options] of [[5,{}],[6,{}],[7,{pattern:'rain',alternating:true}],[7,{pattern:'diagonal'}],[7,{pattern:'pairs'}],[8,{}]]) {
            const old=balls.map(ball=>({...ball}));director.configure(sector,options);assert.deepEqual(balls,old);
            // Replace one slot at a time, leaving the other patterns in flight.
            for(let i=0;i<3;i++) {
                balls[i]=director.create(i,balls.filter((_,index)=>index!==i),bird);
                assert.ok(balls[i].wait>=.6);
                for(let t=0;t<7;t+=.1)assert.ok(largestVerticalGap(balls,t)>=140-1e-7,`seed ${seed}, sector ${sector}`);
            }
        }
    }
});
