/* Copyright mujic@royverse69 */
(() => {
    const SHARE_BASE = 'https://royverse69.github.io/mujic/';
    const currentTrack = id => Player.getTrackById(id || State.actionTargetId) || OnlineMusic.getTrack(id || State.actionTargetId) || Player.getCurrentTrack();
    const formatDuration = value => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';
        return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    };
    const showInfo = async id => {
        const track = currentTrack(id);
        if (!track) { UI.showToast('Song information is unavailable.', 'info'); return false; }
        UI.closeSheets();
        const isOnline = OnlineMusic.isOnlineTrack(track);
        const album = String(track.album || track.raw?.album?.name || '').trim() || 'Unknown';
        const year = String(track.year || track.raw?.year || '').trim() || 'Unknown';
        const duration = formatDuration(track.duration || track.raw?.duration);
        const format = isOnline ? 'Streaming catalogue' : (track.mimeType || track.format || 'Local audio file');
        const message = `Title: ${track.title || 'Unknown'}\nArtist: ${track.artist || 'Unknown Artist'}\nAlbum: ${album}\nYear: ${year}\nDuration: ${duration}\nSource: ${format}`;
        await Dialog.show({type:'info', title:'Song info', message, confirmText:'Done', cancelText:'Close'});
        return true;
    };
    const shortShareUrl = (track, startSeconds) => {
        const rawId = String(track?.onlineTrackId || track?.songId || track?.id || '')
            .replace(/^machhar:(?:saavn|machhar):/i, '').replace(/^machhar:/i, '').trim();
        if (!rawId || /^(?:artists|albums|playlists):/i.test(rawId)) return '';
        const url = new URL(SHARE_BASE);
        url.searchParams.set('s', rawId);
        if (Number.isFinite(Number(startSeconds)) && Number(startSeconds) > 0) url.searchParams.set('t', String(Math.floor(Number(startSeconds))));
        return url.href;
    };
    const share = async id => {
        const track = currentTrack(id);
        if (!track) { UI.showToast('There is no song to share.', 'info'); return false; }
        if (!OnlineMusic.isOnlineTrack(track)) {
            UI.showToast('Local files stay on your device. Play a streaming song to share a playable Mujic link.', 'info');
            return false;
        }
        const url = shortShareUrl(track);
        if (!url) { UI.showToast('A share link could not be created for this track.', 'error'); return false; }
        const title = `${track.title || 'Song'} — ${track.artist || 'Mujic'}`;
        try {
            if (navigator.share) {
                await navigator.share({title, text:`Listen to ${track.title || 'this song'} on Mujic.`, url});
                return true;
            }
        } catch (error) {
            if (error?.name === 'AbortError') return false;
        }
        try {
            if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(url);
            else {
                const input = document.createElement('textarea');
                input.value = url; input.setAttribute('readonly',''); input.style.position='fixed'; input.style.opacity='0';
                document.body.appendChild(input); input.select();
                const copied = document.execCommand('copy'); input.remove();
                if (!copied) throw new Error('Clipboard unavailable');
            }
            UI.showToast('Mujic song link copied.', 'check_circle');
            return true;
        } catch (_) {
            await Dialog.show({type:'info', title:'Share song link', message:url, confirmText:'Done', cancelText:'Close'});
            return true;
        }
    };
    const openSharedSong = async (reference, startSeconds = 0) => {
        const id = String(reference || '').trim().replace(/^songs?:/i, '');
        const requestedTime = Math.max(0, Math.min(24 * 60 * 60, Number(startSeconds) || 0));
        if (!id || /^(?:artists|albums|playlists):/i.test(id)) return false;
        if (State.playbackSourceMode !== 'online' && !(await OnlineMusic.setMode('online'))) return false;
        try {
            const tracks = await OnlineMusic.fetchSongsByIdsOrLink(id);
            if (!tracks?.length) throw new Error('This Mujic link did not return a playable song.');
            const track = tracks[0];
            const audio = AudioAdapter.audio;
            let seekApplied = false;
            let seekTimer = null;
            const cleanupSeek = () => {
                audio.removeEventListener('loadedmetadata', applySharedPosition);
                audio.removeEventListener('durationchange', applySharedPosition);
                audio.removeEventListener('canplay', applySharedPosition);
                if (seekTimer) clearTimeout(seekTimer);
                seekTimer = null;
            };
            const applySharedPosition = () => {
                if (seekApplied || !requestedTime) return;
                if (String(State.currentTrackId ?? '') !== String(track.id ?? '')) { cleanupSeek(); return; }
                const duration = Number(audio.duration);
                if (audio.readyState < 1 || !Number.isFinite(duration) || duration <= 0) return;
                AudioAdapter.seek(Math.min(requestedTime, Math.max(0, duration - 0.25)));
                State.currentTime = Number(audio.currentTime) || 0;
                State.resumePosition = State.currentTime;
                UI.updateProgress();
                AudioAdapter.updateMediaSessionPosition();
                seekApplied = true;
                cleanupSeek();
            };
            if (requestedTime > 0) {
                audio.addEventListener('loadedmetadata', applySharedPosition);
                audio.addEventListener('durationchange', applySharedPosition);
                audio.addEventListener('canplay', applySharedPosition);
                seekTimer = setTimeout(() => { applySharedPosition(); cleanupSeek(); }, 15000);
            }
            UI.switchView('online-home');
            await Player.playContext([track], 0);
            // Cover cached/fast streams whose metadata event fires before playContext resolves.
            applySharedPosition();
            UI.showMiniPlayer();
            UI.openFullPlayer();
            try { history.replaceState(null, document.title, location.pathname + location.hash); } catch (_) {}
            UI.showToast(requestedTime > 0 ? `Opening ${track.title} at ${formatDuration(requestedTime)}` : `Opened ${track.title} from Mujic`, 'music_note');
            return true;
        } catch (error) {
            UI.showToast(error?.message || 'Could not open the shared song. Check your connection and try again.', 'error');
            return false;
        }
    };
    window.TrackActions = {showInfo, share, shortShareUrl, openSharedSong};
})();
