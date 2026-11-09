(function(){
"use strict";
/* Fire Alarm Wiring & Programming Simulator v8 – single file, no external resources, SCORM 1.2 aware (optional). */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad3=n=>String(n).padStart(3,'0');
const MINUS='−';
const ps=p=>p==='+'?'+':MINUS;
const PW=190;

/* ---------------- Tasks / progress ---------------- */
const TASKS=[
 ['cb','Conventional Class B – zones, sprinkler tree + NAC'],['ca','Conventional Class A – zones, sprinkler tree + NAC'],
 ['dclc','Addressable – DCLC, modules + NAC'],['dclb','Addressable – DCLC with DCLB tap, modules + NAC'],
 ['prog0','Program: General alarm'],['prog1','Program: Supervisory & fan shutdown'],
 ['prog2','Program: Door holders (fail-safe)'],['prog3','Program: Elevator recall'],
 ['prog4','Program: Cross-zoned pre-action release'],['prog5','Program: Full sequence of operations']
];
const TABS=[['cb','Conventional Class B'],['ca','Conventional Class A'],['dclc','Addressable DCLC'],['dclb','DCLC + DCLB Tap'],['prog','Panel Programming'],['help','Progress & Help']];
const WTABS=['cb','ca','dclc','dclb'];
const state={tab:'cb',mode:'wire',tool:'activate',sel:null,zoom:null,armed:null,dmm:{open:false,mode:'off',x:null,y:null,blown:false},settings:{floorIso:true,taskMin:false},done:{},sims:{}};

/* ---------------- SCORM 1.2 (optional) ---------------- */
const SCORM={api:null,
  find(){let w=window,n=0;try{while(w&&n<12){if(w.API){return w.API}if(w.parent===w)break;w=w.parent;n++}}catch(e){}
    try{if(window.opener&&window.opener.API)return window.opener.API}catch(e){}return null},
  init(){this.api=this.find();if(!this.api)return;try{this.api.LMSInitialize('');
      const sd=this.api.LMSGetValue('cmi.suspend_data');if(sd){const o=JSON.parse(sd);if(o&&o.done)Object.assign(state.done,o.done)}
      const st=this.api.LMSGetValue('cmi.core.lesson_status');if(!st||st==='not attempted')this.api.LMSSetValue('cmi.core.lesson_status','incomplete');
      this.api.LMSCommit('')}catch(e){this.api=null}},
  report(score,complete){if(!this.api)return;try{
      this.api.LMSSetValue('cmi.core.score.min','0');this.api.LMSSetValue('cmi.core.score.max','100');
      this.api.LMSSetValue('cmi.core.score.raw',String(score));
      this.api.LMSSetValue('cmi.core.lesson_status',complete?'completed':'incomplete');
      this.api.LMSSetValue('cmi.suspend_data',JSON.stringify({done:state.done}).slice(0,4000));
      this.api.LMSCommit('')}catch(e){}},
  finish(){if(!this.api)return;try{this.api.LMSCommit('');this.api.LMSFinish('')}catch(e){}}
};
const LS='fasim.v8';
function loadLocal(){try{const o=JSON.parse(localStorage.getItem(LS)||'{}');if(o.done)Object.assign(state.done,o.done);if(o.settings)Object.assign(state.settings,o.settings)}catch(e){}}
function saveLocal(){try{localStorage.setItem(LS,JSON.stringify({done:state.done,settings:state.settings}))}catch(e){}}
function markDone(key){
  const was=!!state.done[key];state.done[key]=true;saveLocal();updateProgress();
  const n=TASKS.filter(t=>state.done[t[0]]).length;SCORM.report(Math.round(n/TASKS.length*100),n===TASKS.length);
  if(!was)toast('✔ Task complete: '+TASKS.find(t=>t[0]===key)[1]);
}
function updateProgress(){
  const n=TASKS.filter(t=>state.done[t[0]]).length;
  $('#pfill').style.width=(n/TASKS.length*100)+'%';
  $('#ptext').textContent=`${n} of ${TASKS.length} tasks complete (${Math.round(n/TASKS.length*100)}%)`;
  renderTabs();
}
let toastT=0;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2800)}

/* ---------------- Item factories ---------------- */
function stdTerms(w,flip){const iX=flip?w:0,oX=flip?0:w,iS=flip?'r':'l',oS=flip?'l':'r';return[
  {id:'in+',pol:'+',dx:iX,dy:40,side:iS,name:'+IN'},{id:'in-',pol:'-',dx:iX,dy:64,side:iS,name:MINUS+'IN'},
  {id:'out+',pol:'+',dx:oX,dy:40,side:oS,name:'+OUT'},{id:'out-',pol:'-',dx:oX,dy:64,side:oS,name:MINUS+'OUT'}]}
function mkDev(id,kind,desc,x,y,o={}){const w=o.w||132;return{id,type:'dev',kind,desc,x,y,w,h:80,flip:!!o.flip,group:o.group||'loop',zone:o.zone||null,addressable:!!o.addressable,sup:!!o.sup,monOf:o.monOf||null,terms:stdTerms(w,o.flip)}}
function mkMM(id,desc,x,y,o,mon){const it=mkDev(id,'MM',desc,x,y,o);it.mon=mon;it.btm=true;
  it.terms.push({id:'m+',pol:'+',dx:48,dy:80,side:'b',name:'IDC +',role:'mon'},{id:'m-',pol:'-',dx:84,dy:80,side:'b',name:'IDC '+MINUS,role:'mon'});return it}
function mkRM(id,x,y,o){const it=mkDev(id,'RM','Relay Module (Form C)',x,y,o);it.btm=true;
  it.terms.push({id:'COM',pol:'*',dx:30,dy:80,side:'b',name:'COM',role:'rly'},{id:'NC',pol:'*',dx:66,dy:80,side:'b',name:'NC',role:'rly'},{id:'NO',pol:'*',dx:102,dy:80,side:'b',name:'NO',role:'rly'});return it}
function mkBT(id,x,y,mm,zone,grp){return{id,type:'ser',kind:'BT',desc:'Box Tamper Sw.',x,y,w:84,h:56,group:grp||'mon',monOf:mm,zone,
  terms:[{id:'s1',pol:'*',dx:0,dy:28,side:'l',name:'T1'},{id:'s2',pol:'*',dx:84,dy:28,side:'r',name:'T2'}]}}
function mkDH(id,x,y){return{id,type:'dh',kind:'DH',desc:'Door Holder 24VDC',x,y,w:110,h:76,group:'dh',
  terms:[{id:'d+',pol:'+',dx:0,dy:26,side:'l',name:'DH +'},{id:'d-',pol:'-',dx:0,dy:50,side:'l',name:'DH '+MINUS}]}}
function mkIso(id,x,y,flip){return{id,type:'iso',kind:'ISO',desc:'Fault Isolator Module',x,y,w:132,h:80,flip:!!flip,group:'loop',terms:stdTerms(132,flip)}}
function mkTB(id,x,y){const it={id,type:'tb',kind:'TB',desc:'T-Tap Junction (DCLB)',x,y,w:132,h:80,group:'loop',zone:'TAP',terms:stdTerms(132)};
  it.terms.push({id:'t+',pol:'+',dx:48,dy:0,side:'t',name:'+TAP',role:'tap'},{id:'t-',pol:'-',dx:84,dy:0,side:'t',name:MINUS+'TAP',role:'tap'});return it}
function mkEOL(id,x,y,desc,cls){return{id,type:'eol',kind:'EOL',desc,cls,x,y,w:100,h:58,terms:[{id:'r1',pol:'*',dx:0,dy:20,side:'l',name:'EOL-1'},{id:'r2',pol:'*',dx:0,dy:42,side:'l',name:'EOL-2'}]}}
function mkPanel(x,y,h,sub,terms){return{id:'P',type:'panel',kind:'FACP',desc:'FACP',sub,x,y,w:PW,h,terms}}
const T2=(id,dy,name,pol)=>({id,pol,dx:PW,dy,side:'r',name});
const auxTerms=dy=>[T2('X+',dy,'AUX 24VDC +','+'),T2('X-',dy+30,'AUX 24VDC '+MINUS,'-')];
function nacTerms(cls,dy){const b=[T2('N+',dy,cls==='A'?'NAC B+ (OUT)':'NAC 1 +','+'),T2('N-',dy+30,cls==='A'?'NAC B'+MINUS+' (OUT)':'NAC 1 '+MINUS,'-')];
  if(cls==='A')b.push(T2('NR+',dy+70,'NAC A+ (RET)','+'),T2('NR-',dy+100,'NAC A'+MINUS+' (RET)','-'));return b}
function addNAC(items,x,y,cls){items.push(mkDev('HS-1','HS','Horn / Strobe',x,y,{group:'nac'}),mkDev('H-1','HN','Horn (audible only)',x+260,y,{group:'nac'}),mkEOL('NEOL',x+530,y+10,'NAC EOL Resistor',cls))}

/* ---------------- Scenario builders ---------------- */
function treeSVG(x,y){const P='#c62828';let s=`<g pointer-events="none">`;
  s+=`<text class="roomlbl" x="${x+150}" y="${y+16}" text-anchor="middle">SPRINKLER TREE</text>`;
  s+=`<rect x="${x+20}" y="${y+40}" width="260" height="9" rx="2" fill="${P}"/>`;
  [45,100,200,255].forEach(dx=>{s+=`<rect x="${x+dx-2}" y="${y+49}" width="4" height="10" fill="${P}"/><polygon points="${x+dx-7},${y+66} ${x+dx+7},${y+66} ${x+dx},${y+57}" fill="#90a4ae"/>`});
  s+=`<rect x="${x+143}" y="${y+40}" width="14" height="262" fill="${P}"/>`;
  s+=`<rect x="${x+157}" y="${y+120}" width="30" height="22" rx="3" fill="#b71c1c" stroke="#7f0000"/><text class="dio" x="${x+192}" y="${y+128}">FLOW SWITCH</text><text class="dio" x="${x+192}" y="${y+139}">FS-1 + BT-1</text>`;
  const vy=y+225;s+=`<polygon points="${x+132},${vy-14} ${x+168},${vy+14} ${x+168},${vy-14} ${x+132},${vy+14}" fill="#37474f"/><line x1="${x+150}" y1="${vy}" x2="${x+150}" y2="${vy-24}" stroke="#37474f" stroke-width="3"/><circle cx="${x+150}" cy="${vy-32}" r="9" fill="none" stroke="#37474f" stroke-width="3"/><rect x="${x+110}" y="${vy-8}" width="18" height="16" rx="2" fill="#455a64"/><text class="dio" x="${x+176}" y="${vy-2}">CONTROL VALVE</text><text class="dio" x="${x+176}" y="${vy+9}">TS-1 + BT-2</text>`;
  s+=`<text class="dio" x="${x+150}" y="${y+314}" text-anchor="middle">▲ FROM WATER SUPPLY</text></g>`;return s}
function buildConv(cls){
  const zt=(n,dy)=>{const t=[T2(n+'B+',dy,cls==='A'?`Z${n} B+ (OUT)`:`ZONE ${n} +`,'+'),T2(n+'B-',dy+30,cls==='A'?`Z${n} B${MINUS} (OUT)`:`ZONE ${n} ${MINUS}`,'-')];
    if(cls==='A')t.push(T2(n+'A+',dy+60,`Z${n} A+ (RET)`,'+'),T2(n+'A-',dy+90,`Z${n} A${MINUS} (RET)`,'-'));return t};
  const terms=zt(1,60).concat(zt(2,230),zt(3,400),zt(4,570),nacTerms(cls,760));
  const items=[mkPanel(20,120,940,`Conventional • Class ${cls}`,terms)];
  items.push(mkDev('PS-1','PS','Manual Pull Station',330,100,{zone:'Z1'}),mkDev('SD-1','SD','2-Wire Smoke Det.',620,100,{zone:'Z1'}),mkEOL('EOL1',910,110,'Zone 1 EOL Resistor',cls),
    mkDev('HD-1','HD','Heat Detector',330,330,{zone:'Z2'}),mkDev('SD-2','SD','2-Wire Smoke Det.',620,330,{zone:'Z2'}),mkEOL('EOL2',910,340,'Zone 2 EOL Resistor',cls),
    mkDev('FS-1','FS','Waterflow Alarm Switch',330,560,{zone:'Z3',group:'spr',w:140}),mkBT('BT-1',560,572,null,'Z3','spr'),mkEOL('EOL3',720,571,'Zone 3 EOL Resistor',cls),
    mkDev('TS-1','TS','Valve Tamper Switch',330,700,{zone:'Z4',group:'spr',w:140,sup:true}),mkBT('BT-2',560,712,null,'Z4','spr'),mkEOL('EOL4',720,711,'Zone 4 EOL Resistor',cls));
  addNAC(items,380,920,cls);
  return{key:cls==='B'?'cb':'ca',kind:'conv',cls,nacCls:cls,items,vw:1220,vh:1080,decor:treeSVG(900,515),blocks:[[895,510,1205,834]],
    zones:[{n:1,z:'Z1',members:['PS-1','SD-1']},{n:2,z:'Z2',members:['HD-1','SD-2']},
      {n:3,z:'Z3',members:['FS-1'],sw:'FS-1',bt:'BT-1',label:'waterflow'},{n:4,z:'Z4',members:['TS-1'],sw:'TS-1',bt:'BT-2',label:'valve tamper – supervisory',sup:true}],
    zoneNames:{Z1:'Zone 1',Z2:'Zone 2',Z3:'Zone 3 (Waterflow)',Z4:'Zone 4 (Supervisory)'},
    rooms:[{x:240,y:20,w:970,h:230,l:'FIRE ZONE 1 – MAIN ENTRANCE / OFFICE'},{x:240,y:260,w:970,h:230,l:'FIRE ZONE 2 – WAREHOUSE'},
      {x:240,y:500,w:970,h:335,l:'SPRINKLER RISER ROOM – ZONE 3 WATERFLOW / ZONE 4 SUPERVISORY'},{x:10,y:100,w:220,h:970,l:'ELECTRICAL RM'},{x:240,y:845,w:970,h:225,l:'CORRIDOR – NAC 1'}]};
}
function buildDCLC(){
  const terms=[T2('A+',80,'SLC RET +','+'),T2('A-',110,'SLC RET '+MINUS,'-'),T2('B+',370,'SLC OUT +','+'),T2('B-',400,'SLC OUT '+MINUS,'-')].concat(auxTerms(640),nacTerms('B',740));
  const items=[mkPanel(20,160,830,'Addressable • DCLC + NAC 1',terms)];
  const z1={addressable:true,zone:'Z1'},z2={addressable:true,zone:'Z2',flip:true};
  items.push(
    mkIso('ISO-4',250,60,true),mkMM('MM-2','Tamper Monitor Mod.',430,60,{...z2,sup:true},{eol:'MEOL2',sw:'TS-1',bt:'BT-2'}),
    mkDev('HD-1','HD','Heat Detector',610,60,z2),mkDev('SD-4','SD','Smoke Detector',790,60,z2),mkDev('SD-3','SD','Smoke Detector',970,60,z2),
    mkDev('TS-1','TS','Valve Tamper Switch',430,240,{group:'mon',zone:'Z2',monOf:'MM-2',w:126}),mkBT('BT-2',620,252,'MM-2','Z2'),mkEOL('MEOL2',770,251,'MM-2 EOL Resistor','B'),
    mkIso('ISO-3',1330,220,true),mkIso('ISO-2',1330,490),
    mkIso('ISO-1',250,490),mkDev('PS-1','PS','Manual Pull Station',430,490,z1),mkRM('RM-1',610,490,z1),
    mkDev('SD-1','SD','Smoke Detector',790,490,z1),mkDev('SD-2','SD','Smoke Detector',970,490,z1),
    mkMM('MM-1','Waterflow Monitor Mod.',1150,490,z1,{eol:'MEOL1',sw:'FS-1',bt:'BT-1'}),
    mkDH('DH-1',740,650),
    mkDev('FS-1','FS','Waterflow Alarm Switch',900,660,{group:'mon',zone:'Z1',monOf:'MM-1',w:126}),mkBT('BT-1',1080,672,'MM-1','Z1'),mkEOL('MEOL1',1220,671,'MM-1 EOL Resistor','B'));
  addNAC(items,430,860,'B');
  return{key:'dclc',kind:'addr',cls:'A',nacCls:'B',items,vw:1480,vh:1030,zoneNames:{Z1:'Zone 1 (Floor 1)',Z2:'Zone 2 (Floor 2)'},interZone:2,
    points:[{a:1,k:'PS',tag:'PS-1',loc:'Zone 1 – Floor 1'},{a:2,k:'SD',tag:'SD-1',loc:'Zone 1 – Floor 1'},{a:3,k:'SD',tag:'SD-2',loc:'Zone 1 – Floor 1'},{a:4,k:'MM',tag:'MM-1',loc:'Zone 1 – Sprinkler Waterflow (FS-1)'},{a:5,k:'RM',tag:'RM-1',loc:'Zone 1 – Door Holder Release (DH-1)'},
            {a:21,k:'SD',tag:'SD-3',loc:'Zone 2 – Floor 2'},{a:22,k:'SD',tag:'SD-4',loc:'Zone 2 – Floor 2'},{a:23,k:'HD',tag:'HD-1',loc:'Zone 2 – Floor 2'},{a:24,k:'MM',tag:'MM-2',loc:'Zone 2 – Sprinkler Valve Tamper (TS-1)'}],
    rooms:[{x:230,y:20,w:1065,h:170,l:'ZONE 2 – FLOOR 2'},{x:230,y:200,w:1065,h:170,l:'SPRINKLER VALVE ROOM'},{x:1305,y:20,w:165,h:640,l:'RISER'},
           {x:230,y:385,w:1065,h:425,l:'ZONE 1 – FLOOR 1'},{x:10,y:140,w:210,h:880,l:'ELECTRICAL RM'},{x:230,y:825,w:1240,h:195,l:'NAC 1 – FLOOR 1 CORRIDOR'}]};
}
function buildDCLB(){
  const terms=[T2('B+',140,'SLC OUT +','+'),T2('B-',170,'SLC OUT '+MINUS,'-'),T2('A+',360,'SLC RET +','+'),T2('A-',390,'SLC RET '+MINUS,'-')].concat(auxTerms(640),nacTerms('B',740));
  const items=[mkPanel(20,160,830,'Addressable • DCLC + DCLB + NAC 1',terms)];
  const z1={addressable:true,zone:'Z1'},z2={addressable:true,zone:'Z2',flip:true},b={addressable:true,group:'B1',zone:'S101'};
  items.push(
    mkDev('SD-11','SD','Smoke Detector',430,60,b),mkDev('SD-12','SD','Smoke Detector',650,60,b),mkDev('HD-11','HD','Heat Detector',870,60,b),
    mkIso('ISO-1',250,260),mkDev('PS-1','PS','Manual Pull Station',430,260,z1),mkDev('SD-1','SD','Smoke Detector',610,260,z1),
    mkIso('ISO-2',790,260),mkTB('TB-1',970,260),mkIso('ISO-3',1150,260),
    mkMM('MM-1','Waterflow Monitor Mod.',1150,480,z2,{eol:'MEOL1',sw:'FS-1',bt:'BT-1'}),mkDev('SD-2','SD','Smoke Detector',970,480,z2),
    mkDev('HD-2','HD','Heat Detector',790,480,z2),mkRM('RM-1',610,480,z2),mkIso('ISO-4',250,480,true),
    mkDH('DH-1',740,640),
    mkDev('FS-1','FS','Waterflow Alarm Switch',900,650,{group:'mon',zone:'Z2',monOf:'MM-1',w:126}),mkBT('BT-1',1080,662,'MM-1','Z2'),mkEOL('MEOL1',1220,661,'MM-1 EOL Resistor','B'));
  addNAC(items,430,860,'B');
  return{key:'dclb',kind:'addr',cls:'A',nacCls:'B',taps:true,items,vw:1480,vh:1030,zoneNames:{Z1:'Zone 1 (West Corridor)',Z2:'Zone 2 (East Corridor)',S101:'Suite 101',TAP:'the T-tap junction (TB-1)'},interZone:2,
    points:[{a:1,k:'PS',tag:'PS-1',loc:'Zone 1 – West Corridor'},{a:2,k:'SD',tag:'SD-1',loc:'Zone 1 – West Corridor'},
            {a:21,k:'HD',tag:'HD-2',loc:'Zone 2 – East Corridor'},{a:22,k:'MM',tag:'MM-1',loc:'Zone 2 – Sprinkler Waterflow (FS-1)'},{a:23,k:'SD',tag:'SD-2',loc:'Zone 2 – East Corridor'},{a:24,k:'RM',tag:'RM-1',loc:'Zone 2 – Door Holder Release (DH-1)'},
            {a:41,k:'SD',tag:'SD-11',loc:'Suite 101 (DCLB)'},{a:42,k:'SD',tag:'SD-12',loc:'Suite 101 (DCLB)'},{a:43,k:'HD',tag:'HD-11',loc:'Suite 101 (DCLB)'}],
    rooms:[{x:230,y:20,w:1240,h:165,l:'SUITE 101 – DCLB BRANCH'},{x:230,y:200,w:1240,h:170,l:'ZONE 1 – WEST CORRIDOR'},{x:230,y:385,w:1240,h:425,l:'ZONE 2 – EAST CORRIDOR'},
           {x:10,y:140,w:210,h:880,l:'ELECTRICAL RM'},{x:230,y:825,w:1240,h:195,l:'NAC 1 – CORRIDOR'}]};
}
const GROUPNAME={B1:'Suite 101'};
function cur(){return getSim(state.tab)}
function getSim(k){if(!state.sims[k]){let s;
  if(k==='cb')s=buildConv('B');else if(k==='ca')s=buildConv('A');else if(k==='dclc')s=buildDCLC();else s=buildDCLB();
  s.map={};s.items.forEach(i=>s.map[i.id]=i);s.wires=[];s.seq=0;s.undo=[];s.addr={};s.shorts=new Set();s.active=new Set();s.coverOff=new Set();
  s.events=[];s.log=[];s.nacOn=false;s.silenced=false;s.zoneAlarm=new Set();s.zoneInit={};s.alarmZones=new Set();s.results=null;s.lastRelay=false;s.powerOff=false;s.probes={red:{},black:{}};
  state.sims[k]=s}return state.sims[k]}

