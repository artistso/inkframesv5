// InkFrame Brush Engine V2 — tablet-first Brush Lab
'use strict';
(function(root){
  const TAB_KEY='inkframe.brushLab.activeTab.v1';
  const GROUPS=[
    ['stabilizer','Stabilizer','Steady motion and deliberate turns','◎'],
    ['trail','Ghost Trail','Shape the luminous brush afterimage','✦'],
    ['stroke','Stroke','Coverage, width, pressure, and spacing','●'],
    ['safety','Safety','Contact and coordinate containment','◇'],
    ['diagnostics','Diagnostics','Trace tools and engine state','⋯'],
  ];
  const LABEL_GROUP={
    'Stabilizer':'stabilizer','Strength':'stabilizer','Fixed lag':'stabilizer','Corners':'stabilizer','Corner response':'stabilizer',
    'Ghost trail':'trail','Trail intensity':'trail','Trail length':'trail','Trail width':'trail',
    'Pressure lag':'stroke','Dab spacing':'stroke','Coverage':'stroke','Width guard':'stroke',
    'Contact':'safety','Spike gate':'safety',
  };
  const ADVANCED_LABELS=new Set(['Fixed lag','Corner response','Pressure lag','Dab spacing','Spike gate']);
  const adapter=()=>root.InkFrameBrushV2Adapter||null;
  const traceToolsEnabled=()=>!(root.InkFrameBuild&&root.InkFrameBuild.traceTools===false);
  const visibleGroups=()=>GROUPS.filter(group=>group[0]!=='diagnostics'||traceToolsEnabled());

  function storedTab(groups){
    try{
      const value=root.localStorage&&root.localStorage.getItem(TAB_KEY);
      return groups.some(group=>group[0]===value)?value:'stabilizer';
    }catch(_){return 'stabilizer';}
  }
  function rememberTab(value){try{if(root.localStorage)root.localStorage.setItem(TAB_KEY,value);}catch(_){} }

  function install(){
    if(!root.document)return false;
    const api=adapter();
    const dock=root.document.getElementById('inkframe-v2-ab');
    const lab=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!dock||!lab)return false;
    if(root.document.getElementById('inkframe-v2-lab-tabs'))return true;
    if(!root.document.getElementById('inkframe-v2-ghost-mode'))return false;
    const groups=visibleGroups();

    const style=root.document.createElement('style');
    style.textContent=`
      #inkframe-v2-ab{top:12px!important;gap:8px!important;padding:7px!important;border-radius:18px!important;max-width:none!important;background:rgba(20,7,18,.88)!important}
      #inkframe-v2-ab>button{min-height:42px!important;padding:9px 15px!important;border-radius:13px!important;font-size:12px!important;letter-spacing:.025em!important}
      #inkframe-v2-ab>button:nth-of-type(2){background:linear-gradient(145deg,rgba(187,0,55,.78),rgba(86,0,78,.88))!important;border-color:rgba(255,208,220,.68)!important;min-width:112px}
      #inkframe-v2-status{display:none!important}
      #inkframe-v2-tuning{top:68px!important;width:min(94vw,820px)!important;max-height:calc(100vh - 88px)!important;overflow:auto;padding:18px!important;border-radius:24px!important;background:rgba(20,7,18,.965)!important;box-shadow:0 22px 70px rgba(0,0,0,.48)!important}
      #inkframe-v2-tuning .inkframe-v2-tune-head{position:sticky;top:-18px;z-index:5;margin:-18px -18px 16px!important;padding:14px 16px!important;background:rgba(20,7,18,.985);border-bottom:1px solid rgba(255,255,255,.13)}
      #inkframe-v2-tuning .inkframe-v2-tune-head strong{font-size:17px;letter-spacing:.04em}
      #inkframe-v2-tuning .inkframe-v2-tune-head select,#inkframe-v2-tuning .inkframe-v2-tune-head button:not(#inkframe-v2-lab-close){display:none!important}
      #inkframe-v2-lab-tabs{display:grid;grid-template-columns:repeat(var(--inkframe-lab-columns,5),minmax(0,1fr));gap:10px;margin:0 0 18px}
      #inkframe-v2-lab-tabs button{min-height:72px;border:1px solid rgba(255,255,255,.16);border-radius:17px;background:rgba(255,255,255,.055);color:#fff;font:760 12px/1.15 system-ui,sans-serif;padding:10px 7px;letter-spacing:.015em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px}
      #inkframe-v2-lab-tabs button .inkframe-v2-tab-icon{font-size:21px;line-height:1;opacity:.88}
      #inkframe-v2-lab-tabs button.on{background:linear-gradient(145deg,#bb0037,#69004e);border-color:#ffd0dc;box-shadow:0 0 0 1px rgba(255,255,255,.12) inset,0 8px 24px rgba(187,0,55,.28)}
      .inkframe-v2-lab-section[hidden]{display:none}
      .inkframe-v2-lab-section{padding:0 2px 8px}
      .inkframe-v2-lab-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 14px;padding:13px 15px;border-radius:15px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10)}
      .inkframe-v2-lab-section-head strong{font-size:17px;letter-spacing:.025em}
      .inkframe-v2-lab-section-head small{display:block;margin-top:5px;opacity:.67;font-weight:500;font-size:12px}
      .inkframe-v2-lab-primary{display:grid;gap:7px}
      .inkframe-v2-lab-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 16px}
      .inkframe-v2-lab-presets button,.inkframe-v2-diag-tools button{min-height:46px;border:1px solid rgba(255,255,255,.17);border-radius:13px;background:rgba(255,255,255,.075);color:#fff;padding:9px 10px;font:720 11px/1.15 system-ui,sans-serif}
      .inkframe-v2-lab-presets button.studio{background:linear-gradient(145deg,rgba(187,0,55,.72),rgba(87,0,92,.78));border-color:rgba(255,208,220,.45)}
      .inkframe-v2-tune-row{grid-template-columns:150px minmax(180px,1fr) 70px!important;min-height:48px;padding:8px 10px!important;margin:0!important;border-radius:12px;background:rgba(255,255,255,.032)}
      .inkframe-v2-tune-row+ .inkframe-v2-tune-row{margin-top:7px!important}
      .inkframe-v2-tune-row select{width:100%;min-height:38px;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:#2b1325;color:#fff;padding:6px 9px}
      .inkframe-v2-tune-row input[type="range"]{min-height:34px}
      .inkframe-v2-tune-row output[data-studio="true"]{color:#ffd0dc;font-weight:850;text-shadow:0 0 8px rgba(255,90,150,.55)}
      .inkframe-v2-lab-advanced{margin-top:14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden}
      .inkframe-v2-lab-advanced summary{list-style:none;cursor:pointer;min-height:48px;padding:14px 15px;display:flex;align-items:center;justify-content:space-between;font:730 12px/1 system-ui,sans-serif;letter-spacing:.025em}
      .inkframe-v2-lab-advanced summary::-webkit-details-marker{display:none}
      .inkframe-v2-lab-advanced summary::after{content:'+';font-size:19px;opacity:.72}
      .inkframe-v2-lab-advanced[open] summary::after{content:'−'}
      .inkframe-v2-lab-advanced-body{padding:0 8px 8px}
      .inkframe-v2-diag-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px}
      .inkframe-v2-diag-card{padding:13px;border-radius:13px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10);font:600 11px/1.5 system-ui,sans-serif;opacity:.86}
      #inkframe-v2-lab-close{display:flex!important;align-items:center;justify-content:center;flex:0 0 auto!important;width:42px!important;height:42px!important;margin-left:auto!important;border-radius:12px!important;font-size:22px!important}
      @media(max-width:720px){
        #inkframe-v2-lab-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}
        .inkframe-v2-lab-presets{grid-template-columns:repeat(2,minmax(0,1fr))}
        .inkframe-v2-tune-row{grid-template-columns:108px minmax(105px,1fr) 58px!important}
      }
    `;
    root.document.head.appendChild(style);

    const head=lab.querySelector('.inkframe-v2-tune-head');
    const title=head&&head.querySelector('strong');
    if(title)title.textContent='Brush Lab';
    const tuneButton=Array.from(dock.querySelectorAll('button')).find(button=>String(button.textContent||'').startsWith('Tune'));
    if(tuneButton){tuneButton.textContent='Brush Lab';tuneButton.setAttribute('aria-label','Open Brush Lab');}
    const close=root.document.createElement('button');
    close.id='inkframe-v2-lab-close';close.type='button';close.textContent='×';close.title='Close Brush Lab';
    close.addEventListener('click',()=>{lab.hidden=true;});
    if(head)head.appendChild(close);

    const tabs=root.document.createElement('div');
    tabs.id='inkframe-v2-lab-tabs';tabs.setAttribute('role','tablist');
    tabs.style.setProperty('--inkframe-lab-columns',String(groups.length));
    const sections=new Map();
    const buttons=new Map();
    const primaryBodies=new Map();
    const advancedBodies=new Map();
    for(const [key,label,description,icon] of groups){
      const button=root.document.createElement('button');button.type='button';button.dataset.labTab=key;button.setAttribute('role','tab');
      const iconNode=root.document.createElement('span');iconNode.className='inkframe-v2-tab-icon';iconNode.textContent=icon;
      const labelNode=root.document.createElement('span');labelNode.textContent=label;button.append(iconNode,labelNode);
      tabs.appendChild(button);buttons.set(key,button);
      const section=root.document.createElement('section');section.className='inkframe-v2-lab-section';section.dataset.labSection=key;section.setAttribute('role','tabpanel');
      const sectionHead=root.document.createElement('div');sectionHead.className='inkframe-v2-lab-section-head';
      const copy=root.document.createElement('div');const sectionTitle=root.document.createElement('strong');sectionTitle.textContent=label;const note=root.document.createElement('small');note.textContent=description;copy.append(sectionTitle,note);sectionHead.appendChild(copy);section.appendChild(sectionHead);
      const primary=root.document.createElement('div');primary.className='inkframe-v2-lab-primary';section.appendChild(primary);primaryBodies.set(key,primary);
      const details=root.document.createElement('details');details.className='inkframe-v2-lab-advanced';
      const summary=root.document.createElement('summary');summary.textContent='Advanced controls';
      const advanced=root.document.createElement('div');advanced.className='inkframe-v2-lab-advanced-body';details.append(summary,advanced);section.appendChild(details);advancedBodies.set(key,{details,body:advanced});
      sections.set(key,section);
    }
    if(head)head.insertAdjacentElement('afterend',tabs);else lab.prepend(tabs);
    for(const section of sections.values())lab.appendChild(section);

    const presets=root.document.createElement('div');presets.className='inkframe-v2-lab-presets';
    const presetButton=(label,handler,studio)=>{const button=root.document.createElement('button');button.type='button';button.textContent=label;if(studio)button.className='studio';button.addEventListener('click',handler);presets.appendChild(button);};
    presetButton('Direct',()=>api.setTuningPreset('direct'));
    presetButton('Balanced',()=>api.setTuningPreset('balanced'));
    presetButton('Smooth',()=>api.setTuningPreset('smooth'));
    presetButton('Studio 150%',()=>api.setTuning({stabilizerMode:'adaptive',stabilizerStrength:150,cornerMode:'preserve',cornerStrength:70,ghostMode:'echo',ghostIntensity:82,ghostDurationMs:720,ghostWidthPercent:165}),true);
    presetButton('Maximum 200%',()=>api.setTuning({stabilizerMode:'adaptive',stabilizerStrength:200,cornerMode:'preserve',cornerStrength:78,ghostMode:'echo',ghostIntensity:90,ghostDurationMs:900,ghostWidthPercent:185}),true);
    primaryBodies.get('stabilizer').prepend(presets);

    for(const row of Array.from(lab.querySelectorAll(':scope > .inkframe-v2-tune-row'))){
      const label=row.querySelector('span');
      const text=label&&label.textContent||'';
      const group=LABEL_GROUP[text]||'stroke';
      const destination=ADVANCED_LABELS.has(text)?advancedBodies.get(group).body:primaryBodies.get(group);
      destination.appendChild(row);
    }
    for(const [key,value] of advancedBodies){if(!value.body.children.length)value.details.remove();}

    const diagnostics=sections.get('diagnostics');
    if(diagnostics){
      const diagTools=root.document.createElement('div');diagTools.className='inkframe-v2-diag-tools';
      for(const button of Array.from(dock.querySelectorAll('button'))){
        if(['Import trace','Replay','Export trace'].includes(button.textContent))diagTools.appendChild(button);
      }
      primaryBodies.get('diagnostics').appendChild(diagTools);
      const diagCard=root.document.createElement('div');diagCard.className='inkframe-v2-diag-card';
      diagCard.textContent='Debug tools are isolated here so they never compete with drawing controls. Production excludes native telemetry and trace history.';
      primaryBodies.get('diagnostics').appendChild(diagCard);
    }

    function openTab(key){
      const resolved=sections.has(key)?key:'stabilizer';
      for(const [name,section] of sections){const active=name===resolved;section.hidden=!active;buttons.get(name).classList.toggle('on',active);buttons.get(name).setAttribute('aria-selected',String(active));}
      rememberTab(resolved);return resolved;
    }
    for(const [key,button] of buttons)button.addEventListener('click',()=>openTab(key));
    openTab(storedTab(groups));

    root.InkFrameBrushV2LabUI={openTab,sections,buttons,installed:true,traceTools:traceToolsEnabled()};
    return true;
  }

  const api={GROUPS,LABEL_GROUP,ADVANCED_LABELS,visibleGroups,traceToolsEnabled,install};
  root.InkFrameBrushV2LabUI=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(start,0);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);