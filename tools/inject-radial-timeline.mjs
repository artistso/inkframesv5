// Organic radial frame-timeline postprocessor for generated Android assets.
// The checked-in browser fallback retains the proven rectangular perimeter board.

const block=(...lines)=>lines.join('\n');

export function injectRadialTimeline(html,replaceOnce){
  html=replaceOnce(html,
    block('<script src="brush-math.js"></script>','<script src="canvas-shape.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    block('<script src="brush-math.js"></script>','<script src="canvas-shape.js"></script>','<script src="radial-timeline.js"></script>','<script src="radial-timing-editor.js"></script>','<script src="radial-timing-patterns.js"></script>','<script src="radial-timing-recipes.js"></script>','<script src="radial-timing-variations.js"></script>','<script src="radial-timing-morph.js"></script>','<script src="radial-timing-phrases.js"></script>','<script src="radial-timing-phrase-library.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    'Radial Timeline runtime scripts');

  html=replaceOnce(html,
    block('    const w=fg.clientWidth||1, h=fg.clientHeight||1, pad=14;','    const sideW=Math.max(1,w-pad*2), sideH=Math.max(1,h-pad*2), per=sideW*2+sideH*2;','    const slots=boardSlotCount();'),
    block('    const slots=boardSlotCount();','    if(window.InkFrameRadialTimeline && window.InkFrameRadialTimeline.render(board,{','      frameGlass:fg,canvas,slotCount:slots,framesLength:frames.length,current:cur,','      selectedFrames,holdAt:hOf,maxFrames:MAX_FRAMES,shape:activeCanvasShape(),','      project:projects[pi],playing,fps,loopOn,loopIn,loopOut,','      playbackFraction:frameCenterFrac(cur),','      canNavigate:()=>{','        const adapter=window.InkFrameBrushV2Adapter;','        return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());','      },','      canEditTiming:()=>{','        const adapter=window.InkFrameBrushV2Adapter;','        return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());','      },','      seek:i=>{','        const next=Math.max(0,Math.min(frames.length-1,Math.round(Number(i)||0)));','        if(playing)kPlay.click();','        if(next===cur){syncRail();return true;}','        setCur(next);render();refreshFrames();return true;','      },','      seekFraction:f=>{','        if(playing)kPlay.click();','        const frac=Math.max(0,Math.min(1,Number(f)||0));','        const next=frameAtFrac(frac);','        bumpReach();','        if(next!==cur){setCur(next);render();refreshFrames();}else render();','        syncRail(frac);return true;','      },','      togglePlayback:()=>{kPlay.click();return playing;},','      setHold:(i,v)=>{','        const index=Math.max(0,Math.min(frames.length-1,Math.round(Number(i)||0)));','        const hold=Math.max(1,Math.min(8,Math.round(Number(v)||1)));','        const targets=selectedFrames&&selectedFrames.has(index)?selectedSorted():[index];','        targets.forEach(j=>holds[j]=hold);','        if(index!==cur)setCur(index);','        render();refreshFrames();buildRail();','        if(typeof AUTOSAVE!==\'undefined\'&&AUTOSAVE.schedule)AUTOSAVE.schedule();','        return hold;','      },','      setHolds:entries=>{','        const changed=[];','        const seen=new Set();','        for(const entry of Array.isArray(entries)?entries:[]){','          const index=Math.max(0,Math.min(frames.length-1,Math.round(Number(entry&&entry.index)||0)));','          if(seen.has(index))continue;seen.add(index);','          const hold=Math.max(1,Math.min(8,Math.round(Number(entry&&entry.value)||1)));','          holds[index]=hold;changed.push({index,value:hold});','        }','        if(!changed.length)return changed;','        render();refreshFrames();buildRail();','        if(typeof AUTOSAVE!==\'undefined\'&&AUTOSAVE.schedule)AUTOSAVE.schedule();','        return changed;','      },','      setLoopRange:(a,b)=>{','        if(frames.length<2)return {loopOn:false,loopIn:0,loopOut:0};','        const first=Math.max(0,Math.min(frames.length-1,Math.round(Number(a)||0)));','        const last=Math.max(first,Math.min(frames.length-1,Math.round(Number(b)||0)));','        loopOn=true;loopIn=first;loopOut=last;kLoop.classList.add(\'on\');','        syncRail();','        if(typeof AUTOSAVE!==\'undefined\'&&AUTOSAVE.schedule)AUTOSAVE.schedule();','        return {loopOn,loopIn,loopOut};','      },','      toggleLoop:()=>{kLoop.click();return {loopOn,loopIn,loopOut};},','      thumbAt:i=>i>=0&&i<frames.length?frameThumbData(frames[i]):\'\',','    })) return;','    const w=fg.clientWidth||1, h=fg.clientHeight||1, pad=14;','    const sideW=Math.max(1,w-pad*2), sideH=Math.max(1,h-pad*2), per=sideW*2+sideH*2;'),
    'Radial Timeline frame-board delegation');

  html=replaceOnce(html,
    block('    if(k) k.style.backgroundImage=`url(${frameThumbData(frames[cur])})`;','  }'),
    block('    const thumb=frameThumbData(frames[cur]);','    if(k) k.style.backgroundImage=`url(${thumb})`;','    if(window.InkFrameRadialTimeline) window.InkFrameRadialTimeline.refreshThumbnail(cur,thumb);','  }'),
    'Radial Timeline live thumbnail refresh');

  html=replaceOnce(html,
    block('  function syncRail(playFrac){','    setPlayheadFrac(playFrac!=null?playFrac:frameCenterFrac(cur));'),
    block('  function syncRail(playFrac){','    const activeFraction=playFrac!=null?playFrac:frameCenterFrac(cur);','    setPlayheadFrac(activeFraction);'),
    'Radial Timeline shared playback fraction');
  html=replaceOnce(html,
    block('    syncLoop();','  }','  function buildRail(){'),
    block('    syncLoop();','    if(window.InkFrameRadialTimeline) window.InkFrameRadialTimeline.syncPlayback({','      fraction:activeFraction,current:cur,playing,loopOn,loopIn,loopOut,fps,','    });','  }','  function buildRail(){'),
    'Radial Timeline playback synchronization');

  for(const marker of [
    'radial-timeline.js',
    'radial-timing-editor.js',
    'radial-timing-patterns.js',
    'radial-timing-recipes.js',
    'radial-timing-variations.js',
    'radial-timing-morph.js',
    'radial-timing-phrases.js',
    'radial-timing-phrase-library.js',
    'InkFrameRadialTimeline.render(board',
    'InkFrameRadialTimeline.refreshThumbnail(cur,thumb)',
    'InkFrameRadialTimeline.syncPlayback({',
    'shape:activeCanvasShape()',
    'project:projects[pi]',
    'playing,fps,loopOn,loopIn,loopOut',
    'playbackFraction:frameCenterFrac(cur)',
    'canNavigate:()=>',
    'canEditTiming:()=>',
    'seek:i=>',
    'seekFraction:f=>',
    'togglePlayback:()=>',
    'setHold:(i,v)=>',
    'setHolds:entries=>',
    'setLoopRange:(a,b)=>',
    'toggleLoop:()=>',
    'fraction:activeFraction,current:cur,playing,loopOn,loopIn,loopOut,fps',
    "thumbAt:i=>i>=0&&i<frames.length?frameThumbData(frames[i]):''",
  ]){
    if(!html.includes(marker))throw new Error(`Radial Timeline injection verification failed: ${marker}`);
  }
  return html;
}
