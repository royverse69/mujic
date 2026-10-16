const fs=require('fs'),vm=require('vm');
const noop=()=>{}; const el=()=>({classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},style:{},addEventListener:noop});
const sb={console,document:{getElementById:el,addEventListener:noop},window:{},navigator:{},Audio:function(){return {addEventListener:noop,play:async()=>{},pause:noop}},
 requestAnimationFrame:noop,cancelAnimationFrame:noop,performance:{now:()=>0}};
sb.window=sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','js/core.js'),'utf8')+fs.readFileSync(require('path').join(__dirname,'..','js/player.js'),'utf8')+
 `StorageAdapter={saveSettings:()=>Promise.resolve()};UI={renderQueue(){},showToast(){}};this.S=State;this.P=Player;`,sb);
const {S,P}=sb; let bad=0; const t=(c,m)=>{if(!c){console.error('FAIL',m);bad=1}};
// shuffled playback: original queue must survive a manual reorder, duplicates preserved
S.queue=['a','b','c','a']; S.shuffle=true; S.playbackOrder=['b','a','c','a']; S.queueIndex=0;
P.moveQueue(1,'down');
t(JSON.stringify(S.queue)==='["a","b","c","a"]','shuffled: State.queue must stay in original order incl. duplicates, got '+JSON.stringify(S.queue));
t(JSON.stringify(S.playbackOrder)==='["b","c","a","a"]','playbackOrder should reflect the move, got '+JSON.stringify(S.playbackOrder));
// not shuffled: queue follows the reorder and keeps duplicates
S.shuffle=false; S.queue=['a','b','c','a']; S.playbackOrder=['a','b','c','a']; S.queueIndex=0;
P.moveQueue(1,'down');
t(JSON.stringify(S.queue)==='["a","c","b","a"]','unshuffled: queue should follow reorder with duplicates, got '+JSON.stringify(S.queue));
t(S.queueIndex===0,'current index must not move');
console.log(bad?'queue test FAILED':'queue test OK');process.exit(bad);
