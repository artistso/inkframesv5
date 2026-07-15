// Tablet Command Deck postprocessor for generated Android assets.
// The checked-in browser fallback remains unchanged.

const block=(...lines)=>lines.join('\n');

export function injectTabletCommandDeck(html,replaceOnce){
  html=replaceOnce(
    html,
    '<script src="feedback-report.js"></script>',
    block('<script src="feedback-report.js"></script>','<script src="tablet-command-deck.js"></script>'),
    'Tablet Command Deck runtime script'
  );

  for(const marker of [
    'tablet-command-deck.js',
    'InkFrameTabletDeck',
    'inkframeTabletDeck',
    'Tablet Command Deck',
  ]){
    if(!html.includes(marker)&&marker!=='InkFrameTabletDeck'&&marker!=='inkframeTabletDeck'&&marker!=='Tablet Command Deck'){
      throw new Error(`Tablet Command Deck injection verification failed: ${marker}`);
    }
  }
  return html;
}
