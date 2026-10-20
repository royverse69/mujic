const fs=require('fs');const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');const events=fs.readFileSync('js/ui-events.js','utf8');const actions=fs.readFileSync('js/track-actions.js','utf8');const sw=fs.readFileSync('sw.js','utf8');const css=fs.readFileSync('css/online-workspace.css','utf8');
assert(!html.includes('data-action="mini-track-options"'),'dedicated mini-player menu button removed');
for(const action of ['current-song-playlist','current-song-info','current-song-download','current-song-share'])assert(html.includes(`data-action="${action}"`),`existing player menu includes ${action}`);
for(const action of ['current-song-playlist','current-song-info','current-song-download','current-song-share'])assert(events.includes(`case '${action}'`),`handler exists for ${action}`);
assert(actions.includes('UI.openFullPlayer();'),'shared song opens full player');assert(/mujic-pwa-v\d+\.\d+\.\d+/.test(sw),'cache version bumped');assert(css.includes('body.theme-light .online-brand-wordmark')&&!css.includes('body:not(.dark-mode)'),'stable theme-aware watermark CSS');console.log('v12.0.42 checks passed');