/* ---------------- Orthogonal wire router (A* on a grid, avoids devices, prefers few bends) ---------------- */
const GRID=12,MARG=8,LBL=14,BEND=28;
const NV={l:[-1,0],r:[1,0],t:[0,-1],b:[0,1]};
function inflate(it){const btmText=it.type!=='panel'?LBL:0;return[it.x-MARG,it.y-MARG-(it.btm?14:0),it.x+it.w+MARG,it.y+it.h+MARG+btmText]}
function stubLen(side){return side==='b'?MARG+LBL+12:20}
function termInfo(sim,tid){const{it,t}=T(sim,tid);const x=it.x+t.dx,y=it.y+t.dy;const n=NV[t.side];const L=stubLen(t.side);return{x,y,sx:x+n[0]*L,sy:y+n[1]*L,n,pol:t.pol}}
function grid(sim){if(sim.G)return sim.G;
  const xs=new Set(),ys=new Set();for(let x=0;x<=sim.vw;x+=GRID)xs.add(x);for(let y=0;y<=sim.vh;y+=GRID)ys.add(y);
  const stubs=[];sim.items.forEach(it=>it.terms.forEach(t=>{const ti=termInfo(sim,it.id+'.'+t.id);xs.add(ti.sx);ys.add(ti.sy);stubs.push([it.id+'.'+t.id,ti.sx,ti.sy])}));
  const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b);const NX=X.length,NY=Y.length;
  const xi=new Map(X.map((v,i)=>[v,i])),yi=new Map(Y.map((v,i)=>[v,i]));
  const blocked=new Uint8Array(NX*NY);const rects=sim.items.map(inflate).concat(sim.blocks||[]).concat(sim.rooms.map(r=>[r.x+2,r.y+r.h-22,r.x+14+r.l.length*7.6,r.y+r.h+2]));
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const x=X[i],y=Y[j];for(const r of rects){if(x>r[0]&&x<r[2]&&y>r[1]&&y<r[3]){blocked[i+j*NX]=1;break}}}
  const stubNode={};stubs.forEach(([tid,x,y])=>{const k=xi.get(x)+yi.get(y)*NX;stubNode[tid]=k;if(!blocked[k])blocked[k]=2});
  sim.G={X,Y,NX,NY,xi,yi,blocked,stubNode};return sim.G}
function occupancy(sim,G,skip){const E=new Set(),N=new Set();
  sim.wires.forEach(w=>{if(w===skip||!w.path)return;const p=w.path;
    for(let k=1;k<p.length-2;k++){const a=p[k],b=p[k+1];let i0=G.xi.get(a.x),j0=G.yi.get(a.y),i1=G.xi.get(b.x),j1=G.yi.get(b.y);
      if(i0===undefined||j0===undefined||i1===undefined||j1===undefined)continue;
      const di=Math.sign(i1-i0),dj=Math.sign(j1-j0);let i=i0,j=j0;N.add(i+j*G.NX);
      while(i!==i1||j!==j1){const a1=i+j*G.NX;i+=di;j+=dj;const b1=i+j*G.NX;N.add(b1);E.add(a1<b1?a1*1e6+b1:b1*1e6+a1)}}});
  return{E,N}}
function heapPush(h,f,v){h.push([f,v]);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p][0]<=h[i][0])break;[h[p],h[i]]=[h[i],h[p]];i=p}}
function heapPop(h){const top=h[0],last=h.pop();if(h.length){h[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<h.length&&h[l][0]<h[m][0])m=l;if(r<h.length&&h[r][0]<h[m][0])m=r;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m}}return top}
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const dirOf=n=>n[0]===1?0:n[0]===-1?1:n[1]===1?2:3;
function simplify(pts){const o=[];pts.forEach(p=>{const l=o[o.length-1];if(l&&l.x===p.x&&l.y===p.y)return;o.push({x:p.x,y:p.y})});
  for(let k=o.length-2;k>0;k--){const a=o[k-1],b=o[k],c=o[k+1];if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))o.splice(k,1)}return o}
