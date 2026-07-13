// InkFrame Brush Engine V2 — refined tablet Brush Lab
'use strict';
(function(root){
  const TAB_KEY='inkframe.brushLab.activeTab.v1';
  const GROUPS=[
    ['stabilizer','Stabilizer','Motion cleanup, latency, and deliberate turns'],
    ['trail','Ghost Trail','Live visual streaks from accepted brush samples'],
    ['stroke','Stroke','Pressure, spacing, coverage, and width behavior'],
    ['safety','Safety','Contact boundaries and coordinate spike containment'],
    ['diagnostics','Diagnostics','Trace capture, replay, and engine status'],
  ];
  const LAYOUT={
    stabilizer:[['Response',['Stabilizer','Strength','Fixed lag']],['Corners',['Corners','Corner response']]],
    trail:[['Trail style',['Ghost trail']],['Appearance',['Trail intensity','Trail length','Trail width']]],
    stroke:[['Pressure',['Pressure lag']],['Coverage',['Dab spacing','Coverage','Width guard']]],
    safety:[['Input safety',['Contact','Spike gate']]],
  };
  const adapter=()=>root.InkFrameBrushV2Adapter||null;
  const traceToolsEnabled=()=>!(root.InkFrameBuild&&root.InkFrameBuild.traceTools===false);
  const visibleGroups=()=>GROUPS.filter(group=>group[0]!=='diagnostics'||traceToolsEnabled());
  function storedTab(groups){try{const value=root.localStorage&&root.localStorage.getItem(TAB_KEY);return groups.some(group=>group[0]===value)?value:'stabilizer';}catch(_){return'stabilizer';}}
  function rememberTab(value){try{if(root.localStorage)root.localStorage.setItem(TAB_KEY,value);}catch(_){} }
  function card(title,note){const el=root.document.createElement('div');el.className='inkframe-v2-control-card';const head=root.document.createElement('div');head.className='inkframe-v2-card-head';const strong=root.document.createElement('strong');strong.textContent=title;const small=root.document.createElement('small');small.textContent=note||'';head.append(strong,small);el.appendChild(head);return el;}

  function install(){
    if(!root.document)return false;
    const api=adapter(),panel=root.document.getElementById('inkframe-v2-ab'),lab=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!panel||!lab)return false;
    if(root.document.getElementById('inkframe-v2-lab-nav'))return true;
    if(!root.document.getElementById('inkframe-v2-ghost-mode'))return false;
    const groups=visibleGroups();
    const style=root.document.createElement('style');
    style.textContent=`
      #inkframe-v2-ab.lab-launcher{top:16px!important;right:16px!important;left:auto!important;transform:none!important;width:62px;height:62px;padding:0!important;border-radius:50%!important;background:linear-gradient(150deg,rgba(255,240,243,.25),rgba(96,0,70,.58))!important;border-color:rgba(255,240,243,.58)!important;box-shadow:0 12px 34px rgba(20,0,14,.45),inset 0 1px 0 rgba(255,255,255,.46)!important}
      #inkframe-v2-ab.lab-launcher>button[data-lab-launcher]{position:absolute;inset:0;width:100%;height:100%;padding:0!important;border:0!important;border-radius:50%!important;background:transparent!important;font-size:0!important;display:grid;place-items:center;color:#fff}
      #inkframe-v2-ab.lab-launcher>button[data-lab-launcher]::before{content:'LAB';font:850 10px/1 system-ui,sans-serif;letter-spacing:.15em;margin-left:.15em;text-shadow:0 0 12px rgba(255,210,230,.9)}
      #inkframe-v2-ab.lab-launcher>#inkframe-v2-status,#inkframe-v2-ab.lab-launcher>input{display:none!important}
      #inkframe-v2-tuning.lab-refined{top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;width:min(94vw,920px)!important;max-height:88vh!important;overflow:hidden!important;padding:0!important;border-radius:22px!important;background:rgba(24,8,20,.97)!important}
      #inkframe-v2-tuning.lab-refined .inkframe-v2-tune-head{position:relative!important;top:auto!important;margin:0!important;padding:14px 16px!important;display:flex!important;align-items:center!important;gap:10px!important;border-bottom:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.035)!important}
      .lab-title{margin-right:auto}.lab-title strong{display:block;font-size:16px}.lab-title small{display:block;margin-top:3px;font:550 10px/1.2 system-ui,sans-serif;opacity:.62}
      #inkframe-v2-engine-toggle{min-height:36px;border-radius:12px!important}#inkframe-v2-engine-toggle.on{background:#bb0037!important;border-color:#ffd0dc!important}
      #inkframe-v2-lab-close{width:38px;height:38px;min-width:38px!important;padding:0!important;border-radius:50%!important;font-size:22px!important}
      .lab-body{display:grid;grid-template-columns:160px 1fr;max-height:calc(88vh - 67px);min-height:430px}.lab-nav{display:flex;flex-direction:column;gap:6px;padding:12px;border-right:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.12)}
      .lab-nav button{min-height:48px;padding:9px 11px!important;border:1px solid transparent!important;border-radius:13px!important;background:transparent!important;color:#fff;text-align:left;font:750 11px/1.15 system-ui,sans-serif}.lab-nav button.on{background:linear-gradient(145deg,rgba(187,0,55,.72),rgba(94,0,76,.62))!important;border-color:rgba(255,208,220,.55)!important}
      .lab-content{overflow:auto;padding:15px 17px 18px}.inkframe-v2-lab-section[hidden]{display:none!important}.inkframe-v2-lab-section{max-width:700px;margin:auto}.inkframe-v2-lab-section-head{margin:0 0 12px!important;padding:0 2px 8px!important;border:0!important;background:transparent!important}.inkframe-v2-lab-section-head strong{font-size:18px}.inkframe-v2-lab-section-head small{display:block;margin-top:5px;opacity:.65}
      .inkframe-v2-control-card{margin:0 0 11px;padding:11px 12px 9px;border:1px solid rgba(255,255,255,.11);border-radius:16px;background:rgba(255,255,255,.045)}.inkframe-v2-card-head{display:flex;justify-content:space-between;gap:12px;margin:0 2px 8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.07)}.inkframe-v2-card-head strong{font-size:12px}.inkframe-v2-card-head small{font:500 10px/1.25 system-ui,sans-serif;opacity:.58;text-align:right}
      .quick-row{display:grid;grid-template-columns:110px 1fr auto;align-items:center;gap:9px;margin:4px 2px 10px}.quick-row select{min-height:38px;border-radius:11px;background:#2b1325;color:#fff}.studio-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.studio-actions button{min-height:44px;border-radius:13px!important;background:linear-gradient(145deg,rgba(187,0,55,.6),rgba(83,0,90,.66))!important;color:#fff}
      .inkframe-v2-tune-row{display:grid!important;grid-template-columns:145px 1fr 66px!important;align-items:center!important;gap:10px!important;min-height:42px!important;margin:0!important;padding:7px 4px!important}.inkframe-v2-tune-row+.inkframe-v2-tune-row{border-top:1px solid rgba(255,255,255,.055)}.inkframe-v2-tune-row select{min-height:36px;background:#2b1325;color:#fff}.inkframe-v2-tune-row output{text-align:right;font-size:10px}.inkframe-v2-tune-row output[data-studio=true]{color:#ffd0dc;font-weight:850}
      .inkframe-v2-diag-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.inkframe-v2-diag-tools button{min-height:42px}.inkframe-v2-diag-card,#inkframe-v2-status.lab-status{display:block!important;margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04);white-space:normal!important;font:600 10px/1.4 system-ui,sans-serif;opacity:.8}
      @media(max-width:760px){.lab-body{grid-template-columns:1fr}.lab-nav{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.1);padding:8px}.lab-nav button{flex:0 0 124px;min-height:42px}.inkframe-v2-tune-row{grid-template-columns:110px 1fr 58px!important}.lab-content{padding:12px}}
    `;
    root.document.head.appendChild(style);lab.classList.add('lab-refined');panel.classList.add('lab-launcher');

    const head=lab.querySelector('.inkframe-v2-tune-head'),title=head&&head.querySelector('strong'),preset=head&&head.querySelector('select'),reset=head&&Array.from(head.querySelectorAll('button')).find(button=>button.textContent==='Reset');
    const topButtons=Array.from(panel.querySelectorAll(':scope > button')),mode=topButtons.find(button=>/^Engine/.test(button.textContent)),launcher=topButtons.find(button=>/^Tune/.test(button.textContent)),status=root.document.getElementById('inkframe-v2-status');
    if(title){const wrap=root.document.createElement('div');wrap.className='lab-title';const small=root.document.createElement('small');small.textContent='Brush response, trail, stroke, and safety';title.textContent='Brush Lab';wrap.append(title,small);head.prepend(wrap);}
    if(mode){mode.id='inkframe-v2-engine-toggle';head.appendChild(mode);}if(launcher){launcher.dataset.labLauncher='true';launcher.title='Open Brush Lab';launcher.setAttribute('aria-label','Open Brush Lab');}
    const close=root.document.createElement('button');close.id='inkframe-v2-lab-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Close Brush Lab');close.addEventListener('click',()=>lab.hidden=true);head.appendChild(close);

    const body=root.document.createElement('div');body.className='lab-body';const nav=root.document.createElement('nav');nav.id='inkframe-v2-lab-nav';nav.className='lab-nav';nav.setAttribute('role','tablist');const content=root.document.createElement('div');content.className='lab-content';const sections=new Map(),buttons=new Map();
    for(const [key,label,note] of groups){const button=root.document.createElement('button');button.type='button';button.textContent=label;button.dataset.labTab=key;button.setAttribute('role','tab');nav.appendChild(button);buttons.set(key,button);const section=root.document.createElement('section');section.className='inkframe-v2-lab-section';section.dataset.labSection=key;const sectionHead=root.document.createElement('div');sectionHead.className='inkframe-v2-lab-section-head';const strong=root.document.createElement('strong');strong.textContent=label;const small=root.document.createElement('small');small.textContent=note;sectionHead.append(strong,small);section.appendChild(sectionHead);sections.set(key,section);content.appendChild(section);}body.append(nav,content);head.insertAdjacentElement('afterend',body);

    const rows=Array.from(lab.querySelectorAll(':scope > .inkframe-v2-tune-row')),byLabel=new Map(rows.map(row=>[String(row.querySelector('span')&&row.querySelector('span').textContent||''),row]));
    const quick=card('Quick setup','Choose a base feel, then refine it.');const quickRow=root.document.createElement('div');quickRow.className='quick-row';const quickLabel=root.document.createElement('span');quickLabel.textContent='Brush feel';if(preset)quickRow.append(quickLabel,preset);if(reset)quickRow.appendChild(reset);quick.appendChild(quickRow);const actions=root.document.createElement('div');actions.className='studio-actions';
    for(const [label,patch] of [['Studio 150%',{stabilizerMode:'adaptive',stabilizerStrength:150,cornerMode:'preserve',cornerStrength:70,ghostMode:'echo',ghostIntensity:82,ghostDurationMs:720,ghostWidthPercent:165}],['Maximum 200%',{stabilizerMode:'adaptive',stabilizerStrength:200,cornerMode:'preserve',cornerStrength:78,ghostMode:'echo',ghostIntensity:90,ghostDurationMs:900,ghostWidthPercent:185}]]){const button=root.document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>api.setTuning(patch));actions.appendChild(button);}quick.appendChild(actions);sections.get('stabilizer').appendChild(quick);
    const used=new Set();for(const [group,sets] of Object.entries(LAYOUT)){const section=sections.get(group);for(const [name,labels] of sets){const selected=labels.map(label=>byLabel.get(label)).filter(Boolean);if(!selected.length)continue;const box=card(name,'');for(const row of selected){box.appendChild(row);used.add(row);}section.appendChild(box);}}
    for(const row of rows){if(used.has(row))continue;sections.get('stroke').appendChild(row);}
    const diagnostics=sections.get('diagnostics');if(diagnostics){if(status){status.classList.add('lab-status');diagnostics.appendChild(status);}const tools=card('Trace tools','Debug-only capture and replay.');const grid=root.document.createElement('div');grid.className='inkframe-v2-diag-tools';for(const button of Array.from(panel.querySelectorAll(':scope > button'))){if(['Import trace','Replay','Export trace'].includes(button.textContent))grid.appendChild(button);}tools.appendChild(grid);diagnostics.appendChild(tools);const note=root.document.createElement('div');note.className='inkframe-v2-diag-card';note.textContent='Production keeps the Brush Lab but excludes native telemetry and raw event history.';diagnostics.appendChild(note);}

    function syncLauncher(){const engine=api.currentMode&&api.currentMode()==='v2'?'v2':'original';panel.dataset.engine=engine;if(launcher){launcher.title='Brush Lab · '+(engine==='v2'?'V2':'Original');launcher.setAttribute('aria-label',launcher.title);}}
    function openTab(key){const resolved=sections.has(key)?key:'stabilizer';for(const [name,section] of sections){const active=name===resolved;section.hidden=!active;buttons.get(name).classList.toggle('on',active);buttons.get(name).setAttribute('aria-selected',String(active));}rememberTab(resolved);content.scrollTop=0;return resolved;}
    for(const [key,button] of buttons)button.addEventListener('click',()=>openTab(key));if(mode)mode.addEventListener('click',()=>root.setTimeout(syncLauncher,0));if(launcher)launcher.addEventListener('click',()=>root.setTimeout(()=>{syncLauncher();if(!lab.hidden)openTab(storedTab(groups));},0));openTab(storedTab(groups));syncLauncher();
    root.InkFrameBrushV2LabUI={openTab,sections,buttons,installed:true,traceTools:traceToolsEnabled(),launcher,modeButton:mode};return true;
  }
  const api={GROUPS,LAYOUT,visibleGroups,traceToolsEnabled,install};root.InkFrameBrushV2LabUI=api;
  if(root.document){const start=()=>{if(!install())root.setTimeout(start,0);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);