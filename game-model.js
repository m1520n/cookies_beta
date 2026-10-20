import {CARDS,STYLES,cleanProfile,unlockedCards} from './progression.js?v=ascent3';
import {Director,seededRandom} from './director.js?v=ascent3';
import {getCourse,sectorDuration,cookiePosition} from './courses.js?v=ascent3';
import {makeObstacle,moveObstacle,obstacleAt,obstacleAlive} from './obstacles.js?v=ascent3';
export const WIDTH=400,HEIGHT=640,STEP=1/60;
const RADIUS=22,EPS=1e-7;let serial=0;
const FRENZY_STYLE={id:'greed',name:'Szał',symbol:'✦',color:'#ffb74f'};
const emptyEffects=()=>({invincible:0,slow:0,magnet:0,double:0});
const freshSeed=()=>globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() ^ ++serial)>>>0;
const clone=value=>structuredClone(value);
export const POWERUPS = {
    1: { effect: 'invincible', label: 'Tarcza', duration: 5, color: '#bda4ff', symbol: '◇', description: 'Ochrona przed piłkami. Uważaj na kolce!' },
    2: { effect: 'slow', label: 'Spowolnienie', duration: 6, color: '#8ecbff', symbol: '◷', description: 'Piłki zwalniają. Twój skok działa jak zwykle.' },
    3: { effect: 'magnet', label: 'Magnes', duration: 6, color: '#87e4c4', symbol: 'U', description: 'Zbierasz ciastka z większej odległości.' },
    4: { effect: 'double', label: 'Podwójne punkty', duration: 8, color: '#ffd78f', symbol: '×2', description: 'Każde ciastko daje dwa punkty.' },
};
export function cookieWord(count) {
    if (count === 1) return 'ciastko';
    const lastTwo = count % 100;
    return count % 10 >= 2 && count % 10 <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'ciastka' : 'ciastek';
}
const STATE_KEYS=['ticks','elapsed','courseTime','score','collected','stageIndex','grace','bonuses','effects','effectMax','cards','featherUsed','chain','chainTime','bestChain','energy','abilityRemaining','abilityMax','abilityCooldown','offer','offerIndex','offerPendingSince','previousCookieSide','won','metrics','nextBonusCookie','nextBonusTime','bonusCount','lastBonus','lastBonusAt','bonusBag','cookie','bird','balls','pocketReady','pocketCount','highlight','finalAnnounced','abilityWarned'];
export class Game {
    constructor({seed,mode,profile,best=0,onSound=()=>{},onFeedback=()=>{},onSettle=()=>{},onFinish=()=>{},onVictory=()=>{}}={}) {
        Object.assign(this,{fixedSeed:seed,modeOverride:mode,profile:cleanProfile(profile),best,onSound,onFeedback,onSettle,onFinish,onVictory});this.practice=false;this.reset();
    }
    get isGreed(){return this.course.id==='greed';}
    get goldenCookie(){
        if(!this.isGreed || this.state!=='playing' || this.abilityRemaining>0 || !this.cookie)return false;
        const x=this.cookie.x+15,y=this.cookie.y+10;
        return this.balls.some(ball=>{
            if(!obstacleAlive(ball)||ball.wait>0||ball.y<-44||ball.y>=640)return false;
            const distance=Math.hypot(x-ball.x-23,y-ball.y-22);return distance>=70 && distance<=120;
        });
    }
    get level(){return this.stageIndex+1;}
    get nextStage(){return {atSeconds:(this.stageIndex+1)*sectorDuration(this.course)};}
    get progress(){return this.isGreed ? 0 : Math.min(1,this.courseTime/this.course.duration);}
    get ball(){return this.balls[0];}
    get multiplier(){return Math.min(4,1+Math.floor(this.chain/3));}
    get hasFeather(){return !this.isGreed && unlockedCards(this.profile).includes('feather');}
    get style(){return this.isGreed ? FRENZY_STYLE : STYLES.find(style=>style.id===this.profile.runStyle);}
    get magnetic(){return this.effects.magnet>0;}
    get magnetRange(){return 90;}
    get energyNeeded(){return this.isGreed ? 4 : 6-(this.cards.battery||0);}
    get abilityReady(){return this.energy>=this.energyNeeded && !this.abilityRemaining && !this.abilityCooldown;}
    get abilityDuration(){return this.isGreed ? 3 : 4+(this.cards.streak||0)*.5;}
    get shielded(){return (this.isGreed && this.abilityRemaining>0) || this.effects.invincible>0 || (this.profile.runStyle==='guard' && this.abilityRemaining>0);}
    get slowed(){return !this.isGreed && (this.effects.slow>0 || (this.profile.runStyle==='time' && this.abilityRemaining>0));}
    get dyingScale(){return this.deathElapsed<.08 ? 0 : this.deathElapsed<.4 ? .18 : .4;}
    durationFor(effect){return Object.values(POWERUPS).find(power=>power.effect===effect).duration*(1+this.profile.upgrades.duration*.05);}
    reset(){
        this.state='ready';this.paused=false;this.pendingCheckpoint=false;this.finalAnnounced=false;if(!this.practice)this.practiceOrigin=null;this.score=0;this.collected=0;this.stageIndex=0;
        this.ticks=0;this.elapsed=0;this.courseTime=0;this.grace=0;this.deathElapsed=0;this.bonuses=0;this.cause=null;
        this.effects=emptyEffects();this.effectMax=emptyEffects();this.cards={};this.featherUsed=false;this.snapshot=null;this.resultSent=false;
        this.chain=0;this.chainTime=0;this.bestChain=0;this.highlight='Pierwszy lot';
        this.course=getCourse(this.modeOverride||this.profile.selectedCourse);
        this.seed=this.isGreed || this.course.id==='marathon' ? this.fixedSeed ?? this.retrySeed ?? freshSeed() : this.course.seed;
        this.director=new Director(this.course,this.seed);this.stage=this.director.configure(0);
        this.bird={x:172,y:291,vx:6,vy:-8,frame:0,rotation:0};this.balls=[];this.cookie=null;
        this.abilityWarned=false;this.energy=0;this.abilityRemaining=0;this.abilityMax=4;this.abilityCooldown=0;this.offer=null;this.offerIndex=0;this.offerPendingSince=null;
        this.previousCookieSide=null;this.won=false;this.pocketReady=false;this.pocketCount=0;
        this.metrics={goldenCookies:0,shatters:0,firstFrenzyAt:0,shieldSeconds:0,twoPowerSeconds:0,nearMisses:0,abilities:0,rescues:0,firstTraitAt:0,offersSeen:0,offersTaken:0};
        this.nextBonusCookie=4;this.nextBonusTime=8;this.bonusCount=0;this.lastBonus=0;this.lastBonusAt=-1;this.bonusBag=[];
    }
    press(){
        if(this.paused)return false;
        if(['dying','celebrating'].includes(this.state) && this.deathElapsed<.12)return false;
        if(this.state!=='playing'){
            if(!['ready','over','dying','celebrating'].includes(this.state))return false;
            if(this.practice && this.practiceOrigin){const started=this.startPractice();if(started){this.bird.vy=-8;this.onSound('pop');this.onFeedback({type:'jump'});}return started;}
            if(this.state!=='ready' && (this.isGreed || this.course.id==='marathon'))this.retrySeed=this.seed;
            this.reset();this.runId=`${Date.now().toString(36)}-${this.seed}-${++serial}`;this.state='playing';this.spawnCookie();
            if(!this.isGreed && this.profile.upgrades.start)this.activate('invincible',this.profile.upgrades.start===1?1:1.5);
            this.checkpoint=this.captureState();
        }
        this.bird.vy=-8;this.onSound('pop');this.onFeedback({type:'jump'});return true;
    }
    captureState(){return {data:clone(Object.fromEntries(STATE_KEYS.map(key=>[key,this[key]]))),profile:clone(this.profile),seed:this.seed,mode:this.course.id,cursor:this.director.cursor};}
    startPractice(){
        const origin=this.practiceOrigin||this.checkpoint;if(this.isGreed || !origin)return false;
        this.practiceOrigin=clone(origin);this.practice=true;this.profile=clone(origin.profile);
        Object.assign(this,clone(origin.data));this.course=getCourse(origin.mode);this.seed=origin.seed;
        this.director=new Director(this.course,this.seed);this.director.ensure(this.courseTime);this.director.cursor=origin.cursor;
        this.stage=this.director.configure(this.stageIndex);this.pendingCheckpoint=false;this.state='playing';this.paused=false;this.snapshot=null;this.resultSent=false;this.deathElapsed=0;
        this.practiceEnd=(this.stageIndex+1)*sectorDuration(this.course);this.runId=`practice-${++serial}`;return true;
    }
    leavePractice(){this.practice=false;this.practiceOrigin=null;this.state='ready';this.reset();}
    newMarathon(){this.retrySeed=undefined;this.practice=false;this.practiceOrigin=null;this.state='ready';this.reset();}
    bonusType(){
        if(this.lastBonusAt===this.collected)return this.lastBonus;
        if(this.bonusCount===0)this.lastBonus=1;
        else {
            if(!this.bonusBag.length){
                this.bonusBag=this.bonusCount===1?[2,3,4]:[1,2,3,4];const random=seededRandom(this.seed^this.bonusCount);
                for(let i=this.bonusBag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[this.bonusBag[i],this.bonusBag[j]]=[this.bonusBag[j],this.bonusBag[i]];}
                if(this.bonusBag.at(-1)===this.lastBonus)[this.bonusBag[0],this.bonusBag[this.bonusBag.length-1]]=[this.bonusBag.at(-1),this.bonusBag[0]];
            }this.lastBonus=this.bonusBag.pop();
        }this.lastBonusAt=this.collected;this.bonusCount++;return this.lastBonus;
    }
    spawnCookie(){
        const {side,baseY}=cookiePosition(this.collected);let type=0;
        if(!this.isGreed && this.collected>=this.nextBonusCookie-1 && this.elapsed>=this.nextBonusTime && Object.values(this.effects).filter(time=>time>0).length<2){
            if(this.course.id==='marathon')type=this.bonusType();else type=[1,2,3,4][this.bonusCount++%4];
            for(let i=0;i<4&&this.effects[POWERUPS[type].effect]>0;i++)type=type%4+1;
            this.nextBonusCookie=this.collected+8;this.nextBonusTime=this.elapsed+12;
        }
        this.cookie={id:`cookie:${this.collected}`,side,x:side===0?50:315,baseY,y:baseY,type,remaining:type?8:0};
    }
    activate(effect,override){
        if(this.isGreed)return false;
        if(!this.effects[effect] && Object.values(this.effects).filter(time=>time>0).length>=2)return false;
        const duration=override??this.durationFor(effect);if(override!==undefined && this.effects[effect]>=duration)return false;
        this.effects[effect]=duration;this.effectMax[effect]=duration;return true;
    }
    updateTimeline(){
        const index=Math.min(this.isGreed || this.course.id==='marathon'?Infinity:2,Math.floor((this.courseTime+EPS)/sectorDuration(this.course)));
        if(index!==this.stageIndex){this.stageIndex=index;this.stage=this.director.configure(index);this.pendingCheckpoint=!this.isGreed;if(!this.isGreed){this.onSound('stage');this.onFeedback({type:'stage',level:this.level,stage:this.stage});}}
        for(const event of this.director.due(this.courseTime)){
            this.balls.push(makeObstacle(event,this.courseTime));this.onSound(`warning-${event.kind}`);
        }
        if(this.course.id==='marathon' && !this.finalAnnounced && this.courseTime>=210-EPS){this.finalAnnounced=true;this.onFeedback({type:'finale'});this.onSound('finale');}
    }
    gainEnergy(amount){
        if(this.state!=='playing'||this.abilityRemaining||this.abilityCooldown)return;
        const before=this.energy;this.energy=Math.min(this.energyNeeded,this.energy+amount);
        if(this.isGreed && before<4 && this.energy===4){this.onSound('frenzy-ready');this.onFeedback({type:'ready',color:this.style.color});}
    }
    triggerAbility(){
        if(!this.abilityReady)return false;this.energy=0;this.abilityMax=this.abilityDuration;this.abilityRemaining=this.abilityMax;this.metrics.abilities++;this.abilityWarned=false;
        if(this.isGreed && !this.metrics.firstFrenzyAt)this.metrics.firstFrenzyAt=this.elapsed;
        this.onSound(this.isGreed?'frenzy':'ability');this.onFeedback({type:'ability',color:this.style.color,symbol:this.style.symbol,title:this.style.name});return true;
    }
    updateAbility(dt){
        if(this.abilityRemaining>0){
            this.abilityRemaining=Math.max(0,this.abilityRemaining-dt);
            if(this.isGreed && this.abilityRemaining>0 && this.abilityRemaining<=1 && !this.abilityWarned){
                this.abilityWarned=true;this.onSound('frenzy-ending');
            }
            if(this.abilityRemaining<1e-8){
                this.abilityRemaining=0;this.abilityCooldown=this.isGreed?4:8;
                if(this.isGreed)this.onSound('frenzy-end');
            }
        } else {
            this.abilityCooldown=Math.max(0,this.abilityCooldown-dt);
            if(this.abilityCooldown<1e-8)this.abilityCooldown=0;
        }
    }
    awardNearMiss(ball,distance){
        if(ball.contacted||ball.broken||ball.nearAwarded)return;
        ball.nearDistance=Math.min(ball.nearDistance,distance);
        if(distance>84 && ball.nearDistance>=45 && ball.nearDistance<=69){
            ball.nearAwarded=true;this.metrics.nearMisses++;if(!this.isGreed){this.score++;this.gainEnergy(2);}if(this.chainTime>0)this.chainTime=4;
            if(this.cards.crack){ball.weak=true;if(this.cards.crack===2){const other=this.nearestBall(ball.x+23,ball.y+22,80,ball);if(other)other.weak=true;}}
            this.onSound('near');this.onFeedback({type:'near',x:ball.x+23,y:ball.y+22,color:this.style.color});
        }
    }
    nearestBall(x,y,radius,exclude){return this.balls.filter(ball=>ball!==exclude&&!ball.broken&&ball.wait<=0&&ball.y>=-22&&ball.y<640&&Math.hypot(x-ball.x-23,y-ball.y-22)<=radius).sort((a,b)=>Math.hypot(x-a.x-23,y-a.y-22)-Math.hypot(x-b.x-23,y-b.y-22))[0];}
    traitPool(){if(this.isGreed)return [];const full=Object.keys(this.cards).length>=3;return CARDS.filter(card=>(!card.unlock||unlockedCards(this.profile).includes(card.id))&&(!full||this.cards[card.id])&&(this.cards[card.id]||0)<2);}
    createOffer(){
        let pool=this.traitPool();if(!pool.length)return true;
        if(this.course.id==='press'&&this.offerIndex===0)pool=pool.filter(card=>['battery','crack'].includes(card.id));
        const heights=[128,256,384,512],preferred=[128,384,256][this.offerIndex%3];
        const y=[preferred,...heights.filter(y=>y!==preferred)].find(y=>Math.abs(y-this.bird.y-29)<=160&&[74,326].every(x=>(!this.cookie||Math.hypot(x-this.cookie.x-15,y-this.cookie.y-10)>=65)&&this.balls.filter(ball=>!ball.broken).every(ball=>{const p=obstacleAt(ball,this.courseTime+.9*(this.slowed ? .5 : 1));return Math.hypot(x-p.x-23,y-p.y-22)>=100;})));
        if(y===undefined)return false;const random=seededRandom(this.seed^(this.offerIndex*0x9e3779b9));const choices=[...pool];
        for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
        this.offer={age:0,options:choices.slice(0,2).map((card,i)=>({id:card.id,x:i?326:74,y}))};this.metrics.offersSeen++;this.onSound('offer');this.onFeedback({type:'offer'});return true;
    }
    updateOffer(dt){
        const due=this.course.offers[this.offerIndex];
        if(!this.offer && due!==undefined && this.courseTime>=due-EPS){
            this.offerPendingSince??=this.elapsed;
            if(this.elapsed-this.offerPendingSince>3 || this.createOffer()){this.offerIndex++;this.offerPendingSince=null;}
        }
        if(!this.offer)return;this.offer.age+=dt;if(this.offer.age>=8.9){this.offer=null;return;}if(this.offer.age<.9)return;
        const option=this.offer.options.find(option=>Math.hypot(this.bird.x+28-option.x,this.bird.y+29-option.y)<40);if(option)this.chooseTrait(option.id);
    }
    chooseTrait(id){
        if(this.state!=='playing'||this.paused||!this.offer||this.offer.age<.9||!this.offer.options.some(option=>option.id===id))return false;
        const card=this.traitPool().find(card=>card.id===id);if(!card)return false;
        this.cards[id]=(this.cards[id]||0)+1;this.offer=null;this.metrics.offersTaken++;if(!this.metrics.firstTraitAt)this.metrics.firstTraitAt=this.elapsed;
        if(id==='pocket'&&this.cards.pocket===1)this.pocketReady=true;
        if(id==='battery')this.energy=Math.min(this.energy,this.energyNeeded);
        this.onSound('trait');this.onFeedback({type:'card',title:card.name,color:card.color,symbol:card.symbol});return true;
    }
    rescue(cause,hit){
        this.featherUsed=true;this.metrics.rescues++;this.grace=1.2;
        if(hit)this.shatterBall(hit,'feather','#ffd78f');else this.bird.vy=cause==='floor'?-Math.min(8,Math.abs(this.bird.vy)):Math.min(8,Math.abs(this.bird.vy));
        this.onSound('feather');this.onFeedback({type:'rescue',x:this.bird.x+28,y:this.bird.y+29});
    }
    shatterBall(ball,source='shield',color=this.style.color,root=null){
        if(this.state!=='playing'||ball.broken||ball.wait>0||ball.y<-44||ball.y>640)return false;
        root??={breaks:0,cookieId:this.cookie?.id,collected:false};if(root.breaks>=2)return false;
        root.breaks++;ball.broken=true;ball.contacted=true;this.metrics.shatters++;
        if(this.isGreed){
            if(this.abilityRemaining>0){const points=2*this.multiplier;this.score+=points;this.chainTime=4;this.onFeedback({type:'points',x:ball.x+23,y:ball.y+22,points});}
        }else this.gainEnergy(1);
        if(this.chainTime>0)this.chainTime=4;
        this.onSound(`shatter-${ball.kind}`);this.onFeedback({type:'shatter',x:ball.x+23,y:ball.y+22,color,source,kind:ball.kind});
        if(this.cards.shards && !root.collected && this.cookie?.id===root.cookieId && Math.hypot(ball.x+23-this.cookie.x-15,ball.y+22-this.cookie.y-10)<=(this.cards.shards===1?90:130)){
            root.collected=true;this.collectCookie('shards',root);
        }
        if(this.cards.echo && root.breaks===1){const other=this.nearestBall(ball.x+23,ball.y+22,this.cards.echo===1?70:100,ball);if(other)this.shatterBall(other,'echo',color,root);}
        return true;
    }
    settle(cause){
        this.best=this.practice?this.best:Math.max(this.best,this.score);
        this.snapshot=Object.freeze({id:this.runId,mode:this.course.id,style:this.style.id,practice:this.practice,seed:this.seed,progress:this.progress,score:this.score,collected:this.collected,bonuses:this.bonuses,
            ...this.runDetails,won:this.won,bestChain:this.bestChain,build:Object.freeze(Object.entries(this.cards).map(([id,rank])=>Object.freeze({id,rank}))),metrics:Object.freeze({...this.metrics,cause}),
            completedSectors:this.isGreed?0:Math.floor((this.courseTime+EPS)/sectorDuration(this.course)),level:this.level,elapsed:this.elapsed,highlight:this.highlight});
        if(!this.practice)this.onSettle(this.snapshot);
    }
    finish(cause='ball',hit=null){
        if(this.state!=='playing')return false;if(this.hasFeather&&!this.featherUsed){this.rescue(cause,hit);return false;}
        this.practiceOrigin=clone(this.checkpoint);this.state='dying';this.deathElapsed=0;this.cause=cause;
        this.deathDuration=this.elapsed<15?.35:.7;this.deathOrigin={x:this.bird.x+28,y:this.bird.y+29};
        this.bird.vx=hit?(this.bird.x+28<hit.x+23?-2.5:2.5):Math.sign(this.bird.vx)*2;this.bird.vy=cause==='floor'?-5.5:cause==='ceiling'?3:-3;
        this.settle(cause);this.effects=emptyEffects();this.abilityRemaining=0;this.offer=null;this.onSound('dead');this.onFeedback({type:'hit',...this.deathOrigin});return true;
    }
    complete(){
        if(!this.won){this.won=true;if(!this.practice)this.onVictory(this.runId,this.course.id);this.onSound('victory');this.onFeedback({type:'victory'});}
        if(this.course.id!=='marathon'||this.practice){if(!this.practice)this.practiceOrigin=clone(this.checkpoint);this.state='celebrating';this.cause='complete';this.deathElapsed=0;this.deathDuration=.6;this.settle('complete');}
    }
    showResults(){if(!['dying','celebrating'].includes(this.state)||this.resultSent)return false;this.resultSent=true;this.state='over';this.onFinish(this.score,this.best,this.snapshot);return true;}
    skipDeath(){return this.deathElapsed>=.12?this.showResults():false;}
    updateDeath(dt){
        this.deathElapsed+=dt;if(this.state==='dying'){
            const frames=dt*60*this.dyingScale;this.bird.x=Math.max(0,Math.min(344,this.bird.x+this.bird.vx*frames));this.bird.y+=this.bird.vy*frames;this.bird.vy+=.5*frames;
            this.bird.rotation+=.12*frames*Math.sign(this.bird.vx||1);if(this.bird.y>567){this.bird.y=567;this.bird.vy=0;}
        }if(this.deathElapsed>=this.deathDuration)this.showResults();
    }
    update(dt=STEP){
        if(this.paused||this.state==='over')return;this.ticks++;if(this.state==='ready')return;
        if(['dying','celebrating'].includes(this.state)){this.updateDeath(dt);return;}
        const timeScale=this.slowed ? .5 : 1;this.elapsed+=dt;this.courseTime+=dt*timeScale;this.grace=Math.max(0,this.grace-dt);this.updateAbility(dt);
        for(const key of Object.keys(this.effects)){this.effects[key]=Math.max(0,this.effects[key]-dt);if(this.effects[key]<1e-8)this.effects[key]=0;}
        this.chainTime=Math.max(0,this.chainTime-dt);
        if(!this.chainTime&&this.chain){if(this.cards.pocket&&this.pocketReady){this.chainTime=this.cards.pocket===1?2:3;this.pocketReady=false;this.pocketCount=0;this.onFeedback({type:'pocket'});}else this.chain=0;}
        this.updateTimeline();if(this.shielded)this.metrics.shieldSeconds+=dt;if(Object.values(this.effects).filter(t=>t>0).length===2)this.metrics.twoPowerSeconds+=dt;
        const bird=this.bird;bird.x+=bird.vx;bird.y+=bird.vy;bird.vy+=.5;
        bird.frame=bird.vx<0?(bird.vy<0?1:3):(bird.vy>0?0:2);
        if(bird.x<0||bird.x+56>WIDTH){bird.x=Math.max(0,Math.min(344,bird.x));bird.vx*=-1;this.onSound('bird');}
        if(bird.y+29-RADIUS<25||bird.y+29+RADIUS>615){const cause=bird.y+29-RADIUS<25?'ceiling':'floor';bird.y=Math.max(18,Math.min(564,bird.y));if(this.grace>0)bird.vy=cause==='ceiling'?Math.abs(bird.vy):-Math.abs(bird.vy);else {this.finish(cause);return;}}
        for(const ball of this.balls){
            if(ball.broken)continue;moveObstacle(ball,this.courseTime);if(ball.wait>0||ball.y<-44||!obstacleAlive(ball))continue;
            const distance=Math.hypot(bird.x+28-ball.x-23,bird.y+29-ball.y-22);
            if(distance<RADIUS+ball.radius){ball.contacted=true;if(this.shielded||this.grace>0||ball.weak)this.shatterBall(ball,ball.weak?'weak':'shield');else {this.finish('ball',ball);return;}}
            else this.awardNearMiss(ball,distance);
        }
        this.balls=this.balls.filter(obstacleAlive);this.updateOffer(dt);
        const cookie=this.cookie;if(cookie.type){cookie.remaining=Math.max(0,cookie.remaining-dt);if(!cookie.remaining)cookie.type=0;}
        cookie.y=cookie.baseY+12*Math.sin(this.courseTime*6);
        const cx=cookie.x+15,cy=cookie.y+10,closestX=Math.max(bird.x,Math.min(bird.x+56,cx)),closestY=Math.max(bird.y,Math.min(bird.y+58,cy)),padding=this.isGreed?0:this.profile.upgrades.grip*3;
        const overlap=cookie.type?Math.hypot(cx-closestX,cy-closestY)<=23:bird.x-padding<cookie.x+30&&bird.x+56+padding>cookie.x&&bird.y-padding<cookie.y+20&&bird.y+58+padding>cookie.y;
        if(overlap||(this.magnetic&&Math.hypot(bird.x+28-cx,bird.y+29-cy)<90))this.collectCookie();
        if(!this.isGreed&&this.state==='playing'&&this.courseTime>=(this.practice?this.practiceEnd:this.course.duration)-EPS)this.complete();
        if(this.pendingCheckpoint&&this.state==='playing'&&!this.practice){this.checkpoint=this.captureState();this.pendingCheckpoint=false;}
    }
    collectGreedCookie(cookie){
        const golden=this.goldenCookie;
        if(this.abilityReady)this.triggerAbility();
        const before=this.multiplier;
        this.chain++;this.chainTime=4;this.bestChain=Math.max(this.bestChain,this.chain);
        const points=(golden?3:1)*this.multiplier*(this.abilityRemaining>0?2:1);
        this.score+=points;this.collected++;this.gainEnergy(golden?2:1);
        if(golden)this.metrics.goldenCookies++;
        if(this.multiplier>before){this.onSound(`combo${this.multiplier}`);this.onFeedback({type:'combo',multiplier:this.multiplier,x:cookie.x+15,y:cookie.y+10});}
        this.onSound(golden?'golden':'eatCookie');
        this.onFeedback({type:'collect',x:cookie.x+15,y:cookie.y+10,cookieType:0,points,golden});
        this.spawnCookie();
    }
    collectCookie(source='touch',root=null){
        if(this.state!=='playing')return;const cookie=this.cookie;
        if(this.isGreed){this.collectGreedCookie(cookie);return;}
        if(source==='touch'&&this.abilityReady)this.triggerAbility();
        const before=this.multiplier;this.chain++;this.chainTime=4;this.bestChain=Math.max(this.bestChain,this.chain);
        const points=(this.effects.double>0?2:1)*this.multiplier*(this.profile.runStyle==='collector'&&this.abilityRemaining>0?2:1);
        this.score+=points;this.collected++;this.gainEnergy(1);
        if(this.cards.pocket&&!this.pocketReady&&++this.pocketCount>=6){this.pocketReady=true;this.pocketCount=0;}
        if(this.multiplier>before){this.onSound(`combo${this.multiplier}`);this.onFeedback({type:'combo',multiplier:this.multiplier,x:cookie.x+15,y:cookie.y+10});}
        const power=POWERUPS[cookie.type];if(power){this.bonuses++;this.activate(power.effect);this.onSound(cookie.type===1?'boost':'gravity');}
        this.onSound('eatCookie');this.onFeedback({type:'collect',x:cookie.x+15,y:cookie.y+10,cookieType:cookie.type,points,source,magnetic:Boolean(this.magnetic||source==='shards'),targetX:this.bird.x+28,targetY:this.bird.y+29});
        if(source==='touch'&&this.profile.runStyle==='collector'&&this.abilityRemaining>0){const ball=this.nearestBall(cookie.x+15,cookie.y+10,70);if(ball)this.shatterBall(ball,'impulse',this.style.color,{breaks:0,cookieId:cookie.id,collected:true});}
        this.spawnCookie();
    }
}
