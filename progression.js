import {COURSES} from './courses.js';
// Run traits occupy at most three slots; legacy unlock IDs remain stable.
export const CARDS = [
    { id:'battery', name:'Bateria', symbol:'ϟ', description:'Energia do aktywacji: 5 / 4 zamiast 6.', max:2, color:'#ffd78f' },
    { id:'shards', name:'Odłamki', symbol:'✦', description:'Rozbita piłka zbiera ciastko z odległości 90 / 130.', max:2, color:'#ffb17c' },
    { id:'crack', name:'Pęknięcie', symbol:'◎', description:'Unik osłabia miniętą przeszkodę. Poziom 2: także jedną pobliską w promieniu 80.', max:2, color:'#87e4c4' },
    { id:'echo', name:'Echo', symbol:'↯', description:'Rozbicie niszczy jeszcze jedną przeszkodę w promieniu 70 / 100.', max:2, color:'#8ecbff' },
    { id:'pocket', name:'Kieszeń', symbol:'◈', description:'Ratuje serię przez 2 / 3 s. Odnawia się po sześciu ciastkach.', max:2, color:'#d4adff' },
    { id:'streak', name:'Dogrywka', symbol:'◷', description:'Zdolność trwa dłużej o 0,5 / 1 sekundę.', max:2, color:'#ff94b5', unlock:true },
];
export const LOOKS = [
    {id:'classic', name:'Klasyczny', color:null},
    {id:'gold', name:'Złoty', color:'#ffd78f'},
    {id:'mint', name:'Miętowy', color:'#87e4c4'},
    {id:'copper',name:'Miedziany',color:'#db9462',course:'press',cost:100},
    {id:'cobalt',name:'Kobaltowy',color:'#7cafff',course:'ricochet',cost:150},
    {id:'carbon',name:'Grafitowy',color:'#a3acc5',course:'mechanism',cost:200},
];
export function unlockedLooks(profile) { return ['classic', ...(profile.wins > 0 ? ['gold'] : []), ...(profile.bestChain >= 20 ? ['mint'] : []), ...(profile.ownedLooks || []).filter(id=>LOOKS.some(look=>look.id===id&&look.cost))]; }
export const NEST_UPGRADES = [
    { id: 'grip', name: 'Pewniejszy chwyt', description: '+3 / +6 do zasięgu zwykłych ciastek.', costs: [20, 50] },
    { id: 'duration', name: 'Dłuższa moc', description: '+5% / +10% czasu bonusów.', costs: [20, 50] },
    { id: 'start', name: 'Dobry start', description: '1 / 1,5 s tarczy na początku rundy.', costs: [30, 60] },
];
export const PROFILE_KEY = 'ciastkobranie.profile.v1';
export const STYLES = [
    { id:'guard', name:'Rozbijacz', symbol:'✦', color:'#d4adff', description:'Naładuj pasek i zbierz ciastko: 4 s rozbijania. Uważaj na kolce.' },
    { id:'collector', name:'Łakomczuch', symbol:'×2', color:'#87e4c4', description:'Ciastko uruchamia gotową moc: punkty ×2 i rozbijające impulsy przez 4 s.' },
    { id:'time', name:'Władca czasu', symbol:'◷', color:'#8ecbff', description:'Ciastko uruchamia gotową moc: świat i rytm trasy zwalniają przez 4 s.' },
];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
function cleanMetrics(value = {}) {
    const number = key => Number.isFinite(value?.[key]) && value[key] >= 0 ? value[key] : 0;
    return {goldenCookies:Math.floor(number('goldenCookies')),shatters:Math.floor(number('shatters')),firstFrenzyAt:number('firstFrenzyAt'),shieldSeconds:number('shieldSeconds'),twoPowerSeconds:number('twoPowerSeconds'),nearMisses:Math.floor(number('nearMisses')),
        firstTraitAt:number('firstTraitAt'),offersSeen:Math.floor(number('offersSeen')),offersTaken:Math.floor(number('offersTaken')),retrySeconds:number('retrySeconds'),abilities:Math.floor(number('abilities')),rescues:Math.floor(number('rescues')),cause:['ball','floor','ceiling','complete'].includes(value?.cause) ? value.cause : 'ball'};
}
export function unlockedCourses(profile) {
    const clears=profile.courseClears||[];
    return ['greed','press', ...(profile.legacyWinner || clears.includes('press') ? ['ricochet'] : []),
        ...(profile.legacyWinner || clears.includes('ricochet') ? ['mechanism'] : []), 'marathon'];
}
const positive=value=>Number.isFinite(value)&&value>=0 ? value : 0;
export function cleanProfile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const legacyWinner=typeof value.legacyWinner==='boolean' ? value.legacyWinner : count(value.wins)>0;
    const courseClears=Array.isArray(value.courseClears) ? value.courseClears.filter(id=>COURSES.some(course=>course.id===id&&id!=='marathon')) : [];
    return {
        legacyWinner,courseClears,greedIntroduced:true,selectedCourse:value.greedIntroduced===true && unlockedCourses({legacyWinner,courseClears}).includes(value.selectedCourse) ? value.selectedCourse : 'greed',
        ownedLooks:Array.isArray(value.ownedLooks) ? value.ownedLooks.filter(id=>LOOKS.some(look=>look.id===id&&look.cost)) : [],
        legacyBest:count(value.legacyBest),legacyBestImported:value.legacyBestImported===true,
        records:{greed:{progress:0,score:count(value.records?.greed?.score)},...Object.fromEntries(COURSES.flatMap(course=>STYLES.map(style=>{const key=`${course.id}:${style.id}`,record=value.records?.[key];return [key,{progress:Math.min(1,positive(record?.progress)),score:count(record?.score)}];})))},
        wins: count(value.wins), bestChain: count(value.bestChain),
        look: unlockedLooks({wins:count(value.wins),bestChain:count(value.bestChain),ownedLooks:Array.isArray(value.ownedLooks)?value.ownedLooks:[]}).includes(value.look) ? value.look : 'classic',
        victoryRuns: Array.isArray(value.victoryRuns) ? value.victoryRuns.filter(id => typeof id === 'string').slice(-128) : [],
        lastBuild: Array.isArray(value.lastBuild) ? value.lastBuild.filter(item => CARDS.some(card => card.id === item?.id)).slice(0,3).map(item => ({id:item.id,rank:Math.min(2,count(item.rank))})) : [],
        version: 1, crumbs: count(value.crumbs), lifetimeCookies: count(value.lifetimeCookies),
        runStyle: STYLES.some(style => style.id === value.runStyle) ? value.runStyle : 'guard',
        lifetimeBonuses: count(value.lifetimeBonuses), runs: count(value.runs), bestSector: count(value.bestSector),
        upgrades: Object.fromEntries(NEST_UPGRADES.map(item => [item.id, Math.min(2, count(value.upgrades?.[item.id]))])),
        settledRuns: Array.isArray(value.settledRuns) ? value.settledRuns.filter(id => typeof id === 'string').slice(-128) : [],
        lastRun: value.lastRun ? {id:typeof value.lastRun.id==='string'?value.lastRun.id:'',mode:value.lastRun.mode==='greed'||COURSES.some(course=>course.id===value.lastRun.mode)?value.lastRun.mode:'marathon',progress:Math.min(1,positive(value.lastRun.progress)), seed: count(value.lastRun.seed), score: count(value.lastRun.score), level: count(value.lastRun.level), elapsed:Number.isFinite(value.lastRun.elapsed) && value.lastRun.elapsed >= 0 ? value.lastRun.elapsed : 0, metrics:cleanMetrics(value.lastRun.metrics) } : null,
    };
}
export function unlockedCards(profile) {
    return [ ...(profile.lifetimeCookies >= 40 ? ['feather'] : []), ...(profile.lifetimeBonuses >= 10 ? ['streak'] : []) ];
}
export function nextUnlock(profile) {
    if (profile.lifetimeCookies < 40) return { name: 'Ostatnie pióro', current: profile.lifetimeCookies, target: 40, unit: 'ciastek' };
    if (profile.lifetimeBonuses < 10) return { name: 'Dogrywka', current: profile.lifetimeBonuses, target: 10, unit: 'bonusów' };
    return null;
}
export class ProfileStore {
    constructor(storage) {
        this.storage = storage;
        this.value = cleanProfile();
        this.reload();
    }
    reload() {
        if (this.memoryOnly) return this.value;
        try {
            const text = this.storage?.getItem(PROFILE_KEY);
            if (text) {
                const data = JSON.parse(text);
                if (data?.version === 1) this.value = cleanProfile(data);
            }
        } catch { this.memoryOnly = true; }
        return this.value;
    }
    save() {
        try { this.storage?.setItem(PROFILE_KEY, JSON.stringify(this.value)); } catch { this.memoryOnly = true; }
    }
    settle(run) {
        this.reload();
        if (run?.practice || !run?.id || this.value.settledRuns.includes(run.id)) return { awarded: false, crumbs: 0, unlocked: [] };
        const before = unlockedCards(this.value);
        const collected = count(run.collected);
        const sectors = run.mode==='greed' ? 0 : count(run.completedSectors);
        const crumbs = collected + sectors * 3;
        this.value.crumbs += crumbs;
        this.value.lifetimeCookies += collected;
        this.value.lifetimeBonuses += count(run.bonuses);
        this.value.runs++;
        this.value.bestChain = Math.max(this.value.bestChain, count(run.bestChain));
        this.value.lastBuild = cleanProfile({lastBuild:run.build}).lastBuild;
        this.value.bestSector = Math.max(this.value.bestSector, count(run.level));
        const key=run.mode==='greed' ? 'greed' : `${run.mode||'marathon'}:${run.style||'guard'}`;
        if(this.value.records[key]) {this.value.records[key].progress=Math.max(this.value.records[key].progress,Math.min(1,positive(run.progress)));this.value.records[key].score=Math.max(this.value.records[key].score,count(run.score));}
        this.value.lastRun = {id:run.id,mode:run.mode||'marathon',progress:Math.min(1,positive(run.progress)), seed: count(run.seed), score: count(run.score), level: count(run.level), elapsed:Number.isFinite(run.elapsed) && run.elapsed >= 0 ? run.elapsed : 0, metrics:cleanMetrics(run.metrics) };
        this.value.settledRuns = [...this.value.settledRuns, run.id].slice(-128);
        this.save();
        return { awarded: true, crumbs, unlocked: unlockedCards(this.value).filter(id => !before.includes(id)) };
    }
    recordVictory(id,courseId='marathon') {
        this.reload();
        if (courseId==='greed' || typeof id !== 'string' || !id || this.value.victoryRuns.includes(id)) return false;
        this.value.victoryRuns = [...this.value.victoryRuns, id].slice(-128);
        this.value.wins++;
        if(courseId!=='marathon' && COURSES.some(course=>course.id===courseId) && !this.value.courseClears.includes(courseId))this.value.courseClears.push(courseId);
        this.save(); return true;
    }
    adoptLegacyBest(score){this.reload();if(!this.value.legacyBestImported){this.value.legacyBest=Math.max(this.value.legacyBest,count(score));this.value.legacyBestImported=true;this.save();}}
    setCourse(id){this.reload();if(!unlockedCourses(this.value).includes(id))return false;this.value.selectedCourse=id;this.save();return true;}
    purchaseLook(id){
        this.reload();const look=LOOKS.find(look=>look.id===id&&look.cost);
        if(!look || this.value.ownedLooks.includes(id) || !this.value.courseClears.includes(look.course) || this.value.crumbs<look.cost)return false;
        this.value.crumbs-=look.cost;this.value.ownedLooks.push(id);this.save();return true;
    }
    recordRetry(seconds){this.reload();if(!this.value.lastRun)return;this.value.lastRun.metrics.retrySeconds=Math.min(3600,positive(seconds));this.save();}
    setLook(id) {
        this.reload();
        if (!unlockedLooks(this.value).includes(id)) return false;
        this.value.look = id; this.save(); return true;
    }
    purchase(id) {
        this.reload();
        const item = NEST_UPGRADES.find(upgrade => upgrade.id === id);
        if (!item) return false;
        const level = this.value.upgrades[id];
        const cost = item.costs[level];
        if (cost === undefined || this.value.crumbs < cost) return false;
        this.value.crumbs -= cost;
        this.value.upgrades[id]++;
        this.save();
        return true;
    }
    setStyle(id) {
        if (!STYLES.some(style => style.id === id)) return false;
        this.reload(); this.value.runStyle = id; this.save(); return true;
    }
}
