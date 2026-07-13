// InkFrame Brush Engine V2 — adaptive stabilizer and corner controls
'use strict';
(function(root){
  const MODE_ID='inkframe-v2-stabilizer-mode';
  const STRENGTH_ID='inkframe-v2-stabilizer-strength';
  const CORNER_MODE_ID='inkframe-v2-corner-mode';
  const CORNER_STRENGTH_ID='inkframe-v2-corner-strength';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)));
  const adapter=()=>root.InkFrameBrushV2Adapter||null;
  const normalizeMode=v=>v==='adaptive'?'adaptive':'fixed';
  const normalizeCornerMode=v=>v==='preserve'?'preserve':'smooth';

  function sync(nodes){
    const api=adapter();
    if(!api||typeof api.currentTuning!=='function')return false;
    const tuning=api.currentTuning()||{};
    const mode=normalizeMode(tuning.stabilizerMode);
    const strength=clamp(tuning.stabilizerStrength??55,0,200);
    const cornerMode=normalizeCornerMode(tuning.cornerMode);
    const cornerStrength=clamp(tuning.cornerStrength??70,0,100);
    const active=typeof api.isActive==='function'&&api.isActive();
    nodes.mode.value=mode;
    nodes.mode.disabled=active;
    nodes.strength.value=String(strength);
    nodes.strength.disabled=active||mode!=='adaptive';
    nodes.output.textContent=Math.round(strength)+'%';
    nodes.output.dataset.studio=strength>100?'true':'false';
    nodes.cornerMode.value=cornerMode;
    nodes.cornerMode.disabled=active;
    nodes.cornerStrength.value=String(cornerStrength);
    nodes.cornerStrength.disabled=active||cornerMode!=='preserve';
    nodes.cornerOutput.textContent=Math.round(cornerStrength)+'%';
    if(nodes.fixedInput)nodes.fixedInput.disabled=active||mode!=='fixed';
    return true;
  }

  function makeSelectRow(labelText,id,options,noteText){
    const row=root.document.createElement('label');
    row.className='inkframe-v2-tune-row';
    const name=root.document.createElement('span');
    name.textContent=labelText;
    const select=root.document.createElement('select');
    select.id=id;
    for(const pair of options){
      const option=root.document.createElement('option');
      option.value=pair[0]; option.textContent=pair[1]; select.appendChild(option);
    }
    const note=root.document.createElement('output');
    note.textContent=noteText;
    row.append(name,select,note);
    return {row,select};
  }

  function makeRangeRow(labelText,id,max){
    const row=root.document.createElement('label');
    row.className='inkframe-v2-tune-row';
    const name=root.document.createElement('span');
    name.textContent=labelText;
    const input=root.document.createElement('input');
    input.id=id;
    input.type='range'; input.min='0'; input.max=String(max||100); input.step='1';
    const output=root.document.createElement('output');
    row.append(name,input,output);
    return {row,input,output};
  }

  function install(){
    if(!root.document)return false;
    const api=adapter();
    const panel=root.document.getElementById('inkframe-v2-tuning');
    if(!api||!panel)return false;
    if(root.document.getElementById(MODE_ID)
      &&root.document.getElementById(CORNER_MODE_ID))return true;

    let fixedInput=null;
    for(const row of panel.querySelectorAll('.inkframe-v2-tune-row')){
      const label=row.querySelector('span');
      if(label&&label.textContent==='Position lag'){
        label.textContent='Fixed lag';
        fixedInput=row.querySelector('input');
      }
    }

    const stabilizerMode=makeSelectRow(
      'Stabilizer',MODE_ID,[['adaptive','Adaptive'],['fixed','Fixed']],'mode'
    );
    const stabilizerStrength=makeRangeRow('Strength',STRENGTH_ID,200);
    const cornerMode=makeSelectRow(
      'Corners',CORNER_MODE_ID,[['preserve','Preserve'],['smooth','Smooth']],'turns'
    );
    const cornerStrength=makeRangeRow('Corner response',CORNER_STRENGTH_ID,100);

    panel.insertBefore(cornerStrength.row,panel.children[1]||null);
    panel.insertBefore(cornerMode.row,panel.children[1]||null);
    panel.insertBefore(stabilizerStrength.row,panel.children[1]||null);
    panel.insertBefore(stabilizerMode.row,panel.children[1]||null);

    const nodes={
      mode:stabilizerMode.select,
      strength:stabilizerStrength.input,
      output:stabilizerStrength.output,
      cornerMode:cornerMode.select,
      cornerStrength:cornerStrength.input,
      cornerOutput:cornerStrength.output,
      fixedInput,
    };
    nodes.mode.addEventListener('change',()=>{
      api.setTuning({stabilizerMode:normalizeMode(nodes.mode.value)}); sync(nodes);
    });
    nodes.strength.addEventListener('input',()=>{
      api.setTuning({stabilizerStrength:clamp(nodes.strength.value,0,200)}); sync(nodes);
    });
    nodes.cornerMode.addEventListener('change',()=>{
      api.setTuning({cornerMode:normalizeCornerMode(nodes.cornerMode.value)}); sync(nodes);
    });
    nodes.cornerStrength.addEventListener('input',()=>{
      api.setTuning({cornerStrength:clamp(nodes.cornerStrength.value,0,100)}); sync(nodes);
    });
    const preset=panel.querySelector('.inkframe-v2-tune-head select');
    if(preset)preset.addEventListener('change',()=>root.setTimeout(()=>sync(nodes),0));
    sync(nodes);
    return true;
  }

  const api={
    MODE_ID,STRENGTH_ID,CORNER_MODE_ID,CORNER_STRENGTH_ID,
    normalizeMode,normalizeCornerMode,sync,install,
  };
  root.InkFrameBrushV2StabilizerUI=api;
  if(root.document){
    const start=()=>{if(!install())root.setTimeout(install,0);};
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
