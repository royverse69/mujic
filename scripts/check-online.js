const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/online-recommendations.js'), 'utf8'), sandbox, { filename: 'online-recommendations.js' });
const Engine = sandbox.window.OnlineRecommendations;
const original = { id: 'machhar:one', onlineTrackId: 'one', title: 'Dil Se Dil Tak', artist: 'Asha Example', source: 'machhar-online' };
const remix = { id: 'machhar:two', onlineTrackId: 'two', title: 'Dil Se Dil Tak (DJ Remix)', artist: 'DJ Example', source: 'machhar-online' };
const unrelated = { id: 'machhar:three', onlineTrackId: 'three', title: 'Midnight Drive', artist: 'Asha Example', source: 'machhar-online' };
const sameTitleDifferentArtist = { id: 'machhar:seven', onlineTrackId: 'seven', title: 'Dil Se Dil Tak', artist: 'Another Independent Artist', source: 'machhar-online' };
const soundtrackTitle = { id: 'machhar:five', onlineTrackId: 'five', title: 'Gehra Hua (From \"Dhurandhar\")', artist: 'Shashwat Sachdev, Arijit Singh', source: 'machhar-online' };
const sameSongAltCredit = { id: 'machhar:six', onlineTrackId: 'six', title: 'Gehra Hua', artist: 'Irshad Kamil, Arijit Singh', source: 'machhar-online' };
const nearDuplicate = { id: 'machhar:four', onlineTrackId: 'four', title: 'Dil Se Dil Tak - Slowed + Reverb', artist: 'Asha Example', source: 'machhar-online' };
if (!Engine.isSameRecording(original, remix)) throw new Error('Remix fingerprint should match the original recording.');
if (!Engine.isSameRecording(original, nearDuplicate)) throw new Error('Slowed/reverb version should match the original recording.');
if (!Engine.isSameRecording(soundtrackTitle, sameSongAltCredit)) throw new Error('Soundtrack subtitles and alternate catalogue credits must not create duplicate autoplay tracks.');
if (Engine.isSameRecording(original, unrelated)) throw new Error('Unrelated tracks must not be classified as repeats.');
if (Engine.isSameRecording(original, sameTitleDifferentArtist)) throw new Error('A title shared by different artists must not automatically count as the same recording.');
Engine.seedHistory([original]);
if (!Engine.wasPlayedOrEquivalent(remix) || !Engine.wasPlayedOrEquivalent(nearDuplicate)) throw new Error('Autoplay must recognize remixes/slow variants of tracks already heard in session/history.');
if (Engine.wasPlayedOrEquivalent(unrelated)) throw new Error('A distinct track must remain eligible for autoplay.');
const filtered = Engine.filterPlaybackContext([original, remix, unrelated, nearDuplicate], original.id);
if (filtered.length !== 2 || filtered[0].id !== original.id || filtered.some(t => t.id === remix.id || t.id === nearDuplicate.id)) {
    throw new Error('Playback queue should keep the chosen track but omit repeat/remix variants.');
}

(async () => {
const queueTracks = new Map();
const queued = { id:'machhar:saavn:q1', onlineTrackId:'q1', title:'Queue Song', artist:'Queue Artist', provider:'saavn', source:'machhar-online' };
queueTracks.set(queued.id, queued);
const suggested = [
  { id:'machhar:saavn:r1', onlineTrackId:'r1', title:'Midnight Signals', artist:'Artist One', provider:'saavn', source:'machhar-online' },
  { id:'machhar:saavn:r2', onlineTrackId:'r2', title:'Midnight Signals (DJ Remix)', artist:'DJ Artist', provider:'saavn', source:'machhar-online' },
  { id:'machhar:saavn:r3', onlineTrackId:'r3', title:'Midnight Signals', artist:'Artist One', provider:'saavn', source:'machhar-online' },
  { id:'machhar:saavn:q2', onlineTrackId:'q2', title:'Queue Song (Slowed + Reverb)', artist:'Queue Artist', provider:'saavn', source:'machhar-online' },
  { id:'machhar:saavn:r4', onlineTrackId:'r4', title:'Different Song', artist:'Artist Two', provider:'saavn', source:'machhar-online' }
];
const candidateContext = {
    window: {},
    State: { playbackSourceMode:'online', playbackOrder:[queued.id], queue:[] },
    Player: { getTrackById:id=>queueTracks.get(String(id))||null, getCurrentTrack:()=>null },
    OnlineMusic: {
      fetchRelated:async()=>suggested,
      normalizeTrack:track=>track,
      search:async()=>[], fetchTrending:async()=>[],
      getTrack:id=>queueTracks.get(String(id))||null,
      registerTrack:track=>{queueTracks.set(track.id,track);return track;}
    },
    UI:{}, OnlineWorkspace:{}, Map, Set, String, Number, Array, Object, Math, Date, Promise, Error, RegExp
};
vm.createContext(candidateContext);
vm.runInContext(fs.readFileSync(path.join(root,'js/online-recommendations.js'),'utf8'),candidateContext,{filename:'online-recommendations-dedupe.js'});
const candidates=await candidateContext.window.OnlineRecommendations.getCandidates({id:'machhar:saavn:now',onlineTrackId:'now',title:'Now Playing',artist:'Current Artist',provider:'saavn',source:'machhar-online'},1);
if(candidates.length!==2 || candidates.some(t=>t.id==='machhar:saavn:r2'||t.id==='machhar:saavn:r3'||t.id==='machhar:saavn:q2')) throw new Error(`Suggestion results must be recording-unique and exclude queued equivalents; got ${candidates.map(t=>t.id).join(',')}`);
console.log('Online recommendation checks OK: exact repeats, history seeding, autoplay remix skipping, recording-level suggestion dedupe, and queued-track protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