function route(sim,wire){
  const G=grid(sim);const A=termInfo(sim,wire.a),B=termInfo(sim,wire.b);
  const s=G.stubNode[wire.a],g=G.stubNode[wire.b];const{E,N}=occupancy(sim,G,wire);
  const NX=G.NX,X=G.X,Y=G.Y;const tot=NX*G.NY*4;const gs=new Float64Array(tot).fill(Infinity);const prev=new Int32Array(tot).fill(-1);
  const gx=g%NX,gy=(g/NX)|0;const H=k=>Math.abs(X[k%NX]-X[gx])+Math.abs(Y[(k/NX)|0]-Y[gy]);
  const sd=dirOf(A.n),endDir=dirOf([-B.n[0],-B.n[1]]);const st=s*4+sd;gs[st]=0;const h=[];heapPush(h,H(s),st);let found=-1;
  while(h.length){const[f,cs]=heapPop(h);const node=cs>>2,d=cs&3;const cg=gs[cs];if(f-H(node)>cg+1e-6)continue;
    if(node===g){found=cs;break}
    const i=node%NX,j=(node/NX)|0;
    for(let nd=0;nd<4;nd++){if((d^1)===nd&&d>>1===nd>>1)continue;const ni=i+DIRS[nd][0],nj=j+DIRS[nd][1];if(ni<0||nj<0||ni>=NX||nj>=G.NY)continue;
      const nn=ni+nj*NX;const bl=G.blocked[nn];if(bl===1||(bl===2&&nn!==g))continue;
      const len=Math.abs(X[ni]-X[i])+Math.abs(Y[nj]-Y[j]);const ek=node<nn?node*1e6+nn:nn*1e6+node;
      let c=len+(nd!==d?BEND:0)+(E.has(ek)?len*6+20:0)+(N.has(nn)?4:0);if(nn===g&&nd!==endDir)c+=BEND;
      const ns=nn*4+nd;const ng=cg+c;if(ng<gs[ns]){gs[ns]=ng;prev[ns]=cs;heapPush(h,ng+H(nn),ns)}}}
  let mid;
  if(found<0)mid=[{x:A.sx,y:A.sy},{x:A.sx,y:B.sy},{x:B.sx,y:B.sy}];
  else{mid=[];let c=found;while(c>=0){const nd=c>>2;mid.push({x:X[nd%NX],y:Y[(nd/NX)|0]});c=prev[c]}mid.reverse()}
  return simplify([{x:A.x,y:A.y},{x:A.sx,y:A.sy},...mid,{x:B.sx,y:B.sy},{x:B.x,y:B.y}]);
}
function rerouteAll(sim){sim.wires.forEach(w=>w.path=null);sim.wires.forEach(w=>{w.path=route(sim,w)})}
const HR=5;
function wireGeom(sim){
  const segs=sim.wires.map(w=>{const p=w.path||[];const s=[];for(let k=0;k<p.length-1;k++)s.push([p[k],p[k+1]]);return s});
  return sim.wires.map((w,i)=>{const p=w.path;if(!p||!p.length)return{d:'',mid:{x:0,y:0}};let d=`M${p[0].x},${p[0].y}`;let best=null,bl=-1;
    segs[i].forEach(([a,b])=>{const L=Math.abs(b.x-a.x)+Math.abs(b.y-a.y);if(L>bl){bl=L;best={x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
      if(a.y===b.y&&a.x!==b.x){const dir=Math.sign(b.x-a.x),lo=Math.min(a.x,b.x),hi=Math.max(a.x,b.x);const xs=[];
        segs.forEach((S,j)=>{if(j===i)return;S.forEach(([c,e])=>{if(c.x!==e.x||c.y===e.y)return;const vlo=Math.min(c.y,e.y),vhi=Math.max(c.y,e.y);
          if(c.x>lo+HR+1&&c.x<hi-HR-1&&a.y>vlo+0.5&&a.y<vhi-0.5)xs.push(c.x)})});
        xs.sort((u,v)=>(u-v)*dir);let last=null;
        xs.forEach(x=>{if(last!==null&&Math.abs(x-last)<2*HR+2)return;d+=` L${x-dir*HR},${a.y} A${HR},${HR} 0 0 ${dir>0?1:0} ${x+dir*HR},${a.y}`;last=x});
      }
      d+=` L${b.x},${b.y}`});
    return{d,mid:best||p[0]}})}

/* ---------------- Graph helpers ---------------- */
const PASS_TYPES=['dev','iso','tb'];
function T(sim,tid){const i=tid.indexOf('.');const it=sim.map[tid.slice(0,i)];return{it,t:it.terms.find(x=>x.id===tid.slice(i+1))}}
function tn(sim,tid){const{it,t}=T(sim,tid);return it.type==='panel'?'FACP '+t.name:it.id+' '+t.name}
function wireAt(sim,tid){return sim.wires.find(w=>w.a===tid||w.b===tid)}
function partner(sim,tid){const{it,t}=T(sim,tid);
  if(it.type==='ser')return it.id+'.'+(t.id==='s1'?'s2':'s1');
  if(!PASS_TYPES.includes(it.type))return null;
  const m={'in+':'out+','out+':'in+','in-':'out-','out-':'in-'};return m[t.id]?it.id+'.'+m[t.id]:null}
function walk(sim,start){
  const seq=[],wires=[];let cur=start;const seen=new Set([start]);
  for(let g=0;g<200;g++){
    const w=wireAt(sim,cur);if(!w)return{seq,wires,end:{type:'open',tid:cur}};
    wires.push(w.id);const nx=w.a===cur?w.b:w.a;
    if(seen.has(nx))return{seq,wires,end:{type:'cycle',tid:nx}};seen.add(nx);
    const{it,t}=T(sim,nx);
    if(it.type==='panel'||it.type==='eol')return{seq,wires,end:{type:it.type,tid:nx}};
    if(t.role==='tap'||t.role==='mon'||t.role==='rly')return{seq,wires,end:{type:t.role,tid:nx}};
    if(it.type==='dh')return{seq,wires,end:{type:'dh',tid:nx}};
    seq.push({item:it.id,via:nx});
    const p=partner(sim,nx);if(!p)return{seq,wires,end:{type:'cycle'}};seen.add(p);
    if(!wireAt(sim,p))return{seq,wires,end:{type:'device',item:it.id,tid:p}};
    cur=p;
  }
  return{seq,wires,end:{type:'cycle'}};
}
const OK=m=>({k:'ok',m}),F=m=>({k:'fail',m}),INFO=m=>({k:'info',m});
function polarityCheck(sim,R){
  const bad=[];sim.wires.forEach(w=>{const a=T(sim,w.a).t,b=T(sim,w.b).t;if(a.pol!=='*'&&b.pol!=='*'&&a.pol!==b.pol)bad.push(`${tn(sim,w.a)} ↔ ${tn(sim,w.b)}`)});
  if(bad.length)R.push(F('Reversed polarity — + must land on + and '+MINUS+' on '+MINUS+' (polarized devices will not operate and circuits will not supervise correctly). Check: '+bad.join('; ')));
  else if(sim.wires.length)R.push(OK('Polarity maintained on every conductor (+ to +, '+MINUS+' to '+MINUS+').'));
}
function strayCheck(sim,used,R){const s=sim.wires.filter(w=>!used.has(w.id));
  if(s.length)R.push(F(`${s.length} conductor(s) are not part of a supervised path (stray wire or T-tap): `+s.map(w=>`${tn(sim,w.a)} → ${tn(sim,w.b)}`).join('; ')))}

/* ---------------- Generic circuit check (IDC / NAC) ---------------- */
function foreignWhy(sim,c,id){const it=sim.map[id];
  if(it.group==='nac')return'notification appliance – belongs on NAC 1';
  if(it.group==='mon')return`sprinkler switch – belongs on ${it.monOf}'s IDC`;
  if(it.group==='spr')return`sprinkler device – belongs on ${sim.zoneNames[it.zone]}`;
  if(it.group==='dh')return'door holder – powered through the relay module contacts';
  if(c.zone&&it.zone&&it.zone!==c.zone)return`${sim.zoneNames[it.zone]} device – each fire zone requires its own initiating zone circuit`;
  if(c.name.startsWith('NAC'))return'initiating device – does not belong on a NAC';
  if(c.name.includes('IDC')&&it.group==='loop')return'addressable device – belongs on the DCLC loop';
  if(/^B\d/.test(it.group))return'belongs on the DCLB branch';
  if(it.group==='loop')return'belongs on the DCLC loop';
  return'not part of this circuit'}
function checkLoop(sim,c,R,used){
  let complete=0;const seqs={};const eolName=sim.map[c.eol].desc;
  for(const p of['+','-']){
    const P=ps(p);const st=`P.${c.src}${p}`;const wk=walk(sim,st);wk.wires.forEach(x=>used.add(x));
    const ids=wk.seq.map(s=>s.item);seqs[p]=ids;const e=wk.end;
    if(!wk.wires.length){R.push(F(`${c.name}: nothing is connected to terminal ${tn(sim,st)}.`));continue}
    const foreign=ids.filter(id=>!c.members.includes(id));
    if(foreign.length){R.push(F(`${c.name} ${P}: ${foreign.map(id=>`${id} (${foreignWhy(sim,c,id)})`).join('; ')}.`));continue}
    const miss=c.members.filter(d=>!ids.includes(d));const route=`FACP → ${ids.join(' → ')}`;
    if(c.cls==='B'){
      if(e.type==='eol'&&e.tid.startsWith(c.eol+'.')){if(miss.length)R.push(F(`${c.name} ${P} reaches the EOL but bypasses ${miss.join(', ')}. Loop IN and OUT of every device so the EOL is beyond the last device.`));else{R.push(OK(`${c.name} ${P}: ${route} → ${eolName}`));complete++}}
      else if(e.type==='eol')R.push(F(`${c.name} ${P} is terminated on the wrong resistor (${sim.map[e.tid.split('.')[0]].desc}). Use the ${eolName}.`));
      else if(e.type==='device')R.push(F(`${c.name} ${P} ends at ${e.item} (${tn(sim,e.tid)} is empty). A Class B circuit continues to the EOL resistor after the last device.`));
      else if(e.type==='panel')R.push(F(`${c.name} ${P} lands on the panel (${tn(sim,e.tid)}). Class B is not returned to the panel — terminate at the ${eolName} after the last device.`));
      else R.push(F(`${c.name} ${P} path is not continuous.`));
    }else{
      const ret=`P.${c.ret}${p}`;
      if(e.type==='panel'&&e.tid===ret){if(miss.length)R.push(F(`${c.name} ${P} returns to the panel but bypasses ${miss.join(', ')}.`));else{R.push(OK(`${c.name} ${P}: ${route} → ${tn(sim,ret)}`));complete++}}
      else if(e.type==='panel')R.push(F(`${c.name} ${P} returns to the wrong panel terminal (${tn(sim,e.tid)}). It must return on ${tn(sim,ret)}.`));
      else if(e.type==='eol')R.push(F(`${c.name} ${P} is terminated on an EOL resistor. Class A circuits return to the panel — no field EOL is used.`));
      else if(e.type==='device')R.push(F(`${c.name} ${P} ends at ${e.item}. On Class A continue from the last device back to ${tn(sim,ret)}.`));
      else R.push(F(`${c.name} ${P} path is not continuous.`));
    }
  }
  if(c.cls==='A'&&sim.wires.some(w=>w.a.startsWith(c.eol+'.')||w.b.startsWith(c.eol+'.')))R.push(F(`${c.name}: the ${eolName} is connected. Remove it — Class A supervision is done by returning the conductors to the panel.`));
  if(complete===2&&seqs['+'].join()!==seqs['-'].join())R.push(INFO(`${c.name}: the + and ${MINUS} conductors visit the devices in a different order — both conductors should follow the same route.`));
  return complete===2;
}
const NACDEF=sim=>({name:'NAC 1',cls:sim.nacCls,src:'N',ret:'NR',eol:'NEOL',members:['HS-1','H-1']});

/* ---------------- Switch + box tamper circuits (sprinkler zones & monitor module IDCs) ---------------- */
function checkSw(sim,c,R,used){
  const sw=c.sw,bt=c.bt,name=c.name,eolName=sim.map[c.eol].desc;const legs={};let ok=true;
  for(const p of['+','-']){const P=ps(p);const st=c.start[p];const wk=walk(sim,st);wk.wires.forEach(x=>used.add(x));
    const ids=wk.seq.map(s=>s.item);const e=wk.end;
    if(!wk.wires.length){R.push(F(`${name}: nothing is connected to ${tn(sim,st)}.`));ok=false;continue}
    legs[p]=ids;
    const foreign=ids.filter(id=>id!==sw&&id!==bt);
    if(foreign.length){R.push(F(`${name} ${P}: ${foreign.map(id=>`${id} (${foreignWhy(sim,{name},id)})`).join('; ')}.`));ok=false;continue}
    if(!ids.includes(sw)){R.push(F(`${name} ${P} bypasses ${sw}. The switch must be wired IN and OUT on both conductors.`));ok=false}
    if(c.cls==='B'){
      if(e.type==='eol'&&e.tid.startsWith(c.eol+'.'))continue;ok=false;
      if(e.type==='eol')R.push(F(`${name} ${P} terminates on the wrong resistor (${sim.map[e.tid.split('.')[0]].desc}). Use the ${eolName}.`));
      else if(e.type==='device')R.push(F(`${name} ${P} ends at ${e.item} (${tn(sim,e.tid)} is empty). Continue to the ${eolName}.`));
      else if(e.type==='panel')R.push(F(`${name} ${P} lands on the panel (${tn(sim,e.tid)}). This Class B circuit is terminated on its EOL resistor in the field.`));
      else R.push(F(`${name} ${P} path is not continuous.`));
    }else{
      if(e.type==='panel'&&e.tid===c.ret[p])continue;ok=false;
      if(e.type==='panel')R.push(F(`${name} ${P} returns to the wrong panel terminal (${tn(sim,e.tid)}). It must return on ${tn(sim,c.ret[p])}.`));
      else if(e.type==='eol')R.push(F(`${name} ${P} is terminated on an EOL resistor. Class A circuits return to the panel — no field EOL is used.`));
      else if(e.type==='device')R.push(F(`${name} ${P} ends at ${e.item}. On Class A continue back to ${tn(sim,c.ret[p])}.`));
      else R.push(F(`${name} ${P} path is not continuous.`));
    }
  }
  if(!legs['+']||!legs['-'])return false;
  const ser=c.cls==='B'?'in series with the EOL resistor':'in series in the circuit';
  const btLeg=legs['+'].includes(bt)?'+':legs['-'].includes(bt)?'-':null;
  if(!btLeg){R.push(F(`${bt} (box tamper on ${sw}) is not wired. It must be ${ser} – after the switch – so removing the cover opens the circuit and causes a trouble.`));ok=false}
  else{const L=legs[btLeg];if(L.indexOf(bt)<L.indexOf(sw)){R.push(F(`${bt} is wired ahead of ${sw}. The box tamper goes after the switch, ${ser}, so the switch stays connected.`));ok=false}}
  if(c.cls==='A'&&sim.wires.some(w=>w.a.startsWith(c.eol+'.')||w.b.startsWith(c.eol+'.'))){R.push(F(`${name}: the ${eolName} is connected. Remove it — Class A supervision is done by returning the conductors to the panel.`));ok=false}
  if(ok)R.push(OK(`${name}: ${c.startLbl} → ${sw} → ${bt} (series in the ${ps(btLeg)} conductor) → ${c.cls==='B'?eolName:'return to panel'}. Removing the cover opens the circuit and causes a trouble.`));
  return ok}
function checkMon(sim,mm,R,used){const M=mm.mon;
  return checkSw(sim,{name:`${mm.id} IDC`,cls:'B',start:{'+':mm.id+'.m+','-':mm.id+'.m-'},eol:M.eol,sw:M.sw,bt:M.bt,startLbl:mm.id},R,used)}
function checkConv(sim){
  const R=[];if(!sim.wires.length)return[F('No conductors have been installed yet.')];
  polarityCheck(sim,R);const used=new Set();let ok=true;
  sim.zones.forEach(z=>{const r=z.sw
    ?checkSw(sim,{name:`Zone ${z.n} IDC (${z.label})`,cls:sim.cls,start:{'+':`P.${z.n}B+`,'-':`P.${z.n}B-`},ret:{'+':`P.${z.n}A+`,'-':`P.${z.n}A-`},eol:`EOL${z.n}`,sw:z.sw,bt:z.bt,startLbl:'FACP'},R,used)
    :checkLoop(sim,{name:`Zone ${z.n} IDC`,zone:z.z,cls:sim.cls,src:`${z.n}B`,ret:`${z.n}A`,eol:`EOL${z.n}`,members:z.members},R,used);if(!r)ok=false});
  if(!checkLoop(sim,NACDEF(sim),R,used))ok=false;
  strayCheck(sim,used,R);
  if(ok)R.push(OK('Each fire zone has its own initiating zone circuit, and the waterflow and valve tamper are on their own zones.'));
  if(sim.cls==='A'&&ok)R.push(INFO('Field note: Class A outgoing and return conductors must be physically separated — confirm the routing/separation requirements in CAN/ULC-S524 and the manufacturer’s instructions.'));
  return R;
}

/* ---------------- Relay module / door holder circuit ---------------- */
function dhState(sim,relayOn,live){
  if(!sim.map['DH-1'])return'none';
  const A=new Map();const add=(a,b)=>{if(!A.has(a))A.set(a,[]);A.get(a).push(b)};
  sim.wires.forEach(w=>{if(live&&w.open)return;add(w.a,w.b);add(w.b,w.a)});
  const c='RM-1.COM',o=relayOn?'RM-1.NO':'RM-1.NC';add(c,o);add(o,c);
  const none=new Set();const Rp=bfs(A,['P.X+'],none),Rn=bfs(A,['P.X-'],none);
  if(Rp.has('P.X-'))return'short';
  if(Rp.has('DH-1.d+')&&Rn.has('DH-1.d-'))return'on';
  if(Rp.has('DH-1.d-')&&Rn.has('DH-1.d+'))return'rev';
  return'off'}
function checkDH(sim,R,used){
  const rx=/^(P\.X|RM-1\.(COM|NC|NO)|DH-1\.)/;const dw=sim.wires.filter(w=>rx.test(w.a)||rx.test(w.b));dw.forEach(w=>used.add(w.id));
  if(!dw.length){R.push(F('Door holder circuit not wired: run AUX 24VDC through the RM-1 relay contacts to DH-1.'));return false}
  const n=dhState(sim,false,false),a=dhState(sim,true,false);
  if(n==='short'||a==='short'){R.push(F('Door holder circuit: AUX 24VDC + and '+MINUS+' are connected together (short circuit). Only one relay contact should be in the + leg feeding DH-1.'));return false}
  if(n==='rev'||a==='rev'){R.push(F('Door holder circuit: polarity reversed at DH-1 – AUX + must reach DH-1 + and DH-1 '+MINUS+' must return to AUX '+MINUS+'.'));return false}
  if(n==='on'&&a==='off'){R.push(OK('Door holder circuit: AUX 24VDC + → RM-1 COM → NC → DH-1 → AUX '+MINUS+'. DH-1 is energized (door held open) in normal and released when RM-1 operates on alarm – fail-safe.'));return true}
  if(n==='off'&&a==='on')R.push(F('Door holder is wired through the relay NO contact: DH-1 would be de-energized (door closed) in normal and energize on alarm. Door holders are fail-safe – use COM and NC so the door releases on alarm or loss of power.'));
  else if(n==='on'&&a==='on')R.push(F('Door holder circuit: DH-1 stays energized during an alarm – the relay contact is bypassed. Route the 24VDC through RM-1 COM and NC.'));
  else R.push(F('Door holder circuit incomplete: DH-1 is not energized in the normal condition. Wire AUX 24VDC + → RM-1 COM, RM-1 NC → DH-1 +, DH-1 '+MINUS+' → AUX 24VDC '+MINUS+'.'));
  return false}

/* ---------------- Isolator placement check ---------------- */
function isoCheck(sim,seq,R){
  const ZN=sim.zoneNames,toks=seq.map(id=>sim.map[id]);const isIso=it=>it.type==='iso';
  const zn=z=>ZN[z]||z;let bad=false;
  if(!toks.length)return;
  if(!isIso(toks[0])){bad=true;R.push(F(`No isolator at the panel on the SLC OUT side (first module is ${toks[0].id}). Each zone needs an isolator at its start.`))}
  if(!isIso(toks[toks.length-1])){bad=true;R.push(F(`No isolator at the panel on the SLC RET side (last module is ${toks[toks.length-1].id}). Each zone needs an isolator at its end.`))}
  const segs=[[]];toks.forEach(it=>{if(isIso(it))segs.push([]);else segs[segs.length-1].push(it)});
  const zoneSegs={};const order=[];let gap=0;const gaps=[];
  segs.forEach((sg,i)=>{
    if(!sg.length){if(i>0)gap++;return}
    const zs=[...new Set(sg.map(it=>it.zone))];
    if(zs.length>1){bad=true;
      if(zs.includes('TAP'))R.push(F(`The T-tap junction (TB-1) shares an isolated segment with ${sg.filter(i=>i.zone!=='TAP').map(i=>i.id).join(', ')}. Install an isolator on EACH side of the T-tap so a fault on the DCLB branch is confined to the tap segment.`));
      else R.push(F(`Isolated segment {${sg.map(i=>i.id).join(', ')}} contains devices from ${zs.map(zn).join(' and ')}. Each zone must start and end with an isolator.`))}
    zs.forEach(z=>{zoneSegs[z]=(zoneSegs[z]||0)+1});
    if(order.length)gaps.push({a:order[order.length-1],b:zs.join('/'),n:gap+1});
    order.push(zs.join('/'));gap=0;
  });
  Object.entries(zoneSegs).forEach(([z,n])=>{if(n>1){bad=true;R.push(F(`${zn(z)} is split across ${n} isolated segments. Keep each zone's devices together between its start and end isolators.`))}});
  if(!bad){
    gaps.forEach(g=>{const tapGap=g.a==='TAP'||g.b==='TAP';
      if(!tapGap&&g.n<sim.interZone){bad=true;R.push(F(`Only ${g.n} isolator between ${zn(g.a)} and ${zn(g.b)}. Two isolators are required between zones — one at the END of ${zn(g.a)} and one at the START of ${zn(g.b)}.`))}});
    if(sim.taps){const ti=order.indexOf('TAP');
      if(ti<0){bad=true;R.push(F('The T-tap junction is not on the DCLC loop.'))}
      else if(ti===0||ti===order.length-1){bad=true;R.push(F('The T-tap is not located between the two zones. Place TB-1 between Zone 1 and Zone 2 so an isolator sits on each side of the tap.'))}}
  }
  if(!bad){const isos=toks.filter(isIso);const sig=[];segs.forEach((sg,i)=>{if(i>0)sig.push(isos[i-1].id);if(sg.length)sig.push('['+[...new Set(sg.map(it=>it.zone==='TAP'?'T-TAP':zn(it.zone)))].join('')+']')});
    R.push(OK(`Fault isolation correct (${isos.length} isolators): FACP → ${sig.join(' → ')} → FACP. Each zone has an isolator at its start and end${sim.taps?', and the T-tap has an isolator on each side':''}.`))}
}

/* ---------------- Addressable check ---------------- */
function checkAddr(sim){
  const R=[];if(!sim.wires.length)return[F('No conductors have been installed yet.')];
  polarityCheck(sim,R);
  const loopItems=sim.items.filter(i=>i.group==='loop'&&i.type!=='panel');
  const branchDevs=sim.items.filter(i=>i.group&&/^B\d/.test(i.group));
  const used=new Set(),seqs={};let complete=0;
  for(const p of['+','-']){
    const P=ps(p);const wk=walk(sim,'P.B'+p);wk.wires.forEach(x=>used.add(x));seqs[p]=wk.seq.map(s=>s.item);
    const e=wk.end;const miss=loopItems.filter(d=>!seqs[p].includes(d.id)).map(d=>d.id);
    if(!wk.wires.length){R.push(F(`Nothing is connected to SLC OUT ${P}.`));continue}
    const intr=seqs[p].filter(id=>branchDevs.some(b=>b.id===id));
    if(intr.length)R.push(F(`${intr.join(', ')} ${intr.length>1?'are':'is'} wired into the DCLC loop. Suite devices belong on the DCLB branch from the T-tap junction.`));
    const nacIn=seqs[p].filter(id=>sim.map[id].group==='nac');if(nacIn.length){R.push(F(`${nacIn.join(', ')} wired into the DCLC. Notification appliances belong on NAC 1.`));continue}
    const monIn=seqs[p].filter(id=>sim.map[id].group==='mon');if(monIn.length){R.push(F(`${monIn.join(', ')} wired into the DCLC. Conventional sprinkler switches are not addressable — wire them to their monitor module's IDC terminals.`));continue}
    if(e.type==='eol'){R.push(F(`DCLC ${P} is terminated on an EOL resistor (${sim.map[e.tid.split('.')[0]].desc}). The DCLC is Class A and must return to SLC RET ${P}.`));continue}
    if(e.type==='panel'&&e.tid==='P.A'+p){if(miss.length)R.push(F(`DCLC ${P} returns to SLC RET ${P} but bypasses ${miss.join(', ')}.`));else if(!intr.length){R.push(OK(`DCLC ${P}: FACP → ${seqs[p].join(' → ')} → SLC RET ${P}`));complete++}}
    else if(e.type==='panel')R.push(F(`DCLC ${P} lands on the wrong panel terminal (${tn(sim,e.tid)}). It must return on SLC RET ${P}.`));
    else if(e.type==='device')R.push(F(`DCLC ${P} ends at ${e.item}. A DCLC is a Class A loop — continue from the last module back to SLC RET ${P}.`));
    else if(e.type==='tap')R.push(F(`DCLC ${P} runs into a TAP terminal (${tn(sim,e.tid)}). The TAP terminals feed the DCLB branch only.`));
    else if(e.type==='mon')R.push(F(`DCLC ${P} runs into a monitor module IDC terminal (${tn(sim,e.tid)}). The SLC passes through the module IN/OUT terminals; the IDC terminals are for the conventional switches.`));
    else if(e.type==='rly')R.push(F(`DCLC ${P} runs into a relay contact (${tn(sim,e.tid)}). The SLC passes through RM-1 IN/OUT; the COM/NC/NO contacts switch the door holder power.`));
    else if(e.type==='dh')R.push(F(`DCLC ${P} is connected to the door holder. DH-1 is powered from AUX 24VDC through the relay contacts, not from the SLC.`));
    else R.push(F(`DCLC ${P} path is not continuous.`));
  }
  if(state.settings.floorIso&&complete===2)isoCheck(sim,seqs['+'],R);
  if(sim.taps){
    const served={};
    sim.items.filter(i=>i.type==='tb').forEach(ti=>{
      const sets={};
      for(const p of['+','-']){const P=ps(p);const wk=walk(sim,`${ti.id}.t${p}`);wk.wires.forEach(x=>used.add(x));
        if(!wk.wires.length){R.push(F(`${ti.id} ${P}TAP has no DCLB branch connected.`));continue}
        const e=wk.end;const ids=wk.seq.map(s=>s.item);sets[p]=ids;
        if(e.type==='panel')R.push(F(`${ti.id} ${P}TAP branch runs back to the panel. A DCLB branch is Class B — it ends at the last device.`));
        else if(e.type==='eol')R.push(F(`${ti.id} ${P}TAP branch ends on an EOL. Addressable DCLB branches do not use an EOL resistor.`));
        const wrong=ids.filter(id=>!/^B\d/.test(sim.map[id].group));if(wrong.length)R.push(F(`${ti.id} DCLB branch includes ${wrong.join(', ')}, which do not belong on the branch.`));
      }
      const ids=sets['+']||[];const groups=new Set(ids.map(id=>sim.map[id].group).filter(g=>/^B/.test(g)));
      if(groups.size===1){const g=[...groups][0];const all=branchDevs.filter(b=>b.group===g).map(b=>b.id);const miss=all.filter(x=>!ids.includes(x));served[g]=ti.id;
        if(miss.length)R.push(F(`${ti.id} DCLB to ${GROUPNAME[g]} misses ${miss.join(', ')}.`));
        else if(sets['-']&&sets['-'].slice().sort().join()===ids.slice().sort().join())R.push(OK(`DCLB from ${ti.id} → ${ids.join(' → ')} (${GROUPNAME[g]}, Class B, ends at last device).`));
        else R.push(F(`${ti.id} branch: the ${MINUS} conductor does not serve the same devices as the + conductor.`));}
    });
    [...new Set(branchDevs.map(b=>b.group))].forEach(g=>{if(!served[g])R.push(F(`${GROUPNAME[g]} devices are not served by the DCLB tap.`))});
  }
  sim.items.filter(i=>i.mon).forEach(mm=>checkMon(sim,mm,R,used));
  checkDH(sim,R,used);
  checkLoop(sim,NACDEF(sim),R,used);
  const wrong=[];sim.items.filter(i=>i.addressable).forEach(i=>{const pt=sim.points.find(q=>q.tag===i.id);const a=sim.addr[i.id];if(pt&&a!==pt.a)wrong.push(`${i.id} ${a?'is set to '+pad3(a):'is not addressed (000)'} – programmed at ${pad3(pt.a)}`)});
  if(wrong.length)R.push(F('Device addresses do not match the panel Device Address List: '+wrong.join('; ')+'.'));
  else R.push(OK('Every device and module is set to its programmed address from the Device Address List.'));
  strayCheck(sim,used,R);
  if(complete===2&&seqs['+'].join()!==seqs['-'].join())R.push(INFO('The + and '+MINUS+' loop conductors visit modules in a different order — both conductors should follow the same route.'));
  if(complete===2)R.push(INFO('Field note: DCLC outgoing and return pathways require physical separation per CAN/ULC-S524 — confirm the current edition’s requirements.'));
  return R;
}

/* ---------------- Test-mode electrical model ---------------- */
function segmentOf(sim,id){const set=new Set([id]),q=[id];
  while(q.length){const d=q.shift();const it=sim.map[d];
    for(const t of it.terms){if(t.role)continue;const tid=d+'.'+t.id;const w=wireAt(sim,tid);if(!w||w.open)continue;const o=w.a===tid?w.b:w.a;const oi=sim.map[o.split('.')[0]];
      if((oi.type==='dev'||oi.type==='tb')&&!set.has(oi.id)){set.add(oi.id);q.push(oi.id)}}}
  return set}
function tripped(sim,seg){const s=new Set();seg.forEach(id=>{const it=sim.map[id];it.terms.forEach(t=>{if(t.role)return;const w=wireAt(sim,id+'.'+t.id);if(!w||w.open)return;const o=(w.a===id+'.'+t.id?w.b:w.a).split('.')[0];if(sim.map[o].type==='iso')s.add(o)})});return s}
function adjacency(sim,lost){const A=new Map();const add=(a,b)=>{if(!A.has(a))A.set(a,[]);A.get(a).push(b)};
  sim.wires.forEach(w=>{if(w.open)return;add(w.a,w.b);add(w.b,w.a)});
  sim.items.forEach(it=>{if(lost.has(it.id))return;
    if(it.type==='ser'){if(!sim.coverOff.has(it.id)){add(it.id+'.s1',it.id+'.s2');add(it.id+'.s2',it.id+'.s1')}return}
    if(!PASS_TYPES.includes(it.type))return;
    for(const p of['+','-']){add(`${it.id}.in${p}`,`${it.id}.out${p}`);add(`${it.id}.out${p}`,`${it.id}.in${p}`);
      if(it.type==='tb'){add(`${it.id}.in${p}`,`${it.id}.t${p}`);add(`${it.id}.t${p}`,`${it.id}.in${p}`)}}});
  return A}
function bfs(A,starts,lost){const seen=new Set(starts),q=[...starts];
  while(q.length){const c=q.shift();for(const n of(A.get(c)||[])){if(seen.has(n)||lost.has(n.split('.')[0]))continue;seen.add(n);q.push(n)}}return seen}
const KN={PS:'PULL STATION',SD:'SMOKE DET',HD:'HEAT DET',MM:'MONITOR MOD',RM:'RELAY MOD'};
function reach(sim,A,lost,pos,neg){const Rp=bfs(A,pos,lost),Rn=bfs(A,neg,lost);
  return{Rp,Rn,comm:id=>{if(lost.has(id))return false;const it=sim.map[id];return it.terms.some(t=>t.pol==='+'&&!t.role&&Rp.has(id+'.'+t.id))&&it.terms.some(t=>t.pol==='-'&&!t.role&&Rn.has(id+'.'+t.id))}}}
const eolOK=(X,e)=>(X.Rp.has(e+'.r1')&&X.Rn.has(e+'.r2'))||(X.Rp.has(e+'.r2')&&X.Rn.has(e+'.r1'));
function circTroubles(sim,A,lost,X,name,cls,src,ret,eol,out){
  if(!wireAt(sim,`P.${src}+`)&&!wireAt(sim,`P.${src}-`)){out.push(`${name} NOT WIRED`);return true}
  if([...X.Rp].some(x=>x.startsWith('P.')&&X.Rn.has(x))){out.push(`${name} SHORT CIRCUIT (+ and ${MINUS} connected)`);return true}
  if(cls==='B'){if(!eolOK(X,eol))out.push(`${name} OPEN CIRCUIT – EOL NOT DETECTED`)}
  else{const Bp=bfs(A,[`P.${src}+`],lost),Bn=bfs(A,[`P.${src}-`],lost);if(!Bp.has(`P.${ret}+`)||!Bn.has(`P.${ret}-`))out.push(`${name} CLASS A PATH OPEN – RUNNING FROM BOTH ENDS`)}
  return false}
function addrList(sim,comm){
  const tr=[],rows=[];const devs=sim.items.filter(i=>i.addressable&&comm(i.id));const by={},zero=[];
  devs.forEach(d=>{const a=sim.addr[d.id];if(!a)zero.push(d);else(by[a]=by[a]||[]).push(d)});
  if(zero.length)tr.push(`INVALID ADDRESS 000 – ${zero.length} DEVICE${zero.length>1?'S':''} NOT ADDRESSED`);
  sim.points.forEach(pt=>{const L=by[pt.a]||[];let st='NORMAL',c='ok';
    if(!L.length){st='MISSING';c='bad';tr.push(`MISSING DEVICE  ADDR ${pad3(pt.a)}  ${KN[pt.k]}  ${pt.tag}`)}
    else if(L.length>1){st='DUPLICATE';c='bad';tr.push(`DUPLICATE ADDRESS ${pad3(pt.a)}`)}
    else if(L[0].kind!==pt.k){st='TYPE MISMATCH';c='bad';tr.push(`TYPE MISMATCH  ADDR ${pad3(pt.a)}  PROG: ${KN[pt.k]}  FOUND: ${KN[L[0].kind]}`)}
    else if(L[0].id!==pt.tag){st='WRONG LOCATION';c='bad';tr.push(`LOCATION MISMATCH  ADDR ${pad3(pt.a)}  PROG: ${pt.tag}  INSTALLED: ${L[0].id}`)}
    rows.push({a:pad3(pt.a),type:KN[pt.k],loc:pt.tag+' – '+pt.loc,st,c})});
  Object.keys(by).map(Number).sort((x,y)=>x-y).forEach(a=>{if(sim.points.some(q=>q.a===a))return;const L=by[a];
    if(L.length>1)tr.push(`DUPLICATE ADDRESS ${pad3(a)}`);tr.push(`UNPROGRAMMED DEVICE  ADDR ${pad3(a)}  ${KN[L[0].kind]}`);
    rows.push({a:pad3(a),type:KN[L[0].kind],loc:'Not in panel program',st:'UNPROGRAMMED',c:'bad'})});
  zero.forEach(d=>rows.push({a:'000',type:KN[d.kind],loc:'Unaddressed device',st:'INVALID',c:'bad'}));
  return{troubles:tr,rows}}
function status(sim){
  const lost=new Set(),troubles=[],trips=new Set();
  if(sim.kind==='addr')sim.shorts.forEach(id=>{const sg=segmentOf(sim,id);sg.forEach(x=>lost.add(x));const tr=tripped(sim,sg);tr.forEach(x=>trips.add(x));
    troubles.push(`SHORT NEAR ${id} – ${tr.size?'ISOLATORS '+[...tr].join(', ')+' OPEN':'NO ISOLATOR – LOOP SHORTED'} – LOST: ${[...sg].filter(x=>sim.map[x].type==='dev').join(', ')}`)});
  const A=adjacency(sim,lost);const PT=sim.map.P.terms.map(t=>t.id);
  const mk=(pos,neg)=>reach(sim,A,lost,pos.filter(x=>PT.includes(x)).map(x=>'P.'+x),neg.filter(x=>PT.includes(x)).map(x=>'P.'+x));
  let commIdc;
  if(sim.kind==='conv'){const Z={};sim.zones.forEach(z=>{const X=mk([`${z.n}B+`,`${z.n}A+`],[`${z.n}B-`,`${z.n}A-`]);
      const before=troubles.length;circTroubles(sim,A,lost,X,`ZONE ${z.n}`,sim.cls,`${z.n}B`,`${z.n}A`,`EOL${z.n}`,troubles);
      if(z.bt&&sim.coverOff.has(z.bt)&&troubles.length>before)troubles[troubles.length-1]+=` (BOX COVER REMOVED – ${z.bt})`;
      z.members.concat(z.bt?[z.bt]:[]).forEach(m=>Z[m]=X)});
    commIdc=id=>Z[id]?Z[id].comm(id):false}
  else{const M=mk(['B+','A+'],['B-','A-']);circTroubles(sim,A,lost,M,'DCLC LOOP 1',sim.cls,'B','A','EOL',troubles);commIdc=id=>M.comm(id)}
  const N=mk(['N+','NR+'],['N-','NR-']);const nacDead=circTroubles(sim,A,lost,N,'NAC 1',sim.nacCls,'N','NR','NEOL',troubles);
  const monX={};
  sim.items.filter(i=>i.mon).forEach(mm=>{const X=reach(sim,A,lost,[mm.id+'.m+'],[mm.id+'.m-']);monX[mm.id]=X;
    if(!commIdc(mm.id))return;const a=sim.addr[mm.id];const lbl=`ADDR ${a?pad3(a):'000'}  ${mm.id}`;
    if(!wireAt(sim,mm.id+'.m+')&&!wireAt(sim,mm.id+'.m-'))troubles.push(`OPEN CIRCUIT  ${lbl} – MODULE IDC NOT WIRED`);
    else if([...X.Rp].some(x=>X.Rn.has(x)))troubles.push(`SHORT  ${lbl} – MODULE IDC`);
    else if(!eolOK(X,mm.mon.eol))troubles.push(`OPEN CIRCUIT  ${lbl} – IDC OPEN${sim.coverOff.has(mm.mon.bt)?' (BOX COVER REMOVED – '+mm.mon.bt+')':''}`)});
  const comm=id=>{const it=sim.map[id];if(it.group==='nac')return!nacDead&&N.comm(id);
    if(it.monOf)return commIdc(it.monOf)&&monX[it.monOf].comm(id);return commIdc(id)};
  let alist=null,relay=false,dh='none';
  if(sim.kind==='addr'){alist=addrList(sim,commIdc);troubles.push(...alist.troubles);
    if(sim.map['RM-1']){const pt=sim.points.find(q=>q.tag==='RM-1');const rmOK=commIdc('RM-1')&&sim.addr['RM-1']===pt.a&&!sim.items.some(i=>i.id!=='RM-1'&&i.addressable&&sim.addr[i.id]===pt.a);
      relay=rmOK&&!sim.powerOff&&(sim.nacOn||sim.events.some(e=>e.k==='alarm'));dh=dhState(sim,relay,true)}}
  if(sim.powerOff)return{lost,comm:()=>false,troubles:[],trips:new Set(),relay:false,dh:dh==='on'?'off':dh,
    alist:alist?{troubles:[],rows:alist.rows.map(r=>Object.assign({},r,{st:'NO POWER',c:'bad'}))}:null};
  return{lost,comm,troubles,trips,alist,relay,dh}
}

/* ---------------- NAC sound + visual effects ---------------- */
const VIS={t0:0,active:false};
const AUD={ctx:null,master:null,muted:false,on:false,next:0,iv:0,
  ensure(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;try{this.ctx=new C()}catch(e){return false}}
    if(this.ctx.state==='suspended'){try{this.ctx.resume()}catch(e){}}return true},
  start(){if(this.on)return;this.on=true;if(!this.muted)this.begin()},
  begin(){if(!this.ensure())return;const c=this.ctx;this.master=c.createGain();this.master.gain.value=0.09;
    const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;this.master.connect(lp);lp.connect(c.destination);this.lp=lp;
    const ph=((performance.now()-VIS.t0)%4000+4000)%4000;this.next=c.currentTime+(4000-ph)/1000;
    for(let k=0;k<3;k++){const st=k*1000;if(ph<st+500){const off=Math.max(0,st-ph)/1000,d=Math.min(0.5,(st+500-ph)/1000);if(d>0.05)this.beep(c.currentTime+off,d)}}
    this.pump();this.iv=setInterval(()=>this.pump(),200)},
  pump(){const c=this.ctx;if(!c||!this.master)return;while(this.next<c.currentTime+1.2){for(let k=0;k<3;k++)this.beep(this.next+k,0.5);this.next+=4}},
  beep(t,d){const c=this.ctx;const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+0.01);g.gain.setValueAtTime(1,t+d-0.015);g.gain.linearRampToValueAtTime(0,t+d);g.connect(this.master);
    [[650,'square',1],[975,'square',.5],[1300,'sawtooth',.25]].forEach(([f,ty,v])=>{const o=c.createOscillator(),og=c.createGain();o.type=ty;o.frequency.value=f;og.gain.value=v;o.connect(og);og.connect(g);o.start(t);o.stop(t+d+0.02)})},
  halt(){clearInterval(this.iv);if(this.master){try{this.master.disconnect();this.lp.disconnect()}catch(e){}this.master=null}},
  stop(){this.on=false;this.halt()},
  toggleMute(){this.muted=!this.muted;if(this.muted)this.halt();else if(this.on)this.begin()}};
