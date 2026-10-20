// Factory coordinates use the same units as the 400 × 640 arena; upward is negative Y.
export const ASCENT={id:'ascent',name:'Fabryka',duration:Infinity,endless:true,sectorSeconds:15,offers:[],sectors:[['heavy']],gaps:[2.5]};
export const GATE_HEIGHT=1200,GATE_Y=320-GATE_HEIGHT,VENT_START=1320;
export const heightAt=y=>Math.max(0,320-y);
export const floorName=floor=>floor===2?'Wentylatornia':'Tłocznia';
export const ascentRecordKey=floor=>`ascent:${floor===2?2:1}`;

// Encounters belong to places, not the camera. Consumed entrances never repeat.
export class AscentDirector {
    constructor(startFloor=1,seed=0){this.startFloor=startFloor;this.seed=seed;this.cursor=0;this.ventCursor=0;this.nextShot=null;this.shots=0;}
    configure(){return {name:'Fabryka'};}
    due(game){
        const events=[],lanes=[60,294,114,240];let slots=3-game.balls.length;
        const add=(id,kind,index,wind=0)=>{
            if(slots<=0)return;
            const lane=lanes[(index+(this.seed>>>0)%2)%lanes.length];
            events.push({id,kind,x:kind==='pendulum'?(lane<177?88:266):lane,at:game.courseTime,y:game.cameraTop-50,world:true,wind,cameraEntry:true});slots--;
        };
        const triggers=[120,420,720];
        if(this.startFloor===1)while(this.cursor<triggers.length && game.maxHeight>=triggers[this.cursor]){
            const i=this.cursor++;add(`press:${i}`,'heavy',i);
        }
        if(game.machine.awake && !game.machine.broken){
            this.nextShot??=game.elapsed+1.2;
            if(game.elapsed>=this.nextShot){
                this.nextShot+=2.5;const i=this.shots++;add(`machine:${i}`,'heavy',i);
            }
        }
        if(game.machine.broken)while(game.maxHeight>=VENT_START+this.ventCursor*400){
            const i=this.ventCursor++;add(`vent:${i}`,['heavy','ricochet','pendulum'][i%3],i,i%2?1:-1);
        }
        return events;
    }
}
