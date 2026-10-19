import {courseEvents} from '../../courses.js';
import {makeObstacle,obstacleAt} from '../../obstacles.js';
const DT=1/60;
// Bounded state search. Every retained node is a real flap/no-flap trajectory.
// Replaying the returned witness in Game, rather than the approximation, is the gate.
export function findWitness(course,beam=12000){
    const events=courseEvents(course,course.seed||0).map(event=>makeObstacle(event));
    const parents=[],actions=[];let states=[{y:291,vy:-8}],x=172,vx=6;
    const frames=Math.ceil(course.duration*60);
    for(let frame=0;frame<frames;frame++){
        const time=(frame+1)*DT;x+=vx;if(x<0||x+56>400){x=Math.max(0,Math.min(344,x));vx*=-1;}
        const hazards=events.filter(event=>time>=event.spawnAt+1&&time<event.spawnAt+5).map(ball=>({...obstacleAt(ball,time),radius:ball.radius})).filter(ball=>ball.y<686);
        const offerWindow=course.offers.some(at=>time>=at&&time<=at+12);
        const cy=256+12*Math.sin(time*6);const candidates=new Map();
        for(let parent=0;parent<states.length;parent++)for(let flap=0;flap<2;flap++){
            const old=states[parent],speed=flap?-8:old.vy,y=old.y+speed,vy=speed+.5;
            if(y<18||y>564)continue;
            if(hazards.some(ball=>ball.wait<=0&&ball.y>=-44&&Math.hypot(x+28-ball.x-23,y+29-ball.y-22)<22+ball.radius+1))continue;
            // Keep the baseline free of optional rewards: no ability or pickup can hide a bad route.
            if(x<345&&x+56>315&&y<cy+20&&y+58>cy)continue;
            if(offerWindow&&[74,326].some(ox=>[128,256,384,512].some(oy=>Math.hypot(x+28-ox,y+29-oy)<42)))continue;
            const rank=Math.abs(y-300)*.03+Math.abs(vy)*.12;
            const key=Math.round(y/3)+Math.round((vy+8)*2)*400;
            const node={y,vy,parent,flap,rank};if(!candidates.has(key)||candidates.get(key).rank>rank)candidates.set(key,node);
        }
        states=[...candidates.values()].sort((a,b)=>a.rank-b.rank).slice(0,beam);
        if(!states.length)throw Error(`No witness for ${course.id} at ${time.toFixed(2)}s`);
        parents.push(Int16Array.from(states.map(node=>node.parent)));actions.push(Uint8Array.from(states.map(node=>node.flap)));
    }
    const result=new Uint8Array(frames);let index=0;
    for(let i=frames-1;i>=0;i--){result[i]=actions[i][index];index=parents[i][index];}
    return result;
}
