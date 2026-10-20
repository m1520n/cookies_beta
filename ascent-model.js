import {Game,STEP} from './game-model.js?v=ascent3';
import {makeObstacle,moveObstacle,obstacleAlive} from './obstacles.js?v=ascent3';
import {AscentDirector,GATE_Y,GATE_HEIGHT,VENT_START,heightAt,floorName} from './ascent-world.js?v=ascent3';
const FRENZY={id:'ascent',name:'Szał',symbol:'✦',color:'#ffb74f'};

// The previous modes keep their original model. Only the factory uses world coordinates.
export class FactoryGame extends Game {
    constructor(options={}){super(options);this.onDiscover=options.onDiscover||(()=>{});}
    get isAscent(){return this.course?.id==='ascent';}
    get isGreed(){return this.isAscent||super.isGreed;}
    get style(){return this.isAscent?FRENZY:super.style;}
    get level(){return this.isAscent?this.floor:super.level;}
    get runDetails(){return this.isAscent?{startFloor:this.startFloor,height:this.maxHeight,floor:this.floor,pressBroken:this.machine.broken}:{};}
    get goldenCookie(){
        if(!this.isAscent)return super.goldenCookie;
        if(this.state!=='playing'||this.abilityRemaining>0||!this.cookie)return false;
        return this.balls.some(b=>{
            if(b.wait>0||!obstacleAlive(b,this.cameraTop)||b.y+44<this.cameraTop||b.y>this.cameraTop+640)return false;
            const d=Math.hypot(this.cookie.x+15-b.x-23,this.cookie.y+10-b.y-22);return d>=70&&d<=120;
        });
    }
    reset(){
        super.reset();if(!this.isAscent)return;
        this.startFloor=this.profile.ascentStart===2&&this.profile.ascentUnlocked.includes(2)?2:1;
        this.floor=this.startFloor;this.maxHeight=this.startFloor===2?VENT_START:0;
        this.bird.y=291-this.maxHeight;this.cameraTop=-this.maxHeight;
        this.machine={awake:this.startFloor===2,broken:this.startFloor===2,cookies:0,brokenAt:null,bumpAt:-Infinity};
        this.cookieSerial=0;this.director=new AscentDirector(this.startFloor,this.seed);
        this.stageIndex=0;this.stage={name:floorName(this.floor)};
    }
    spawnCookie(){
        if(!this.isAscent){super.spawnCookie();return;}
        const side=this.collected%2===0?1:0;
        let height;
        if(!this.machine.broken && this.maxHeight>=880)height=this.collected%2===0?1080:950;
        else height=Math.min(this.machine.broken?Infinity:1000,this.maxHeight+120);
        const baseY=320-height-10;
        this.cookie={id:`factory-cookie:${++this.cookieSerial}`,side,x:side===0?50:315,baseY,y:baseY,type:0,remaining:0};
    }
    collectGreedCookie(cookie){
        super.collectGreedCookie(cookie);
        if(this.isAscent && !this.machine.broken){
            this.machine.cookies=Math.min(6,this.machine.cookies+1);
            if(this.machine.cookies===6&&!this.machine.awake){
                this.machine.awake=true;this.onSound('machine-awake');this.onFeedback({type:'machine-awake',x:200,y:GATE_Y});
            }
        }
    }
    breakMachine(){
        if(!this.isAscent||!this.machine.awake||this.machine.broken||this.abilityRemaining<=0||this.state!=='playing')return false;
        this.machine.broken=true;this.machine.brokenAt=this.elapsed;this.metrics.pressBrokenAt=this.elapsed;
        this.onDiscover(2);this.onSound('machine-break');this.onFeedback({type:'machine-break',x:200,y:GATE_Y});return true;
    }
    shatterBall(ball,source='shield',color=this.style.color,root=null){
        if(!this.isAscent)return super.shatterBall(ball,source,color,root);
        if(this.state!=='playing'||ball.broken||ball.wait>0||!obstacleAlive(ball,this.cameraTop))return false;
        ball.broken=true;ball.contacted=true;this.metrics.shatters++;
        if(this.abilityRemaining>0){const points=2*this.multiplier;this.score+=points;this.chainTime=4;this.onFeedback({type:'points',x:ball.x+23,y:ball.y+22,points});}
        this.onSound(`shatter-${ball.kind}`);this.onFeedback({type:'shatter',x:ball.x+23,y:ball.y+22,color,source,kind:ball.kind});return true;
    }
    updateDeath(dt){
        if(!this.isAscent){super.updateDeath(dt);return;}
        this.deathElapsed+=dt;
        if(this.state==='dying'){
            const frames=dt*60*this.dyingScale;
            this.bird.x=Math.max(0,Math.min(344,this.bird.x+this.bird.vx*frames));this.bird.y+=this.bird.vy*frames;
            this.bird.vy+=.5*frames;this.bird.rotation+=.12*frames*Math.sign(this.bird.vx||1);
        }
        if(this.deathElapsed>=this.deathDuration)this.showResults();
    }
    update(dt=STEP){
        if(!this.isAscent){super.update(dt);return;}
        if(this.paused||this.state==='over')return;
        this.ticks++;if(this.state==='ready')return;
        if(this.state==='dying'||this.state==='celebrating'){this.updateDeath(dt);return;}
        this.elapsed+=dt;this.courseTime+=dt;this.updateAbility(dt);
        this.chainTime=Math.max(0,this.chainTime-dt);if(!this.chainTime)this.chain=0;
        if(this.shielded)this.metrics.shieldSeconds+=dt;
        const bird=this.bird;bird.x+=bird.vx;bird.y+=bird.vy;bird.vy+=.5;
        bird.frame=bird.vx<0?(bird.vy<0?1:3):(bird.vy>0?0:2);
        if(bird.x<0||bird.x+56>400){bird.x=Math.max(0,Math.min(344,bird.x));bird.vx*=-1;this.onSound('bird');}
        if(!this.machine.broken&&this.machine.awake&&this.abilityRemaining>0&&Math.hypot(bird.x+28-200,bird.y+29-GATE_Y)<=50)this.breakMachine();
        if(!this.machine.broken && bird.y+29-22<GATE_Y+10){
            if(!this.machine.broken){
                bird.y=GATE_Y+32-29;bird.vy=Math.max(0,bird.vy);
                if(this.elapsed-this.machine.bumpAt>.5){this.machine.bumpAt=this.elapsed;this.onSound('gate-bump');}
            }
        }
        // The camera never goes down. Falling is measured against the visible world, not a fixed floor.
        this.maxHeight=Math.max(this.maxHeight,heightAt(bird.y+29));
        this.cameraTop=Math.min(this.cameraTop,bird.y+29-256);
        if(bird.y+29-22>this.cameraTop+680){this.finish('fall');return;}
        if(this.machine.broken && bird.y+29<GATE_Y-22 && this.floor===1){
            this.floor=2;this.stage={name:floorName(2)};this.onFeedback({type:'floor',title:'WENTYLATORNIA'});this.onSound('stage');
        }
        for(const ball of this.balls){
            if(ball.broken)continue;moveObstacle(ball,this.courseTime);
            if(ball.wait>0||!obstacleAlive(ball,this.cameraTop))continue;
            const d=Math.hypot(bird.x+28-ball.x-23,bird.y+29-ball.y-22);
            if(d<22+ball.radius){ball.contacted=true;if(this.shielded)this.shatterBall(ball);else{this.finish('ball',ball);return;}}
            else this.awardNearMiss(ball,d);
        }
        this.balls=this.balls.filter(b=>obstacleAlive(b,this.cameraTop));
        for(const event of this.director.due(this)){this.balls.push(makeObstacle(event,this.courseTime));this.onSound(`warning-${event.kind}`);}
        // Replace only pickups that are entirely behind the camera. Visible ones never teleport.
        if(this.cookie.y>this.cameraTop+736)this.spawnCookie();
        const c=this.cookie;c.y=c.baseY+12*Math.sin(this.courseTime*6);
        if(bird.x<c.x+30&&bird.x+56>c.x&&bird.y<c.y+20&&bird.y+58>c.y)this.collectCookie();
    }
}
