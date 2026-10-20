import {sectorEvents,sectorDuration,sectorFamilies} from './courses.js?v=rooms3';
export function seededRandom(seed) {
    let value=seed>>>0;
    return ()=>{value=(value+0x6D2B79F5)>>>0;let t=Math.imul(value^(value>>>15),1|value);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
}
// Scheduling never depends on bird position, collection, damage or destruction.
export class Director {
    constructor(course,seed=0){this.course=course;this.seed=seed;this.cursor=0;this.events=[];this.sectors=0;}
    ensure(time){
        const needed=Math.floor(time/sectorDuration(this.course))+1;
        const limit=this.course.endless || this.course.id==='marathon' ? needed : Math.min(3,needed);
        while(this.sectors<limit){this.events.push(...sectorEvents(this.course,this.sectors,this.seed));this.sectors++;}
    }
    due(time){this.ensure(time);const result=[];while(this.cursor<this.events.length && this.events[this.cursor].at<=time+1e-7)result.push(this.events[this.cursor++]);return result;}
    configure(index){return {name:sectorFamilies(this.course,index,this.seed).map(id=>({heavy:'Kule',ricochet:'Rykoszety',pendulum:'Wahadła'}[id])).join(' · '),atSeconds:index*sectorDuration(this.course)};}
}
