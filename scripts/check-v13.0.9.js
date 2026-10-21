const fs = require('node:fs');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const read = file => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const changelog = JSON.parse(read('changlog.json'));
const html = read('index.html');
const css = read('css/app.css');
const player = read('js/player.js');
const events = read('js/ui-events.js');
const version = read('VERSION').trim();

// Update checker: VERSION must satisfy the same pattern ui-settings.js enforces, and agree with the in-app marker.
check(/^\d+(?:\.\d+){1,3}$/.test(version), 'VERSION must be a plain numeric version for the update checker.');
check(version === pkg.version && changelog.version === version, 'VERSION, package.json and changlog.json must agree.');
check(new RegExp(`application-version" content="${version.replace(/\./g, '\\.')}"`).test(html), 'index.html application-version meta must match VERSION.');
check(changelog.entries[0].version === version && changelog.entries.length >= 20, 'Release notes must list the current release first and keep history.');
check(read('sw.js').includes(`mujic-pwa-v${version}-`), 'Service worker cache must be versioned for this release.');

// Desktop player card must keep inner padding (a later padding:0 override previously collapsed it).
check(!/body:not\(\.lyrics-mode\) #full-player \.player-controls-section \{[^}]*padding:0;/.test(css), 'Desktop player card must not reset padding to 0.');
check(/body:not\(\.lyrics-mode\) #full-player \.player-controls-section \{[^}]*padding:clamp\(24px,2\.4vw,34px\)/.test(css), 'Desktop player card padding must be restored.');

// Now-playing integrity.
check(player.includes('Player.syncNowPlaying') && player.includes('startsInFlight'), 'Now-playing resync must be defined.');
check(read('js/ui-player.js').includes('Player.syncNowPlaying?.();') && read('js/online-workspace.js').includes('Player.syncNowPlaying?.();'), 'Both queue renderers must resync now-playing.');

// Picture-in-Picture.
check(events.includes("video.addEventListener('pause'") && events.includes("video.addEventListener('play'"), 'PiP play/pause must control the real audio.');
check(events.includes('setInterval(video._pipPaint') && !events.includes('video._pipFrame=requestAnimationFrame'), 'PiP canvas must be painted by a timer so it stays live in the background.');
console.log('v13.0.9 checks passed: update checker metadata, desktop player card, now-playing sync and PiP controls.');
