// ═══════════════════════════════════════════════
//  AZ-kvíz-up  ·  game.js
// ═══════════════════════════════════════════════

// ── CONSTANTS ──
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
const DEF_NAMES = ['Tým Červení','Tým Modří','Tým Zelení','Tým Oranžoví','Tým Fialový','Tým Tyrkysový'];
const PU_INFO = {
  shield: { icon:'🛡️', name:'Štít',   desc:'Tým získává imunitu proti jednomu útoku. Moderátor mu přidá 1 štít.' },
  bomb:   { icon:'💣', name:'Bomba',  desc:'Tým musí okamžitě zničit jedno libovolné políčko soupeře (stane se volným).' },
  ghost:  { icon:'👻', name:'Duch',   desc:'Tým může okamžitě ukrást jedno sousední políčko soupeře bez otázky.' },
  web:    { icon:'🕸️', name:'Pavučina',desc:'Past! Tým přichází o svůj příští tah.' },
};

// ── STATE ──
let CFG = { radius:3, timerSec:30, maxPowerups:6 };
let G = {
  teams: [],        // { name, score, hexCount, shields, trapped }
  hexes: {},        // key → { q,r, owner(idx|null), state:'free'|'gray'|'owned', powerup, powerupUsed, attackCount, startSide(idx|null) }
  cats: [],         // [{ name, questions:[{q,a,type,img}] }]
  allQ: [],         // flat list shuffled
  usedQIdx: new Set(),
  autoAdvance: true,
  overrideMode: false,
  currentTeam: 0,
  attackMode: false,
  pickMode: null,
  pickTargets: null,
  shieldPending: null,  // {hexKey, type, teamIdx, victimIdx}
  selectedHex: null,
  phase: 'setup',   // 'setup'|'powerup'|'game'
  puType: 'shield',
  timerMax: 30,
  timerLeft: 30,
  timerRunning: false,
  timerInterval: null,
  modPanelOpen: true,
  modBodyOpen: true,
  currentQ: null,
  currentHexKey: null,
  isDuel: false,
};

// ── HEX MATH ──
const HEX_SIZE = 36; // pixels, will be scaled

function hexKey(q,r){ return `${q},${r}`; }
function hexNeighbors(q,r){
  return [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].map(([dq,dr])=>hexKey(q+dq,r+dr));
}
function hexDist(q1,r1,q2,r2){ return (Math.abs(q1-q2)+Math.abs(r1-r2)+Math.abs(q1+r1-q2-r2))/2; }
function hexPixel(q,r,size){
  return { x: size*(Math.sqrt(3)*q + Math.sqrt(3)/2*r), y: size*(3/2*r) };
}
function hexCorners(cx,cy,size){
  return Array.from({length:6},(_,i)=>{
    const a = Math.PI/180*(60*i-30);
    return [cx+size*Math.cos(a), cy+size*Math.sin(a)];
  });
}
function hexPolygonPoints(cx,cy,size){
  return hexCorners(cx,cy,size).map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

// Generate all hex keys for radius R
function genGrid(R){
  const h={};
  for(let q=-R;q<=R;q++){
    for(let r=-R;r<=R;r++){
      if(hexDist(0,0,q,r)<=R){
        const k=hexKey(q,r);
        h[k]={ q,r, owner:null, state:'free', powerup:null, powerupUsed:false, attackCount:0, startSide:null };
      }
    }
  }
  return h;
}

// Get outer ring hexes for each of 6 sides, R hexes each
function getSides(R){
  const dirs=[[0,1],[-1,1],[-1,0],[0,-1],[1,-1],[1,0]];
  const corners=[[R,-R],[R,0],[0,R],[-R,R],[-R,0],[0,-R]];
  return corners.map((c,s)=>{
    const side=[];
    // Step PAST the corner so we get only the non-corner edge hexes
    let q=c[0]+dirs[s][0], r=c[1]+dirs[s][1];
    for(let i=0;i<R-1;i++){
      side.push(hexKey(q,r));
      q+=dirs[s][0]; r+=dirs[s][1];
    }
    return side;
  });
}

// Assign sides to N teams
function assignSides(N){
  // evenly space sides: floor(6*i/N)
  return Array.from({length:N},(_,i)=>Math.floor(6*i/N));
}

// Win check: BFS from team's start hexes; can they reach (0,0)?
function checkWin(teamIdx){
  const startKeys = Object.values(G.hexes)
    .filter(h=>h.startSide===assignSides(G.teams.length)[teamIdx] && h.owner===teamIdx)
    .map(h=>hexKey(h.q,h.r));
  if(!startKeys.length) return false;
  const visited=new Set(startKeys);
  const queue=[...startKeys];
  while(queue.length){
    const k=queue.shift();
    if(k===hexKey(0,0)) return true;
    const {q,r}=G.hexes[k];
    hexNeighbors(q,r).forEach(nk=>{
      if(!visited.has(nk) && G.hexes[nk] && G.hexes[nk].owner===teamIdx){
        visited.add(nk); queue.push(nk);
      }
    });
  }
  return false;
}

// ── CSV PARSING ──
function parseCSV(text){
  const lines=text.split(/\r?\n/);
  return lines.map(line=>{
    const row=[]; let cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"') inQ=!inQ;
      else if(c===',' && !inQ){ row.push(cur.trim()); cur=''; }
      else cur+=c;
    }
    row.push(cur.trim()); return row;
  });
}

function loadFileIntoQ(file, catName){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{
      const rows=parseCSV(e.target.result).slice(1).filter(r=>r.some(c=>c.trim()));
      const qs=rows.map(r=>({
        q: String(r[0]||'').trim(),
        a: String(r[1]||'').trim(),
        type: String(r[2]||'normal').trim().toLowerCase(),
        img: String(r[3]||'').trim(),
      })).filter(q=>q.q && q.a);
      res({ name:catName, questions:qs });
    };
    r.readAsText(file,'UTF-8');
  });
}

// ── SETUP SCREEN ──
let loadedFiles=[]; // { file, name }

function initSetup(){
  initTeams(2);
  document.getElementById('cfg-radius').addEventListener('input',updateHexCountLabel);
  document.getElementById('file-input').addEventListener('change',handleFileInput);
  const uz=document.getElementById('upload-zone');
  uz.addEventListener('dragover',e=>{e.preventDefault();uz.classList.add('over');});
  uz.addEventListener('dragleave',()=>uz.classList.remove('over'));
  uz.addEventListener('drop',e=>{
    e.preventDefault(); uz.classList.remove('over');
    [...e.dataTransfer.files].filter(f=>f.name.endsWith('.csv')).forEach(addFile);
  });
  updateHexCountLabel();
  updateStartBtn();
}