function syncEffects(sim,st){
  const live=WTABS.includes(state.tab)&&sim&&sim.nacOn&&!sim.silenced&&!sim.powerOff;
  const horns=live&&sim.items.some(i=>i.group==='nac'&&st.comm(i.id));
  VIS.active=!!live;if(horns)AUD.start();else if(AUD.on)AUD.stop();
}
setInterval(()=>{const sv=$('#stage');if(!sv)return;if(!VIS.active){sv.classList.remove('hornon','strobeon');return}
  const t=performance.now()-VIS.t0;const ph=((t%4000)+4000)%4000,sp=((t%1000)+1000)%1000;
  sv.classList.toggle('hornon',ph<500||(ph>=1000&&ph<1500)||(ph>=2000&&ph<2500));sv.classList.toggle('strobeon',sp<110)},30);
/* A subsequent alarm from a zone ALREADY in alarm does not resound silenced signals; a NEW zone resounds them. */
function triggerGA(sim,why,zone){
  const zl=zone?(sim.zoneNames[zone]||zone):'';
  if(sim.nacOn&&sim.silenced&&zone&&sim.alarmZones.has(zone)){sim.log.unshift(`${why} – ${zl} already in alarm: signals remain SILENCED (no resound for a subsequent alarm in the same zone)`);return}
  const resound=sim.nacOn&&sim.silenced;if(zone)sim.alarmZones.add(zone);
  if(!sim.nacOn||resound)VIS.t0=performance.now();
  const first=!sim.nacOn;sim.nacOn=true;sim.silenced=false;
  sim.log.unshift(why+(resound?` – NEW ZONE (${zl||'manual'}) – SIGNALS RESOUNDED`:first?' – NAC 1 activated':''));
}

/* ---------------- Multimeter: DC nodal model (simulated training values) ---------------- */
const EOL_R=22700,RS_IDC=470,RS_SLC=50,RS_NAC=10,RS_AUX=1;
const METER={volt:'V DC',ohm:'Ω',amm:'A DC'};
function isMeter(){return state.mode==='test'&&!!state.armed}
function meterShown(){return state.mode==='test'&&state.dmm.open&&WTABS.includes(state.tab)}
function curMeter(sim){const d=state.dmm;if(!meterShown()||d.mode==='off')return null;const R=sim.probes.red,B=sim.probes.black;
  const wOK=id=>id&&sim.wires.some(w=>w.id===id);
  if(d.mode==='amm'&&R.series&&B.series&&R.wire===B.wire&&wOK(R.wire))return{mode:'amm',wire:R.wire};
  return{mode:d.mode,a:R.tid||null,b:B.tid||null}}
function netlist(sim,st,powered,skipWire){
  const par=new Map();const f=x=>{if(!par.has(x)){par.set(x,x);return x}let r=x;while(par.get(r)!==r)r=par.get(r);while(par.get(x)!==r){const n=par.get(x);par.set(x,r);x=n}return r};
  const p2=new Map();const f2=x=>{if(!p2.has(x)){p2.set(x,x);return x}let r=x;while(p2.get(r)!==r)r=p2.get(r);return r};const U2=(a,b)=>{const ra=f2(a),rb=f2(b);if(ra!==rb)p2.set(ra,rb)};
  const U=(a,b)=>{const ra=f(a),rb=f(b);if(ra!==rb)par.set(ra,rb);U2(a,b)};
  const res=[],src=[];const Rr=(a,b,r)=>{res.push([a,b,r]);U2(a,b)};f('GND');
  sim.wires.forEach(w=>{if(w.open||w===skipWire)return;U(w.a,w.b)});
  const live=powered&&!sim.powerOff,nacPos=live&&sim.nacOn&&!sim.silenced;
  sim.items.forEach(it=>{const id=it.id;
    if(it.type==='eol'){Rr(id+'.r1',id+'.r2',EOL_R);return}
    if(it.type==='ser'){if(!sim.coverOff.has(id))U(id+'.s1',id+'.s2');return}
    if(it.type==='dh'){Rr(id+'.d+',id+'.d-',480);return}
    if(it.type==='panel'){
      if(powered)it.terms.forEach(t=>{if(t.pol==='-')U(id+'.'+t.id,'GND')});
      if(!live)return;const has=t=>it.terms.some(x=>x.id===t);const S=(t,v,rs)=>{if(has(t))src.push([id+'.'+t,v,rs])};
      if(sim.kind==='conv')sim.zones.forEach(z=>{S(z.n+'B+',24,RS_IDC);S(z.n+'A+',24,RS_IDC)});
      else{S('B+',24,RS_SLC);S('A+',24,RS_SLC);S('X+',24,RS_AUX)}
      const nv=nacPos?24:-24;S('N+',nv,RS_NAC);S('NR+',nv,RS_NAC);return}
    if(!PASS_TYPES.includes(it.type))return;
    if(!(powered&&st.trips.has(id))){U(id+'.in+',id+'.out+');U(id+'.in-',id+'.out-')}
    if(it.type==='tb'){U(id+'.in+',id+'.t+');U(id+'.in-',id+'.t-')}
    if(it.type!=='dev')return;
    const a=id+'.in+',b=id+'.in-',act=sim.active.has(id);
    if(sim.shorts.has(id))U(a,b);
    if(it.group==='nac'){if(nacPos)Rr(a,b,it.kind==='HS'?200:800)}
    else if(it.addressable){if(live)Rr(a,b,80000)}
    else if(it.kind==='SD'){if(live)Rr(a,b,act?560:240000)}
    else if(['PS','HD','FS','TS'].includes(it.kind)){if(act)U(a,b)}
    if(it.kind==='RM')U(id+'.COM',id+((powered&&st.relay)?'.NO':'.NC'));
    if(it.mon&&live&&st.comm(id)){U(id+'.m-','GND');src.push([id+'.m+',24,RS_IDC])}
  });
  src.forEach(([a])=>U2(a,'GND'));
  return{f,res,src,isLive:t=>src.length>0&&f2(t)===f2('GND')}}
function solve(net,inject,probes){
  const{f,res,src}=net;const g=f('GND');const idx=new Map();let n=0;
  const ix=t=>{const r=f(t);if(r===g)return-1;if(!idx.has(r))idx.set(r,n++);return idx.get(r)};
  res.forEach(([a,b])=>{ix(a);ix(b)});src.forEach(([a])=>ix(a));inject.forEach(([a])=>ix(a));probes.forEach(ix);
  const A=Array.from({length:n},()=>new Float64Array(n)),B=new Float64Array(n);
  for(let i=0;i<n;i++)A[i][i]+=1e-12;
  res.forEach(([a,b,r])=>{const i=ix(a),j=ix(b),G=1/r;if(i===j)return;if(i>=0)A[i][i]+=G;if(j>=0)A[j][j]+=G;if(i>=0&&j>=0){A[i][j]-=G;A[j][i]-=G}});
  src.forEach(([a,v,rs])=>{const i=ix(a);if(i<0)return;A[i][i]+=1/rs;B[i]+=v/rs});
  inject.forEach(([a,I])=>{const i=ix(a);if(i>=0)B[i]+=I});
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
    if(p!==c){const t=A[p];A[p]=A[c];A[c]=t;const tb=B[p];B[p]=B[c];B[c]=tb}
    const piv=A[c][c];if(!piv)continue;
    for(let r=c+1;r<n;r++){const k=A[r][c]/piv;if(!k)continue;const Ar=A[r],Ac=A[c];for(let q=c;q<n;q++)Ar[q]-=k*Ac[q];B[r]-=k*B[c]}}
  const X=new Float64Array(n);for(let r=n-1;r>=0;r--){let sum=B[r];for(let q=r+1;q<n;q++)sum-=A[r][q]*X[q];X[r]=A[r][r]?sum/A[r][r]:0}
  return t=>{const r=f(t);if(r===g)return 0;const i=idx.get(r);return i===undefined?0:X[i]}}
const fmtV=v=>(Math.abs(v)<0.005?'0.00':v.toFixed(2))+' V';
function fmtA(I){const a=Math.abs(I),sg=I<0?'-':'';if(a<5e-7)return'0.0 µA';if(a<1e-3)return sg+(a*1e6).toFixed(1)+' µA';if(a<1)return sg+(a*1e3).toFixed(2)+' mA';return sg+a.toFixed(3)+' A'}
function fmtR(r){if(!isFinite(r)||r>40e6)return'OL';if(r<1)return r.toFixed(2)+' Ω';if(r<1000)return r.toFixed(1)+' Ω';if(r<1e6)return(r/1000).toFixed(2)+' kΩ';return(r/1e6).toFixed(2)+' MΩ'}
function meterRead(sim){
  const m=curMeter(sim);if(!m)return null;const st=status(sim);
  if(m.mode==='amm'&&m.wire){const w=sim.wires.find(x=>x.id===m.wire);if(!w)return{val:'----',note:'Conductor removed – click a conductor again.'};
    if(w.open)return{val:'0.0 µA',note:'This conductor is open (lifted) – no current can flow through the meter.'};
    const net=netlist(sim,st,true,w);net.res.push([w.a,w.b,0.01]);const V=solve(net,[],[w.a,w.b]);const I=(V(w.a)-V(w.b))/0.01;
    return{val:fmtA(Math.abs(I)),note:`Probes inserted in series in the conductor ${tn(sim,w.a)} → ${tn(sim,w.b)}.${Math.abs(I)<5e-7?' No current is flowing in this conductor.':` Current flows from ${I>0?tn(sim,w.a):tn(sim,w.b)} toward ${I>0?tn(sim,w.b):tn(sim,w.a)}.`}`}}
  if(!m.a||!m.b)return{val:'----',note:!m.a&&!m.b?(m.mode==='amm'?'Drag a probe onto a conductor to break it and insert the meter in series.':'Drag the RED and BLACK probes onto two terminals (or conductors).'):`Now place the ${m.a?'BLACK (COM)':'RED'} probe.`};
  const a=m.a,b=m.b;
  if(m.mode==='volt'){const V=solve(netlist(sim,st,true),[],[a,b]);const v=V(a)-V(b);
    return{val:fmtV(v),note:Math.abs(v)<0.05?'No potential difference between the probes (same conductor, de-energized, or no path to the source).':v<0?'Negative reading – the RED probe is at the lower potential (e.g. a NAC in reverse-polarity supervision).':'DC voltage measured from RED to COM.'}}
  if(m.mode==='amm'){if(state.dmm.blown)return{val:'FUSE',err:true,note:'Meter fuse blown! The ammeter was connected in parallel across a source. An ammeter must be connected in SERIES – click a conductor to insert the meter. Press ⟲ on the meter to return the probes and replace the fuse.'};
    const net=netlist(sim,st,true);net.res.push([a,b,0.05]);const V=solve(net,[],[a,b]);const I=(V(a)-V(b))/0.05;
    if(Math.abs(I)>1){state.dmm.blown=true;return meterRead(sim)}
    return{val:fmtA(I),note:'Ammeter probes placed on two terminals – the meter completes a path between them. If those points are already joined by a conductor the meter is bypassed and reads ≈ 0. For an in-circuit reading, drop a probe on a conductor to insert the meter in series.'}}
  const pn=netlist(sim,st,true);
  if(pn.isLive(a)||pn.isLive(b))return{val:'ERR',err:true,note:'Circuit is energized! Resistance must be measured on a de-energized circuit. Press “Power down panel”, or open (lift) the circuit conductors at the panel with the Open conductor tool.'};
  const V=solve(netlist(sim,st,false),[[a,1e-3],[b,-1e-3]],[a,b]);const r=(V(a)-V(b))/1e-3;const t=fmtR(r);
  return{val:t,note:t==='OL'?'Over limit – no continuous path between the probes (open circuit).':r<1?'Continuity – the probes are on the same conductor, a closed contact, or a short.':`Resistance between the probes. EOL resistors in this simulator are ${EOL_R/1000} kΩ.`}}
function renderMeter(sim){
  const show=meterShown();$('#dmmLayer').hidden=!show;$('#meterTog').setAttribute('aria-pressed',String(state.dmm.open));$('#meterTog').classList.toggle('on',state.dmm.open);
  if(!show)return;
  const d=state.dmm;const angles={off:-90,volt:-30,ohm:30,amm:90};$('#knob').style.transform=`rotate(${angles[d.mode]}deg)`;
  document.querySelectorAll('[data-dial]').forEach(b=>b.classList.toggle('on',b.dataset.dial===d.mode));
  const v=$('#dmmVal');const r=meterRead(sim);
  if(d.mode==='off'){v.textContent='-8.8.8.8';v.className='hhm-val off';$('#dmmMode').textContent='OFF';$('#dmmRange').textContent='';$('#dmmNote').textContent='Turn the dial to V⎓, Ω or A⎓, then drag the probes onto the circuit.'}
  else{const val=r?r.val:'----';const sp=val.lastIndexOf(' ');v.textContent=sp>0?val.slice(0,sp):val;v.className='hhm-val'+(r&&r.err?' err':'');
    $('#dmmMode').textContent=(d.mode==='amm'&&d.blown?'FUSE  ':'')+'AUTO  '+METER[d.mode];$('#dmmRange').textContent=sp>0?val.slice(sp+1):'';$('#dmmNote').textContent=r?r.note:''}
  layoutMeter(sim)}
/* ---- handheld meter geometry ---- */
function wrapRect(){return $('.stagewrap').getBoundingClientRect()}
function svgToLocal(x,y){const sv=$('#stage');const m=sv.getScreenCTM();if(!m)return{x:0,y:0};const p=sv.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(m);const W=wrapRect();return{x:q.x-W.left,y:q.y-W.top}}
function clientToSvg(cx,cy){const sv=$('#stage');const m=sv.getScreenCTM();const p=sv.createSVGPoint();p.x=cx;p.y=cy;const q=p.matrixTransform(m.inverse());return{x:q.x,y:q.y}}
function ensureMeterPos(){const d=state.dmm;const W=wrapRect();if(d.x==null){d.x=Math.max(8,W.width-214);d.y=56}d.x=Math.min(Math.max(-120,d.x),W.width-60);d.y=Math.min(Math.max(-40,d.y),W.height-60)}
function probeSvgPos(sim,which){const p=sim.probes[which];
  if(p.series){const k=sim.wires.findIndex(w=>w.id===p.wire);if(k>=0){const g=wireGeom(sim)[k].mid;return{x:g.x+(which==='red'?-7:7),y:g.y}}}
  if(p.tid&&!p.free){const{it,t}=T(sim,p.tid);return{x:it.x+t.dx,y:it.y+t.dy}}
  if(p.x!=null)return{x:p.x,y:p.y};
  return null}
function parkProbe(sim,which){const d=state.dmm;const W=wrapRect();const lx=d.x+(which==='red'?140:60),ly=Math.min(d.y+380,W.height-110);
  const q=clientToSvg(W.left+lx,W.top+ly);sim.probes[which]={x:q.x,y:q.y}}
function jackLocal(id){const r=$(id).querySelector('b').getBoundingClientRect(),W=wrapRect();return{x:r.left+r.width/2-W.left,y:r.top+r.height/2-W.top}}
function layoutMeter(sim){
  ensureMeterPos();const d=state.dmm;const M=$('#dmm');M.style.left=d.x+'px';M.style.top=d.y+'px';
  ['red','black'].forEach(w=>{if(!probeSvgPos(sim,w))parkProbe(sim,w)});
  const tails={};
  [['red','#probeRed',-22],['black','#probeBlk',22]].forEach(([w,sel,deg])=>{const s=probeSvgPos(sim,w);const L=svgToLocal(s.x,s.y);const el=$(sel);
    el.style.left=L.x+'px';el.style.top=L.y+'px';el.classList.toggle('armed',state.armed===w);
    const a=deg*Math.PI/180;tails[w]={x:L.x-96*Math.sin(a),y:L.y+96*Math.cos(a)}});
  const jr=jackLocal(d.mode==='amm'?'#jackA':'#jackV'),jb=jackLocal('#jackCOM');
  const lead=(j,t)=>`M${j.x},${j.y} C${j.x},${j.y+110} ${t.x},${t.y+90} ${t.x},${t.y}`;
  $('#leadRed').setAttribute('d',lead(jr,tails.red));$('#leadBlk').setAttribute('d',lead(jb,tails.black))}
