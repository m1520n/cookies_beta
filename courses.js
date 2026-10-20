import {ASCENT} from './ascent-world.js?v=ascent4';
export const GREED = {id:'greed',name:'Łasuch',duration:Infinity,endless:true,sectorSeconds:15,offers:[],sectors:null,gaps:[2.5,2.5,2.25,2]};
export const COURSES = [
    {id:'press',name:'Tłocznia',duration:45,seed:1520,offers:[6,18,30],sectors:[['heavy'],['heavy'],['heavy','ricochet']],gaps:[2.5,2,2]},
    {id:'ricochet',name:'Rykoszet',duration:60,seed:3221,offers:[6,20,34,48],sectors:[['ricochet'],['heavy','ricochet'],['ricochet','heavy']],gaps:[3,2.5,2]},
    {id:'mechanism',name:'Mechanizm',duration:75,seed:7311,offers:[6,19,32,45,58,66],sectors:[['pendulum'],['pendulum','heavy'],['heavy','ricochet','pendulum']],gaps:[2.5,2.25,2]},
    {id:'marathon',name:'Maraton',duration:240,offers:[8,35,70,105,140,175,210],sectors:null,gaps:[2.5,2.5,2.25,2]},
];
export function getCourse(id) {return id==='ascent' ? ASCENT : id==='greed' ? GREED : COURSES.find(course=>course.id===id)||GREED;}
export function sectorDuration(course) {return course.sectorSeconds || (course.id==='marathon' ? 30 : course.duration/3);}
export function sectorFamilies(course,index,seed=0) {
    if(course.id==='greed')return index<3 ? [['heavy'],['ricochet'],['pendulum']][index] : ['heavy','ricochet','pendulum'];
    if(course.sectors)return course.sectors[Math.min(2,index)];
    if(index===7)return ['heavy','ricochet','pendulum'];
    const patterns=[['heavy'],['ricochet'],['pendulum'],['heavy','ricochet','pendulum']];
    return patterns[index<4 ? index : (index+(seed>>>0)%4)%4];
}
export function sectorEvents(course,index,seed=0) {
    const length=sectorDuration(course),start=index*length,end=start+length;
    const kinds=sectorFamilies(course,index,seed),gap=course.gaps[Math.min(index,course.gaps.length-1)];
    const lanes=[60,294,60,294,114,240];const events=[];
    for(let at=start+(index===0 ? 2 : 1),i=0;at<end-1;at+=gap,i++) {
        let kind=kinds[i%kinds.length];
        if(course.id==='marathon' && index===7)kind=['heavy','ricochet','pendulum'][Math.min(2,Math.floor((at-start)/10))];
        const lane=lanes[(i+(course.endless || course.id==='marathon' ? (seed>>>0)%2 : 0))%lanes.length];
        const x=kind==='pendulum' ? (lane<177 ? 88 : 266) : lane;
        events.push({id:`${index}:${i}`,at,kind,x});
    }
    return events;
}
export function courseEvents(course,seed=0) {
    return Array.from({length:course.endless?4:course.id==='marathon'?8:3},(_,index)=>sectorEvents(course,index,seed)).flat();
}
export function cookiePosition(index) {
    const heights=[256,384,256,128,256,384,512,384];
    return {side:index%2===0 ? 1 : 0,baseY:heights[index%heights.length]};
}
