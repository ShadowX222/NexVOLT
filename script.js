"use strict";

/* ---------- state ---------- */
var state = { route:'dashboard', selectedGame:null, mode:'balanced', logs:[], backups:[] };

/* ---------- mock data (clearly simulated) ---------- */
var HARDWARE = {
  cpu:{name:'Simulated CPU — Ryzen 7 7800X3D', cores:8, threads:16},
  gpu:{name:'Simulated GPU — GeForce RTX 4070', vramGB:12},
  ram:{totalGB:32, usedGB:14},
  storage:[{drive:'C:',type:'NVMe SSD (sim)',freeGB:180,totalGB:512},{drive:'D:',type:'SATA SSD (sim)',freeGB:340,totalGB:1024}],
  os:{version:'Windows 11',build:'26100.1000 (sim)'},
  win:{gameMode:true,hags:false,powerPlan:'Balanced'}
};

/* data-game id matches the logo filename you'll drop into /logos/ — see note after this code */
var GAMES = [
  {id:'gta5',name:'Grand Theft Auto V',exe:'GTA5.exe'},
  {id:'fivem',name:'FiveM',exe:'FiveM.exe'},
  {id:'valorant',name:'VALORANT',exe:'VALORANT-Win64-Shipping.exe'},
  {id:'cs2',name:'Counter-Strike 2',exe:'cs2.exe'},
  {id:'fortnite',name:'Fortnite',exe:'FortniteClient-Win64-Shipping.exe'},
  {id:'apex',name:'Apex Legends',exe:'r5apex.exe'},
  {id:'pubg',name:'PUBG: BATTLEGROUNDS',exe:'TslGame.exe'},
  {id:'cod',name:'Call of Duty',exe:'cod.exe'},
  {id:'minecraft',name:'Minecraft',exe:'javaw.exe'},
  {id:'rdr2',name:'Red Dead Redemption 2',exe:'RDR2.exe'},
  {id:'cyberpunk',name:'Cyberpunk 2077',exe:'Cyberpunk2077.exe'},
  {id:'forza',name:'Forza Horizon',exe:'ForzaHorizon5.exe'},
  {id:'r6siege',name:'Rainbow Six Siege',exe:'RainbowSix.exe'}
];

var PC_CATALOG = [
  {id:'power-plan',name:'Power Plan: High Performance',cat:'power',risk:'low',admin:true,modes:['safe','balanced','performance']},
  {id:'game-mode',name:'Enable Windows Game Mode',cat:'windows',risk:'low',admin:false,modes:['safe','balanced','performance']},
  {id:'hags',name:'Hardware-Accelerated GPU Scheduling',cat:'gpu',risk:'medium',admin:true,modes:['balanced','performance']},
  {id:'fullscreen-opt',name:'Fullscreen Optimization Review',cat:'windows',risk:'low',admin:false,modes:['safe','balanced','performance']},
  {id:'startup-apps',name:'Startup Application Review',cat:'background',risk:'low',admin:false,modes:['safe','balanced','performance']},
  {id:'temp-cleanup',name:'Temporary File Cleanup',cat:'storage',risk:'low',admin:false,modes:['balanced','performance']},
  {id:'visual-fx',name:'Windows Visual Effects → Performance',cat:'windows',risk:'low',admin:false,modes:['performance']},
  {id:'net-throttle',name:'Network Throttling Index Review',cat:'network',risk:'medium',admin:true,modes:['performance']}
];
function gameExtraOpt(g){
  return {id:g.id+'-priority',name:g.name+' Process Priority',cat:'cpu',risk:'medium',admin:true,modes:['balanced','performance']};
}