function updateHexCountLabel(){
  const R=parseInt(document.getElementById('cfg-radius').value)||3;
  const count=3*R*R+3*R+1;
  document.getElementById('hex-count-lbl').textContent=`${count} políček`;
}

function handleFileInput(e){
  [...e.target.files].filter(f=>f.name.endsWith('.csv')).forEach(addFile);
  e.target.value='';
}

function addFile(file){
  if(loadedFiles.find(f=>f.file.name===file.name)) return;
  const name=file.name.replace(/\.csv$/i,'');
  loadedFiles.push({file,name});
  renderFileList();
  updateStartBtn();
}

function removeFile(idx){
  loadedFiles.splice(idx,1);
  renderFileList();
  updateStartBtn();
}

function renderFileList(){
  const el=document.getElementById('file-list');
  el.innerHTML=loadedFiles.map((f,i)=>`
    <div class="file-item">
      📄 ${esc(f.name)}
      <span class="fi-rm" onclick="removeFile(${i})">✕</span>
    </div>`).join('');
}

function initTeams(n){
  G.teams=Array.from({length:n},(_,i)=>({name:DEF_NAMES[i],score:0,hexCount:0,shields:0,trapped:false,powerups:[]}));
  renderTeamRows();
  updateTeamBar();
}
function addTeam(){ if(G.teams.length>=6)return; G.teams.push({name:DEF_NAMES[G.teams.length],score:0,hexCount:0,shields:0,trapped:false,powerups:[]}); renderTeamRows(); updateTeamBar(); }
function removeTeam(){ if(G.teams.length<=2)return; G.teams.pop(); renderTeamRows(); updateTeamBar(); }

function updateTeamBar(){
  document.getElementById('btn-add-t').disabled=G.teams.length>=6;
  document.getElementById('btn-rem-t').disabled=G.teams.length<=2;
  document.getElementById('tcount-lbl').textContent=`${G.teams.length} / 6 týmů`;
  updateSideBadges();
  updateStartBtn();
}

function updateSideBadges(){
  const sides=assignSides(G.teams.length);
  const sideNames=['Strana 1','Strana 2','Strana 3','Strana 4','Strana 5','Strana 6'];
  document.querySelectorAll('.side-badge').forEach((b,i)=>{ b.textContent=sideNames[sides[i]]; });
}

function renderTeamRows(){
  const el=document.getElementById('team-rows');
  el.innerHTML=G.teams.map((t,i)=>`
    <div class="team-row">
      <span class="tdot" style="background:${COLORS[i]}"></span>
      <input type="text" value="${esc(t.name)}" maxlength="20"
        oninput="G.teams[${i}].name=this.value">
      <span class="side-badge"></span>
    </div>`).join('');
  updateSideBadges();
}

function updateStartBtn(){
  const ok=loadedFiles.length>0;
  document.getElementById('btn-start').disabled=!ok;
  document.getElementById('setup-hint').textContent=
    ok ? '' : 'Nahrajte alespoň jeden soubor s otázkami';
}

// ── GO TO POWERUP SETUP ──
async function goToPowerupSetup(){
  // Sync team names
  document.querySelectorAll('#team-rows input').forEach((inp,i)=>G.teams[i].name=inp.value||DEF_NAMES[i]);
  CFG.radius=parseInt(document.getElementById('cfg-radius').value)||3;
  CFG.timerSec=parseInt(document.getElementById('cfg-timer').value)||30;
  CFG.maxPowerups=parseInt(document.getElementById('cfg-powerups').value)||6;
  G.timerMax=G.timerLeft=CFG.timerSec;

  // Parse CSVs
  G.cats=await Promise.all(loadedFiles.map(f=>loadFileIntoQ(f.file,f.name)));
  G.allQ=G.cats.flatMap(c=>c.questions.map(q=>({...q,cat:c.name}))).sort(()=>Math.random()-.5);

  // Build grid
  G.hexes=genGrid(CFG.radius);
  const sides=getSides(CFG.radius);
  const teamSideIdxs=assignSides(G.teams.length);
  // Auto: pick central 1 or 2 non-corner edge hexes per team side
  teamSideIdxs.forEach((sideIdx,teamIdx)=>{
    const sh=sides[sideIdx];
    const L=sh.length;                        // L = R-1 non-corner hexes
    const mid=Math.floor((L-1)/2);
    const mid2=Math.ceil((L-1)/2);
    const picked=mid===mid2?[sh[mid]]:[sh[mid],sh[mid2]];
    picked.forEach(k=>{ if(G.hexes[k]) G.hexes[k].startSide=sideIdx; });
  });

  showScreen('s-powerups');
  renderPuGrid();
}

// ── POWERUP GRID ──
let puSelectedType='shield';