/* ---- placing probes ---- */
function nearestTerm(sim,p,tol){let best=null,bd=tol*tol;sim.items.forEach(it=>it.terms.forEach(t=>{const dx=it.x+t.dx-p.x,dy=it.y+t.dy-p.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=it.id+'.'+t.id}}));return best}
function placeProbe(which,svgP,clientP){
  const sim=cur();const other=which==='red'?'black':'red';
  const wasSeries=sim.probes[which].series;if(wasSeries){sim.probes[other]={};}
  const tid=nearestTerm(sim,svgP,16);
  if(tid){sim.probes[which]={tid};say(`${which==='red'?'RED':'BLACK'} probe on ${tn(sim,tid)}`)}
  else{let wid=null;if(clientP){const els=document.elementsFromPoint(clientP.x,clientP.y);const g=els.find(e=>e.closest&&e.closest('[data-wid]'));if(g)wid=g.closest('[data-wid]').dataset.wid}
    const w=wid&&sim.wires.find(x=>x.id===wid);
    if(w&&state.dmm.mode==='amm'){sim.probes.red={series:true,wire:w.id,tid:w.a};sim.probes.black={series:true,wire:w.id,tid:w.b};say(`Conductor ${tn(sim,w.a)} → ${tn(sim,w.b)} opened and the ammeter inserted in series.`)}
    else if(w){sim.probes[which]={tid:w.a,free:true,x:svgP.x,y:svgP.y};say(`${which==='red'?'RED':'BLACK'} probe touching the conductor at ${tn(sim,w.a)}`)}
    else{sim.probes[which]={x:svgP.x,y:svgP.y};}}
  state.armed=null;renderStage();renderPanel()}
function say(m){$('#hint').textContent=m}
/* ---- dragging ---- */
function dragify(el,onMove,onEnd,onClick){
  el.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,.hhm-note,.knob'))return;e.preventDefault();
    const st={x:e.clientX,y:e.clientY,moved:false};el.setPointerCapture(e.pointerId);el.classList.add('drag');
    const mv=ev=>{if(!st.moved&&Math.hypot(ev.clientX-st.x,ev.clientY-st.y)<4)return;st.moved=true;onMove(ev,st)};
    const up=ev=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.classList.remove('drag');
      if(st.moved)onEnd(ev,st);else onClick&&onClick(ev)};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)})}
dragify($('#dmm'),(ev,st)=>{if(st.ox==null){st.ox=state.dmm.x;st.oy=state.dmm.y}state.dmm.x=st.ox+ev.clientX-st.x;state.dmm.y=st.oy+ev.clientY-st.y;layoutMeter(cur())},()=>{layoutMeter(cur())});
[['red','#probeRed'],['black','#probeBlk']].forEach(([w,sel])=>{const el=$(sel);
  dragify(el,(ev,st)=>{const sim=cur();if(st.dx==null){const p=probeSvgPos(sim,w),L=svgToLocal(p.x,p.y),W=wrapRect();st.dx=ev.clientX-(L.x+W.left);st.dy=ev.clientY-(L.y+W.top);
      if(sim.probes[w].series)sim.probes[w==='red'?'black':'red']={tid:sim.probes[w==='red'?'black':'red'].tid}}
      const cx=ev.clientX-st.dx,cy=ev.clientY-st.dy;const q=clientToSvg(cx,cy);sim.probes[w]={x:q.x,y:q.y};st.cx=cx;st.cy=cy;layoutMeter(sim)},
    (ev,st)=>{const q=clientToSvg(st.cx,st.cy);el.style.visibility='hidden';placeProbe(w,q,{x:st.cx,y:st.cy});el.style.visibility=''},
    ev=>{if(state.armed&&state.armed!==w){placeProbe(state.armed,clientToSvg(ev.clientX,ev.clientY),{x:ev.clientX,y:ev.clientY});return}armProbe(w)});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();armProbe(w)}})});
function armProbe(w){state.armed=state.armed===w?null:w;say(state.armed?`${w==='red'?'RED':'BLACK'} probe picked up – click a terminal or conductor to place it (Esc to cancel).`:'');renderStage();layoutMeter(cur())}
function setDial(m){state.dmm.mode=m;if(m!=='amm')state.dmm.blown=false;const sim=cur();
  if(m!=='amm'){['red','black'].forEach(w=>{if(sim.probes[w].series)sim.probes[w]={}})}renderPanel()}
document.querySelectorAll('[data-dial]').forEach(b=>b.addEventListener('click',()=>setDial(b.dataset.dial)));
const DIALS=['off','volt','ohm','amm'];
$('#knob').addEventListener('click',()=>setDial(DIALS[(DIALS.indexOf(state.dmm.mode)+1)%4]));
$('#knob').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '||e.key==='ArrowRight'){e.preventDefault();setDial(DIALS[(DIALS.indexOf(state.dmm.mode)+1)%4])}if(e.key==='ArrowLeft'){e.preventDefault();setDial(DIALS[(DIALS.indexOf(state.dmm.mode)+3)%4])}});
(function(){const R=52,cx=83,cy=70;const pos={off:-90,volt:-30,ohm:30,amm:90};document.querySelectorAll('[data-dial]').forEach(b=>{const a=pos[b.dataset.dial]*Math.PI/180;b.style.left=(cx+R*Math.sin(a))+'px';b.style.top=(cy-R*Math.cos(a))+'px'})})();
$('#dmmPark').addEventListener('click',()=>{const sim=cur();sim.probes={red:{},black:{}};state.dmm.blown=false;state.armed=null;renderPanel()});
$('#dmmClose').addEventListener('click',()=>{state.dmm.open=false;state.armed=null;renderPanel()});
$('#svgwrap').addEventListener('scroll',()=>{if(meterShown())layoutMeter(cur())});
window.addEventListener('resize',()=>{if(meterShown())layoutMeter(cur())});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.armed){state.armed=null;say('');renderStage();layoutMeter(cur())}});

/* ---------------- Rendering: stage ---------------- */
function waves(cx,cy){return`<path class="wave" d="M${cx+18},${cy-8} a10,10 0 0,1 0,16 M${cx+24},${cy-14} a17,17 0 0,1 0,28 M${cx-18},${cy-8} a10,10 0 0,0 0,16 M${cx-24},${cy-14} a17,17 0 0,0 0,28"/>`}
function icon(it,cx,cy){
  switch(it.kind){
    case'SD':return`<circle cx="${cx}" cy="${cy}" r="14" fill="#eceff1" stroke="#607d8b" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="5" fill="#90a4ae"/><text x="${cx}" y="${cy+4}" text-anchor="middle" style="font:700 8px sans-serif;fill:#263238">S</text>`;
    case'HD':return`<circle cx="${cx}" cy="${cy}" r="14" fill="#ffe0b2" stroke="#ef6c00" stroke-width="2"/><text x="${cx}" y="${cy+5}" text-anchor="middle" style="font:700 13px sans-serif;fill:#bf360c">H</text>`;
    case'PS':return`<rect x="${cx-12}" y="${cy-15}" width="24" height="30" rx="3" fill="#d32f2f"/><rect x="${cx-7}" y="${cy-3}" width="14" height="6" fill="#fff"/><text x="${cx}" y="${cy-6}" text-anchor="middle" style="font:700 6px sans-serif;fill:#fff">FIRE</text>`;
    case'HS':return`<rect x="${cx-13}" y="${cy-15}" width="26" height="30" rx="3" fill="#c62828"/><circle cx="${cx}" cy="${cy-7}" r="4" fill="#fff"/><rect x="${cx-8}" y="${cy+1}" width="16" height="10" fill="#eceff1" stroke="#90a4ae"/><text x="${cx}" y="${cy+9}" text-anchor="middle" style="font:700 6px sans-serif;fill:#c62828">FIRE</text>${waves(cx,cy)}<circle class="glow" cx="${cx}" cy="${cy+6}" r="13"/>`;
    case'HN':return`<rect x="${cx-13}" y="${cy-15}" width="26" height="30" rx="3" fill="#c62828"/><circle cx="${cx}" cy="${cy-2}" r="8" fill="#8e1b1b"/><circle cx="${cx}" cy="${cy-2}" r="4" fill="#4a0e0e"/><text x="${cx}" y="${cy+12}" text-anchor="middle" style="font:700 5.5px sans-serif;fill:#fff">FIRE</text>${waves(cx,cy)}`;
    case'MM':return`<rect x="${cx-14}" y="${cy-13}" width="28" height="26" rx="3" fill="#455a64"/><text x="${cx}" y="${cy+4}" text-anchor="middle" style="font:700 10px sans-serif;fill:#fff">MM</text>`;
    case'RM':return`<rect x="${cx-14}" y="${cy-13}" width="28" height="26" rx="3" fill="#1565c0"/><text x="${cx}" y="${cy+4}" text-anchor="middle" style="font:700 9px sans-serif;fill:#fff">RLY</text>`;
    case'ISO':return`<rect x="${cx-14}" y="${cy-13}" width="28" height="26" rx="3" fill="#ffca28"/><text x="${cx}" y="${cy+4}" text-anchor="middle" style="font:700 9px sans-serif;fill:#3e2723">ISO</text>`;
    case'TB':return`<rect x="${cx-16}" y="${cy-12}" width="32" height="24" rx="3" fill="#78909c"/><path d="M${cx-10},${cy+4} h20 M${cx},${cy+4} v-12" stroke="#fff" stroke-width="2.5" fill="none"/>`;
    case'FS':return`<rect x="${cx-24}" y="${cy-4}" width="48" height="10" rx="5" fill="#90a4ae"/><rect x="${cx-11}" y="${cy-18}" width="22" height="16" rx="2" fill="#c62828"/><text x="${cx}" y="${cy-7}" text-anchor="middle" style="font:700 6px sans-serif;fill:#fff">FLOW</text><path d="M${cx},${cy+6} v8" stroke="#607d8b" stroke-width="2"/>`;
    case'TS':return`<circle cx="${cx-10}" cy="${cy}" r="11" fill="none" stroke="#c62828" stroke-width="3"/><path d="M${cx-21},${cy} h22 M${cx-10},${cy-11} v22" stroke="#c62828" stroke-width="2"/><rect x="${cx+3}" y="${cy-9}" width="20" height="18" rx="2" fill="#37474f"/><text x="${cx+13}" y="${cy+3}" text-anchor="middle" style="font:700 6px sans-serif;fill:#fff">TMP</text>`;
  }return''}
function stat(it,cls,txt){const y=it.btm?it.y-7:it.y+it.h+12;return`<text class="stat ${cls}" x="${it.x+it.w/2}" y="${y}" text-anchor="middle">${txt}</text>`}
function applyZoom(sim){const sv=$('#stage');if(state.zoom==null){sv.style.width='100%';sv.style.minWidth=Math.round(sim.vw*0.72)+'px'}else{sv.style.width=Math.round(sim.vw*state.zoom)+'px';sv.style.minWidth=''}}
function renderStage(){
  const sim=cur();const test=state.mode==='test';const st=status(sim);
  $('#stage').setAttribute('viewBox',`0 0 ${sim.vw} ${sim.vh}`);applyZoom(sim);
  let s='',top='';
  sim.rooms.forEach(r=>{s+=`<rect class="room" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6"/><text class="roomlbl" x="${r.x+8}" y="${r.y+r.h-8}">${r.l}</text>`});
  if(sim.decor)s+=sim.decor;
  sim.wires.forEach(w=>{if(!w.path)w.path=route(sim,w)});
  const geo=wireGeom(sim);
  sim.wires.forEach((w,i)=>{const a=T(sim,w.a).t,b=T(sim,w.b).t;const pol=a.pol!=='*'?a.pol:b.pol;const pc=pol==='+'?'p':pol==='-'?'n':'x';const{d,mid}=geo[i];
    s+=`<g class="wg" data-wid="${w.id}" tabindex="0" role="button" aria-label="Conductor ${esc(tn(sim,w.a))} to ${esc(tn(sim,w.b))}"><path class="whit" d="${d}"/><path class="wire ${pc} ${w.open?'open':''}" d="${d}"/>${w.open?`<text class="openx" x="${mid.x}" y="${mid.y+6}" text-anchor="middle">✕</text>`:''}</g>`});
  sim.items.forEach(it=>{
    if(it.type==='panel'){s+=`<g class="item panel"><rect class="pbox" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="8"/>
      <text class="ptitle" x="${it.x+12}" y="${it.y+24}">FACP</text><text class="psub" x="${it.x+12}" y="${it.y+40}">${esc(it.sub)}</text>`;
      it.terms.forEach(t=>{s+=`<text class="ptl" x="${it.x+it.w-14}" y="${it.y+t.dy+4}" text-anchor="end">${esc(t.name)}</text>`});
      s+=`</g>`;return}
    if(it.type==='eol'){const used=sim.wires.some(w=>w.a.startsWith(it.id+'.')||w.b.startsWith(it.id+'.'));
      s+=`<g class="item"><rect class="dbox" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="6"/>
      <line x1="${it.x}" y1="${it.y+20}" x2="${it.x+12}" y2="${it.y+20}" stroke="#795548" stroke-width="2"/>
      <path d="M${it.x+12},${it.y+20} h8 l4,-6 l6,12 l6,-12 l6,12 l6,-12 l4,6 h8" fill="none" stroke="#795548" stroke-width="2"/>
      <line x1="${it.x+66}" y1="${it.y+20}" x2="${it.x+74}" y2="${it.y+20}" stroke="#795548" stroke-width="2"/><line x1="${it.x+74}" y1="${it.y+20}" x2="${it.x+74}" y2="${it.y+42}" stroke="#795548" stroke-width="2"/><line x1="${it.x}" y1="${it.y+42}" x2="${it.x+74}" y2="${it.y+42}" stroke="#795548" stroke-width="2"/>
      <text class="dio" x="${it.x+44}" y="${it.y+54}" text-anchor="middle" style="font-size:9.5px">22.7 kΩ</text><text class="ddesc" x="${it.x+it.w/2}" y="${it.y+it.h+12}" text-anchor="middle">${esc(it.desc)}${it.cls==='A'&&!used?' (if required)':''}</text></g>`;return}
    if(it.type==='ser'){const off=sim.coverOff.has(it.id);const x=it.x,y=it.y;
      s+=`<g class="item ${test&&!isMeter()?'testable':''} ${off?'coveroff':''}" data-item="${it.id}"><rect class="dbox" x="${x}" y="${y}" width="${it.w}" height="${it.h}" rx="6"/>
        <text class="dtag" x="${x+it.w/2}" y="${y+14}" text-anchor="middle" style="font-size:11px">${it.id}</text>
        <text class="ddesc" x="${x+it.w/2}" y="${y+24}" text-anchor="middle" style="font-size:8.5px">Box Tamper Sw.</text>
        <line x1="${x+8}" y1="${y+28}" x2="${x+28}" y2="${y+28}" stroke="var(--ink)" stroke-width="2"/><circle cx="${x+30}" cy="${y+28}" r="2.5" fill="var(--ink)"/>
        <line x1="${x+30}" y1="${y+28}" x2="${x+54}" y2="${off?y+15:y+28}" stroke="var(--ink)" stroke-width="2.5"/><circle cx="${x+56}" cy="${y+28}" r="2.5" fill="var(--ink)"/>
        <line x1="${x+56}" y1="${y+28}" x2="${x+76}" y2="${y+28}" stroke="var(--ink)" stroke-width="2"/>
        <text class="dio" x="${x+it.w/2}" y="${y+46}" text-anchor="middle">${off?'COVER OFF – OPEN':'COVER ON – CLOSED'}</text></g>`;return}
    if(it.type==='dh'){const on=st.dh==='on';const x=it.x,y=it.y;const cls=['item'];if(!on)cls.push('dhoff');
      const hx=x+96,hy=y+66;const door=on?`<line x1="${hx}" y1="${hy}" x2="${x+64}" y2="${y+36}" stroke="#8d6e63" stroke-width="6" stroke-linecap="round"/>`:`<line x1="${hx}" y1="${hy}" x2="${x+44}" y2="${hy}" stroke="#8d6e63" stroke-width="6" stroke-linecap="round"/>`;
      s+=`<g class="${cls.join(' ')}" data-item="${it.id}"><rect class="dbox" x="${x}" y="${y}" width="${it.w}" height="${it.h}" rx="8"/>
        <text class="dtag" x="${x+62}" y="${y+16}" text-anchor="middle">${it.id}</text><text class="ddesc" x="${x+62}" y="${y+27}" text-anchor="middle" style="font-size:8.5px">Door Holder 24VDC</text>
        <rect x="${x+54}" y="${y+32}" width="10" height="8" rx="1" fill="${on?'#1565c0':'#78909c'}"/>${on?`<path d="M${x+50},${y+36} h-6 M${x+50},${y+32} l-5,-3 M${x+50},${y+40} l-5,3" stroke="#1565c0" stroke-width="1.5"/>`:''}
        ${door}<circle cx="${hx}" cy="${hy}" r="3" fill="#5d4037"/></g>`;
      s+=stat(it,on?'good':'warn',on?'DOOR HELD OPEN':'DOOR RELEASED');return}
    const cls=['item'];let stt='';const nacDev=it.group==='nac';
    if(nacDev&&sim.nacOn&&!sim.silenced&&st.comm(it.id)){cls.push('horning');if(it.kind==='HS')cls.push('strobing')}
    if(it.kind==='RM'&&st.relay)cls.push('rlyon');
    if(test&&it.type==='dev'){const c=st.comm(it.id);const ad=sim.kind==='addr'&&it.addressable;
      if(!it.mon&&!nacDev&&it.kind!=='RM'&&!isMeter())cls.push('testable');
      if(sim.shorts.has(it.id))cls.push('short');
      if(!c)cls.push('nocomm');
      const sw=it.monOf;const activeSup=sim.active.has(it.id)&&(it.sup||(sw&&sim.map[sw].sup));
      if(sim.active.has(it.id))cls.push(activeSup?'sup':'alarm');
      stt=c?stat(it,'good',ad?(it.kind==='RM'?(st.relay?'RELAY OPERATED':'COMM OK'):'COMM OK'):nacDev?'SUPERVISED':sw?'SUPERVISED BY '+sw:'CONNECTED'):stat(it,'bad',sim.shorts.has(it.id)?'⚡ SHORT':sim.powerOff?'NO POWER':(ad?'NO COMM':nacDev?'NO POWER':'NOT CONNECTED'));
      if(sim.kind==='conv'&&sim.active.has(it.id)&&sim.zoneAlarm.has(it.zone)&&sim.zoneInit[it.zone]!==it.id&&c)stt=stat(it,'warn','OPERATED – NOT REPORTED (ZONE LATCHED)');
      if(sim.kind==='conv'&&!nacDev&&it.zone&&sim.zoneAlarm.has(it.zone)&&!sim.active.has(it.id)&&c){cls.push('latched');stt=stat(it,'warn','ZONE IN ALARM – LOCKED OUT')}}
    if(test&&it.type==='iso'&&st.trips.has(it.id)){cls.push('isotrip');stt=stat(it,'warn','ISOLATING')}
    const tapTop=it.type==='tb';const fl=it.flip;
    s+=`<g class="${cls.join(' ')}" data-item="${it.id}"><rect class="dbox" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="8"/>
      <text class="dtag" x="${it.x+it.w/2}" y="${it.y+(tapTop?33:18)}" text-anchor="middle">${it.id}</text>
      <text class="ddesc" x="${it.x+it.w/2}" y="${it.y+(tapTop?45:31)}" text-anchor="middle">${esc(it.desc)}</text>
      <text class="dio" x="${it.x+5}" y="${it.y+14}">${fl?'OUT':'IN'}</text><text class="dio" x="${it.x+it.w-5}" y="${it.y+14}" text-anchor="end">${fl?'IN':'OUT'}</text>
      ${icon(it,it.x+(it.addressable?44:it.w/2),it.y+(tapTop?62:54))}`;
    if(tapTop)s+=`<text class="dio" x="${it.x+66}" y="${it.y+21}" text-anchor="middle">DCLB TAP</text>`;
    if(it.mon)s+=`<text class="dio" x="${it.x+66}" y="${it.y+75}" text-anchor="middle">IDC</text>`;
    if(it.kind==='RM')it.terms.filter(t=>t.role==='rly').forEach(t=>{s+=`<text class="dio" x="${it.x+t.dx}" y="${it.y+72}" text-anchor="middle">${t.name}</text>`});
    if(it.addressable){const a=sim.addr[it.id];top+=`<g class="badge ${a?'':'unset'}" data-addr="${it.id}" tabindex="0" role="button" aria-label="Set address for ${it.id}"><rect x="${it.x+66}" y="${it.y+38}" width="54" height="20" rx="4"/><text x="${it.x+93}" y="${it.y+52}" text-anchor="middle">${a?pad3(a):'ADDR?'}</text></g>`}
    s+=stt+`</g>`;
  });
  s+=top;
  const meterOn=state.mode==='test'&&!!state.armed;
  sim.items.forEach(it=>it.terms.forEach(t=>{const tid=it.id+'.'+t.id;const x=it.x+t.dx,y=it.y+t.dy;const pc=t.pol==='+'?'p':t.pol==='-'?'n':'x';
    const used=wireAt(sim,tid)?' used':'';
    s+=`<circle class="term ${pc}${used}${state.sel===tid?' sel':''}" cx="${x}" cy="${y}" r="7.5" data-tid="${tid}" tabindex="${test&&!meterOn?-1:0}" role="button" aria-label="${esc(tn(sim,tid))}"/>`;
    s+=`<text class="tl" x="${x}" y="${y+3.2}" text-anchor="middle" style="fill:${t.pol==='-'?'var(--card)':'#fff'}">${t.pol==='+'?'+':t.pol==='-'?MINUS:''}</text>`}));
  $('#stage').innerHTML=s;
  if(st.relay!==sim.lastRelay){sim.log.unshift(st.relay?'RM-1 relay operated – door holder circuit transferred':'RM-1 relay restored');sim.lastRelay=st.relay}
  syncEffects(sim,st);
  if(meterShown())requestAnimationFrame(()=>layoutMeter(sim));
}
function renderPanel(){
  const sim=cur();const st=status(sim);
  renderMeter(sim);
  document.querySelector('.led.pw').classList.toggle('on',!sim.powerOff);$('#pwrBtn').textContent=sim.powerOff?'Restore panel power':'Power down panel';
  $('#addrCard').hidden=sim.kind!=='addr';
  if(sim.kind==='addr')$('#alist').innerHTML=st.alist.rows.map(r=>`<tr><td class="a">${r.a}</td><td>${esc(r.type)}</td><td>${esc(r.loc)}</td><td class="st ${r.c}">${esc(r.st)}</td></tr>`).join('');
  const logH=n=>sim.log.length?`<div style="opacity:.7;margin-top:4px">— log —</div>`+sim.log.slice(0,n).map(l=>`<div style="opacity:.75">${esc(l)}</div>`).join(''):'';
  if(sim.powerOff){['#ledAl','#ledSv','#ledTb','#ledSi'].forEach(x=>$(x).classList.remove('on'));$('#silBtn').disabled=true;
    $('#lcd').innerHTML=`<div class="hd">PANEL POWERED DOWN</div><div>AC and battery disconnected.</div><div>Field circuits are de-energized – safe for resistance (Ω) measurements.</div>`+logH(4);return}
  const al=sim.events.filter(e=>e.k==='alarm'),sv=sim.events.filter(e=>e.k==='sup');
  $('#ledAl').classList.toggle('on',al.length>0||sim.nacOn);$('#ledSv').classList.toggle('on',sv.length>0);$('#ledTb').classList.toggle('on',st.troubles.length>0);$('#ledSi').classList.toggle('on',sim.nacOn&&sim.silenced);
  const head=al.length||sim.nacOn?'*** FIRE ALARM ***':sv.length?'** SUPERVISORY **':st.troubles.length?'*  TROUBLE  *':'SYSTEM NORMAL';
  let h=`<div class="hd">${head}</div>`;
  if(sim.nacOn)h+=sim.silenced?`<div>SIGNALS SILENCED – NAC 1 OFF</div>`:`<div>GENERAL ALARM – NAC 1 ACTIVE (TEMPORAL-3)</div>`;
  if(st.relay)h+=`<div>RELAY RM-1 ACTIVE – DOOR HOLDERS ${st.dh==='on'?'STILL ENERGIZED (CHECK WIRING)':'RELEASED'}</div>`;
  al.forEach(e=>h+=`<div>${esc(e.m)}</div>`);sv.forEach(e=>h+=`<div>${esc(e.m)}</div>`);
  st.troubles.forEach(t=>h+=`<div>TBL: ${esc(t)}</div>`);
  h+=logH(6);
  $('#lcd').innerHTML=h;
  $('#silBtn').disabled=!sim.nacOn||sim.silenced;
  $('#sndBtn').textContent='Sound: '+(AUD.muted?'OFF':'ON');$('#sndBtn').setAttribute('aria-pressed',String(!AUD.muted));
}
function renderResults(){const sim=cur();const ul=$('#results');
  if(!sim.results){ul.innerHTML='<li class="info">Wire the circuits, then press <b>Check wiring</b>.</li>';return}
  const pass=!sim.results.some(r=>r.k==='fail');
  ul.innerHTML=(pass?'<li class="pass">✔ PASS – wiring meets all requirements.</li>':'')+sim.results.map(r=>`<li class="${r.k}">${r.k==='ok'?'✔ ':r.k==='fail'?'✖ ':'ℹ '}${esc(r.m)}</li>`).join('')}

