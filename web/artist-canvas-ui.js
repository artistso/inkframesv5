// InkFrame — Android artist canvas UI policy
'use strict';
(function(root){
  const STYLE_ID='inkframe-artist-canvas-ui-style';
  let diagnosticsVisible=false;

  function installStyle(document){
    if(!document||!document.head)return false;
    if(document.getElementById(STYLE_ID))return true;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      body.inkframe-artist-canvas-ui #inkframe-v2-ab{display:none!important}
      body.inkframe-artist-canvas-ui.inkframe-show-engine-diagnostics #inkframe-v2-ab{display:flex!important}
      body.inkframe-artist-canvas-ui #inkframe-v2-tuning:not([hidden]){z-index:92!important}
    `;
    document.head.appendChild(style);
    return true;
  }

  function render(document){
    if(!document||!document.body)return false;
    installStyle(document);
    document.body.classList.add('inkframe-artist-canvas-ui');
    document.body.classList.toggle('inkframe-show-engine-diagnostics',diagnosticsVisible);
    return true;
  }

  function setDiagnosticsVisible(value){
    diagnosticsVisible=!!value;
    render(root.document);
    return diagnosticsVisible;
  }

  function install(){
    const document=root.document;
    if(!document)return false;
    if(document.body)return render(document);
    document.addEventListener('DOMContentLoaded',()=>render(document),{once:true});
    return true;
  }

  const api=Object.freeze({
    install,
    setDiagnosticsVisible,
    diagnosticsVisible:()=>diagnosticsVisible,
    projectCanvasWrites:0,
    artworkUndoWrites:0,
    timelineWrites:0,
    projectSchemaWrites:0,
    storageWrites:0,
    networkWrites:0,
  });
  root.InkFrameArtistCanvasUI=api;
  install();
})(typeof globalThis!=='undefined'?globalThis:this);