function selectPuType(type, btn){
  puSelectedType=type;
  document.querySelectorAll('.pu-type-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function renderPuGrid(){
  const R=CFG.radius;
  const size=Math.min(30, 240/(R*2+1));
  const pad=size+4;
  const keys=Object.keys(G.hexes);
  const positions=keys.map(k=>{const h=G.hexes[k];return hexPixel(h.q,h.r,size);});
  const minX=Math.min(...positions.map(p=>p.x))-pad;
  const minY=Math.min(...positions.map(p=>p.y))-pad;
  const maxX=Math.max(...positions.map(p=>p.x))+pad;
  const maxY=Math.max(...positions.map(p=>p.y))+pad;
  const W=maxX-minX, H=maxY-minY;

  const svg=document.getElementById('pu-svg');
  svg.setAttribute('width',W); svg.setAttribute('height',H);
  svg.setAttribute('viewBox',`${minX} ${minY} ${W} ${H}`);
  svg.innerHTML='';

  keys.forEach(k=>{
    const h=G.hexes[k];
    const {x,y}=hexPixel(h.q,h.r,size);
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.style.cursor='pointer';
    g.addEventListener('click',()=>togglePowerup(k));

    // Determine fill color
    const sideTeam=getTeamBySide(h.startSide);
    const fill= h.powerup ? '#FFD70033' : (sideTeam!==null ? COLORS[sideTeam]+'22' : 'rgba(255,255,255,0.05)');
    const stroke= sideTeam!==null ? COLORS[sideTeam] : 'rgba(255,255,255,0.2)';

    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', hexPolygonPoints(x,y,size*.9));
    poly.setAttribute('fill', fill);
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width','1.5');
    g.appendChild(poly);

    if(h.powerup){
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',x); t.setAttribute('y',y+6);
      t.setAttribute('text-anchor','middle');
      t.setAttribute('font-size',size*.6);
      t.textContent=PU_INFO[h.powerup].icon;
      g.appendChild(t);
    }

    // Center marker
    if(h.q===0&&h.r===0){
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',3);
      c.setAttribute('fill','var(--gold)');g.appendChild(c);
    }
    svg.appendChild(g);
  });
  updatePuSummary();
}

function getTeamBySide(sideIdx){
  if(sideIdx===null) return null;
  const idxs=assignSides(G.teams.length);
  const t=idxs.indexOf(sideIdx);
  return t>=0?t:null;
}

function togglePowerup(k){
  const h=G.hexes[k];
  if(k===hexKey(0,0)) return; // can't put powerup on center
  if(puSelectedType==='none'){ h.powerup=null; }
  else {
    // Count current
    const cnt=Object.values(G.hexes).filter(x=>x.powerup).length;
    if(!h.powerup && cnt>=CFG.maxPowerups){ toast(`Max ${CFG.maxPowerups} power-upů`,'warn'); return; }
    h.powerup=puSelectedType;
  }
  renderPuGrid();
}

function clearAllPowerups(){
  Object.values(G.hexes).forEach(h=>h.powerup=null);
  renderPuGrid();
}

function updatePuSummary(){
  const cnt=Object.values(G.hexes).filter(h=>h.powerup).length;
  const byType={shield:0,bomb:0,ghost:0,web:0};
  Object.values(G.hexes).forEach(h=>{ if(h.powerup) byType[h.powerup]++; });
  document.getElementById('pu-summary').innerHTML=
    `<strong>${cnt}</strong> / ${CFG.maxPowerups} power-upů<br>`+
    Object.entries(byType).filter(([,v])=>v>0)
      .map(([k,v])=>`${PU_INFO[k].icon} ${v}× ${PU_INFO[k].name}`).join('<br>');
}

// ── START GAME ──
function startGame(){
  // Assign starting hexes ownership (visual marker only, not owned yet)
  const teamSideIdxs=assignSides(G.teams.length);
  G.teams.forEach((t,ti)=>{ t.hexCount=0; t.shields=0; t.trapped=false; t.powerups=[]; });
  G.currentTeam=0;
  G.attackMode=false;
  G.phase='game';
  G.timerLeft=G.timerMax;

  showScreen('s-game');
  renderGame();
  renderSidebar();
  renderModPanel();
  timerReset();
  updateTurnPill();
}

// ── GAME RENDERING ──
function renderGame(){
  const svg=document.getElementById('game-svg');
  const area=document.querySelector('.hex-area');
  const aW=area.clientWidth-20, aH=area.clientHeight-20;
  const R=CFG.radius;
  const maxSize=Math.min(aW,aH)/(R*2+2)/Math.sqrt(3)*1.1;
  const size=Math.max(18,Math.min(48,maxSize));

  const keys=Object.keys(G.hexes);
  const positions=keys.map(k=>{ const h=G.hexes[k]; return hexPixel(h.q,h.r,size); });
  const pad=size+6;
  const minX=Math.min(...positions.map(p=>p.x))-pad;
  const minY=Math.min(...positions.map(p=>p.y))-pad;
  const maxX=Math.max(...positions.map(p=>p.x))+pad;
  const maxY=Math.max(...positions.map(p=>p.y))+pad;
  const W=maxX-minX, H=maxY-minY;

  svg.setAttribute('width',W); svg.setAttribute('height',H);
  svg.setAttribute('viewBox',`${minX} ${minY} ${W} ${H}`);
  svg.innerHTML='';

  // Draw side label arcs (team start zones)
  const teamSideIdxs=assignSides(G.teams.length);
  const sides=getSides(R);

  keys.forEach(k=>{
    const h=G.hexes[k];
    const {x,y}=hexPixel(h.q,h.r,size);
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('data-key',k);
    g.setAttribute('class','hex-tile');

    // Fill color
    let fill, stroke, strokeW='2', strokeColor='rgba(255,255,255,0.15)';
    if(h.owner!==null){
      fill=COLORS[h.owner]+'cc';
      strokeColor=COLORS[h.owner];
      strokeW='2.5';
    } else if(h.state==='gray'){
      fill='rgba(150,150,150,0.3)';
      strokeColor='rgba(150,150,150,0.5)';
    } else {
      const ti=getTeamBySide(h.startSide);
      fill= ti!==null ? COLORS[ti]+'18' : 'rgba(255,255,255,0.04)';
      strokeColor= ti!==null ? COLORS[ti]+'66' : 'rgba(255,255,255,0.15)';
    }

    // Fortified = dashed
    const dashArray= h.attackCount>=2 ? '6 3' : 'none';

    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', hexPolygonPoints(x,y,size*0.92));
    poly.setAttribute('fill',fill);
    poly.setAttribute('stroke',strokeColor);
    poly.setAttribute('stroke-width',strokeW);
    if(dashArray!=='none') poly.setAttribute('stroke-dasharray',dashArray);
    g.appendChild(poly);

    // Center "Srdce" marker
    if(h.q===0&&h.r===0){
      const star=document.createElementNS('http://www.w3.org/2000/svg','text');
      star.setAttribute('x',x); star.setAttribute('y',y+5);
      star.setAttribute('text-anchor','middle'); star.setAttribute('font-size',size*.55);
      star.textContent='♥'; star.setAttribute('fill','var(--gold)');
      g.appendChild(star);
    }

    // Start zone label
    const ti=getTeamBySide(h.startSide);
    if(ti!==null && h.owner===null){
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',x); t.setAttribute('y',y+4);
      t.setAttribute('text-anchor','middle'); t.setAttribute('font-size',size*.4);
      t.setAttribute('fill',COLORS[ti]); t.setAttribute('font-weight','700');
      t.textContent=(ti+1).toString();
      g.appendChild(t);
    }

    // Powerup visible to audience only if revealed
    if(h.powerup && h.powerupUsed){
      const pt=document.createElementNS('http://www.w3.org/2000/svg','text');
      pt.setAttribute('x',x); pt.setAttribute('y',y+5);
      pt.setAttribute('text-anchor','middle'); pt.setAttribute('font-size',size*.5);
      pt.textContent=PU_INFO[h.powerup].icon;
      g.appendChild(pt);
    }

    // Attack count marker
    if(h.attackCount>=2){
      const xm=document.createElementNS('http://www.w3.org/2000/svg','text');
      xm.setAttribute('x',x+size*.55); xm.setAttribute('y',y-size*.45);
      xm.setAttribute('text-anchor','middle'); xm.setAttribute('font-size',size*.35);
      xm.setAttribute('fill','#e74c3c'); xm.textContent='🔒';
      g.appendChild(xm);
    }

    // Pick mode target highlight
    if(G.pickMode && G.pickTargets && G.pickTargets.has(k)){
      const pc=G.pickMode.type==='bomb'?'#e74c3c':'#9b59b6';
      poly.setAttribute('fill',pc+'55');
      poly.setAttribute('stroke',pc);
      poly.setAttribute('stroke-width','4');
      g.style.cursor='crosshair';
    } else if(G.pickMode){
      g.style.opacity='0.25';
      g.style.pointerEvents='none';
    }

    g.addEventListener('click',()=>handleHexClick(k));
    svg.appendChild(g);
  });

  // Re-render mod mini svg
  renderModMiniSvg();
}

function renderSidebar(){
  const sb=document.getElementById('sb-cards');
  sb.innerHTML=G.teams.map((t,i)=>{
    const puBadges=(t.powerups||[]).map(p=>
      `<span class="badge" style="background:rgba(255,215,0,.15);color:var(--gold);cursor:pointer;" `+
      `onclick="usePowerup(${i},'${p.type}')" title="${PU_INFO[p.type].name} – ${p.turnsLeft} tah zbývá">`+
      `${PU_INFO[p.type].icon}×${p.turnsLeft}</span>`
    ).join('');
    return `
    <div class="sb-card ${i===G.currentTeam?'active':''}" id="sbc-${i}">
      <span class="sb-dot" style="background:${COLORS[i]}"></span>
      <span class="sb-name" style="color:${COLORS[i]}">${esc(t.name)}</span>
      <span class="sb-cnt">${t.hexCount}</span>
      <span class="sb-badges">
        ${t.shields>0?'<span class="badge b-shield">🛡️×'+t.shields+'</span>':''}
        ${t.trapped?'<span class="badge b-trap">🕸️</span>':''}
        ${puBadges}
      </span>
    </div>`;
  }).join('');
}

// ── HEX CLICK ──
function handleHexClick(k){
  if(G.phase!=='game') return;
  const h=G.hexes[k];

  // Pick mode – clicking on highlighted targets on the board
  if(G.pickMode){
    if(!G.pickTargets||!G.pickTargets.has(k)){ toast('Klikni na zvýrazněné políčko','warn'); return; }
    const {type,teamIdx}=G.pickMode;
    const victimIdx=G.hexes[k]?G.hexes[k].owner:null;
    // Shield check for Bomb/Ghost
    if(victimIdx!==null&&G.teams[victimIdx]&&G.teams[victimIdx].shields>0){
      G.shieldPending={hexKey:k,type,teamIdx,victimIdx};
      cancelPickMode();
      document.getElementById('shield-ol-title').textContent=
        `🛡️ ${G.teams[victimIdx].name} má štít!`;
      document.getElementById('shield-ol-desc').textContent=
        `Chce ho použít pro obranu proti ${PU_INFO[type].name}? Tým útčnía: ${G.teams[teamIdx].name}`;
      document.getElementById('shield-overlay').classList.remove('hidden');
      return;
    }
    cancelPickMode();
    if(type==='bomb') applyBomb(k,teamIdx);
    else applyGhost(k,teamIdx);
    return;
  }

  // Override / paint mode
  if(G.overrideMode){ openOverridePicker(k); return; }

  if(G.attackMode){
    if(h.owner===G.currentTeam){ toast('To je vaše políčko!','warn'); return; }
    if(h.owner===null){ toast('Útočit lze jen na obsazená políčka soupeře.','warn'); return; }
    if(h.attackCount>=2){ toast('Toto políčko je nedobytné (2× útočeno).','err'); return; }
    const myKeys=Object.entries(G.hexes).filter(([,v])=>v.owner===G.currentTeam).map(([k])=>k);
    const myNeighborhood=new Set(myKeys.flatMap(mk=>{ const mh=G.hexes[mk]; return hexNeighbors(mh.q,mh.r); }));
    if(!myNeighborhood.has(k)){ toast('Útočit lze jen na sousední políčka.','warn'); return; }
    openQuestion(k, true);
    return;
  }

  if(h.owner!==null){ toast(G.teams[h.owner].name+' vlastní toto políčko.','warn'); return; }
  openQuestion(k, false);
}

// ── QUESTION ──
function pickQuestion(type){
  // Find unused question (prefer type match)
  const pool=G.allQ.filter((_,i)=>!G.usedQIdx.has(i));
  const typed=pool.filter(q=>q.type===type);
  const arr=typed.length?typed:pool;
  if(!arr.length) return null;
  // Any from pool
  const candidate=G.allQ.findIndex((q,i)=>!G.usedQIdx.has(i)&&(typed.length?q.type===type:true));
  if(candidate===-1) return null;
  G.usedQIdx.add(candidate);
  return G.allQ[candidate];
}

function openQuestion(hexKey, isDuel){
  G.currentHexKey=hexKey;
  G.isDuel=isDuel;
  const h=G.hexes[hexKey];
  const isGray=h.state==='gray';
  const qType=isDuel?'duel':(isGray?'normal':'normal');
  const q=pickQuestion(qType);
  G.currentQ=q;

  // Update mod
  document.getElementById('mod-ans').textContent= q ? q.a : '—';

  // Fill modal
  const typeEl=document.getElementById('qm-type');
  if(isDuel){
    typeEl.textContent='⚔️ DUEL'; typeEl.style.background='rgba(231,76,60,.2)'; typeEl.style.color='#e74c3c';
  } else if(isGray){
    typeEl.textContent='🎯 ROZSTŘEL'; typeEl.style.background='rgba(243,156,18,.2)'; typeEl.style.color='#f39c12';
  } else {
    typeEl.textContent='❓ Otázka'; typeEl.style.background='rgba(52,152,219,.15)'; typeEl.style.color='#3498db';
  }

  document.getElementById('qm-cat').textContent= q ? `(${q.cat})` : '';
  document.getElementById('qm-text').textContent= q ? q.q : 'Zásobník otázek je prázdný. Moderátor rozhoduje.';
  document.getElementById('qm-hex-info').textContent=`Políčko ${hexKey}`;

  const img=document.getElementById('qm-img');
  if(q && q.img){ img.src=q.img; img.style.display='block'; } else { img.style.display='none'; }

  document.getElementById('qans-box').style.display='none';
  document.getElementById('rozstrel-note').classList.toggle('hidden',!isGray);
  document.getElementById('duel-pick').classList.add('hidden');

  // Actions
  const act=document.getElementById('qactions');
  if(isDuel){
    // Check if the defending team has a shield
    const defenderIdx = G.hexes[hexKey] ? G.hexes[hexKey].owner : null;
    const defHasShield = defenderIdx !== null && G.teams[defenderIdx] && G.teams[defenderIdx].shields > 0;
    const shieldBtn = defHasShield
      ? `<button class="qbtn" style="background:rgba(52,152,219,.25);border:2px solid #3498db;color:#fff;"
           onclick="useShield(${defenderIdx})">🛡️ ${esc(G.teams[defenderIdx].name)} použije štít</button>`
      : '';
    act.innerHTML=`
      <button class="qbtn reveal" onclick="revealAnswer()">👁 Zobrazit odpověď</button>
      ${shieldBtn}
      <button class="qbtn cancel" onclick="closeQuestion()">✕ Zavřít</button>`;
  } else {
    act.innerHTML=`
      <button class="qbtn reveal" onclick="revealAnswer()">👁 Zobrazit odpověď</button>
      <button class="qbtn cancel" onclick="closeQuestion()">✕ Zavřít</button>`;
  }

  document.getElementById('qmodal').classList.remove('hidden');
  timerReset(); timerStart();
  syncModState();
}

function revealAnswer(){
  document.getElementById('qm-ans').textContent= G.currentQ ? G.currentQ.a : '—';
  document.getElementById('qans-box').style.display='block';
  timerPause();
  syncModState();

  const act=document.getElementById('qactions');
  if(G.isDuel){
    const picks=document.getElementById('duel-pick');
    picks.classList.remove('hidden');
    const defenderIdx=G.currentHexKey&&G.hexes[G.currentHexKey]?G.hexes[G.currentHexKey].owner:null;
    const shieldBtn=(defenderIdx!==null&&G.teams[defenderIdx]&&G.teams[defenderIdx].shields>0)
      ?`<button class="duel-team-btn" style="color:#3498db;border-color:#3498db;background:rgba(52,152,219,.15);" onclick="useShield(${defenderIdx})">🛡️ ${esc(G.teams[defenderIdx].name)} použije štít</button>`:'';
    picks.innerHTML=`<div style="font-size:.8rem;color:var(--muted);width:100%;text-align:center;margin-bottom:.3rem;">Kdo vyhrál Duel?</div>`+
      G.teams.map((t,i)=>`<button class="duel-team-btn" style="color:${COLORS[i]};border-color:${COLORS[i]};" onclick="duelOutcome(${i})">${esc(t.name)}</button>`).join('')+
      shieldBtn;
    act.innerHTML=`<button class="qbtn cancel" onclick="closeQuestion()">✕ Nikdo / Zavřít</button>`;
  } else {
    const isGray=G.currentHexKey&&G.hexes[G.currentHexKey]&&G.hexes[G.currentHexKey].state==='gray';
    if(isGray){
      // Rozstřel: pick which team buzzed correctly
      const picks=document.getElementById('duel-pick');
      picks.classList.remove('hidden');
      picks.innerHTML=`<div style="font-size:.8rem;color:var(--muted);width:100%;text-align:center;margin-bottom:.3rem;">🎯 Kdo odpověděl správně?</div>`+
        G.teams.map((t,i)=>`<button class="duel-team-btn" style="color:${COLORS[i]};border-color:${COLORS[i]};" onclick="rozstrelWinner(${i})">${esc(t.name)}</button>`).join('');
      act.innerHTML=`<button class="qbtn cancel" onclick="closeQuestion()">✕ Nikdo / Zavřít</button>`;
    } else {
      act.innerHTML=`
        <button class="qbtn correct" onclick="answerCorrect()">✓ Správně</button>
        <button class="qbtn wrong" onclick="answerWrong()">✗ Špatně</button>
        <button class="qbtn cancel" onclick="closeQuestion()">✕ Zavřít</button>`;
    }
  }
}

function answerCorrect(){
  const k=G.currentHexKey;
  const h=G.hexes[k];
  const ti=G.currentTeam;
  if(h.owner!==null) G.teams[h.owner].hexCount--;
  h.owner=ti; h.state='owned';
  G.teams[ti].hexCount++;
  closeQuestion();
  checkPowerup(k,ti);
  renderGame(); renderSidebar();
  if(checkWin(ti)){ showWin(ti,'Propojení s Srdcem plástve!'); return; }
  if(G.autoAdvance) nextTurn();
}

function answerWrong(){
  const k=G.currentHexKey;
  G.hexes[k].state='gray';
  closeQuestion();
  renderGame(); renderSidebar();
  if(G.autoAdvance) nextTurn();
}

function rozstrelWinner(teamIdx){
  const k=G.currentHexKey;
  const h=G.hexes[k];
  if(h.owner!==null) G.teams[h.owner].hexCount--;
  h.owner=teamIdx; h.state='owned';
  G.teams[teamIdx].hexCount++;
  closeQuestion();
  checkPowerup(k,teamIdx);
  renderGame(); renderSidebar();
  toast(`🎯 Rozstřel: ${G.teams[teamIdx].name} získává políčko!`,'ok');
  if(checkWin(teamIdx)){ showWin(teamIdx,'Vítěz Rozstřelu!'); return; }
  if(G.autoAdvance) nextTurn();
}

function duelOutcome(winnerIdx){
  const k=G.currentHexKey;
  const h=G.hexes[k];
  h.attackCount++;
  if(winnerIdx===G.currentTeam){
    if(h.owner!==null) G.teams[h.owner].hexCount--;
    h.owner=G.currentTeam; h.state='owned';
    G.teams[G.currentTeam].hexCount++;
    closeQuestion();
    checkPowerup(k,G.currentTeam);
  } else {
    toast(G.teams[winnerIdx].name+' ubránil políčko!','warn');
    if(h.attackCount>=2) toast('Políčko je nyní NEDOBYTNÉ 🔒','warn');
    closeQuestion();
  }
  G.attackMode=false;
  document.getElementById('atk-btn').classList.remove('on');
  document.getElementById('atk-mode-label').classList.add('hidden');
  renderGame(); renderSidebar();
  if(winnerIdx===G.currentTeam && checkWin(G.currentTeam)){ showWin(G.currentTeam,'Propojení s Srdcem plástve!'); return; }
  if(G.autoAdvance) nextTurn();
}

function closeQuestion(){
  document.getElementById('qmodal').classList.add('hidden');
  G.currentQ=null; G.currentHexKey=null;
  timerPause(); timerReset();
  syncModState();
}

function useShield(defenderIdx){
  G.teams[defenderIdx].shields--;
  toast(`🛡️ ${G.teams[defenderIdx].name} zablokoval útok štítem!`,'ok');
  G.attackMode=false;
  document.getElementById('atk-btn').classList.remove('on');
  document.getElementById('atk-mode-label').classList.add('hidden');
  closeQuestion();
  renderGame(); renderSidebar();
  if(G.autoAdvance) nextTurn();
}

function shieldDecision(useIt){
  document.getElementById('shield-overlay').classList.add('hidden');
  const p=G.shieldPending; G.shieldPending=null;
  if(!p) return;
  if(useIt){
    G.teams[p.victimIdx].shields--;
    toast(`🛡️ ${G.teams[p.victimIdx].name} zablokoval ${PU_INFO[p.type].name} štítem!`,'ok');
    renderSidebar();
  } else {
    if(p.type==='bomb') applyBomb(p.hexKey,p.teamIdx);
    else applyGhost(p.hexKey,p.teamIdx);
  }
}

// ── POWERUP ──
function checkPowerup(k, ti){
  const h=G.hexes[k];
  if(!h.powerup || h.powerupUsed) return;
  h.powerupUsed=true;
  const info=PU_INFO[h.powerup];
  const rb=document.getElementById('pu-reveal');
  document.getElementById('pu-r-icon').textContent=info.icon;
  document.getElementById('pu-r-title').textContent=info.name;
  document.getElementById('pu-r-desc').textContent=info.desc;
  document.getElementById('pu-r-team').textContent=`Tým: ${G.teams[ti].name}`;

  const actions=document.getElementById('pu-r-actions');

  if(h.powerup==='shield'){
    G.teams[ti].shields++;
    actions.innerHTML=`<button class="pu-rbtn gold" onclick="closePuReveal()">✓ Prima!</button>`;
  } else if(h.powerup==='bomb'){
    G.teams[ti].powerups.push({type:'bomb',turnsLeft:3});
    actions.innerHTML=`<button class="pu-rbtn gold" onclick="closePuReveal()">💣 Uloženo! (3 tahy)</button>`;
  } else if(h.powerup==='ghost'){
    G.teams[ti].powerups.push({type:'ghost',turnsLeft:3});
    actions.innerHTML=`<button class="pu-rbtn gold" onclick="closePuReveal()">👻 Uloženo! (3 tahy)</button>`;
  } else if(h.powerup==='web'){
    G.teams[ti].trapped=true;
    actions.innerHTML=`<button class="pu-rbtn gold" onclick="closePuReveal()">😱 Smůla!</button>`;
  }

  rb.classList.remove('hidden');
  renderModMiniSvg();
}

function closePuReveal(){ document.getElementById('pu-reveal').classList.add('hidden'); renderSidebar(); }

// ── POWER-UP INVENTORY USE ──
function usePowerup(teamIdx, type){
  if(type==='bomb') startPickMode('bomb',teamIdx);
  else if(type==='ghost') startPickMode('ghost',teamIdx);
}

function startPickMode(type, teamIdx){
  const targets=new Set();
  if(type==='bomb'){
    Object.entries(G.hexes).filter(([,v])=>v.owner!==null&&v.owner!==teamIdx).forEach(([k])=>targets.add(k));
  } else {
    const myKeys=Object.entries(G.hexes).filter(([,v])=>v.owner===teamIdx).map(([k])=>k);
    myKeys.forEach(k=>{ const h=G.hexes[k]; hexNeighbors(h.q,h.r).forEach(nk=>{ if(G.hexes[nk]&&G.hexes[nk].owner!==null&&G.hexes[nk].owner!==teamIdx) targets.add(nk); }); });
  }
  if(!targets.size){ toast('Žádné platné cíle','warn'); return; }
  G.pickMode={type,teamIdx};
  G.pickTargets=targets;
  const info=PU_INFO[type];
  document.getElementById('pick-mode-text').textContent=`${info.icon} ${info.name} – klikni na zvýrazněné políčko na plánu`;
  document.getElementById('pick-mode-label').classList.remove('hidden');
  renderGame();
}

function cancelPickMode(){
  G.pickMode=null; G.pickTargets=null;
  document.getElementById('pick-mode-label').classList.add('hidden');
  renderGame();
}

function removePowerup(teamIdx, type){
  const idx=G.teams[teamIdx].powerups.findIndex(p=>p.type===type);
  if(idx>=0) G.teams[teamIdx].powerups.splice(idx,1);
}

function _openPickerModal(title, titleStyle, teamName, instruction){
  document.getElementById('qm-type').textContent=title;
  document.getElementById('qm-type').style.cssText=titleStyle;
  document.getElementById('qm-cat').textContent='Tým: '+teamName;
  document.getElementById('qm-hex-info').textContent='';
  document.getElementById('qm-text').textContent=instruction;
  document.getElementById('qm-img').style.display='none';
  document.getElementById('qans-box').style.display='none';
  document.getElementById('rozstrel-note').classList.add('hidden');
  document.getElementById('duel-pick').classList.add('hidden');
  document.getElementById('q-timer-val').textContent='—';
}

function _hexPickerButtons(keysByTeam, teamIdx, callbackFn){
  return Object.entries(keysByTeam).map(([ti,keys])=>
    '<div style="display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;width:100%;">'+
    '<span style="font-size:.72rem;color:'+COLORS[ti]+';font-weight:700;flex-basis:100%;">'+esc(G.teams[ti].name)+'</span>'+
    keys.map(k=>'<button class="qbtn" style="background:'+COLORS[ti]+'33;border:1px solid '+COLORS[ti]+';color:#fff;padding:.35rem .6rem;font-size:.75rem;" onclick="'+callbackFn+'(\''+k+'\','+teamIdx+')">'+k+'</button>').join('')+
    '</div>'
  ).join('')+'<button class="qbtn cancel" onclick="closeQuestion()">✕ Zrušit</button>';
}

function openBombPicker(teamIdx){
  const enemies=Object.entries(G.hexes).filter(([,v])=>v.owner!==null&&v.owner!==teamIdx);
  if(!enemies.length){ toast('Žádní soupeři k bombardování','warn'); return; }
  _openPickerModal('💣 Bomba','background:rgba(231,76,60,.2);color:#e74c3c;padding:.28rem .75rem;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;',G.teams[teamIdx].name,'Vyber políčko soupeře ke zničení:');
  const byTeam={};
  enemies.forEach(([k,h])=>{ if(!byTeam[h.owner]) byTeam[h.owner]=[]; byTeam[h.owner].push(k); });
  document.getElementById('qactions').innerHTML=_hexPickerButtons(byTeam,teamIdx,'applyBomb');
  document.getElementById('qmodal').classList.remove('hidden');
}

function openGhostPicker(teamIdx){
  const myHexes=Object.entries(G.hexes).filter(([,v])=>v.owner===teamIdx).map(([k])=>k);
  const adjSet=new Set();
  myHexes.forEach(k=>{ const h=G.hexes[k]; hexNeighbors(h.q,h.r).forEach(nk=>{ if(G.hexes[nk]&&G.hexes[nk].owner!==null&&G.hexes[nk].owner!==teamIdx) adjSet.add(nk); }); });
  if(!adjSet.size){ toast('Žádné sousední políčko soupeře','warn'); return; }
  _openPickerModal('👻 Duch','background:rgba(155,89,182,.2);color:#9b59b6;padding:.28rem .75rem;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;',G.teams[teamIdx].name,'Vyber sousední políčko soupeře k ukradení:');
  const byTeam={};
  adjSet.forEach(k=>{ const o=G.hexes[k].owner; if(!byTeam[o]) byTeam[o]=[]; byTeam[o].push(k); });
  document.getElementById('qactions').innerHTML=_hexPickerButtons(byTeam,teamIdx,'applyGhost');
  document.getElementById('qmodal').classList.remove('hidden');
}

function applyBomb(k, teamIdx){
  const h=G.hexes[k]; const v=h.owner;
  G.teams[v].hexCount--; h.owner=null; h.state='free';
  removePowerup(teamIdx,'bomb');
  closeQuestion();
  toast('💣 '+k+' ('+G.teams[v].name+') zničeno!','warn');
  renderGame(); renderSidebar();
}

function applyGhost(k, teamIdx){
  const h=G.hexes[k]; const v=h.owner;
  G.teams[v].hexCount--; h.owner=teamIdx; h.state='owned';
  G.teams[teamIdx].hexCount++;
  removePowerup(teamIdx,'ghost');
  closeQuestion();
  toast('👻 '+G.teams[teamIdx].name+' ukradl '+k,'ok');
  renderGame(); renderSidebar();
  if(checkWin(teamIdx)) showWin(teamIdx,'Duch přivedl k vítězství!');
}

// ── TURN / ATTACK ──
// ── OVERRIDE / PAINT MODE ──
function openOverridePicker(k){
  const h=G.hexes[k];
  // Build a lightweight modal inside qmodal
  document.getElementById('qm-type').textContent='🎨 Přiřazení políčka';
  document.getElementById('qm-type').style.cssText='background:rgba(155,89,182,.2);color:#9b59b6;padding:.28rem .75rem;border-radius:999px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;';
  document.getElementById('qm-cat').textContent='Moderátorský přepis';
  document.getElementById('qm-hex-info').textContent=`Políčko ${k}`;
  document.getElementById('qm-text').textContent='Komu přiřadit toto políčko?';
  document.getElementById('qm-img').style.display='none';
  document.getElementById('qans-box').style.display='none';
  document.getElementById('rozstrel-note').classList.add('hidden');
  document.getElementById('duel-pick').classList.add('hidden');
  document.getElementById('q-timer-val').textContent='—';
  const act=document.getElementById('qactions');
  act.innerHTML=
    G.teams.map((t,i)=>`<button class="qbtn" style="background:${COLORS[i]};color:#fff;" onclick="setOverrideOwner('${k}',${i})">${esc(t.name)}</button>`).join('')+
    `<button class="qbtn" style="background:rgba(255,255,255,.1);border:1px solid var(--border);color:#fff;" onclick="setOverrideOwner('${k}',null)">🗑️ Volné</button>`+
    `<button class="qbtn cancel" onclick="closeQuestion()">✕ Zrušit</button>`;
  document.getElementById('qmodal').classList.remove('hidden');
  G.currentHexKey=k;
}

function setOverrideOwner(k, teamIdx){
  const h=G.hexes[k];
  if(h.owner!==null) G.teams[h.owner].hexCount--;
  h.owner=teamIdx;
  h.state= teamIdx!==null ? 'owned' : 'free';
  if(teamIdx!==null) G.teams[teamIdx].hexCount++;
  closeQuestion();
  renderGame(); renderSidebar();
  toast(teamIdx!==null ? `🎨 Políčko přiřazeno: ${G.teams[teamIdx].name}` : '🎨 Políčko uvolněno','ok');
}

function toggleOverrideMode(){
  G.overrideMode=!G.overrideMode;
  if(G.overrideMode) G.attackMode=false;
  document.getElementById('override-btn').classList.toggle('on',G.overrideMode);
  document.getElementById('atk-btn').classList.remove('on');
  document.getElementById('atk-mode-label').classList.add('hidden');
  const bar=document.getElementById('override-mode-label');
  if(bar) bar.classList.toggle('hidden',!G.overrideMode);
}

function toggleAutoAdvance(){
  G.autoAdvance=!G.autoAdvance;
  document.getElementById('auto-adv-btn').classList.toggle('on',G.autoAdvance);
  toast(G.autoAdvance ? '🔄 Auto-střídání ZAP' : '🔄 Auto-střídání VYP','ok');
}

function toggleAttackMode(){
  G.attackMode=!G.attackMode;
  if(G.attackMode) G.overrideMode=false;
  document.getElementById('atk-btn').classList.toggle('on',G.attackMode);
  document.getElementById('atk-mode-label').classList.toggle('hidden',!G.attackMode);
  document.getElementById('override-btn').classList.remove('on');
  const obar=document.getElementById('override-mode-label');
  if(obar) obar.classList.add('hidden');
}

function nextTurn(){
  G.attackMode=false;
  document.getElementById('atk-btn').classList.remove('on');
  document.getElementById('atk-mode-label').classList.add('hidden');

  // Decrement current team's power-up lifetime
  G.teams[G.currentTeam].powerups=G.teams[G.currentTeam].powerups
    .map(p=>({...p,turnsLeft:p.turnsLeft-1}))
    .filter(p=>{
      if(p.turnsLeft<=0){ toast(`💨 ${PU_INFO[p.type].name} vypršel pro ${G.teams[G.currentTeam].name}`,'warn'); return false; }
      return true;
    });

  let next=(G.currentTeam+1)%G.teams.length;
  let maxLoop=G.teams.length;
  while(G.teams[next].trapped && maxLoop-->0){
    toast(`🕸️ ${G.teams[next].name} přeskakuje tah (Pavučina)`,'warn');
    G.teams[next].trapped=false;
    next=(next+1)%G.teams.length;
  }
  G.currentTeam=next;
  timerReset();
  updateTurnPill();
  renderSidebar();
  syncModState();
}

function updateTurnPill(){
  const ti=G.currentTeam;
  document.getElementById('turn-dot').style.background=COLORS[ti];
  document.getElementById('turn-name').textContent=G.teams[ti].name;
  document.querySelectorAll('.sb-card').forEach((c,i)=>c.classList.toggle('active',i===ti));
}

// ── TIMER ──
function timerStart(){
  if(G.timerRunning) return;
  G.timerRunning=true;
  G.timerInterval=setInterval(()=>{
    if(G.timerLeft>0){ G.timerLeft--; updateTimerUI(); }
    else {
      timerPause();
      document.getElementById('t-ring').classList.add('expired');
      document.getElementById('t-text').classList.add('expired');
      setModalTimer(0, true);
    }
  },1000);
}
function timerPause(){ G.timerRunning=false; clearInterval(G.timerInterval); }
function timerReset(){
  timerPause();
  G.timerLeft=G.timerMax;
  document.getElementById('t-ring').classList.remove('expired');
  document.getElementById('t-text').classList.remove('expired');
  updateTimerUI();
}
function updateTimerUI(){
  const frac=G.timerLeft/G.timerMax;
  const circ=2*Math.PI*33;
  document.getElementById('t-ring').style.strokeDashoffset=(circ*(1-frac)).toFixed(2);
  document.getElementById('t-text').textContent=G.timerLeft;
  setModalTimer(G.timerLeft, false);
  if(G.timerLeft%5===0) syncModState(); // sync every 5s
}
function setModalTimer(val, expired){
  const el=document.getElementById('q-timer-val');
  const ic=document.getElementById('q-timer-icon');
  if(!el) return;
  el.textContent=val+'s';
  const color= expired ? '#e74c3c' : (val<=5 ? '#e74c3c' : 'var(--gold)');
  el.style.color=color;
  if(ic) ic.style.color=color;
  el.style.animation= (expired||val<=5) ? 'tpulse .5s ease infinite alternate' : '';
}

// ── MOD PANEL ──
function toggleModPanel(){
  const p=document.getElementById('mod-panel');
  p.classList.toggle('hidden');
}
function toggleModBody(){
  G.modBodyOpen=!G.modBodyOpen;
  document.getElementById('mod-body').classList.toggle('hidden',!G.modBodyOpen);
  document.getElementById('mod-toggle-lbl').textContent=G.modBodyOpen?'▲':'▼';
}
function renderModPanel(){
  document.getElementById('mod-panel').classList.remove('hidden');
  renderModMiniSvg();
}
function renderModMiniSvg(){
  const svg=document.getElementById('mod-mini-svg');
  if(!svg) return;
  const R=CFG.radius;
  const size=Math.min(14, 120/(R*2+1));
  const pad=size+2;
  const keys=Object.keys(G.hexes);
  const positions=keys.map(k=>{const h=G.hexes[k];return hexPixel(h.q,h.r,size);});
  const minX=Math.min(...positions.map(p=>p.x))-pad;
  const minY=Math.min(...positions.map(p=>p.y))-pad;
  const maxX=Math.max(...positions.map(p=>p.x))+pad;
  const maxY=Math.max(...positions.map(p=>p.y))+pad;
  svg.setAttribute('width',maxX-minX); svg.setAttribute('height',maxY-minY);
  svg.setAttribute('viewBox',`${minX} ${minY} ${maxX-minX} ${maxY-minY}`);
  svg.innerHTML='';
  keys.forEach(k=>{
    const h=G.hexes[k];
    const {x,y}=hexPixel(h.q,h.r,size);
    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points',hexPolygonPoints(x,y,size*.9));
    poly.setAttribute('fill', h.powerup&&!h.powerupUsed?'rgba(255,215,0,0.25)':'rgba(255,255,255,0.05)');
    poly.setAttribute('stroke','rgba(255,255,255,0.15)');
    poly.setAttribute('stroke-width','0.8');
    svg.appendChild(poly);
    if(h.powerup && !h.powerupUsed){
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',x); t.setAttribute('y',y+size*.35);
      t.setAttribute('text-anchor','middle');
      t.setAttribute('font-size',size*.7);
      t.textContent=PU_INFO[h.powerup].icon;
      svg.appendChild(t);
    }
  });
}

// ── DOMINATION / WIN ──
function showDomination(){
  const sorted=[...G.teams].map((t,i)=>({...t,i})).sort((a,b)=>b.hexCount-a.hexCount);
  const msg=sorted.map((t,rank)=>`${rank+1}. ${G.teams[t.i].name}: ${t.hexCount} políček`).join('\n');
  alert('📊 Nadvláda – aktuální stav:\n\n'+msg);
}

function showWin(ti, reason){
  document.getElementById('win-team').textContent=G.teams[ti].name;
  document.getElementById('win-team').style.color=COLORS[ti];
  document.getElementById('win-sub').textContent=reason;
  document.getElementById('win-overlay').classList.remove('hidden');
}

function confirmEndGame(){
  if(confirm('Ukončit hru a zobrazit výsledky?')) showDomination();
}

// ── UTILS ──
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg,type='ok'){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');
  el.className=`toast ${type}`; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3400);
}