/* ---------- helpers ---------- */
function el(tag,attrs,children){
  var e=document.createElement(tag);
  attrs=attrs||{};
  for(var k in attrs){
    if(k==='class')e.className=attrs[k];
    else if(k==='html')e.innerHTML=attrs[k];
    else if(k.indexOf('on')===0 && typeof attrs[k]==='function') e.addEventListener(k.slice(2),attrs[k]);
    else e.setAttribute(k,attrs[k]);
  }
  (children||[]).forEach(function(c){ if(c==null)return; e.appendChild(typeof c==='string'?document.createTextNode(c):c); });
  return e;
}
function clear(node){ node.innerHTML=''; }
function fmtTime(){ return new Date().toLocaleTimeString(); }
function toast(type,msg){
  var box=document.getElementById('toasts');
  var t=el('div',{class:'toast '+type},[msg]);
  box.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){t.remove();},250); },4000);
}
function log(result,message){
  state.logs.unshift({time:fmtTime(),result:result,message:message});
  var p=document.getElementById('page-logs');
  if(p && p.classList.contains('active')) renderLogs();
}
/* logo with graceful fallback to initials if logos/<id>.png doesn't exist yet */
function gameLogo(g){
  var img = el('img',{class:'game-logo',src:'logos/'+g.id+'.png',alt:g.name+' logo'});
  var fallback = el('div',{class:'game-logo-fallback'},[g.name.slice(0,2).toUpperCase()]);
  fallback.style.display='none';
  img.onerror = function(){ img.style.display='none'; fallback.style.display='flex'; };
  var wrap = el('span',{style:'display:contents'},[img,fallback]);
  return wrap;
}

/* ---------- navigation ---------- */
var PAGES = [
  ['dashboard','⌂','Dashboard'],['pc-scan','▣','My PC'],['game-library','▤','Game Library'],
  ['optimizer','⚙','Optimizer'],['restore','↺','Restore Center'],['logs','≡','Activity Log'],
  ['settings','✦','Settings'],['about','?','About']
];
function buildNav(){
  var nav=document.getElementById('nav');
  PAGES.forEach(function(p){
    var btn = el('button',{},[el('span',{},[p[1]+' ']), el('span',{},[p[2]])]);
    btn.dataset.route=p[0];
    btn.addEventListener('click',function(){ go(p[0]); });
    nav.appendChild(el('li',{},[btn]));
  });
}
function go(route){
  state.route=route;
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.getElementById('page-'+route).classList.add('active');
  document.querySelectorAll('#nav button').forEach(function(b){b.classList.toggle('active',b.dataset.route===route);});
  if(route==='restore') renderRestore();
  if(route==='logs') renderLogs();
  if(route==='game-library') renderGameLibrary();
  if(route==='optimizer') renderOptimizer();
  if(route==='pc-scan') renderPcInfo();
}

/* ---------- page builders ---------- */
function actionBtn(label,fn){ return el('button',{class:'action-btn',onclick:fn},[label]); }

