// Extend the generated tablet Layer Workspace bridge after the static background
// core has installed its project model and active-layer routing.

function replacePattern(source,pattern,replacement,label){
  const matches=[...source.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];
  if(matches.length!==1)throw new Error(`Static background Layer bridge pattern ${matches.length?'not unique':'missing'}: ${label}`);
  return source.replace(pattern,replacement);
}

export function injectStaticBackgroundLayerBridge(html){
  const snapshotAndSelect=`  function tabletLayerSnapshot(){
    const fr=frames[cur]||null,background=backgroundEditing(),L=activeLayer();
    return Object.freeze({
      count:fr&&Array.isArray(fr.layers)?fr.layers.length:0,active:background?0:(fr?fr.active+1:0),background,
      visible:L?L.visible!==false:false,opacity:L?Math.round(L.opacity*100):0,
      blend:L?(BLEND_LABEL[L.blend]||L.blend||'Normal'):'Normal',canInteract:tabletDeckCanInteract(),
    });
  }
  function tabletLayerSelect(delta){
    const fr=frames[cur];if(!fr||!fr.layers.length)return false;const direction=Number(delta)<0?-1:1;
    if(backgroundEditing()){
      if(direction<0)return false;projects[pi].backgroundActive=false;fr.active=0;refreshFctx();render();refreshLayers();flash('Layer 1 of '+fr.layers.length);return true;
    }
    if(direction<0&&fr.active===0){setBackgroundEditing(true);flash('Static background');return true;}
    const next=Math.max(0,Math.min(fr.layers.length-1,fr.active+direction));
    if(next===fr.active)return false;projects[pi].backgroundActive=false;fr.active=next;refreshFctx();render();refreshLayers();
    flash(`Layer ${fr.active+1} of ${fr.layers.length}`);return true;
  }
  function tabletLayerSetOpacity`;
  html=replacePattern(html,/  function tabletLayerSnapshot\(\)\{[\s\S]*?\n  \}\n  function tabletLayerSelect\(delta\)\{[\s\S]*?\n  \}\n  function tabletLayerSetOpacity/,snapshotAndSelect,'snapshot and navigation');

  const command=`  function tabletLayerCommand(name,value){
    if(!tabletDeckCanInteract())return false;
    const command=String(name||''),fr=frames[cur];let handled=true;
    if(command==='background'){if(!backgroundEditing())setBackgroundEditing(true);}
    else if(command==='selectAbove')handled=tabletLayerSelect(1);
    else if(command==='selectBelow')handled=tabletLayerSelect(-1);
    else if(command==='add'){if(backgroundEditing())handled=false;else kLayAdd.click();}
    else if(command==='duplicate'){if(backgroundEditing())handled=false;else kLayDup.click();}
    else if(command==='delete'){if(backgroundEditing()||!fr||fr.layers.length<=1)handled=false;else kLayDel.click();}
    else if(command==='moveUp'){if(backgroundEditing()||!fr||fr.active>=fr.layers.length-1)handled=false;else kLayUp.click();}
    else if(command==='moveDown'){if(backgroundEditing()||!fr||fr.active<=0)handled=false;else kLayDn.click();}
    else if(command==='mergeDown'){if(backgroundEditing()||!fr||fr.active<=0||fr.layers.length<=1)handled=false;else kLayMerge.click();}
    else if(command==='visibility')kLayEye.click();
    else if(command==='blend')kLayBlend.click();
    else if(command==='opacity')handled=tabletLayerSetOpacity(value);
    else handled=false;
    if(handled)window.dispatchEvent(new Event('inkframe:layers'));
    return handled;
  }`;
  html=replacePattern(html,/  function tabletLayerCommand\(name,value\)\{[\s\S]*?\n  \}(?=\n  window\.InkFrameTabletDeckEnvironment)/,command,'command dispatcher');

  for(const marker of ['background=backgroundEditing()','active:background?0','command===\'background\'','if(backgroundEditing())handled=false']){
    if(!html.includes(marker))throw new Error(`Static background Layer bridge verification failed: ${marker}`);
  }
  return html;
}