const NACB=`<p><b>NAC 1 (Class B):</b> loop + and ${MINUS} from the panel NAC 1 terminals through <b>HS-1</b> (horn/strobe) and <b>H-1</b> (horn) and terminate on the <b>NAC EOL resistor</b>. Appliances are polarized.</p>`;
const MONTXT=(mods)=>`<p><b>Sprinkler monitor modules (${mods}):</b> wire each module's <b>IDC</b> terminals (bottom of the module) to its conventional switch: IDC + → switch IN+ → OUT+ → <b>box tamper (BT)</b> → EOL; IDC ${MINUS} → switch IN${MINUS} → OUT${MINUS} → EOL. The box tamper monitors the device cover and is wired <b>in series with the EOL resistor, after the alarm switch</b>.</p>`;
const RLYTXT=z=>`<p><b>Relay module RM-1 (${z}):</b> addressable output on the DCLC. Wire the door holder fail-safe: AUX 24VDC + → RM-1 <b>COM</b>, RM-1 <b>NC</b> → DH-1 +, DH-1 ${MINUS} → AUX 24VDC ${MINUS}. DH-1 is energized normally and releases on any fire alarm.</p>`;
const FLIPTXT=`<p class="small">Rows that run right-to-left have their <b>IN</b> terminals on the right side (labelled on each device) so the loop flows cleanly.</p>`;
const EOLTXT=`<p class="small">All EOL resistors are <b>22.7 kΩ</b>.</p>`;
const SPRB=cls=>`<p><b>Sprinkler tree</b> (riser room): the waterflow switch and the control-valve tamper switch each have their own zone, and each <b>box tamper</b> is wired <b>after the switch, in series${cls==='B'?' with the EOL resistor':''}</b> so removing the cover opens the circuit and causes a trouble.<br><b>Zone 3 – Waterflow (alarm):</b> ${cls==='B'?`ZONE 3 + → FS-1 IN+ → OUT+ → BT-1 → Zone 3 EOL; ZONE 3 ${MINUS} → FS-1 IN${MINUS} → OUT${MINUS} → Zone 3 EOL.`:`Z3 B+ → FS-1 IN+ → OUT+ → BT-1 → Z3 A+; Z3 B${MINUS} → FS-1 IN${MINUS} → OUT${MINUS} → Z3 A${MINUS}.`}<br><b>Zone 4 – Valve tamper (supervisory):</b> same arrangement with TS-1 and BT-2${cls==='B'?' to the Zone 4 EOL':', returning to Z4 A'}.</p>`;
const TASKTEXT={
 cb:`<p><b>Conventional Class B – fire zones + sprinkler tree.</b> Each fire zone requires its own initiating zone circuit.</p><p><b>Zone 1:</b> ZONE 1 +/${MINUS} → PS-1 → SD-1 → <b>Zone 1 EOL</b>.<br><b>Zone 2:</b> ZONE 2 +/${MINUS} → HD-1 → SD-2 → <b>Zone 2 EOL</b>.<br>Loop IN → OUT of every device; no T-taps.</p>`+SPRB('B')+NACB+EOLTXT,
 ca:`<p><b>Conventional Class A – fire zones + sprinkler tree.</b> Each fire zone requires its own initiating zone circuit.</p><p><b>Zone 1:</b> Z1 B+/B${MINUS} → PS-1 → SD-1 → return to Z1 A+/A${MINUS}.<br><b>Zone 2:</b> Z2 B+/B${MINUS} → HD-1 → SD-2 → return to Z2 A+/A${MINUS}.<br>No field EOL resistors on Class A.</p>`+SPRB('A')+`<p><b>NAC 1 (Class A):</b> NAC B+/B${MINUS} → HS-1 → H-1 → return to NAC A+/A${MINUS}. No field EOL.</p>`,
 dclc:`<p><b>Addressable DCLC (Class A) – 2 zones, 4 isolators.</b> Isolators at the <b>start and end of each zone</b>: 2 at the panel (ISO-1 on SLC OUT, ISO-4 on SLC RET) and 2 between zones in the riser (ISO-2, ISO-3).</p><p>Route: SLC OUT → ISO-1 → Zone 1 (incl. RM-1, MM-1) → ISO-2 → ISO-3 → Zone 2 (incl. MM-2) → ISO-4 → SLC RET.</p>`+FLIPTXT+MONTXT('MM-1 waterflow FS-1 + BT-1; MM-2 valve tamper TS-1 + BT-2')+RLYTXT('Zone 1')+`<p><b>Addressing:</b> set every device and module to its address in the <b>Device Address List</b>.</p>`+NACB+EOLTXT,
 dclb:`<p><b>DCLC with a DCLB tap – 2 zones, 4 isolators.</b> 2 at the panel (ISO-1, ISO-4) and 2 between zones (ISO-2, ISO-3) — one on <b>each side of the T-tap TB-1</b>.</p><p>Route: SLC OUT → ISO-1 → Zone 1 → ISO-2 → TB-1 → ISO-3 → Zone 2 (incl. MM-1, RM-1) → ISO-4 → SLC RET. From TB-1 <b>TAP</b> run a Class B DCLB through Suite 101 (ends at last device, no EOL).</p>`+FLIPTXT+MONTXT('MM-1 waterflow FS-1 + BT-1')+RLYTXT('Zone 2')+`<p><b>Addressing:</b> follow the <b>Device Address List</b>.</p>`+NACB+EOLTXT};
function testHelp(sim){return(sim.kind==='conv'
 ?`<p class="small"><b>Conventional zones:</b> when a device alarms, it shorts (clamps) its zone — the panel latches the zone and <b>no other device on that zone can report</b> until System Reset. A device on a <b>different</b> zone still reports and will resound silenced signals. Zone 4 (valve tamper) reports a <b>supervisory</b> signal.</p><p class="small"><b>Box tamper:</b> in Test mode click a BT to remove / replace the cover — the zone opens and the panel shows a trouble.</p>`
 :`<p class="small"><b>Silence / resound:</b> after Signal Silence, a subsequent alarm from a zone already in alarm does <b>not</b> resound the signals. An alarm from a <b>different</b> zone resounds them.</p><p class="small"><b>Box tamper:</b> in Test mode click a BT to remove / replace the cover — the module IDC opens and the panel shows a trouble. <b>Door holder:</b> watch DH-1 release on any fire alarm.</p>`)
 +`<p class="small"><b>Multimeter (Test mode):</b> press <b>Multimeter</b> in the toolbar, turn the dial to <b>V DC</b>, <b>Ω</b> or <b>A DC</b>, then drag the RED and BLACK probes onto terminals or conductors (or click a probe, then click a terminal). Drag the meter anywhere. In A DC, dropping a probe on a conductor opens it and inserts the meter in series. Resistance must be measured de-energized – use <b>Power down panel</b> or lift (open) the conductors at the panel.</p>`
 +`<p class="small"><b>Test mode:</b> click a device or switch to operate it; choose <b>Open conductor</b> and click a wire to break it${sim.kind==='addr'?'; choose <b>Short at device</b> to short the SLC there':''}.</p><p class="small"><b>Wires</b> are routed automatically around devices; a hump marks where two conductors cross without connecting. Use <b>Tidy wires</b> to re-route everything.</p>`}
function renderWire(){
  const sim=cur();
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===state.mode));
  $('#toolSeg').hidden=state.mode!=='test';$('#meterTog').hidden=state.mode!=='test';$('#shortBtn').hidden=sim.kind!=='addr';
  if(sim.kind!=='addr'&&state.tool==='short')state.tool='activate';
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===state.tool));
  applyTaskMin();
  $('#task').innerHTML=TASKTEXT[sim.key]+testHelp(sim)+(state.done[sim.key]?'<p style="color:var(--ok);font-weight:700">✔ Completed</p>':'');
  renderStage();renderPanel();renderResults();
}

/* ---------------- Wiring interactions ---------------- */
function hint(m){$('#hint').textContent=m}
function pushUndo(sim){sim.undo.push(JSON.stringify({w:sim.wires,s:sim.seq}));if(sim.undo.length>60)sim.undo.shift()}
function onTerm(tid){
  const sim=cur();
  if(!state.sel){if(wireAt(sim,tid)){hint('That terminal already has a conductor. Click the wire to remove it, or use the module’s other terminal.');return}
    state.sel=tid;hint(`Selected ${tn(sim,tid)} — now click the destination terminal (click it again to cancel).`);renderStage();return}
  if(state.sel===tid){state.sel=null;hint('Selection cancelled.');renderStage();return}
  const a=state.sel;
  if(a.split('.')[0]===tid.split('.')[0]){hint('Both ends are on the same module — choose a terminal on another module.');return}
  if(wireAt(sim,tid)){hint('Destination already has a conductor — one conductor per terminal (loop IN and OUT so every device stays supervised).');return}
  pushUndo(sim);const w={id:'w'+(++sim.seq),a,b:tid,open:false};sim.wires.push(w);w.path=route(sim,w);state.sel=null;sim.results=null;
  hint(`Conductor installed: ${tn(sim,a)} → ${tn(sim,tid)}`);renderStage();renderPanel();renderResults();
}
function onWire(wid){const sim=cur();const w=sim.wires.find(x=>x.id===wid);if(!w)return;
  if(state.mode==='wire'){pushUndo(sim);sim.wires=sim.wires.filter(x=>x!==w);sim.results=null;hint(`Removed conductor ${tn(sim,w.a)} → ${tn(sim,w.b)}`)}
  else if(state.tool==='open'){w.open=!w.open;sim.log.unshift(`${w.open?'OPEN introduced':'Repaired'}: ${tn(sim,w.a)} – ${tn(sim,w.b)}`)}
  else{hint('Select the “Open conductor” tool to break a wire.');return}
  renderStage();renderPanel();renderResults()}
function onDevice(id){
  const sim=cur();const it=sim.map[id];if(state.mode!=='test')return;
  if(it.type==='ser'){if(sim.coverOff.has(id)){sim.coverOff.delete(id);sim.log.unshift(`${id}: cover replaced – box tamper closed`)}else{sim.coverOff.add(id);sim.log.unshift(`${id}: cover removed – box tamper switch OPEN`)}renderStage();renderPanel();return}
  if(it.type==='dh'){hint('DH-1 is controlled by relay module RM-1 – it releases on any fire alarm.');return}
  if(it.type!=='dev')return;
  if(state.tool==='short'){
    if(it.group==='nac'||it.monOf){hint('Shorts are applied to SLC devices in this simulator. Use “Open conductor” to fault a NAC or module IDC.');return}
    if(sim.shorts.has(id)){sim.shorts.delete(id);sim.log.unshift(`Short removed at ${id}`)}else{sim.shorts.add(id);sim.log.unshift(`Short applied across + / ${MINUS} at ${id}`)}renderStage();renderPanel();return}
  if(state.tool!=='activate'){hint('Use “Activate device” to operate a device, or click a wire to open it.');return}
  if(it.group==='nac'){hint('Horns and horn/strobes are outputs — activate an initiating device or press “Activate General Alarm”.');return}
  if(it.mon){hint(`${id} is a monitor module — operate the conventional switch wired to its IDC (${it.mon.sw}).`);return}
  if(it.kind==='RM'){hint('RM-1 is an output module — it operates automatically on any fire alarm.');return}
  const st=status(sim);
  if(sim.active.has(id)){sim.active.delete(id);sim.log.unshift(`${id} restored to normal (latched events remain until System Reset)`);renderStage();renderPanel();return}
  sim.active.add(id);
  if(sim.powerOff){sim.log.unshift(`${id} operated – panel is powered down, no response`);renderStage();renderPanel();return}
  if(!st.comm(id)){sim.log.unshift(`${id} operated – PANEL RECEIVED NOTHING (not connected / beyond an open / isolated)`);hint(`${id} operated but the panel can't see it. Why?`);renderStage();renderPanel();return}
  if(sim.kind==='conv'){const zn=sim.zoneNames[it.zone];
    if(sim.zoneAlarm.has(it.zone)){sim.log.unshift(`${id} operated – NO RESPONSE: ${zn} is already latched. The first device has shorted the zone, so no other device on ${zn} can report.`);hint(`${zn} is latched — ${id} cannot be detected until System Reset.`)}
    else{sim.zoneAlarm.add(it.zone);sim.zoneInit[it.zone]=id;const zc=sim.zones.find(z=>z.z===it.zone);
      if(zc&&zc.sup){sim.events.push({k:'sup',m:`SUPV  ${zn.toUpperCase()}`});sim.log.unshift(`Supervisory signal on ${zn} (${id}) – NAC 1 not activated`)}
      else{sim.events.push({k:'alarm',m:`ALARM  ${zn.toUpperCase()}`});triggerGA(sim,`${zn} alarm (initiated by ${id} – a conventional panel only knows the zone)`,it.zone)}}}
  else{const mod=it.monOf?sim.map[it.monOf]:it;const a=sim.addr[mod.id];const pt=a&&sim.points.find(q=>q.a===a);const src=it.monOf?`${id} via ${mod.id}`:id;
    if(!a)sim.log.unshift(`${src} operated – address 000, the panel cannot process the signal`);
    else if(!pt)sim.log.unshift(`${src} operated – address ${pad3(a)} is not programmed, the panel cannot process the signal`);
    else{const z=mod.zone;sim.events.push({k:mod.sup?'sup':'alarm',m:`${mod.sup?'SUPV ':'ALARM'}  ADDR ${pad3(a)}  ${pt.tag} ${pt.loc}`});
      if(pt.tag!==mod.id)sim.log.unshift(`${src} operated but the panel reports ${pt.tag} (${pt.loc}) – wrong location sent to responders!`);
      if(mod.sup)sim.log.unshift(`Supervisory signal from ${src} – NAC 1 not activated`);
      else triggerGA(sim,`Alarm ADDR ${pad3(a)} ${pt.tag} (${sim.zoneNames[z]})`,z)}}
  renderStage();renderPanel()}

let addrFor=null;
function openAddr(id){const sim=cur();addrFor=id;$('#addrTitle').textContent=`Set address – ${id} (${sim.map[id].desc})`;$('#addrIn').value=sim.addr[id]||'';$('#addrWarn').textContent='';$('#addrDlg').hidden=false;setTimeout(()=>$('#addrIn').focus(),20)}
function closeAddr(){$('#addrDlg').hidden=true;addrFor=null}
function setAddr(){const sim=cur();const v=Number($('#addrIn').value);
  if(!Number.isInteger(v)||v<1||v>159){$('#addrWarn').textContent='Enter a whole number from 1 to 159.';return}
  sim.addr[addrFor]=v;sim.results=null;closeAddr();renderStage();renderPanel();renderResults()}

/* ---------------- Programming simulator ---------------- */
const INPUTS=[
 {id:'PS1',tag:'PS-1',name:'Pull Station – Main Entrance'},{id:'SD1',tag:'SD-1',name:'Smoke – Elevator Lobby (designated level)'},
 {id:'SD2',tag:'SD-2',name:'Smoke – Storage Rm 201'},{id:'SD3',tag:'SD-3',name:'Smoke – Elevator Machine Room'},
 {id:'HD1',tag:'HD-1',name:'Heat – Storage Rm 201'},{id:'WF1',tag:'WF-1',name:'Sprinkler Waterflow'},
 {id:'DD1',tag:'DD-1',name:'Duct Smoke – AHU-1 (alarm)'},{id:'TS1',tag:'TS-1',name:'Sprinkler Valve Tamper',sup:true}];
const OUTPUTS=[
 {id:'NAC1',tag:'NAC-1',name:'Horn/Strobes'},{id:'SUP',tag:'SUPV-R',name:'Supervisory relay to monitoring'},
 {id:'AHU',tag:'AHU-1',name:'Fan shutdown relay'},{id:'DH',tag:'DH-1',name:'Door holders (energized = held open)'},
 {id:'EP',tag:'ELV-P',name:'Elevator primary recall'},{id:'EA',tag:'ELV-A',name:'Elevator alternate recall'},
 {id:'PAR',tag:'PAR-1',name:'Pre-action release solenoid'}];