function buildPages(){
  var main=document.getElementById('main');

  var dash=el('div',{class:'page',id:'page-dashboard'},[
    el('section',{class:'card'},[
      el('div',{class:'page-header'},[el('h2',{},['PC PERFORMANCE']),el('span',{class:'badge'},['Optimization Readiness Score'])]),
      el('div',{id:'readiness-body'},[el('p',{class:'empty'},['Run a scan to calculate your Optimization Readiness Score.'])])
    ]),
    el('section',{class:'actions-grid'},[
      actionBtn('Scan PC',function(){ runScan(); }),
      actionBtn('Detect Games',function(){ go('game-library'); }),
      actionBtn('Optimize PC',function(){ go('optimizer'); }),
      actionBtn('Restore Center',function(){ go('restore'); })
    ]),
    el('section',{class:'card'},[el('h3',{},['Selected Game']), el('div',{id:'dash-game-summary'})])
  ]);

  var pc=el('div',{class:'page',id:'page-pc-scan'},[
    el('div',{class:'page-header'},[el('h2',{},['My PC']),el('button',{class:'btn btn-primary',onclick:function(){runScan();}},['Rescan'])]),
    el('div',{class:'pc-grid',id:'pc-grid'}),
    el('section',{class:'card',id:'scan-stage-panel'},[el('p',{class:'muted'},['Run a scan to see the live detection stages.'])])
  ]);

  var lib=el('div',{class:'page',id:'page-game-library'},[
    el('div',{class:'page-header'},[el('h2',{},['Select Game'])]),
    el('section',{class:'card'},[el('h3',{},['All Supported Games']),el('div',{class:'game-grid',id:'game-grid'})])
  ]);

  var opt=el('div',{class:'page',id:'page-optimizer'},[
    el('div',{class:'page-header'},[el('h2',{id:'opt-title'},['Optimize PC'])]),
    el('section',{class:'card'},[el('h3',{},['Optimization Mode']),el('div',{class:'mode-grid',id:'mode-grid'})]),
    el('section',{class:'card'},[el('div',{class:'page-header'},[el('h3',{},['Optimizations'])]),el('div',{id:'opt-list'})])
  ]);

  var restore=el('div',{class:'page',id:'page-restore'},[
    el('div',{class:'page-header'},[el('h2',{},['Restore Center'])]),
    el('section',{class:'card'},[el('h3',{},['Optimization Runs']),el('div',{id:'restore-list'})])
  ]);

  var logs=el('div',{class:'page',id:'page-logs'},[
    el('div',{class:'page-header'},[el('h2',{},['Activity Log'])]),
    el('section',{class:'card'},[el('div',{id:'log-list'})])
  ]);

  var settings=el('div',{class:'page',id:'page-settings'},[
    el('div',{class:'page-header'},[el('h2',{},['Settings'])]),
    el('section',{class:'card'},[el('h3',{},['Privacy']),
      el('label',{class:'toggle-row'},[el('input',{type:'checkbox'}),el('span',{},[el('strong',{},['Send anonymous usage telemetry']),el('p',{class:'muted'},['Off by default. This standalone file sends no data anywhere.'])])])
    ]),
    el('section',{class:'card'},[el('h3',{},['Optimization']),
      el('label',{class:'toggle-row'},[el('input',{type:'checkbox',checked:'checked'}),el('span',{},[el('strong',{},['Require confirmation before applying optimizations'])])])
    ])
  ]);

  var about=el('div',{class:'page',id:'page-about'},[
    el('div',{class:'page-header'},[el('h2',{},['About'])]),
    el('section',{class:'card'},[
      el('h3',{},['Nex','VOLT']),
      el('p',{},['Optimize. Boost. Play.']),
      el('p',{class:'muted'},['Three plain files — HTML, CSS, JS. No build step, no server, no framework.']),
      el('h4',{},['What is real here']),
      el('p',{},['The full UI flow: scanning, mode selection, optimization lists, apply/backup/restore simulation, logging, settings.']),
      el('h4',{},['What is simulated']),
      el('p',{},['All hardware, game detection, and system changes — a browser cannot read real CPU/GPU data or modify Windows settings. Applying an optimization always reports honestly rather than faking a result.'])
    ])
  ]);

  [dash,pc,lib,opt,restore,logs,settings,about].forEach(function(p){ main.appendChild(p); });
  dash.classList.add('active');
}

/* ---------- Dashboard / readiness ---------- */
function renderReadiness(score,breakdown){
  var body=document.getElementById('readiness-body');
  clear(body);
  var tone = score>=75?'good':score>=45?'warn':'bad';
  body.appendChild(el('div',{class:'score '+tone},[el('b',{},[String(score)]),el('span',{class:'neutral'},[' / 100'])]));
  var grid=el('div',{class:'grid'});
  breakdown.forEach(function(row){ grid.appendChild(el('div',{class:'row'},[el('span',{},[row[0]]),el('span',{},[String(row[1])])])); });
  body.appendChild(grid);
  body.appendChild(el('p',{class:'fineprint'},['Heuristic Optimization Readiness Score, not a benchmark result.']));
  renderDashGameSummary();
}
function renderDashGameSummary(){
  var box=document.getElementById('dash-game-summary');
  if(!box) return;
  clear(box);
  if(!state.selectedGame){
    box.appendChild(el('div',{class:'empty'},['No game selected. ',el('br'), el('button',{class:'btn',onclick:function(){go('game-library');}},['Select a game'])]));
    return;
  }
  var g=GAMES.find(function(x){return x.id===state.selectedGame;});
  box.appendChild(el('div',{},[el('strong',{},[g.name]),el('p',{class:'muted'},['Executable: '+g.exe]),
    el('button',{class:'btn',onclick:function(){go('optimizer');}},['Go to optimizer'])]));
}

/* ---------- Scan ---------- */
var SCAN_STAGES = ['Hardware Detection','Windows Configuration Scan','Game Detection','Background Process Analysis',
  'Power Configuration','Graphics Configuration','Network Configuration','Storage Analysis','Recommendation Generation'];

