// InkFrame Brush Engine V2 — grouped tablet Brush Lab
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
  const LABEL_GROUP={
    'Stabilizer':'stabilizer','Strength':'stabilizer','Fixed lag':'stabilizer','Corners':'stabilizer','Corner response':'stabilizer',
    'Ghost trail':'trail','Trail intensity':'trail','Trail length':'trail','Trail width':'trail',
    'Pressure lag':'stroke','Dab spacing':'stroke','Coverage':'stroke','Width guard':'stroke',
    'Contact':'safety','Spike gate':'safety',
  };
  const adapter=()=>root.InkFrameBrushV2Adapter||null;

  function storedTab(){
    try{const value=root.localStorage&&root.localStorage.getItem(TAB_KEY);return GROUPS.some(group=>group[0]===value)?value:'stabilizer';}
    catch(_){return 'stabilizer';}
  }
  function rememberTab(value){try{if(root.localStorage)root.localStorage.setItem(TAB_KEY,value);}catch(_){} }

  function install(){
    if(!root.document)return false;
    const api=adapter();
    const panel=root.document.getElementById('inkframe-v2-ab');
    const lab=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!panel||!lab)return false;
    if(root.document.getElementById('inkframe-v2-lab-tabs'))return true;
    if(!root.document.getElementById('inkframe-v2-ghost-mode'))return false;

    const style=root.document.createElement('style');
    style.textContent=`
      #inkframe-v2-tuning{width:min(94vw,760px)!important;max-height:min(78vh,720px);overflow:auto;padding:14px!important}
      #inkframe-v2-tuning .inkframe-v2-tune-head{position:sticky;top:-14px;z-index:3;margin:-14px -14px 12px!important;padding:12px 14px;background:rgba(24,8,20,.97);border-bottom:1px solid rgba(255,255,255,.15)}
      #inkframe-v2-lab-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:0 0 12px}
      #inkframe-v2-lab-tabs button{min-height:42px;border:1px solid rgba(255,255,255,.24);border-radius:13px;background:rgba(255,255,255,.08);color:#fff;font:750 11px/1.1 system-ui,sans-serif;padding:7px 5px;letter-spacing:.02em}
      #inkframe-v2-lab-tabs button.on{background:linear-gradient(145deg,#bb0037,#76004c);border-color:#ffd0dc;box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 4px 16px rgba(187,0,55,.32)}
      .inkframe-v2-lab-section[hidden]{display:none}
      .inkframe-v2-lab-section{padding:2px 2px 8px}
      .inkframe-v2-lab-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:4px 0 12px;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
      .inkframe-v2-lab-section-head strong{font-size:15px;letter-spacing:.03em}
      .inkframe-v2-lab-section-head small{display:block;margin-top:4px;opacity:.7;font-weight:500}
      .inkframe-v2-lab-presets{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 13px}
      .inkframe-v2-lab-presets button,.inkframe-v2-diag-tools button{border:1px solid rgba(255,255,255,.24);border-radius:12px;background:rgba(255,255,255,.09);color:#fff;padding:8px 11px;font:700 11px/1 system-ui,sans-serif}
      .inkframe-v2-lab-presets button.studio{background:linear-gradient(145deg,rgba(187,0,55,.72),rgba(87,0,92,.78))}
      .inkframe-v2-tune-row{grid-template-columns:140px minmax(180px,1fr) 64px!important;min-height:38px;padding:4px 6px;margin:4px 0!important;border-radius:10px}
      .inkframe-v2-tune-row:hover{background:rgba(255,255,255,.045)}
      .inkframe-v2-tune-row select{width:100%;min-height:34px;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:#2b1325;color:#fff;padding:5px 8px}
      .inkframe-v2-tune-row output[data-studio="true"]{color:#ffd0dc;font-weight:850;text-shadow:0 0 8px rgba(255,90,150,.55)}
      .inkframe-v2-diag-tools{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
      .inkframe-v2-diag-card{padding:11px;border-radius:12px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);font:600 11px/1.45 system-ui,sans-serif;opacity:.9}
      #inkframe-v2-lab-close{flex:0 0 auto!important;min-width:36px}
      @media(max-width:720px){#inkframe-v2-lab-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}.inkframe-v2-tune-row{grid-template-columns:104px minmax(120px,1fr) 56px!important}}
    `;
    root.document.head.appendChild(style);

    const head=lab.querySelector('.inkframe-v2-tune-head');
    const close=root.document.createElement('button');
    close.id='inkframe-v2-lab-close';close.type='button';close.textContent='×';close.title='Close Brush Lab';
    close.addEventListener('click',()=>{lab.hidden=true;});
    if(head)head.appendChild(close);

    const tabs=root.document.createElement('div');
    tabs.id='inkframe-v2-lab-tabs';tabs.setAttribute('role','tablist');
    const sections=new Map();
    const buttons=new Map();
    for(const [key,label,description] of GROUPS){
      const button=root.document.createElement('button');button.type='button';button.textContent=label;button.dataset.labTab=key;button.setAttribute('role','tab');
      tabs.appendChild(button);buttons.set(key,button);
      const section=root.document.createElement('section');section.className='inkframe-v2-lab-section';section.dataset.labSection=key;section.setAttribute('role','tabpanel');
      const sectionHead=root.document.createElement('div');sectionHead.className='inkframe-v2-lab-section-head';
      const copy=root.document.createElement('div');const title=root.document.createElement('strong');title.textContent=label;const note=root.document.createElement('small');note.textContent=description;copy.append(title,note);sectionHead.appendChild(copy);section.appendChild(sectionHead);
      sections.set(key,section);
    }
    if(head)head.insertAdjacentElement('afterend',tabs);else lab.prepend(tabs);
    for(const section of sections.values())lab.appendChild(section);

    const stabilizerSection=sections.get('stabilizer');
    const presets=root.document.createElement('div');presets.className='inkframe-v2-lab-presets';
    const presetButton=(label,handler,studio)=>{const button=root.document.createElement('button');button.type='button';button.textContent=label;if(studio)button.className='studio';button.addEventListener('click',handler);presets.appendChild(button);};
    presetButton('Direct',()=>api.setTuningPreset('direct'));
    presetButton('Balanced',()=>api.setTuningPreset('balanced'));
    presetButton('Smooth',()=>api.setTuningPreset('smooth'));
    presetButton('Studio 150%',()=>api.setTuning({stabilizerMode:'adaptive',stabilizerStrength:150,cornerMode:'preserve',cornerStrength:70,ghostMode:'echo',ghostIntensity:82,ghostDurationMs:720,ghostWidthPercent:165}),true);
    presetButton('Maximum 200%',()=>api.setTuning({stabilizerMode:'adaptive',stabilizerStrength:200,cornerMode:'preserve',cornerStrength:78,ghostMode:'echo',ghostIntensity:90,ghostDurationMs:900,ghostWidthPercent:185}),true);
    stabilizerSection.appendChild(presets);

    for(const row of Array.from(lab.querySelectorAll(':scope > .inkframe-v2-tune-row'))){
      const label=row.querySelector('span');
      const group=LABEL_GROUP[label&&label.textContent]||'stroke';
      sections.get(group).appendChild(row);
    }

    const diagnostics=sections.get('diagnostics');
    const diagTools=root.document.createElement('div');diagTools.className='inkframe-v2-diag-tools';
    for(const button of Array.from(panel.querySelectorAll('button'))){
      if(['Import trace','Replay','Export trace'].includes(button.textContent))diagTools.appendChild(button);
    }
    diagnostics.appendChild(diagTools);
    const diagCard=root.document.createElement('div');diagCard.className='inkframe-v2-diag-card';
    diagCard.textContent='Debug builds can capture and replay traces. Production builds retain the stabilized brush controls but exclude native telemetry and raw event history.';
    diagnostics.appendChild(diagCard);

    function openTab(key){
      const resolved=sections.has(key)?key:'stabilizer';
      for(const [name,section] of sections){const active=name===resolved;section.hidden=!active;buttons.get(name).classList.toggle('on',active);buttons.get(name).setAttribute('aria-selected',String(active));}
      rememberTab(resolved);return resolved;
    }
    for(const [key,button] of buttons)button.addEventListener('click',()=>openTab(key));
    openTab(storedTab());

    root.InkFrameBrushV2LabUI={openTab,sections,buttons,installed:true};
    return true;
  }

  const api={GROUPS,LABEL_GROUP,install};
  root.InkFrameBrushV2LabUI=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(start,0);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