const tagI=id=>INPUTS.find(i=>i.id===id).tag,tagO=id=>OUTPUTS.find(o=>o.id===id).tag;
const ALARM=I=>!!(I.PS1||I.SD1||I.SD2||I.SD3||I.HD1||I.WF1||I.DD1);
const CH=[
 {t:'1. General alarm',d:'Any fire alarm initiating device (PS-1, SD-1, SD-2, SD-3, HD-1, WF-1, DD-1 duct detector) shall activate <b>NAC-1</b>. The supervisory device (TS-1 valve tamper) shall <b>not</b> activate NAC-1.',outs:['NAC1'],f:I=>({NAC1:ALARM(I)})},
 {t:'2. Supervisory & fan shutdown',d:'TS-1 (valve tamper) shall operate the <b>supervisory relay</b>. <b>AHU-1</b> shall shut down on any fire alarm, including the DD-1 duct detector. Fire alarm devices shall not operate the supervisory relay.',outs:['SUP','AHU'],f:I=>({SUP:!!I.TS1,AHU:ALARM(I)})},
 {t:'3. Door holders (fail-safe)',d:'<b>DH-1</b> is ENERGIZED in the normal condition to hold the doors open and must DE-ENERGIZE (release the doors) on any fire alarm (including DD-1). Hint: normally-closed contacts in series, or a NOR gate.',outs:['DH'],f:I=>({DH:!ALARM(I)})},
 {t:'4. Elevator recall',d:'SD-2 or SD-3 → <b>ELV-P</b> primary recall. SD-1 (designated-level lobby) → <b>ELV-A</b> alternate recall. (For this exercise both may be ON at once.)',outs:['EP','EA'],f:I=>({EP:!!(I.SD2||I.SD3),EA:!!I.SD1})},
 {t:'5. Cross-zoned pre-action release',d:'<b>PAR-1</b> shall operate only when <b>both</b> SD-2 <b>and</b> HD-1 (Storage Rm 201) are in alarm.',outs:['PAR'],f:I=>({PAR:!!(I.SD2&&I.HD1)})},
 {t:'6. Full sequence of operations',d:'Program challenges 1–5 together in one program: all seven outputs must behave correctly.',outs:OUTPUTS.map(o=>o.id),f:I=>Object.assign({},CH[0].f(I),CH[1].f(I),CH[2].f(I),CH[3].f(I),CH[4].f(I))}];
const P={mode:'block',blocks:[{id:1,out:'NAC1',gate:'OR',ins:[{id:'PS1',not:false}],delay:0}],rungs:[{id:2,coil:'NAC1',branches:[[{id:'PS1',nc:false}]]}],I:{},ch:0,since:{},nid:3};
const GATES={OR:'≥1',AND:'&',NOR:'≥1',NAND:'&'};
function evalBlock(r,I){if(!r.ins.length)return false;const v=r.ins.map(x=>x.not?!I[x.id]:!!I[x.id]);
  return r.gate==='AND'?v.every(Boolean):r.gate==='OR'?v.some(Boolean):r.gate==='NAND'?!v.every(Boolean):!v.some(Boolean)}
const contactClosed=(c,I)=>c.nc?!I[c.id]:!!I[c.id];
function evalRung(g,I){return g.branches.some(b=>b.length&&b.every(c=>contactClosed(c,I)))}
function computeOut(I,steady){const O={};OUTPUTS.forEach(o=>O[o.id]=false);const now=Date.now();
  if(P.mode==='block')P.blocks.forEach(r=>{const v=evalBlock(r,I);let on=v;
    if(!steady){if(r.delay>0){if(v){if(!P.since[r.id])P.since[r.id]=now;on=now-P.since[r.id]>=r.delay*1000}else{P.since[r.id]=0;on=false}}r._v=v;r._on=on}
    if(on)O[r.out]=true});
  else P.rungs.forEach(g=>{if(evalRung(g,I))O[g.coil]=true});
  return O}
function blockSVG(r,I){
  const n=Math.max(1,r.ins.length),H=Math.max(74,n*24+26),gx=200,gw=62,gy=12,gh=H-24;const inv=r.gate==='NOR'||r.gate==='NAND';
  let s=`<svg class="dsvg" viewBox="0 0 560 ${H}" width="560" role="img" aria-label="Block diagram">`;
  if(!r.ins.length)s+=`<text class="ds" x="8" y="${H/2}">No inputs selected – tick inputs below</text>`;
  r.ins.forEach((x,i)=>{const y=gy+gh*(i+1)/(n+1);const raw=!!I[x.id],eff=x.not?!raw:raw;
    s+=`<text class="dt ${raw?'on':''}" x="6" y="${y+4}">${tagI(x.id)}</text><line class="dl ${raw?'on':''}" x1="56" y1="${y}" x2="${x.not?gx-10:gx}" y2="${y}"/>`;
    if(x.not)s+=`<circle class="bub ${eff?'on':''}" cx="${gx-5}" cy="${y}" r="5"/>`;
    s+=`<text class="ds" x="${gx-12}" y="${y-5}" text-anchor="end">${x.not?'NOT':''}</text>`});
  s+=`<rect class="gate ${r._v?'on':''}" x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="4"/><text class="gsym" x="${gx+gw/2}" y="${gy+gh/2+6}" text-anchor="middle">${GATES[r.gate]}</text><text class="ds" x="${gx+gw/2}" y="${gy+gh+11}" text-anchor="middle">${r.gate}</text>`;
  let x=gx+gw;const my=gy+gh/2;
  if(inv){s+=`<circle class="bub ${r._v?'on':''}" cx="${x+6}" cy="${my}" r="6"/>`;x+=12}
  if(r.delay>0){s+=`<line class="dl ${r._v?'on':''}" x1="${x}" y1="${my}" x2="330" y2="${my}"/><rect class="gate ${r._on?'on':''}" x="330" y="${my-18}" width="74" height="36" rx="4"/><text class="dt" x="367" y="${my-2}" text-anchor="middle">TON</text><text class="ds" x="367" y="${my+12}" text-anchor="middle">${r.delay} s delay</text>`;x=404}
  s+=`<line class="dl ${r._on?'on':''}" x1="${x}" y1="${my}" x2="440" y2="${my}"/><polygon points="440,${my-9} 452,${my} 440,${my+9}" fill="${r._on?'var(--on)':'var(--muted)'}"/><text class="dt ${r._on?'on':''}" x="458" y="${my+4}">${tagO(r.out)}</text></svg>`;
  return s}
function rungSVG(g,I){
  const br=g.branches.length?g.branches:[[]];const maxC=Math.max(1,...br.map(b=>b.length));const cw=84,L=14,xs=L+12,xj=xs+maxC*cw+16;
  const coilX=Math.max(xj+70,440),R=coilX+70,rowH=64,H=br.length*rowH+18,W=R+12;const y0=30;
  const out=evalRung(g,I);let s=`<svg class="dsvg" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Ladder rung">`;
  s+=`<line class="dl on" x1="${L}" y1="6" x2="${L}" y2="${H-6}" style="stroke-width:4"/><line class="dl" x1="${R}" y1="6" x2="${R}" y2="${H-6}" style="stroke-width:4"/>`;
  br.forEach((b,i)=>{const y=y0+i*rowH;let pw=true,x=L;
    if(!b.length){s+=`<line class="dl" x1="${L}" y1="${y}" x2="${xj}" y2="${y}" stroke-dasharray="4 4"/><text class="ds" x="${xs+8}" y="${y-6}">empty branch – add a contact</text>`;return}
    b.forEach((c,j)=>{const cx=xs+j*cw+cw/2;const cl=contactClosed(c,I);
      s+=`<line class="dl ${pw?'on':''}" x1="${x}" y1="${y}" x2="${cx-8}" y2="${y}"/>`;
      s+=`<line class="dl ${pw?'on':''}" x1="${cx-8}" y1="${y-12}" x2="${cx-8}" y2="${y+12}"/><line class="dl ${pw&&cl?'on':''}" x1="${cx+8}" y1="${y-12}" x2="${cx+8}" y2="${y+12}"/>`;
      if(c.nc)s+=`<line class="dl ${pw&&cl?'on':''}" x1="${cx-11}" y1="${y+11}" x2="${cx+11}" y2="${y-11}"/>`;
      if(cl)s+=`<line class="dl ${pw?'on':''}" x1="${cx-8}" y1="${y}" x2="${cx+8}" y2="${y}" stroke-dasharray="2 2"/>`;
      s+=`<text class="dt ${I[c.id]?'on':''}" x="${cx}" y="${y-16}" text-anchor="middle">${tagI(c.id)}</text><text class="ds" x="${cx}" y="${y+24}" text-anchor="middle">${c.nc?'NC':'NO'}</text>`;
      pw=pw&&cl;x=cx+8});
    s+=`<line class="dl ${pw?'on':''}" x1="${x}" y1="${y}" x2="${xj}" y2="${y}"/>`});
  if(br.length>1)s+=`<line class="dl ${out?'on':''}" x1="${xj}" y1="${y0}" x2="${xj}" y2="${y0+(br.length-1)*rowH}"/>`;
  s+=`<line class="dl ${out?'on':''}" x1="${xj}" y1="${y0}" x2="${coilX-14}" y2="${y0}"/>`;
  s+=`<path class="dl ${out?'on':''}" d="M${coilX-6},${y0-13} a16,16 0 0,0 0,26 M${coilX+6},${y0-13} a16,16 0 0,1 0,26"/>`;
  s+=`<text class="dt ${out?'on':''}" x="${coilX}" y="${y0+30}" text-anchor="middle">${tagO(g.coil)}</text>`;
  s+=`<line class="dl" x1="${coilX+14}" y1="${y0}" x2="${R}" y2="${y0}"/></svg>`;return s}
function optList(arr,sel){return arr.map(o=>`<option value="${o.id}" ${o.id===sel?'selected':''}>${o.tag} – ${esc(o.name)}</option>`).join('')}
function renderProgEditor(){
  document.querySelectorAll('[data-pmode]').forEach(b=>b.classList.toggle('on',b.dataset.pmode===P.mode));
  $('#addRuleBtn').textContent=P.mode==='block'?'＋ Add logic block':'＋ Add rung';
  $('#editorTitle').textContent=P.mode==='block'?'Block logic program':'Ladder logic program';
  let h='';
  if(P.mode==='block'){
    if(!P.blocks.length)h='<p class="small">No logic blocks. Press “Add logic block”.</p>';
    P.blocks.forEach((r,i)=>{h+=`<div class="pcard" data-rule="${r.id}"><div class="prow"><span class="ttl">Block ${i+1}</span>
      <label>Gate <select data-f="gate">${['OR','AND','NOR','NAND'].map(g=>`<option ${g===r.gate?'selected':''}>${g}</option>`).join('')}</select></label>
      <label>Delay (s) <input type="number" data-f="delay" min="0" max="60" step="1" value="${r.delay}" style="width:60px"></label>
      <label>Output <select data-f="out">${optList(OUTPUTS,r.out)}</select></label>
      <button type="button" class="xbtn" data-act="delrule">Delete</button></div>
      <div class="diag" data-diag="${r.id}"></div>
      <div class="ingrid">${INPUTS.map(inp=>{const x=r.ins.find(z=>z.id===inp.id);return`<label><input type="checkbox" data-in="${inp.id}" ${x?'checked':''}> ${inp.tag}<span class="notl"><input type="checkbox" data-not="${inp.id}" ${x&&x.not?'checked':''} aria-label="NOT ${inp.tag}"> NOT</span></label>`}).join('')}</div></div>`});
    h+=`<p class="small">Multiple blocks driving the same output are OR'd together. Delay applies a timer (TON) between the gate and the output – live simulation only; program checks use the final (steady-state) result.</p>`;
  }else{
    if(!P.rungs.length)h='<p class="small">No rungs. Press “Add rung”.</p>';
    P.rungs.forEach((g,i)=>{h+=`<div class="pcard" data-rung="${g.id}"><div class="prow"><span class="ttl">Rung ${i+1}</span>
      <label>Coil <select data-f="coil">${optList(OUTPUTS,g.coil)}</select></label>
      <button type="button" data-act="addbr">＋ Parallel branch (OR)</button><button type="button" class="xbtn" data-act="delrung">Delete rung</button></div>
      <div class="diag" data-diag="${g.id}"></div>`;
      g.branches.forEach((b,bi)=>{h+=`<div class="branch" data-br="${bi}"><b>Branch ${bi+1}</b> <span class="small">(series = AND)</span>
        ${b.map((c,ci)=>`<button type="button" class="chip ${c.nc?'nc':''}" data-act="tog" data-c="${ci}" title="Click to toggle NO / NC">${c.nc?'NC':'NO'} ${tagI(c.id)}</button><button type="button" class="xbtn" data-act="rmc" data-c="${ci}" aria-label="Remove contact">✕</button>`).join('')}
        <select data-addsel aria-label="Contact to add">${optList(INPUTS,'')}</select><button type="button" data-act="addc">Add contact</button>
        ${g.branches.length>1?'<button type="button" class="xbtn" data-act="rmbr">Remove branch</button>':''}</div>`});
      h+=`</div>`});
    h+=`<p class="small">NO = normally-open contact (closes when the device is in alarm). NC = normally-closed contact (opens when the device is in alarm). Contacts in a branch are in series (AND); parallel branches are OR.</p>`;
  }
  $('#progEditor').innerHTML=h;updateLive();
}
function renderInputs(){$('#inList').innerHTML=INPUTS.map(i=>`<button type="button" class="inbtn ${i.sup?'sup':''} ${P.I[i.id]?'on':''}" data-inp="${i.id}" aria-pressed="${!!P.I[i.id]}"><b>${i.tag}</b><span>${esc(i.name)}</span><span class="st">${P.I[i.id]?(i.sup?'SUPV':'ALARM'):'NORMAL'}</span></button>`).join('')}
function updateLive(){
  const O=computeOut(P.I,false);
  $('#outList').innerHTML=OUTPUTS.map(o=>`<div class="outrow"><span class="lamp ${O[o.id]?'on':''}"></span><b>${o.tag}</b><span>${esc(o.name)}</span><span style="margin-left:auto;font-weight:700">${O[o.id]?'ON':'OFF'}</span></div>`).join('');
  if(P.mode==='block')P.blocks.forEach(r=>{const d=document.querySelector(`[data-diag="${r.id}"]`);if(d)d.innerHTML=blockSVG(r,P.I)});
  else P.rungs.forEach(g=>{const d=document.querySelector(`[data-diag="${g.id}"]`);if(d)d.innerHTML=rungSVG(g,P.I)});
}
function renderChallenge(){$('#chSel').innerHTML=CH.map((c,i)=>`<option value="${i}" ${i===P.ch?'selected':''}>${c.t}${state.done['prog'+i]?' ✔':''}</option>`).join('');$('#chDesc').innerHTML=CH[P.ch].d}
function checkProgram(){
  const ch=CH[P.ch];const R=[];const mism=[];
  for(let m=0;m<256;m++){const I={};INPUTS.forEach((inp,k)=>I[inp.id]=!!(m&(1<<k)));const got=computeOut(I,true),exp=ch.f(I);
    ch.outs.forEach(o=>{if(!!got[o]!==!!exp[o])mism.push({m,I,o,exp:!!exp[o],got:!!got[o]})})}
  const pc=x=>{let c=0;while(x){c+=x&1;x>>=1}return c};mism.sort((a,b)=>pc(a.m)-pc(b.m));
  if(P.mode==='ladder'){const cnt={};P.rungs.forEach(g=>cnt[g.coil]=(cnt[g.coil]||0)+1);Object.entries(cnt).filter(([k,v])=>v>1).forEach(([k])=>R.push(INFO(`${tagO(k)} is used as a coil in more than one rung. This simulator ORs them, but on most PLC-style processors the last rung wins — use parallel branches instead.`)))}
  if(!mism.length){R.unshift({k:'pass',m:`✔ PASS – all 256 input combinations produce the correct ${ch.outs.map(tagO).join(', ')} response.`});markDone('prog'+P.ch)}
  else{const pick=[],outsSeen=new Set();mism.forEach(x=>{if(!outsSeen.has(x.o)){outsSeen.add(x.o);pick.push(x)}});mism.forEach(x=>{if(pick.length<5&&!pick.includes(x))pick.push(x)});
    pick.slice(0,5).forEach(x=>{const act=INPUTS.filter(i=>x.I[i.id]).map(i=>i.tag);R.push(F(`${act.length?'With '+act.join(' + ')+' active':'With all inputs NORMAL'}: ${tagO(x.o)} should be ${x.exp?'ON':'OFF'}, your program gives ${x.got?'ON':'OFF'}.`))});
    R.unshift(F(`${mism.length} incorrect output state(s) found across 256 tested input combinations. First problems:`))}
  $('#progRes').innerHTML=R.map(r=>`<li class="${r.k}">${r.k==='ok'?'✔ ':r.k==='fail'?'✖ ':r.k==='info'?'ℹ ':''}${esc(r.m)}</li>`).join('');renderChallenge();
}
function findRule(el){const c=el.closest('[data-rule]');return c?P.blocks.find(r=>r.id==c.dataset.rule):null}
function findRung(el){const c=el.closest('[data-rung]');return c?P.rungs.find(r=>r.id==c.dataset.rung):null}

/* ---------------- Help / progress ---------------- */
function renderHelp(){
  const rows=TASKS.map(t=>`<tr><td>${t[1]}</td><td style="font-weight:700;color:${state.done[t[0]]?'var(--ok)':'var(--muted)'}">${state.done[t[0]]?'✔ Complete':'Not yet'}</td></tr>`).join('');
  const n=TASKS.filter(t=>state.done[t[0]]).length;
  $('#helpView').innerHTML=`<h2>Your progress – ${n}/${TASKS.length} (${Math.round(n/TASKS.length*100)}%)</h2>
  <table><tr><th>Task</th><th>Status</th></tr>${rows}</table>
  <p class="small">${SCORM.api?'Connected to the LMS – your score is reported automatically.':'Running stand-alone – progress is saved in this browser only. Use Save to file to keep your work.'}</p>
  <h2>How to use</h2>
  <ol><li><b>Wire mode:</b> click a terminal, then the destination terminal to install a conductor. Wires are routed automatically around devices and show a hump where they cross another conductor. Click a wire to remove it; <b>Tidy wires</b> re-routes everything.</li>
  <li><b>Zoom:</b> use − / Fit / + to enlarge the drawing; scroll to move around.</li>
  <li><b>Addresses:</b> on addressable tabs, click the <b>ADDR?</b> badge on each device/module and set the address shown in the Device Address List.</li>
  <li><b>Check wiring:</b> verifies continuity, polarity, Class A/B termination, EOL placement, zoning, isolators, DCLB branch, sprinkler switches with box tampers, relay/door holder circuit, NAC and addressing.</li>
  <li><b>Test mode:</b> operate devices and switches, remove box covers, open conductors and (addressable) apply shorts. Watch the FACP display, signals, isolators and door holder.</li>
  <li><b>Multimeter:</b> in Test mode, press <b>Multimeter</b> to bring out a handheld meter with draggable probes (see below).</li>
  <li><b>Panel Programming:</b> build the sequence of operations in block or ladder logic and check it against each challenge.</li>
  <li><b>Saving your work:</b> press <b>Save to file</b> (top right) to download a save file containing your wiring, addresses, programs and completed tasks. Next time, press <b>Load save</b> and choose that file. If downloads are blocked, copy the save code shown and paste it back in later.</li>
  <li><b>More room:</b> use <b>Minimize</b> on the Task card to hide the instructions while you wire.</li></ol>
  <h2>Multimeter</h2>
  <p>In Test mode press <b>Multimeter</b> in the toolbar. A handheld meter appears over the drawing – drag it by its yellow holster to move it. Turn the rotary dial (click a setting or the knob) to <b>V DC</b>, <b>Ω</b> or <b>A DC</b>. Drag the RED and BLACK probe tips onto terminals or conductors – they snap to the nearest terminal. You can also click a probe to pick it up, then click a terminal to place it. ⟲ returns the probes to the meter (and replaces a blown fuse). Readings update live as you operate devices, open conductors or remove covers.</p>
  <ul><li><b>Voltmeter:</b> DC voltage from RED to COM. Try across an EOL resistor in normal and in alarm, or across NAC 1 in standby (reverse-polarity supervision reads negative) and in alarm.</li>
  <li><b>Ohmmeter:</b> only on a de-energized circuit – press <b>Power down panel</b>, or lift the conductors at the panel with Open conductor. A healthy Class B circuit reads the 22.7 kΩ EOL from the panel end; an open circuit reads OL.</li>
  <li><b>Ammeter:</b> with the dial on A DC, drop a probe on a conductor – the conductor is opened and the meter inserted in series to read the circuit current. The red lead moves to the <b>A</b> jack. Putting the ammeter probes across a source blows the meter fuse.</li></ul>
  <p class="small">Meter values come from a simplified training model (24 VDC circuits, typical standby and alarm loads, 22.7 kΩ EOL resistors). Real values depend on the panel and devices – always use the manufacturer's data.</p>
  <h2>Quick reference</h2>
  <table><tr><th>Circuit</th><th>Termination</th><th>Single open</th></tr>
  <tr><td>Conventional Class B zone</td><td>Zone EOL resistor (22.7 kΩ) after the last device</td><td>Trouble; devices beyond the open are lost</td></tr>
  <tr><td>Conventional Class A zone</td><td>Returns to the zone's A terminals, no field EOL</td><td>Trouble; all devices still operate</td></tr>
  <tr><td>Sprinkler switch zone / module IDC</td><td>Switch → box tamper (series) → EOL (Class B) or return (Class A)</td><td>Trouble (also when the box cover is removed)</td></tr>
  <tr><td>DCLC (addressable)</td><td>Loop returns to SLC RET</td><td>Trouble; all devices still communicate</td></tr>
  <tr><td>DCLB (addressable branch)</td><td>Ends at last device, no EOL</td><td>Trouble; devices beyond the open are lost</td></tr>
  <tr><td>Door holder (relay module)</td><td>AUX 24VDC + → COM → NC → DH-1 → AUX ${MINUS}</td><td>Fail-safe: loss of power releases the door</td></tr>
  <tr><td>NAC Class B</td><td>NAC EOL resistor (22.7 kΩ) after the last appliance</td><td>Trouble; appliances beyond the open do not operate</td></tr>
  <tr><td>NAC Class A</td><td>Returns to NAC A terminals, no field EOL</td><td>Trouble; all appliances still operate</td></tr></table>
  <h2>Zones, silence and resound</h2>
  <ul><li><b>Conventional:</b> each fire zone has its own initiating zone circuit. The first device to alarm shorts (clamps) the zone; the panel latches that zone and <b>no other device on the same zone can report</b> until System Reset. A different zone can still report.</li>
  <li><b>Silence / resound:</b> after Signal Silence, a subsequent alarm in a zone <b>already in alarm</b> does not resound the signals. An alarm in a <b>new zone</b> resounds them. Confirm current requirements in CAN/ULC-S527 and the panel manufacturer's documentation.</li></ul>
  <h2>Addressable panel troubles</h2>
  <table><tr><th>Trouble</th><th>Cause</th></tr>
  <tr><td>MISSING DEVICE</td><td>A programmed address is not responding (not wired, open/isolated, or set to a different address)</td></tr>
  <tr><td>DUPLICATE ADDRESS</td><td>Two devices set to the same address</td></tr>
  <tr><td>TYPE MISMATCH</td><td>Device type at that address differs from the programmed type</td></tr>
  <tr><td>UNPROGRAMMED DEVICE</td><td>A device answers at an address that is not in the panel program</td></tr>
  <tr><td>INVALID ADDRESS 000</td><td>Device left unaddressed</td></tr>
  <tr><td>OPEN CIRCUIT – MODULE IDC</td><td>Monitor module IDC not wired, open, missing its EOL, or box cover removed</td></tr>
  <tr><td>LOCATION MISMATCH</td><td>Training aid: correct type but not the device programmed for that address. A real panel cannot detect this — the alarm would report the wrong location.</td></tr></table>
  <h2>Signals</h2><p>NAC 1 sounds the temporal-3 evacuation pattern and the strobe flashes once per second. Use <b>Sound: ON/OFF</b> on the panel to mute audio.</p>
  <p class="small">This simulator is a training aid. Always follow CAN/ULC-S524, CAN/ULC-S527, CAN/ULC-S537, the Canadian Electrical Code and the manufacturer's published installation instructions.</p>
  <h2>Settings</h2>
  <label><input type="checkbox" id="setFloor" ${state.settings.floorIso?'checked':''}> Addressable tabs: enforce isolator placement rules</label>
  <p><button type="button" class="btn" id="resetProg">Reset my progress</button></p>`;
}

