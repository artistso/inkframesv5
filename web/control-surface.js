// InkFrame — Glass Horizon Control Surface v2
'use strict';
(function(root){
  const STYLE_ID='inkframe-control-surface-v2';
  const CONTROL_SELECTOR='button,.orb,.kid,.frameSlot,[role="button"]';
  const DANGER_COMMANDS=new Set(['delete','mergedown','flatten','clearproject','clearcanvas','clearbackground']);
  const TRANSPORT_ACTIONS=new Set(['previous','prev','next','play','pause']);
  const DANGER_WORDS=/\b(delete|remove|flatten|merge down|clear project|clear canvas|clear background)\b/i;
  const safe=value=>String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);
  const classTokens=value=>safe(value).split(/\s+/).filter(Boolean);
  const data=(dataset,key)=>dataset&&typeof dataset==='object'?safe(dataset[key]).toLowerCase():'';

  function normalizeDescriptor(value){
    const input=value&&typeof value==='object'?value:{};
    const ariaDisabled=safe(input.ariaDisabled||input['aria-disabled']).toLowerCase();
    return Object.freeze({
      tag:safe(input.tag||input.tagName).toLowerCase(),
      id:safe(input.id).toLowerCase(),
      text:safe(input.text||input.textContent||input.label),
      title:safe(input.title),
      classes:Object.freeze(classTokens(input.className||input.classes)),
      disabled:!!input.disabled||ariaDisabled==='true',
      ariaPressed:safe(input.ariaPressed||input['aria-pressed']).toLowerCase(),
      action:data(input.dataset,'action'),
      timelineCommand:data(input.dataset,'timelineCommand'),
      layerCommand:data(input.dataset,'layerCommand'),
    });
  }

  function classifyDescriptor(value){
    const item=normalizeDescriptor(value),classes=new Set(item.classes);
    const command=[item.action,item.timelineCommand,item.layerCommand,item.id,item.text,item.title].filter(Boolean).join(' ');
    const radial=classes.has('orb')||classes.has('kid');
    const frame=classes.has('frameSlot');
    const exactText=item.text.toLowerCase();
    const transport=TRANSPORT_ACTIONS.has(item.action)||TRANSPORT_ACTIONS.has(exactText)||/rail(prev|next)/i.test(item.id);
    const danger=DANGER_COMMANDS.has(item.action)||DANGER_COMMANDS.has(item.timelineCommand)||DANGER_COMMANDS.has(item.layerCommand)||DANGER_WORDS.test(command);
    const selected=classes.has('on')||classes.has('active')||classes.has('cur')||classes.has('sel')||item.ariaPressed==='true';
    const compact=radial||frame||classes.has('deck-icon')||classes.has('deck-grip')||item.text.length<=2;
    return Object.freeze({radial,frame,transport,danger,selected,compact,disabled:item.disabled,role:danger?'danger':transport?'transport':selected?'selected':'standard'});
  }

  function descriptorFromElement(element){
    return {
      tagName:element&&element.tagName,id:element&&element.id,textContent:element&&element.textContent,
      title:element&&element.title,className:element&&element.className,dataset:element&&element.dataset,
      disabled:!!(element&&element.disabled),
      ariaDisabled:element&&element.getAttribute?element.getAttribute('aria-disabled'):'',
      ariaPressed:element&&element.getAttribute?element.getAttribute('aria-pressed'):'',
    };
  }

  function applyControlState(element){
    if(!element||!element.classList)return false;
    const state=classifyDescriptor(descriptorFromElement(element));
    element.classList.add('ink-control');
    for(const [name,on] of Object.entries({
      'ink-control--radial':state.radial,'ink-control--frame':state.frame,
      'ink-control--transport':state.transport,'ink-control--danger':state.danger,
      'ink-control--selected':state.selected,'ink-control--compact':state.compact,
    }))element.classList.toggle(name,on);
    if(element.toggleAttribute)element.toggleAttribute('data-inkframe-disabled',state.disabled);
    if(element.setAttribute){
      if(state.disabled)element.setAttribute('aria-disabled','true');
      else if(element.getAttribute&&element.getAttribute('aria-disabled')==='true')element.removeAttribute('aria-disabled');
      if(!safe(element.getAttribute&&element.getAttribute('aria-label'))&&!safe(element.textContent)&&safe(element.title))element.setAttribute('aria-label',safe(element.title));
    }
    return true;
  }

  function decorateTree(target){
    if(!target)return 0;let count=0;
    if(target.matches&&target.matches(CONTROL_SELECTOR)&&applyControlState(target))count++;
    if(target.querySelectorAll)for(const element of target.querySelectorAll(CONTROL_SELECTOR))if(applyControlState(element))count++;
    return count;
  }

  function css(){return `
:root{
  --ink-control-min:44px;--ink-control-min-coarse:52px;--ink-control-radius:14px;
  --ink-control-border:rgba(255,240,243,.28);--ink-control-border-strong:rgba(255,240,243,.62);
  --ink-control-bg:linear-gradient(165deg,rgba(255,240,243,.13),rgba(66,8,44,.72));
  --ink-control-bg-hover:linear-gradient(165deg,rgba(255,240,243,.20),rgba(92,9,55,.82));
  --ink-control-bg-selected:linear-gradient(160deg,rgba(136,0,87,.92),rgba(187,0,55,.88));
  --ink-control-bg-danger:linear-gradient(160deg,rgba(108,12,45,.86),rgba(74,5,30,.82));
  --ink-control-shadow:0 7px 20px rgba(10,0,10,.34),inset 0 1px 0 rgba(255,255,255,.16);
  --ink-control-shadow-hover:0 10px 26px rgba(10,0,10,.42),0 0 0 1px rgba(255,240,243,.10),inset 0 1px 0 rgba(255,255,255,.22);
  --ink-control-shadow-selected:0 10px 28px rgba(78,0,45,.48),0 0 18px rgba(187,0,55,.34),inset 0 1px 0 rgba(255,255,255,.28);
}
.ink-control{
  min-height:var(--ink-control-min)!important;border:1px solid var(--ink-control-border)!important;border-radius:var(--ink-control-radius)!important;
  background:var(--ink-control-bg)!important;color:var(--text,#fff0f3)!important;box-shadow:var(--ink-control-shadow)!important;
  font-family:var(--font-ui,system-ui,sans-serif)!important;font-weight:800!important;letter-spacing:.045em!important;
  text-shadow:0 1px 2px rgba(0,0,0,.62)!important;-webkit-tap-highlight-color:transparent;
  transition:background .16s ease,border-color .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease,transform .10s ease!important;
}
button.ink-control:not(.ink-control--compact),[role="button"].ink-control:not(.ink-control--compact){padding:9px 13px!important}
.ink-control--radial{border-radius:50%!important;background:linear-gradient(160deg,rgba(255,240,243,.15),rgba(62,8,43,.76))!important;box-shadow:0 8px 22px rgba(10,0,10,.40),inset 0 1px 0 rgba(255,255,255,.22)!important}
.ink-control--frame{border-radius:7px!important}.ink-control--transport{border-color:rgba(247,202,201,.42)!important}
.ink-control--danger{background:var(--ink-control-bg-danger)!important;border-color:rgba(255,145,165,.48)!important}
.ink-control--selected,.node.open>.orb.ink-control,.kid.on.ink-control,.frameSlot.cur.ink-control,.frameSlot.sel.ink-control{background:var(--ink-control-bg-selected)!important;border-color:var(--ink-control-border-strong)!important;box-shadow:var(--ink-control-shadow-selected)!important}
@media(hover:hover){
  .ink-control:hover,.ink-control.inkframe-pen-hover{background:var(--ink-control-bg-hover)!important;border-color:rgba(255,240,243,.52)!important;box-shadow:var(--ink-control-shadow-hover)!important;filter:brightness(1.06)}
  button.ink-control:hover:not(.ink-control--radial):not(.ink-control--frame),[role="button"].ink-control:hover:not(.ink-control--radial):not(.ink-control--frame){transform:translateY(-1px)}
}
button.ink-control:active:not(.ink-control--radial):not(.ink-control--frame),button.ink-control.is-pressed:not(.ink-control--radial):not(.ink-control--frame),[role="button"].ink-control.is-pressed:not(.ink-control--radial):not(.ink-control--frame){transform:translateY(1px) scale(.985)!important;box-shadow:0 3px 10px rgba(10,0,10,.34),inset 0 1px 4px rgba(0,0,0,.24)!important}
.ink-control:focus-visible{outline:3px solid rgba(255,240,243,.94)!important;outline-offset:3px!important}
.ink-control:disabled,.ink-control[data-inkframe-disabled]{opacity:.38!important;filter:saturate(.35)!important;box-shadow:none!important;cursor:not-allowed!important}
#inkframeTabletDeck .deck-modes button,#inkframeTabletDeck .deck-transport button,#inkframeTabletDeck .deck-utilities button,#inkframeTimelineWorkspace button,#inkframeLayerWorkspace button{border-radius:13px!important;text-transform:uppercase!important}
#inkframeTabletDeck .deck-icon,#inkframeTabletDeck .deck-grip{border-radius:50%!important}
#studio .actions button,#studio .close,#projectPanel .footer button,.projBtn,#startActions button,#expo button,#blab button,#stylusPanel button,.customTemplate button{text-transform:uppercase!important}
@media(pointer:coarse){
  button.ink-control:not(.ink-control--compact),[role="button"].ink-control:not(.ink-control--compact){min-height:var(--ink-control-min-coarse)!important}
  #inkframeTabletDeck .deck-icon,#inkframeTabletDeck .deck-grip{width:52px!important;height:52px!important;min-height:52px!important}
  .frameSlot.ink-control{min-width:28px!important;min-height:28px!important}
}
@media(prefers-reduced-motion:reduce){.ink-control{transition:none!important}button.ink-control,[role="button"].ink-control{transform:none!important}}
`;}

  let observer=null;
  function installStyle(document){
    if(!document||!document.head)return false;
    let style=document.getElementById(STYLE_ID);
    if(style)return true;
    style=document.createElement('style');style.id=STYLE_ID;style.dataset.inkframeControlSurface='v2';style.textContent=css();
    document.head.appendChild(style);return true;
  }

  const controlFromEvent=event=>event&&event.target&&event.target.closest?event.target.closest(CONTROL_SELECTOR):null;
  function onPointerOver(event){if(event&&event.pointerType!=='pen')return;const control=controlFromEvent(event);if(control)control.classList.add('inkframe-pen-hover');}
  function onPointerOut(event){const control=controlFromEvent(event);if(control)control.classList.remove('inkframe-pen-hover');}
  function onPointerDown(event){const control=controlFromEvent(event);if(control)control.classList.add('is-pressed');}
  function clearPressed(event){const control=controlFromEvent(event);if(control)control.classList.remove('is-pressed');}

  function install(){
    const document=root&&root.document;if(!document)return false;
    installStyle(document);decorateTree(document);
    if(document.addEventListener&&!document.documentElement.dataset.inkframeControlEvents){
      document.documentElement.dataset.inkframeControlEvents='v2';
      document.addEventListener('pointerover',onPointerOver,true);document.addEventListener('pointerout',onPointerOut,true);
      document.addEventListener('pointerdown',onPointerDown,true);document.addEventListener('pointerup',clearPressed,true);
      document.addEventListener('pointercancel',clearPressed,true);document.addEventListener('lostpointercapture',clearPressed,true);
    }
    if(typeof root.MutationObserver==='function'&&!observer){
      observer=new root.MutationObserver(records=>{
        for(const record of records){
          if(record.type==='attributes'){applyControlState(record.target);continue;}
          for(const node of record.addedNodes||[])decorateTree(node);
        }
      });
      observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled','aria-pressed','title']});
    }
    return true;
  }

  function scheduleInstall(){if(!root||typeof root.setTimeout!=='function')return install();root.setTimeout(install,0);root.setTimeout(install,120);return true;}
  if(root&&typeof root.addEventListener==='function'){root.addEventListener('load',scheduleInstall);root.addEventListener('orientationchange',scheduleInstall);}
  scheduleInstall();

  const api=Object.freeze({STYLE_ID,CONTROL_SELECTOR,normalizeDescriptor,classifyDescriptor,applyControlState,decorateTree,css,install,
    projectCanvasWrites:0,artworkWrites:0,artworkUndoWrites:0,timingWrites:0,layerWrites:0,
    projectSchemaWrites:0,archiveWrites:0,storageWrites:0,networkWrites:0});
  root.InkFrameControlSurface=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