function downloadSampleCSV(){
  const rows=[
    'Otázka,Odpověď,Typ,Obrázek',
    'Co je hlavní město ČR?,Praha,normal,',
    'Která řeka protéká Prahou?,Vltava,normal,',
    'Kdo napsal Babičku?,Božena Němcová,normal,',
    'Kdy proběhla Sametová revoluce?,1989,normal,',
    'Kdo byl 1. prezident ČR?,Václav Havel,normal,',
    'Jaký je nejvyšší vrchol ČR?,Sněžka,normal,https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Snezka.jpg/320px-Snezka.jpg',
    '"Vyjmenujte po jednom kraje ČR (Duel)","Jihočeský / Jihomoravský / Karlovarský / Královéhradecký / Liberecký / Moravskoslezský / Olomoucký / Pardubický / Plzeňský / Praha / Středočeský / Ústecký / Vysočina / Zlínský",duel,',
    'Odhadněte rok Sametové revoluce (Duel),1989,duel,',
  ];
  const blob=new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='vzor_otazky.csv'; a.click(); URL.revokeObjectURL(a.href);
  toast('📥 Vzor stažen','ok');
}

// ── MODERATOR WINDOW SYNC ──
function syncModState(){
  try {
    const teamSideIdxs=assignSides(G.teams.length);
    const sideTeamMap={};
    teamSideIdxs.forEach((sideIdx,teamIdx)=>{ sideTeamMap[sideIdx]=teamIdx; });
    localStorage.setItem('azkviz_mod', JSON.stringify({
      currentQ: G.currentQ,
      answerRevealed: document.getElementById('qans-box')?.style.display==='block',
      currentTeam: G.currentTeam,
      teams: G.teams.map(t=>({name:t.name,hexCount:t.hexCount,shields:t.shields,trapped:t.trapped,powerups:t.powerups||[]})),
      hexes: G.hexes,
      timerLeft: G.timerLeft,
      timerMax: G.timerMax,
      colors: COLORS,
      phase: G.phase,
      sideTeamMap,
    }));
  } catch(e){}
}

function openModWindow(){
  const w=screen.availWidth, h=screen.availHeight;
  window.open('moderator.html','azkviz_mod',`width=${w},height=${h},left=0,top=0`);
}

// ── BOOT ──
initSetup();