/* ---------------- Tabs ---------------- */
function renderTabs(){$('#tabs').innerHTML=TABS.map(([k,l])=>{let done='';
  if(k==='prog')done=[0,1,2,3,4,5].every(i=>state.done['prog'+i]);else if(k!=='help')done=state.done[k];
  return`<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab===k}">${l}${done?'<span class="tick">✔</span>':''}</button>`}).join('')}
function show(){renderTabs();const w=WTABS.includes(state.tab);
  $('#wireView').hidden=!w;$('#progView').hidden=state.tab!=='prog';$('#helpView').hidden=state.tab!=='help';
  if(!w){VIS.active=false;AUD.stop()}
  if(w){state.sel=null;hint('');renderWire()}else if(state.tab==='prog'){renderInputs();renderProgEditor();renderChallenge()}else renderHelp()}

/* ---------------- Events ---------------- */
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;state.tab=b.dataset.tab;show()});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;state.armed=null;state.sel=null;hint(state.mode==='test'?'Test mode – operate devices, introduce faults or take meter readings.':'Wire mode – click terminals to install conductors.');renderWire()}));
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{state.tool=b.dataset.tool;renderWire()}));
$('#meterTog').addEventListener('click',()=>{state.dmm.open=!state.dmm.open;state.armed=null;if(state.dmm.open&&state.dmm.mode==='off'){state.dmm.mode='volt'}renderPanel();if(state.dmm.open)hint('Drag the probe tips onto terminals or conductors. Drag the meter by its holster to move it.')});
function zoomStep(f){const sim=cur();const curZ=state.zoom==null?($('#stage').getBoundingClientRect().width/sim.vw):state.zoom;state.zoom=Math.min(2,Math.max(0.4,Math.round(curZ*f*100)/100));applyZoom(sim);if(meterShown())layoutMeter(sim)}
$('#zIn').addEventListener('click',()=>zoomStep(1.2));$('#zOut').addEventListener('click',()=>zoomStep(1/1.2));$('#zFit').addEventListener('click',()=>{state.zoom=null;applyZoom(cur());if(meterShown())layoutMeter(cur())});
$('#tidyBtn').addEventListener('click',()=>{const sim=cur();if(!sim.wires.length)return;pushUndo(sim);rerouteAll(sim);hint('All conductors re-routed.');renderStage()});
$('#stage').addEventListener('click',e=>{
  const meter=isMeter();
  const ad=e.target.closest('[data-addr]');if(ad){if(meter){hint('Meter probes go on terminals or conductors – click a coloured terminal dot.');return}if(state.mode==='wire')openAddr(ad.dataset.addr);else onDevice(ad.dataset.addr);return}
  const t=e.target.closest('[data-tid]');
  if(t&&state.mode==='wire'){onTerm(t.dataset.tid);return}
  if(t&&meter){const sim=cur();const{it,t:tt}=T(sim,t.dataset.tid);placeProbe(state.armed,{x:it.x+tt.dx,y:it.y+tt.dy},null);return}
  const w=e.target.closest('[data-wid]');if(w){if(meter){placeProbe(state.armed,clientToSvg(e.clientX,e.clientY),{x:e.clientX,y:e.clientY});return}onWire(w.dataset.wid);return}
  const d=e.target.closest('[data-item]');if(d&&state.mode==='test'){if(meter){hint('Meter probes go on terminals or conductors – click a coloured terminal dot.');return}onDevice(d.dataset.item);return}
  if(state.sel){state.sel=null;hint('Selection cancelled.');renderStage()}});
$('#stage').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const el=e.target;if(el.closest&&el.closest('[data-tid],[data-addr],[data-wid]')){e.preventDefault();el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}}});
$('#undoBtn').addEventListener('click',()=>{const sim=cur();const u=sim.undo.pop();if(!u){hint('Nothing to undo.');return}const o=JSON.parse(u);sim.wires=o.w;sim.seq=o.s;sim.results=null;state.sel=null;renderWire()});
function clearAlarms(sim){sim.events=[];sim.active.clear();sim.nacOn=false;sim.silenced=false;sim.zoneAlarm.clear();sim.zoneInit={};sim.alarmZones.clear()}
$('#clearBtn').addEventListener('click',()=>{const sim=cur();if(!sim.wires.length)return;pushUndo(sim);sim.wires=[];sim.results=null;sim.shorts.clear();sim.coverOff.clear();clearAlarms(sim);sim.probes={red:{},black:{}};state.sel=null;hint('All conductors removed (Undo restores them).');renderWire()});
$('#checkBtn').addEventListener('click',()=>{const sim=cur();sim.results=sim.kind==='conv'?checkConv(sim):checkAddr(sim);
  if(!sim.results.some(r=>r.k==='fail'))markDone(sim.key);else hint('Some requirements are not met – see Wiring check.');renderWire()});
$('#gaBtn').addEventListener('click',()=>{const sim=cur();if(sim.powerOff){toast('The panel is powered down.');return}triggerGA(sim,'Manual general alarm',null);renderStage();renderPanel()});
$('#silBtn').addEventListener('click',()=>{const sim=cur();if(sim.powerOff||!sim.nacOn)return;sim.silenced=true;sim.log.unshift('Signal silence – NAC 1 de-energized');renderStage();renderPanel()});
$('#sndBtn').addEventListener('click',()=>{AUD.toggleMute();renderPanel()});
$('#resetBtn').addEventListener('click',()=>{const sim=cur();if(sim.powerOff){toast('The panel is powered down.');return}clearAlarms(sim);sim.log.unshift('System reset – zones restored');renderStage();renderPanel()});
$('#clrFaultBtn').addEventListener('click',()=>{const sim=cur();sim.wires.forEach(w=>w.open=false);sim.shorts.clear();sim.coverOff.clear();sim.log.unshift('All faults repaired');renderStage();renderPanel()});
$('#pwrBtn').addEventListener('click',()=>{const sim=cur();sim.powerOff=!sim.powerOff;
  if(sim.powerOff)sim.log.unshift('Panel powered down (AC + battery disconnected)');
  else{clearAlarms(sim);sim.log.unshift('Panel power restored – system restarted, alarms cleared')}
  renderStage();renderPanel()});
$('#addrOk').addEventListener('click',setAddr);$('#addrCancel').addEventListener('click',closeAddr);
$('#addrIn').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setAddr()}if(e.key==='Escape')closeAddr()});
document.querySelectorAll('[data-pmode]').forEach(b=>b.addEventListener('click',()=>{P.mode=b.dataset.pmode;$('#progRes').innerHTML='';renderProgEditor()}));
$('#addRuleBtn').addEventListener('click',()=>{if(P.mode==='block')P.blocks.push({id:P.nid++,out:'NAC1',gate:'OR',ins:[],delay:0});else P.rungs.push({id:P.nid++,coil:'NAC1',branches:[[]]});renderProgEditor()});
$('#clearProgBtn').addEventListener('click',()=>{if(P.mode==='block')P.blocks=[];else P.rungs=[];$('#progRes').innerHTML='';renderProgEditor()});
$('#inList').addEventListener('click',e=>{const b=e.target.closest('[data-inp]');if(!b)return;P.I[b.dataset.inp]=!P.I[b.dataset.inp];renderInputs();updateLive()});
$('#allNormBtn').addEventListener('click',()=>{P.I={};renderInputs();updateLive()});
$('#chSel').addEventListener('change',e=>{P.ch=Number(e.target.value);$('#chDesc').innerHTML=CH[P.ch].d;$('#progRes').innerHTML=''});
$('#chkProg').addEventListener('click',checkProgram);
$('#progEditor').addEventListener('change',e=>{const el=e.target;
  if(P.mode==='block'){const r=findRule(el);if(!r)return;
    if(el.dataset.f==='gate')r.gate=el.value;else if(el.dataset.f==='out')r.out=el.value;
    else if(el.dataset.f==='delay'){let v=Math.round(Number(el.value));if(!Number.isFinite(v)||v<0)v=0;if(v>60)v=60;r.delay=v;el.value=v}
    else if(el.dataset.in){const id=el.dataset.in;if(el.checked){if(!r.ins.find(x=>x.id===id))r.ins.push({id,not:false})}else r.ins=r.ins.filter(x=>x.id!==id)}
    else if(el.dataset.not){const id=el.dataset.not;let x=r.ins.find(z=>z.id===id);if(!x&&el.checked){x={id,not:true};r.ins.push(x)}else if(x)x.not=el.checked}
    r.ins.sort((a,b)=>INPUTS.findIndex(i=>i.id===a.id)-INPUTS.findIndex(i=>i.id===b.id));P.since[r.id]=0;renderProgEditor()}
  else{const g=findRung(el);if(!g)return;if(el.dataset.f==='coil'){g.coil=el.value;updateLive()}}});
$('#progEditor').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='delrule'){const r=findRule(b);P.blocks=P.blocks.filter(x=>x!==r)}
  else{const g=findRung(b);if(!g)return;const br=b.closest('[data-br]');const bi=br?Number(br.dataset.br):-1;
    if(a==='delrung')P.rungs=P.rungs.filter(x=>x!==g);
    else if(a==='addbr')g.branches.push([]);
    else if(a==='rmbr')g.branches.splice(bi,1);
    else if(a==='addc'){const sel=br.querySelector('[data-addsel]');g.branches[bi].push({id:sel.value,nc:false})}
    else if(a==='rmc')g.branches[bi].splice(Number(b.dataset.c),1);
    else if(a==='tog'){const c=g.branches[bi][Number(b.dataset.c)];c.nc=!c.nc}}
  renderProgEditor()});
$('#helpView').addEventListener('change',e=>{if(e.target.id==='setFloor'){state.settings.floorIso=e.target.checked;saveLocal();Object.values(state.sims).forEach(s=>{if(s.kind==='addr')s.results=null})}});
$('#helpView').addEventListener('click',e=>{if(e.target.id==='resetProg'){state.done={};saveLocal();SCORM.report(0,false);updateProgress();renderHelp();toast('Progress reset')}});
setInterval(()=>{if(state.tab==='prog'&&P.mode==='block'&&P.blocks.some(r=>r.delay>0))updateLive()},250);
window.addEventListener('pagehide',()=>SCORM.finish());

/* ---------------- Task panel minimize ---------------- */
function applyTaskMin(){const m=!!state.settings.taskMin;$('#taskCard').classList.toggle('min',m);$('#task').hidden=m;
  const b=$('#taskTog');b.textContent=m?'▾ Show task':'▴ Minimize';b.setAttribute('aria-expanded',String(!m))}
$('#taskTog').addEventListener('click',()=>{state.settings.taskMin=!state.settings.taskMin;saveLocal();applyTaskMin()});

/* ---------------- Save file export / import ---------------- */
function snapshot(){const sims={};
  WTABS.forEach(k=>{const s=state.sims[k];if(!s||(!s.wires.length&&!Object.keys(s.addr).length))return;
    sims[k]={wires:s.wires.map(w=>({a:w.a,b:w.b,open:!!w.open})),addr:Object.assign({},s.addr),coverOff:[...s.coverOff]}});
  return{app:'fasim',version:8,saved:new Date().toISOString(),tab:state.tab,done:Object.assign({},state.done),settings:Object.assign({},state.settings),sims,
    prog:{mode:P.mode,ch:P.ch,blocks:P.blocks.map(r=>({out:r.out,gate:r.gate,delay:r.delay,ins:r.ins.map(x=>({id:x.id,not:!!x.not}))})),
      rungs:P.rungs.map(g=>({coil:g.coil,branches:g.branches.map(b=>b.map(c=>({id:c.id,nc:!!c.nc})))}))}}}
function summary(o){const n=TASKS.filter(t=>o.done&&o.done[t[0]]).length;const w=WTABS.filter(k=>o.sims&&o.sims[k]).map(k=>`${TABS.find(t=>t[0]===k)[1]} (${o.sims[k].wires.length} wires)`);
  const d=o.saved?new Date(o.saved):null;
  return`<b>${n} of ${TASKS.length}</b> tasks complete${d&&!isNaN(d)?` • saved ${esc(d.toLocaleString())}`:''}<br>${w.length?'Wiring in progress: '+esc(w.join(', ')):'No wiring in progress'}<br>Program: ${o.prog?((o.prog.mode==='ladder'?o.prog.rungs.length+' ladder rung(s)':o.prog.blocks.length+' logic block(s)')):'none'}`}
function fileName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return`FireAlarmSim_save_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`}
function download(txt){try{const blob=new Blob([txt],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName();a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1500);return true}catch(e){return false}}
let lastExport='';
$('#expBtn').addEventListener('click',()=>{const o=snapshot();lastExport=JSON.stringify(o);const ok=download(lastExport);
  $('#expSum').innerHTML=summary(o);$('#expTxt').value=lastExport;$('#expMsg').className='msg'+(ok?'':' bad');$('#expMsg').textContent=ok?'':'The download could not start – use “Copy save code”.';$('#expDlg').hidden=false;$('#expClose').focus()});
$('#expDl').addEventListener('click',()=>{download(lastExport)});
$('#expCopy').addEventListener('click',async()=>{const ta=$('#expTxt');let ok=false;try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ta.focus();ta.select();ok=document.execCommand('copy')}catch(e2){}}
  $('#expMsg').className='msg '+(ok?'good':'bad');$('#expMsg').textContent=ok?'Save code copied to the clipboard.':'Copy blocked – select the text in the box and press Ctrl+C.';if(!ok){ta.focus();ta.select()}});
$('#expClose').addEventListener('click',()=>{$('#expDlg').hidden=true});
function impErr(m){$('#impMsg').className='msg bad';$('#impMsg').textContent=m}
$('#impBtn').addEventListener('click',()=>{$('#impTxt').value='';$('#impMsg').textContent='';$('#impMsg').className='msg';$('#impFile').value='';$('#impDlg').hidden=false;$('#impPick').focus()});
$('#impCancel').addEventListener('click',()=>{$('#impDlg').hidden=true});
$('#impPick').addEventListener('click',()=>$('#impFile').click());
$('#impFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
  if(f.size>2e6){impErr('That file is too large to be a simulator save.');return}
  const r=new FileReader();r.onload=()=>loadSave(String(r.result||''));r.onerror=()=>impErr('The file could not be read.');r.readAsText(f)});
$('#impGo').addEventListener('click',()=>{const t=$('#impTxt').value.trim();if(!t){impErr('Paste a save code first, or choose a save file.');return}loadSave(t)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#expDlg').hidden)$('#expDlg').hidden=true;if(!$('#impDlg').hidden)$('#impDlg').hidden=true}});
function validTid(sim,tid){if(typeof tid!=='string')return false;const i=tid.indexOf('.');if(i<1)return false;const it=sim.map[tid.slice(0,i)];return!!(it&&it.terms.some(t=>t.id===tid.slice(i+1)))}
function loadSave(txt){
  let o;try{o=JSON.parse(txt)}catch(e){impErr('This is not a valid save file (could not read it).');return}
  if(!o||typeof o!=='object'||o.app!=='fasim'){impErr('This file was not created by the Fire Alarm Simulator.');return}
  let skipped=0;state.sims={};
  WTABS.forEach(k=>{const d=o.sims&&o.sims[k];if(!d)return;const sim=getSim(k);const used=new Set();
    (Array.isArray(d.wires)?d.wires:[]).forEach(w=>{if(!w||!validTid(sim,w.a)||!validTid(sim,w.b)||w.a===w.b||used.has(w.a)||used.has(w.b)||w.a.split('.')[0]===w.b.split('.')[0]){skipped++;return}
      used.add(w.a);used.add(w.b);sim.wires.push({id:'w'+(++sim.seq),a:w.a,b:w.b,open:!!w.open})});
    if(d.addr&&typeof d.addr==='object')Object.entries(d.addr).forEach(([id,a])=>{const v=Number(a);if(sim.map[id]&&sim.map[id].addressable&&Number.isInteger(v)&&v>=1&&v<=159)sim.addr[id]=v});
    (Array.isArray(d.coverOff)?d.coverOff:[]).forEach(id=>{if(sim.map[id]&&sim.map[id].type==='ser')sim.coverOff.add(id)})});
  state.done={};if(o.done)TASKS.forEach(t=>{if(o.done[t[0]])state.done[t[0]]=true});
  if(o.settings){state.settings.floorIso=o.settings.floorIso!==false;state.settings.taskMin=!!o.settings.taskMin}
  const okI=id=>INPUTS.some(i=>i.id===id),okO=id=>OUTPUTS.some(x=>x.id===id);
  if(o.prog){const pr=o.prog;P.mode=pr.mode==='ladder'?'ladder':'block';P.ch=Number.isInteger(pr.ch)&&pr.ch>=0&&pr.ch<CH.length?pr.ch:0;P.I={};P.since={};
    P.blocks=(Array.isArray(pr.blocks)?pr.blocks:[]).filter(r=>r&&okO(r.out)).map(r=>({id:P.nid++,out:r.out,gate:['OR','AND','NOR','NAND'].includes(r.gate)?r.gate:'OR',
      delay:Math.min(60,Math.max(0,Math.round(Number(r.delay)||0))),ins:(Array.isArray(r.ins)?r.ins:[]).filter(x=>x&&okI(x.id)).map(x=>({id:x.id,not:!!x.not}))}));
    P.rungs=(Array.isArray(pr.rungs)?pr.rungs:[]).filter(g=>g&&okO(g.coil)).map(g=>({id:P.nid++,coil:g.coil,branches:(Array.isArray(g.branches)&&g.branches.length?g.branches:[[]]).map(b=>(Array.isArray(b)?b:[]).filter(c=>c&&okI(c.id)).map(c=>({id:c.id,nc:!!c.nc})))}))}
  if(TABS.some(t=>t[0]===o.tab))state.tab=o.tab;
  state.mode='wire';state.sel=null;
  saveLocal();const n=TASKS.filter(t=>state.done[t[0]]).length;SCORM.report(Math.round(n/TASKS.length*100),n===TASKS.length);
  updateProgress();show();$('#progRes').innerHTML='';
  $('#impDlg').hidden=true;toast(`✔ Save loaded – ${n} of ${TASKS.length} tasks complete${skipped?` (${skipped} conductor${skipped>1?'s':''} no longer match this version and were skipped)`:''}`);
}

loadLocal();SCORM.init();updateProgress();show();
window.__fasim={state,P,cur,placeProbe,clientToSvg,svgToLocal,status,meterRead,AUD,VIS,CH,computeOut,rerouteAll,snapshot,loadSave};
})();
