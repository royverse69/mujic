/* Copyright mujic@royverse69 */
(() => {
    const cleanFilePart = value => String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Unknown';
    const concat = parts => {
        const total = parts.reduce((sum, part) => sum + part.length, 0);
        const out = new Uint8Array(total); let offset = 0;
        for (const part of parts) { out.set(part, offset); offset += part.length; }
        return out;
    };
    const be32 = n => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    const fcc = value => Uint8Array.from(value, char => char.charCodeAt(0));
    const utf8 = value => new TextEncoder().encode(String(value ?? ''));
    const atom = (type, ...parts) => { const body = concat(parts); return concat([be32(8 + body.length), fcc(type), body]); };
    const dataAtom = (flags, bytes) => atom('data', be32(flags), be32(0), bytes);
    const textItem = (key, value) => value !== undefined && value !== null && String(value).trim() ? atom(key, dataAtom(1, utf8(value))) : null;
    const parseBoxes = (buf, start, end) => {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); const out = []; let offset = start;
        while (offset + 8 <= end) {
            let size = dv.getUint32(offset); let header = 8;
            const type = String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
            if (size === 1) { if (offset + 16 > end) break; size = Number(dv.getBigUint64(offset + 8)); header = 16; }
            else if (size === 0) size = end - offset;
            if (size < header || offset + size > end) break;
            out.push({ type, offset, size, header }); offset += size;
        }
        return out;
    };
    const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
    const chunkTables = (buf, start, end, out = []) => {
        for (const box of parseBoxes(buf, start, end)) {
            if (CONTAINERS.has(box.type)) chunkTables(buf, box.offset + box.header, box.offset + box.size, out);
            else if (box.type === 'stco' || box.type === 'co64') out.push(box);
        }
        return out;
    };
    const shiftOffsets = (buf, delta) => {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (const box of chunkTables(buf, 8, buf.length)) {
            const count = dv.getUint32(box.offset + box.header + 4); const start = box.offset + box.header + 8;
            for (let index = 0; index < count; index++) {
                if (box.type === 'stco') dv.setUint32(start + index * 4, dv.getUint32(start + index * 4) + delta);
                else dv.setBigUint64(start + index * 8, dv.getBigUint64(start + index * 8) + BigInt(delta));
            }
        }
    };
    const verifyOffsets = (moov, mediaStart, mediaEnd) => {
        const dv = new DataView(moov.buffer, moov.byteOffset, moov.byteLength); const tables = chunkTables(moov, 8, moov.length);
        if (!tables.length) return false;
        return tables.every(box => {
            const count = dv.getUint32(box.offset + box.header + 4); if (!count) return true;
            const ptr = box.offset + box.header + 8;
            const first = box.type === 'stco' ? dv.getUint32(ptr) : Number(dv.getBigUint64(ptr));
            return first >= mediaStart && first < mediaEnd;
        });
    };
    const bytesContain = (bytes, text) => {
        const needle = utf8(text);
        outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
            for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
            return true;
        }
        return false;
    };
    const isAACM4A = bytes => {
        const top = parseBoxes(bytes, 0, bytes.length);
        return top.some(box => box.type === 'ftyp') && top.some(box => box.type === 'moov') && top.some(box => box.type === 'mdat') && bytesContain(bytes, 'mp4a') && !top.some(box => box.type === 'moof');
    };
    const tagM4A = (bytes, track, cover) => {
        const top = parseBoxes(bytes, 0, bytes.length);
        const ftyp = top.find(box => box.type === 'ftyp'); const moov = top.find(box => box.type === 'moov'); const mdat = top.find(box => box.type === 'mdat');
        if (!ftyp || !moov || !mdat || !isAACM4A(bytes)) throw new Error('The provider did not return a complete AAC/M4A file. No lower-quality or MP3 conversion was used.');
        const raw = track.raw || {};
        const info = raw.more_info || {};
        const artist = track.artist || 'Unknown Artist';
        const metaItems = [
            textItem('\u00A9nam', track.title), textItem('\u00A9ART', artist),
            textItem('aART', track.albumArtist || info.album_artist || artist.split(',')[0]),
            textItem('\u00A9alb', track.album), textItem('\u00A9day', track.year || info.year),
            textItem('\u00A9gen', track.genre || info.genre), textItem('\u00A9wrt', track.composer || info.music || info.composer),
            textItem('\u00A9lyr', track.lyrics || info.lyrics || info.syncedLyrics),
            textItem('cprt', track.copyright || info.copyright_text),
            textItem('\u00A9cmt', 'Downloaded with Mujic · Streaming catalogue'),
            textItem('\u00A9too', 'Mujic AAC Metadata Writer')
        ].filter(Boolean);
        const trackNo = Number.parseInt(track.trackNumber || info.track_number || raw.track_number, 10) || 0;
        if (trackNo > 0) metaItems.push(atom('trkn', dataAtom(0, new Uint8Array([0, 0, (trackNo >> 8) & 255, trackNo & 255, 0, 0, 0, 0]))));
        if (cover?.length) {
            const imageType = cover[0] === 0x89 && cover[1] === 0x50 ? 14 : (cover[0] === 0xff && cover[1] === 0xd8 ? 13 : 0);
            if (imageType) metaItems.push(atom('covr', dataAtom(imageType, cover)));
        }
        const hdlr = atom('hdlr', be32(0), be32(0), fcc('mdir'), fcc('appl'), new Uint8Array(9));
        const udta = atom('udta', atom('meta', be32(0), hdlr, atom('ilst', ...metaItems)));
        const retained = parseBoxes(bytes, moov.offset + moov.header, moov.offset + moov.size)
            .filter(box => box.type !== 'udta').map(box => bytes.subarray(box.offset, box.offset + box.size));
        const replacementMoov = atom('moov', ...retained, udta);
        const delta = replacementMoov.length - moov.size;
        const moovBeforeMdat = moov.offset < mdat.offset;
        if (moovBeforeMdat && delta !== 0) shiftOffsets(replacementMoov, delta);
        const mediaStart = mdat.offset + (moovBeforeMdat ? delta : 0) + mdat.header;
        const mediaEnd = mdat.offset + (moovBeforeMdat ? delta : 0) + mdat.size;
        if (!verifyOffsets(replacementMoov, mediaStart, mediaEnd)) throw new Error('Metadata could not be written safely; original AAC file was left unchanged.');
        return new Blob([bytes.subarray(0, moov.offset), replacementMoov, bytes.subarray(moov.offset + moov.size)], { type: 'audio/mp4' });
    };
    const fetchBytes = async (url, onProgress) => {
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45000);
                try {
                    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
                    if (!response.ok) throw new Error(`Audio server returned HTTP ${response.status}`);
                    const type = (response.headers.get('content-type') || '').toLowerCase();
                    const total = Number(response.headers.get('content-length')) || 0;
                    if (type.includes('mpeg') || type.includes('mp3')) throw new Error('Only AAC/M4A downloads are supported; the highest-quality source returned MP3.');
                    if (!response.body?.getReader) {
                        const bytes = new Uint8Array(await response.arrayBuffer()); onProgress?.(100); return bytes;
                    }
                    const reader = response.body.getReader(); const chunks = []; let received = 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value); received += value.length;
                        if (total > 0) onProgress?.(Math.min(95, received / total * 95));
                    }
                    const bytes = concat(chunks); onProgress?.(100); return bytes;
                } finally { clearTimeout(timeout); }
            } catch (error) { lastError = error; if (attempt === 0 && error?.name !== 'AbortError') await new Promise(resolve => setTimeout(resolve, 350)); }
        }
        throw lastError || new Error('Download could not be completed.');
    };
    const isJpeg = b => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
    const isPng = b => b && b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    /* WebP/AVIF/GIF/BMP covers are re-encoded to JPEG: the M4A `covr` atom only supports JPEG and PNG. */
    const reencodeToJpeg = async bytes => {
        try {
            const bitmap = await createImageBitmap(new Blob([bytes]));
            const longest = Math.max(bitmap.width, bitmap.height) || 1;
            const scale = Math.min(1, 1000 / longest);
            const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close?.();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            canvas.width = canvas.height = 0;
            return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        } catch (_) { return null; }
    };
    const fetchOneCover = async url => {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { cache: 'force-cache', credentials: 'omit', signal: controller.signal });
            if (!response.ok) return null;
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length < 512) return null;
            if (isJpeg(bytes) || isPng(bytes)) return bytes;
            return await reencodeToJpeg(bytes);
        } catch (_) { return null; }
        finally { clearTimeout(timeout); }
    };
    /* Best artwork first. The old code embedded `artworkUrl`, which is the 112px list thumbnail. */
    const coverCandidates = track => {
        const raw = track.raw || {};
        const list = [track.artworkLargeUrl, track.artworkMediumUrl];
        const rawImages = [].concat(raw.image || [], raw.images || [], raw.more_info?.image || [])
            .map(item => typeof item === 'string' ? item : (item?.url || item?.link || item?.src)).filter(Boolean);
        for (const source of rawImages) {
            list.push(OnlineMusic.proxyMediaUrl(String(source).replace(/\d{2,4}x\d{2,4}/, '500x500')));
        }
        for (const source of rawImages) list.push(OnlineMusic.proxyMediaUrl(source));
        list.push(track.artworkUrl);
        return [...new Set(list.filter(item => typeof item === 'string' && item))];
    };
    const fetchTrackCover = async track => {
        for (const url of coverCandidates(track)) {
            const bytes = await fetchOneCover(url);
            if (bytes) return bytes;
        }
        return null;
    };
    const download = async track => {
        if (!track || track.source !== 'machhar-online') { UI.showToast('Select a streaming track to download.', 'info'); return false; }
        if (State.playbackSourceMode !== 'online') { UI.showToast('Switch to streaming playback to download this track.', 'info'); return false; }
        if (!navigator.onLine) { UI.showToast('You are offline. Reconnect to download AAC audio.', 'error'); return false; }
        let lastProgressToast = 0;
        try {
            UI.showToast('Preparing highest-quality AAC download…', 'download');
            const source = await OnlineMusic.resolveDownloadSource(track);
            if (!source?.url) throw new Error('No download source was returned by the backend.');
            const bytes = await fetchBytes(source.url, percent => {
                const now = Date.now();
                if (now - lastProgressToast > 1800 && percent < 100) { lastProgressToast = now; UI.showToast(`Downloading AAC · ${Math.round(percent)}%`, 'download'); }
            });
            if (!isAACM4A(bytes)) throw new Error('The backend did not provide a valid AAC/M4A file at its highest available quality. For safety, Mujic will not convert an MP3 or silently choose a lower-quality stream.');
            const cover = await fetchTrackCover(track);
            const metadata = tagM4A(bytes, track, cover);
            const filename = `${cleanFilePart(track.title)} - ${cleanFilePart(track.artist?.split(',')[0])}.m4a`;
            const objectUrl = URL.createObjectURL(metadata); const anchor = document.createElement('a');
            anchor.href = objectUrl; anchor.download = filename; anchor.style.display = 'none'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            UI.showToast(cover ? 'AAC download ready · metadata and cover art tagged.' : 'AAC download ready · metadata tagged, but cover art could not be fetched.', cover ? 'check_circle' : 'info');
            if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
            return true;
        } catch (error) {
            console.error('Online AAC download failed:', error);
            UI.showToast(error?.message || 'AAC download failed. Try again later.', 'error');
            return false;
        }
    };
    window.OnlineDownloader = { download, isAACM4A, cleanFilePart, fetchTrackCover, coverCandidates };
})();
