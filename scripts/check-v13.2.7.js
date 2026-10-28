const fs=require('node:fs');
const assert=require('node:assert/strict');
const read=f=>fs.readFileSync(f,'utf8');
const pkg=JSON.parse(read('package.json'));
const html=read('index.html'),sw=read('sw.js'),events=read('js/ui-events.js'),workspace=read('js/online-workspace.js');
assert.equal(pkg.version,'13.2.8');
assert.equal(read('VERSION').trim(),pkg.version);
assert.ok(html.includes(`application-version" content="${pkg.version}"`));
assert.ok(sw.includes(`mujic-pwa-v${pkg.version}-cloudflare-edge`));
assert.match(events,/requestWindow\(\{width:480, height:480, preferInitialWindowPlacement:true\}\)/);
assert.match(events,/id="mj-pip-bg" width="640" height="640"/);
assert.match(events,/id="mj-pip-lyrics"/);
assert.match(events,/id="mj-pip-queue"/);
assert.match(events,/id="mj-pip-volume-range"/);
assert.match(events,/grid-template-columns:minmax\(66px,1fr\) auto minmax\(66px,1fr\)/);
assert.match(events,/button\.primary\{width:48px;height:52px;min-width:48px;border-radius:0;background:transparent;color:#fff;box-shadow:none\}/);
assert.match(events,/gap:18px;margin-bottom:15px;min-width:0/);
assert.match(events,/gap:13px;margin-bottom:16px;font-size:13px/);
assert.match(events,/case 'play-track':[\s\S]*?if \(State\.playbackSourceMode !== 'online' && !\(await OnlineMusic\.setMode\('online'\)\)\) return;[\s\S]*?OnlineWorkspace\.playTrackInContext\(id, contextName\)/);
assert.match(workspace,/const playlistId=contextName\.slice\('online-playlist:'\.length\);[\s\S]*?candidateLists\.push\(\.\.\.playlist\.tracks\)/);
assert.match(events,/get\('mj-pip-duration'\)\.textContent = durationKnown \? `-\$\{fmt\(Math\.max\(0,duration-current\)\)\}`/);
assert.match(events,/OnlineWorkspace\.playTrackInContext\(id, contextName\)/);
assert.match(workspace,/const resolveContextTrack = \(id, context=''/);
assert.match(workspace,/OnlineMusic\.normalizeTrack\?\.\(candidate\)/);
assert.match(workspace,/const playTrackInContext = \(id, context=''/);
assert.match(workspace,/playTrackFromShelf:\(id,context\)=>playTrackInContext\(id,context\)/);
assert.match(workspace,/const playSearchResult = id => playTrackInContext\(id,'online-search'\)/);
console.log('v13.2.7 checks passed: cover-led square PiP controls, auto-switch playback for catalogue rows, and context recovery for Search/playlist tracks.');

// Runtime regression: Search-discovered tracks must be recoverable from a rendered remote
// collection or a persisted online playlist even after the bounded provider registry evicts them.
const vm=require('node:vm');
const resolverStart=workspace.indexOf('    const resolveContextTrack =');
const resolverEnd=workspace.indexOf('    const playSearchResult = id =>',resolverStart);
assert.ok(resolverStart>=0&&resolverEnd>resolverStart,'Context-aware playback helpers must remain available.');
const registered=new Map();let playCalls=[];
const remoteTrack={id:'machhar:saavn:remote-song',onlineTrackId:'remote-song',provider:'saavn',source:'machhar-online',isOnline:true,title:'Remote Search Song',artist:'Test Artist'};
const playlistTrack={id:'machhar:saavn:saved-song',onlineTrackId:'saved-song',provider:'saavn',source:'machhar-online',isOnline:true,title:'Saved Search Playlist Song',artist:'Test Artist'};
const playlists=[{id:'saved-search-playlist',tracks:[playlistTrack]}];
const shelfContexts=new Map([['detail:playlists:remote-search-playlist',[remoteTrack]]]);
const OnlineMusic={
  getTrack:id=>registered.get(String(id))||null,
  normalizeTrack:record=>record&&record.onlineTrackId?{...record,source:'machhar-online',isOnline:true}:null,
  registerTrack:record=>{if(!record||!record.id||!record.onlineTrackId)return null;const track={...record,source:'machhar-online',isOnline:true};registered.set(String(track.id),track);return track;},
  isOnlineTrack:track=>Boolean(track&&track.source==='machhar-online'&&track.onlineTrackId),
  preferPrimaryMedia(){}
};
const runtime={
  window:{OnlineCache:{getTrack:()=>null}},State:{playbackSourceMode:'online',playbackOrder:[]},
  Player:{getTrackById:id=>registered.get(String(id))||null,playContext:(tracks,index)=>playCalls.push({tracks,index})},
  OnlineMusic,UI:{showToast(message){throw new Error(`Unexpected playback failure toast: ${message}`);}},
  getPlaybackContext:()=>[],shelfContexts,playlists,activePlaylistId:'',onlineHistory:[],onlineFavorites:[],activeRemoteEntity:null,
  saveQueueSnapshot(){},String,Array,Map,Set,Math,Boolean
};
vm.createContext(runtime);
vm.runInContext(workspace.slice(resolverStart,resolverEnd)+'\nglobalThis.__playTrackInContext=playTrackInContext;',runtime);
assert.equal(runtime.__playTrackInContext('machhar:saavn:remote-song','online-remote:playlists:remote-search-playlist'),true);
assert.equal(playCalls[0].tracks[playCalls[0].index].id,'machhar:saavn:remote-song');
playCalls=[];registered.clear();
assert.equal(runtime.__playTrackInContext('machhar:saavn:saved-song','online-playlist:saved-search-playlist'),true);
assert.equal(playCalls[0].tracks[playCalls[0].index].id,'machhar:saavn:saved-song');
console.log('v13.2.7 playback runtime regression passed: unregistered Search-discovered tracks can be recovered from remote collections and persisted online playlists before starting playback.');