function runScan(){
  toast('info','Scanning…');
  var panel=document.getElementById('scan-stage-panel');
  if(panel){
    clear(panel);
    panel.appendChild(el('h3',{},['Optimization Scanner']));
    var list=el('ul',{class:'stage-list'});
    SCAN_STAGES.forEach(function(s){ list.appendChild(el('li',{class:'stage'},['○ '+s])); });
    panel.appendChild(list);
  }
  var i=0;
  function step(){
    if(panel){
      var items=panel.querySelectorAll('.stage');
      if(i>0){ items[i-1].classList.remove('run'); items[i-1].classList.add('done'); items[i-1].textContent='✓ '+SCAN_STAGES[i-1]; }
      if(i<SCAN_STAGES.length){ items[i].classList.add('run'); items[i].textContent='… '+SCAN_STAGES[i]; i++; setTimeout(step,220); }
      else { finishScan(); }
    } else { finishScan(); }
  }
  step();
}
function finishScan(){
  var ramScore = Math.round((1 - HARDWARE.ram.usedGB/HARDWARE.ram.totalGB)*100);
  var cpuScore = Math.round((HARDWARE.cpu.threads/16)*100);
  var gpuScore = Math.round((HARDWARE.gpu.vramGB/12)*100);
  var winScore = Math.round(((HARDWARE.win.gameMode?1:0)+(HARDWARE.win.hags?1:0)+1)/3*100);
  var overall = Math.round((ramScore+cpuScore+gpuScore+winScore)/4);
  renderReadiness(overall,[['CPU',cpuScore],['GPU',gpuScore],['RAM',ramScore],['Windows Configuration',winScore]]);
  renderPcInfo();
  log('info','PC scan completed.');
  toast('success','Scan complete.');
}
function renderPcInfo(){
  var grid=document.getElementById('pc-grid');
  if(!grid) return;
  clear(grid);
  function card(title,rows){
    var dl=el('dl');
    rows.forEach(function(r){ dl.appendChild(el('dt',{},[r[0]])); dl.appendChild(el('dd',{},[String(r[1])])); });
    return el('div',{class:'info-card'},[el('h3',{},[title]),dl]);
  }
  grid.appendChild(card('CPU',[['Name',HARDWARE.cpu.name],['Cores',HARDWARE.cpu.cores],['Threads',HARDWARE.cpu.threads]]));
  grid.appendChild(card('GPU',[['Name',HARDWARE.gpu.name],['VRAM',HARDWARE.gpu.vramGB+' GB']]));
  grid.appendChild(card('RAM',[['Total',HARDWARE.ram.totalGB+' GB'],['Used',HARDWARE.ram.usedGB+' GB']]));
  HARDWARE.storage.forEach(function(d){ grid.appendChild(card('Storage '+d.drive,[['Type',d.type],['Free / Total',d.freeGB+' GB / '+d.totalGB+' GB']])); });
  grid.appendChild(card('Windows',[['Version',HARDWARE.os.version],['Build',HARDWARE.os.build]]));
  grid.appendChild(card('Gaming Features',[['Game Mode',HARDWARE.win.gameMode?'Enabled':'Disabled'],['HAGS',HARDWARE.win.hags?'Enabled':'Disabled'],['Power Plan',HARDWARE.win.powerPlan]]));
}

/* ---------- Game library ---------- */
function renderGameLibrary(){
  var grid=document.getElementById('game-grid');
  clear(grid);
  GAMES.forEach(function(g){
    var sel = state.selectedGame===g.id;
    grid.appendChild(el('div',{class:'game-card'+(sel?' sel':'')},[
      el('div',{class:'game-head'},[ gameLogo(g), el('strong',{},[g.name]) ]),
      el('p',{class:'muted'},['Executable: '+g.exe]),
      el('span',{class:'badge'+(sel?' badge-good':'')},[sel?'✓ Selected':'Not detected (standalone file)']),
      el('button',{class:'btn btn-primary',onclick:function(){ state.selectedGame=g.id; toast('success',g.name+' selected.'); go('optimizer'); }},['Select & Optimize'])
    ]));
  });
}

/* ---------- Optimizer ---------- */
var MODES=[['safe','Safe','Only low-risk, fully reversible optimizations.'],
  ['balanced','Balanced','Recommended general gaming optimization.'],
  ['performance','Performance','More aggressive changes with clear warnings.'],
  ['custom','Custom','Choose individual optimizations yourself.']];

