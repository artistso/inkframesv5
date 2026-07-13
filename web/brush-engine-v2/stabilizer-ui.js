// InkFrame Brush Engine V2 — adaptive stabilizer controls
'use strict';
(function(root){
  const MODE_ID='inkframe-v2-stabilizer-mode';
  const STRENGTH_ID='inkframe-v2-stabilizer-strength';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)));
  const adapter=()=>root.InkFrameBrushV2Adapter||null;
  const normalizeMode=v=>v==='adaptive'?'adaptive':'fixed';

  function sync(nodes){
    const api=adapter();
    if(!api||typeof api.currentTuning!=='function')return false;
    const tuning=api.currentTuning()||{};
    const mode=normalizeMode(tuning.stabilizerMode);
    const strength=clamp(tuning.stabilizerStrength??55,0,100);
    const active=typeof api.isActive==='function'&&api.isActive();
    nodes.mode.value=mode;
    nodes.mode.disabled=active;
    nodes.strength.value=String(strength);
    nodes.strength.disabled=active||mode!=='adaptive';
    nodes.output.textContent=Math.round(strength)+'%';
    if(nodes.fixedInput)nodes.fixedInput.disabled=active||mode!=='fixed';
    return true;
  }

  function install(){
    if(!root.document)return false;
    const api=adapter();
    const panel=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!panel)return false;
    if(root.document.getElementById(MODE_ID))return true;

    let fixedInput=null;
    for(const row of panel.querySelectorAll('.inkframe-v2-tune-row')){
      const label=row.querySelector('span');
      if(label&&label.textContent==='Position lag'){
        label.textContent='Fixed lag';
        fixedInput=row.querySelector('input');
      }
    }

    const modeRow=root.document.createElement('label');
    modeRow.className='inkframe-v2-tune-row';
    const modeName=root.document.createElement('span');
    modeName.textContent='Stabilizer';
    const mode=root.document.createElement('select');
    mode.id=MODE_ID;
    for(const pair of [['adaptive','Adaptive'],['fixed','Fixed']]){
      const option=root.document.createElement('option');
      option.value=pair[0]; option.textContent=pair[1]; mode.appendChild(option);
    }
    const modeNote=root.document.createElement('output');
    modeNote.textContent='mode';
    modeRow.append(modeName,mode,modeNote);

    const strengthRow=root.document.createElement('label');
    strengthRow.className='inkframe-v2-tune-row';
    const strengthName=root.document.createElement('span');
    strengthName.textContent='Strength';
    const strength=root.document.createElement('input');
    strength.id=STRENGTH_ID;
    strength.type='range'; strength.min='0'; strength.max='100'; strength.step='1';
    const output=root.document.createElement('output');
    strengthRow.append(strengthName,strength,output);

    panel.insertBefore(strengthRow,panel.children[1]||null);
    panel.insertBefore(modeRow,panel.children[1]||null);
    const nodes={mode,strength,output,fixedInput};
    mode.addEventListener('change',()=>{ api.setTuning({stabilizerMode:normalizeMode(mode.value)}); sync(nodes); });
    strength.addEventListener('input',()=>{ api.setTuning({stabilizerStrength:clamp(strength.value,0,100)}); sync(nodes); });
    const preset=panel.querySelector('.inkframe-v2-tune-head select');
    if(preset)preset.addEventListener('change',()=>root.setTimeout(()=>sync(nodes),0));
    sync(nodes);
    return true;
  }

  const api={MODE_ID,STRENGTH_ID,normalizeMode,sync,install};
  root.InkFrameBrushV2StabilizerUI=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(install,0);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
