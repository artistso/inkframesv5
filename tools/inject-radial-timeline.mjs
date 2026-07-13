// Organic radial frame-timeline postprocessor for generated Android assets.
// The checked-in browser fallback retains the proven rectangular perimeter board.

const block=(...lines)=>lines.join('\n');

export function injectRadialTimeline(html,replaceOnce){
  html=replaceOnce(html,
    block('<script src="brush-math.js"></script>','<script src="canvas-shape.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    block('<script src="brush-math.js"></script>','<script src="canvas-shape.js"></script>','<script src="radial-timeline.js"></script>','<!-- INKFRAME_BRUSH_V2_RUNTIME: generated into APK assets only -->'),
    'Radial Timeline runtime script');

  html=replaceOnce(html,
    block('    const w=fg.clientWidth||1, h=fg.clientHeight||1, pad=14;','    const sideW=Math.max(1,w-pad*2), sideH=Math.max(1,h-pad*2), per=sideW*2+sideH*2;','    const slots=boardSlotCount();'),
    block('    const slots=boardSlotCount();','    if(window.InkFrameRadialTimeline && window.InkFrameRadialTimeline.render(board,{','      frameGlass:fg,canvas,slotCount:slots,framesLength:frames.length,current:cur,','      selectedFrames,holdAt:hOf,maxFrames:MAX_FRAMES,shape:activeCanvasShape(),','      project:projects[pi],playing,fps,loopOn,loopIn,loopOut,','      playbackFraction:frameCenterFrac(cur),','      canNavigate:()=>{','        const adapter=window.InkFrameBrushV2Adapter;','        return !drawing&&!(adapter&&adapter.isActive&&adapter.isActive());','      },','      seek:i=>{','        const next=Math.max(0,Math.min(frames.length-1,Math.round(Number(i)||0)));','        if(playing)kPlay.click();','        if(next===cur){syncRail();return true;}','        setCur(next);render();refreshFrames();return true;','      },','      seekFraction:f=>{','        if(playing)kPlay.click();','        const frac=Math.max(0,Math.min(1,Number(f)||0));','        const next=frameAtFrac(frac);','        bumpReach();','        if(next!==cur){setCur(next);render();refreshFrames();}else render();','        syncRail(frac);return true;','      },','      togglePlayback:()=>{kPlay.click();return playing;},','      thumbAt:i=>i>=0&&i<frames.length?frameThumbData(frames[i]):\'\',','    })) return;','    const w=fg.clientWidth||1, h=fg.clientHeight||1, pad=14;','    const sideW=Math.max(1,w-pad*2), sideH=Math.max(1,h-pad*2), per=sideW*2+sideH*2;'),
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
    'InkFrameRadialTimeline.render(board',
    'InkFrameRadialTimeline.refreshThumbnail(cur,thumb)',
    'InkFrameRadialTimeline.syncPlayback({',
    'shape:activeCanvasShape()',
    'project:projects[pi]',
    'playing,fps,loopOn,loopIn,loopOut',
    'playbackFraction:frameCenterFrac(cur)',
    'canNavigate:()=>',
    'seek:i=>',
    'seekFraction:f=>',
    'togglePlayback:()=>',
    'fraction:activeFraction,current:cur,playing,loopOn,loopIn,loopOut,fps',
    "thumbAt:i=>i>=0&&i<frames.length?frameThumbData(frames[i]):''",
  ]){
    if(!html.includes(marker))throw new Error(`Radial Timeline injection verification failed: ${marker}`);
  }
  return html;
}