function currentPlan(){
  var plan = PC_CATALOG.filter(function(o){ return state.mode==='custom' || o.modes.indexOf(state.mode)>-1; });
  if(state.selectedGame){
    var g=GAMES.find(function(x){return x.id===state.selectedGame;});
    var extra=gameExtraOpt(g);
    if(state.mode==='custom' || extra.modes.indexOf(state.mode)>-1) plan=plan.concat([extra]);
  }
  return plan;
}
function renderOptimizer(){
  document.getElementById('opt-title').textContent = state.selectedGame
    ? 'Optimize: '+GAMES.find(function(x){return x.id===state.selectedGame;}).name
    : 'Optimize PC';

  var modeGrid=document.getElementById('mode-grid');
  clear(modeGrid);
  MODES.forEach(function(m){
    var sel = state.mode===m[0];
    modeGrid.appendChild(el('button',{class:'mode-card'+(sel?' sel':''),onclick:function(){ state.mode=m[0]; renderOptimizer(); }},[
      el('strong',{},[m[1]]), el('p',{},[m[2]])
    ]));
  });

  var listEl=document.getElementById('opt-list');
  clear(listEl);
  var plan=currentPlan();
  if(!plan.length){ listEl.appendChild(el('p',{class:'empty'},['No optimizations for this selection.'])); return; }

  plan.forEach(function(op){
    listEl.appendChild(el('div',{class:'opt-row',id:'row-'+op.id},[
      el('div',{},[
        el('strong',{},[op.name]),
        el('div',{class:'opt-meta'},[
          el('span',{class:'badge'},[op.cat]),
          el('span',{class:'badge'},[op.risk+' risk']),
          op.admin?el('span',{class:'badge badge-warn'},['Admin required']):null
        ])
      ]),
      el('span',{class:'opt-state',id:'state-'+op.id},['Available'])
    ]));
  });
  listEl.appendChild(el('div',{style:'text-align:right;padding-top:.8rem'},[
    el('button',{class:'btn btn-primary',onclick:function(){ applyPlan(plan); }},['Apply Selected'])
  ]));
}
function applyPlan(plan){
  if(!confirm(plan.length+' change(s) will be attempted. A backup record will be created first. Continue?')) return;
  var backup={id:'backup-'+Date.now(), time:fmtTime(), game:state.selectedGame, count:plan.length};
  state.backups.unshift(backup);
  log('info','Backup created ('+plan.length+' item(s)).');
  var i=0;
  function step(){
    if(i>=plan.length){ toast('warn','0 applied — Administrator + native app required for real changes.'); return; }
    var op=plan[i];
    var stateEl=document.getElementById('state-'+op.id);
    if(stateEl) stateEl.textContent='Applying…';
    setTimeout(function(){
      if(stateEl){ stateEl.textContent='Requires Administrator'; stateEl.style.color='var(--warn)'; }
      log('skipped', op.name+': requires the native Windows app + Administrator rights. No change made.');
      i++; step();
    },260);
  }
  step();
}

/* ---------- Restore center ---------- */
function renderRestore(){
  var list=document.getElementById('restore-list');
  clear(list);
  if(!state.backups.length){ list.appendChild(el('p',{class:'empty'},['No optimization runs yet.'])); return; }
  state.backups.forEach(function(b){
    list.appendChild(el('div',{class:'row',style:'margin-bottom:.4rem'},[
      el('span',{},[(b.game?GAMES.find(function(g){return g.id===b.game;}).name:'PC')+' · '+b.time+' · '+b.count+' change(s)']),
      el('button',{class:'btn',onclick:function(){ log('restored','Restore requested for '+b.id+'.'); toast('info','Restore recorded (standalone: no real settings to revert).'); }},['Restore'])
    ]));
  });
}

/* ---------- Logs ---------- */
function renderLogs(){
  var list=document.getElementById('log-list');
  clear(list);
  if(!state.logs.length){ list.appendChild(el('p',{class:'empty'},['No activity recorded yet.'])); return; }
  state.logs.forEach(function(e){
    list.appendChild(el('div',{class:'log-row '+e.result},[
      el('span',{class:'time'},[e.time]), el('span',{class:'r'},[e.result]), el('span',{},[e.message])
    ]));
  });
}

/* ---------- boot ---------- */
buildNav();
buildPages();
go('dashboard');
renderGameLibrary();
renderDashGameSummary();