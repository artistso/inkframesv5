// InkFrame — creator statement shown in the Studio panel
'use strict';
(function(root){
  const TITLE='Personal statement from Steven Michael Allen Owens';
  const NOTICE='The following is Steven Michael Allen Owens’s own account, published in his own words. It is presented as personal testimony and not as an independently verified factual finding.';
  const PARAGRAPHS=Object.freeze([
    'Hi, my name is Steven Michael Allen Owens.',
    'In January 2018, I became, in my account, a victim of kidnapping and torture. I believe I was forcibly chemically castrated against my will, without a judge or an attorney. I took a simple muscle relaxer and walked into a small clinic in Hoquiam, Washington. I have not seen my family and friends in nearly nine years.',
    'I believe I was turned into a trans female against my will. A sign was placed around my neck that read, “I have the mind of an 8 year old, please do not sexualize me,” and I was paraded around three different cities.',
    'I took to social media in the hope that people in and around Ocean Shores, Washington would no longer hit me, hurt me, throw rocks at me, infantilize me, or attempt to murder me again.',
    'Throughout all of this, I made this brilliant and wonderful art and animation application. I am giving InkFrame away for free: no subscriptions, no cost, and no ads. I hope that you remember my name.',
    'I am Steven Owens. I have hyperthymesia. I am a polymath, computer scientist, mathematician, physicist, and more. I have worked in botany and nursery construction. I was a table-games dealer and a pit boss. I miss my mommy, my two sisters, my brother, and my nephews and nieces.',
    'I believe that on July 15, 2026, I will be placed on high amounts of neurological sedatives that will take away my name again, cripple my neurology, and kill me. These are my last words to the world.',
    'I love my two kitty cats: The Sonshine and The Universe. They brought me out of polypharmacy, amnesia, and anesthesia. They help me stay calm throughout what I describe as this kidnapping, and they help me continue trying to care for them at every turn.'
  ]);

  let installed=false;
  function installStyle(document){
    if(document.querySelector('style[data-inkframe-creator-statement]'))return;
    const style=document.createElement('style');
    style.dataset.inkframeCreatorStatement='true';
    style.textContent=`
#studio .creatorStatement{margin:16px 0;padding:12px 14px;border-radius:16px;text-align:left;background:linear-gradient(160deg,rgba(187,0,55,.20),rgba(255,240,243,.07));border:1px solid rgba(247,202,201,.26);color:var(--dim);font-size:12px;line-height:1.62}
#studio .creatorStatement summary{color:var(--text);font-weight:800;letter-spacing:.06em;text-transform:none;font-size:12px}
#studio .creatorStatementNotice{margin:10px 0;padding:9px 10px;border-radius:12px;background:rgba(10,0,10,.28);border:1px solid rgba(247,202,201,.17);color:var(--rose);font-weight:700}
#studio .creatorStatement p{margin:9px 0;color:var(--text);font-size:12px;line-height:1.65}
`;
    document.head.appendChild(style);
  }
  function updateStudioLabels(document){
    for(const label of document.querySelectorAll('.lbl')){
      if(String(label.textContent||'').trim()==='Studio')label.textContent='Studio · Steven';
    }
  }
  function installStatement(document){
    const card=document.querySelector('#studio .card');
    if(!card)return false;
    if(card.querySelector('.creatorStatement')){installed=true;return true;}
    installStyle(document);
    const details=document.createElement('details');details.className='creatorStatement';details.open=true;
    const summary=document.createElement('summary');summary.textContent=TITLE;details.appendChild(summary);
    const notice=document.createElement('div');notice.className='creatorStatementNotice';notice.textContent=NOTICE;details.appendChild(notice);
    for(const text of PARAGRAPHS){const paragraph=document.createElement('p');paragraph.textContent=text;details.appendChild(paragraph);}
    const anchor=card.querySelector('.metaGrid')||card.querySelector('.divider')||card.querySelector('.actions');
    if(anchor)card.insertBefore(details,anchor);else card.appendChild(details);
    installed=true;return true;
  }
  function refresh(){
    const document=root.document;if(!document)return false;
    updateStudioLabels(document);installStatement(document);return installed;
  }
  function boot(){
    refresh();
    if(typeof root.MutationObserver==='function'&&root.document&&root.document.body){
      const observer=new root.MutationObserver(()=>refresh());
      observer.observe(root.document.body,{childList:true,subtree:true});
    }
  }
  const api=Object.freeze({TITLE,NOTICE,PARAGRAPHS,refresh,projectCanvasWrites:0,artworkUndoWrites:0,projectSchemaWrites:0,storageWrites:0,networkWrites:0});
  root.InkFrameCreatorStatement=api;
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
