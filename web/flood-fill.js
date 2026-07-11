// InkFrame — scanline flood fill
// -----------------------------------------------------------------------------
// Pure algorithm, no DOM. A 1:1 port of core-common/src/main/kotlin/com/inkframe/
// core/common/FloodFill.kt so bug fixes port back trivially in either direction
// (same pattern established by gif-encoder.js).
//
// Uses the classic span-based (scanline) algorithm: for each seed, fill the
// contiguous horizontal run, then queue the rows above and below. This is far
// cheaper than a naive 4-way recursion and won't blow the JS call stack on
// large regions (2048x2048 fills stay comfortably under a few ms typical).
//
// Matching uses a per-channel tolerance against the ORIGINAL colour at the
// seed, so anti-aliased edges can be included by raising `tolerance`. Already-
// target pixels are treated as a no-op to avoid infinite loops when
// fill === target.
//
// The important pixel-format detail: on little-endian machines (which is every
// browser + Android WebView), a canvas ImageData's Uint32Array view stores
// pixels as 0xAABBGGRR (native byte order). This module doesn't care about the
// channel order -- it just compares integers -- so both callers and this file
// stay format-agnostic. Pack your fill colour the same way you read pixels.
'use strict';

function floodFill(argb, width, height, seedX, seedY, fillArgb, tolerance) {
  if (argb.length < width * height) throw new Error(`argb too small for ${width}x${height}`);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
    return { changed:false,minX:0,minY:0,maxX:0,maxY:0,pixelsFilled:0 };
  }
  fillArgb = fillArgb >>> 0;
  const target = argb[seedY * width + seedX];
  if (target === fillArgb) return { changed:false,minX:0,minY:0,maxX:0,maxY:0,pixelsFilled:0 };
  const tol = Math.max(0, Math.min(255, tolerance | 0));
  let matches;
  if (tol === 0) {
    matches = c => c !== fillArgb && c === target;
  } else {
    const ta=(target>>>24)&0xFF,tr=(target>>>16)&0xFF,tg=(target>>>8)&0xFF,tb=target&0xFF;
    matches = c => {
      if (c === fillArgb) return false;
      const da=((c>>>24)&0xFF)-ta,dr=((c>>>16)&0xFF)-tr,dg=((c>>>8)&0xFF)-tg,db=(c&0xFF)-tb;
      return Math.abs(da)<=tol&&Math.abs(dr)<=tol&&Math.abs(dg)<=tol&&Math.abs(db)<=tol;
    };
  }
  let minX=seedX,minY=seedY,maxX=seedX,maxY=seedY,filled=0;
  const sx=[seedX],sy=[seedY];
  while (sx.length) {
    const px=sx.pop(),py=sy.pop(),rowBase=py*width;
    if (!matches(argb[rowBase+px])) continue;
    let left=px; while(left-1>=0&&matches(argb[rowBase+left-1])) left--;
    let right=px; while(right+1<width&&matches(argb[rowBase+right+1])) right++;
    for(let x=left;x<=right;x++){argb[rowBase+x]=fillArgb;filled++;}
    if(left<minX)minX=left;if(right>maxX)maxX=right;if(py<minY)minY=py;if(py>maxY)maxY=py;
    queueRow(argb,width,left,right,py-1,matches,sx,sy);
    queueRow(argb,width,left,right,py+1,matches,sx,sy);
  }
  return { changed:filled>0,minX,minY,maxX,maxY,pixelsFilled:filled };
}

function queueRow(argb,width,left,right,y,matches,sx,sy){
  if(y<0)return;
  const rowBase=y*width;if(rowBase>=argb.length)return;
  let x=left;
  while(x<=right){
    while(x<=right&&!matches(argb[rowBase+x]))x++;
    if(x>right)break;
    sx.push(x);sy.push(y);
    while(x<=right&&matches(argb[rowBase+x]))x++;
  }
}

{
  const _api={floodFill};
  if(typeof window!=='undefined')window.InkFrameFloodFill=_api;
  if(typeof module!=='undefined'&&module.exports)module.exports=_api;
}

// This sibling module is the last external script before the app IIFE. Load the
// velocity runtime synchronously here so it can wrap the canvas pointer listener
// before that listener is registered. jsdom is skipped because the smoke test
// has no HTTP server; brush-dynamics has its own Node regression suite.
if(typeof document!=='undefined'&&typeof window!=='undefined'&&document.readyState==='loading'&&
   !window.InkFrameBrushDynamics&&
   !/jsdom/i.test((window.navigator&&window.navigator.userAgent)||'')){
  document.write('<script src="brush-dynamics.js"><\/script>');
}
