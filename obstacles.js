// Coordinates retain the original 46×44 sprite envelope. Hit circles stay inside artwork.
export const OBSTACLES = {
    heavy: {name:'Ciężka kula', radius:21, color:'#f3bd7b', vy:4.5, vx:0},
    ricochet: {name:'Rykoszet', radius:16, color:'#ff8e9c', vy:4.2, vx:3},
    pendulum: {name:'Wahadło', radius:18, color:'#85dcca', vy:3.8, vx:0},
};
export function obstacleAt(ball, time) {
    const age=Math.max(0,time-ball.spawnAt-ball.warningDuration);
    let x=ball.originX;
    if(ball.kind==='ricochet') {
        const raw=x+ball.vx*age*60;
        x=ball.vx>0 && raw>354 ? 708-raw : ball.vx<0 && raw<0 ? -raw : raw;
    } else if(ball.kind==='pendulum') x+=Math.sin(age*2.6)*44;
    return {x,y:-50+ball.vy*age*60,age,wait:Math.max(0,ball.spawnAt+ball.warningDuration-time)};
}
export function makeObstacle(event, time=event.at) {
    const spec=OBSTACLES[event.kind];
    const ball={id:event.id,kind:event.kind,originX:event.x,spawnAt:event.at,warningDuration:1,
        vx:event.kind==='ricochet' ? (event.x<177 ? spec.vx : -spec.vx) : 0,vy:spec.vy,
        radius:spec.radius,color:spec.color,rotation:0,nearDistance:Infinity,nearAwarded:false,contacted:false,broken:false,weak:false};
    return Object.assign(ball,obstacleAt(ball,time));
}
export function moveObstacle(ball,time) {
    Object.assign(ball,obstacleAt(ball,time));ball.rotation=ball.age*(ball.kind==='ricochet' ? 5 : 3);
}
export function obstacleAlive(ball) {return !ball.broken && ball.y<686 && ball.x>-46 && ball.x<400;}
