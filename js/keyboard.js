/* Copyright mujic@royverse69 */
const Keyboard = {
    ACTIONS: [
        { id:'playPause',  label:'Play / pause',        def:'Space',      repeat:false, run:() => Player.togglePlay() },
        { id:'next',       label:'Next track',          def:'n',          repeat:false, run:() => Player.next() },
        { id:'previous',   label:'Previous track',      def:'p',          repeat:false, run:() => Player.previous() },
        { id:'seekBack',   label:'Seek backward',       def:'ArrowLeft',  repeat:true,  run:() => Keyboard.seekBy(-1) },
        { id:'seekForward',label:'Seek forward',        def:'ArrowRight', repeat:true,  run:() => Keyboard.seekBy(1) },
        { id:'volumeUp',   label:'Volume up',           def:'ArrowUp',    repeat:true,  run:() => Keyboard.volumeBy(0.05) },
        { id:'volumeDown', label:'Volume down',         def:'ArrowDown',  repeat:true,  run:() => Keyboard.volumeBy(-0.05) },
        { id:'mute',       label:'Mute / unmute',       def:'m',          repeat:false, run:() => AudioAdapter.toggleMute() },
        { id:'shuffle',    label:'Toggle shuffle',      def:'s',          repeat:false, run:() => Player.toggleShuffle() },
        { id:'repeat',     label:'Cycle repeat',        def:'r',          repeat:false, run:() => Player.toggleRepeat() },
        { id:'favorite',   label:'Favorite current song', def:'l',        repeat:false, run:() => Player.toggleFavorite() },
        { id:'player',     label:'Open / close full player', def:'f',     repeat:false, run:() => (State.isFullPlayerOpen ? UI.closeFullPlayer() : UI.openFullPlayer()) },
        { id:'lyrics',     label:'Toggle lyrics',       def:'y',          repeat:false, run:() => document.getElementById('lyrics-btn')?.click() },
        { id:'addMusic',   label:'Add music',           def:'a',          repeat:false, run:() => document.getElementById('file-input')?.click() },
        { id:'search',     label:'Search',              def:'/',          repeat:false, run:() => Keyboard.focusSearch() },
        { id:'viewHome',   label:'Go to Home',          def:'1',          repeat:false, run:() => Keyboard.view('home') },
        { id:'viewLibrary',label:'Go to Library',       def:'2',          repeat:false, run:() => Keyboard.view('library') },
        { id:'viewSettings',label:'Go to Settings',     def:'3',          repeat:false, run:() => Keyboard.view('settings') },
        { id:'help',       label:'Show shortcut list',  def:'?',          repeat:false, run:() => Keyboard.showHelp() }
    ],
    capturing: null,
    binding: (id) => { const b = State.keyBindings || {}; const a = Keyboard.ACTIONS.find(x => x.id === id); return Object.prototype.hasOwnProperty.call(b, id) ? b[id] : (a ? a.def : ''); },
    combo: (e) => {
        if (['Shift','Control','Alt','Meta','CapsLock','Dead','Unidentified'].includes(e.key)) return null;
        let key = e.key === ' ' ? 'Space' : e.key;
        const isLetter = key.length === 1 && key.toLowerCase() !== key.toUpperCase();
        if (key.length === 1) key = key.toLowerCase();
        const mods = [];
        if (e.ctrlKey) mods.push('Ctrl'); if (e.altKey) mods.push('Alt');
        if (e.shiftKey && (key.length > 1 || isLetter)) mods.push('Shift');
        if (e.metaKey) mods.push('Meta');
        return mods.concat(key).join('+');
    },
    pretty: (c) => !c ? 'Unassigned' : c.replace('ArrowLeft','←').replace('ArrowRight','→').replace('ArrowUp','↑').replace('ArrowDown','↓'),
    seekBy: (dir) => { const a = AudioAdapter.audio; if (!a || !State.duration) return; AudioAdapter.seek(a.currentTime + dir * (Number(State.seekStep) || 10)); },
    volumeBy: (d) => AudioAdapter.setVolume(Math.max(0, Math.min(1, Math.round(((State.muted ? 0 : State.volume) + d) * 100) / 100))),
    view: (v) => { document.getElementById('dialog-overlay')?.classList.contains('active') || UI.switchView(v); },
    focusSearch: () => { UI.switchView('search'); setTimeout(() => document.getElementById('search-input')?.focus(), 60); },
    showHelp: () => {
        const lines = Keyboard.ACTIONS.map(a => `${Keyboard.pretty(Keyboard.binding(a.id)).padEnd(12)} ${a.label}`).join('\n');
        Dialog.show({ type:'confirm', title:'Keyboard shortcuts', message: lines + '\n\nCustomize them in Settings → Player & Audio.', confirmText:'Close' });
    },
    isTyping: (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t.tagName === 'INPUT' && ['checkbox','radio','button','range'].includes(t.type))),
    dialogOpen: () => !!document.getElementById('dialog-overlay')?.classList.contains('active'),
    suppressKeyup: null,
    onKeyDown: (e) => {
        if (Keyboard.capturing) return;
        if (!State.keyboardShortcutsEnabled || e.defaultPrevented || e.isComposing) return;
        if (Keyboard.isTyping(e.target) || Keyboard.dialogOpen()) return;
        const c = Keyboard.combo(e); if (!c) return;
        const action = Keyboard.ACTIONS.find(a => Keyboard.binding(a.id) === c); if (!action) return;
        if (e.repeat && !action.repeat) { e.preventDefault(); return; }
        e.preventDefault();
        Keyboard.suppressKeyup = e.code;
        try { action.run(); } catch (err) { Utils.warn(err); }
    },
    onKeyUp: (e) => { if (Keyboard.suppressKeyup && e.code === Keyboard.suppressKeyup) { e.preventDefault(); Keyboard.suppressKeyup = null; } },
    save: () => StorageAdapter.saveSettings(),
    render: () => {
        const host = document.getElementById('keyboard-shortcuts-list'); if (!host) return;
        const toggle = document.getElementById('kb-enabled'); if (toggle) toggle.checked = !!State.keyboardShortcutsEnabled;
        const used = {}; Keyboard.ACTIONS.forEach(a => { const c = Keyboard.binding(a.id); if (c) used[c] = (used[c] || 0) + 1; });
        host.textContent = '';
        for (const a of Keyboard.ACTIONS) {
            const c = Keyboard.binding(a.id);
            const row = document.createElement('div'); row.className = 'settings-row';
            const text = document.createElement('div'); text.className = 'settings-text';
            const label = document.createElement('div'); label.className = 'settings-label'; label.textContent = a.label;
            text.appendChild(label);
            const group = document.createElement('div'); group.className = 'settings-control-group';
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'kb-key' + (c && used[c] > 1 ? ' conflict' : '') + (c ? '' : ' empty');
            btn.textContent = Keyboard.pretty(c); btn.dataset.kbAction = a.id; btn.title = 'Click, then press the new key. Backspace clears, Escape cancels.';
            group.appendChild(btn); row.append(text, group); host.appendChild(row);
        }
    },
    startCapture: (btn) => {
        Keyboard.stopCapture(); Keyboard.capturing = btn.dataset.kbAction;
        btn.classList.add('capturing'); btn.textContent = 'Press a key…';
        const onKey = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { Keyboard.stopCapture(); return; }
            const id = Keyboard.capturing;
            if (e.key === 'Backspace' || e.key === 'Delete') State.keyBindings = Object.assign({}, State.keyBindings, { [id]: '' });
            else {
                const c = Keyboard.combo(e); if (!c) return;
                const next = Object.assign({}, State.keyBindings);
                const other = Keyboard.ACTIONS.find(a => a.id !== id && Keyboard.binding(a.id) === c);
                if (other) next[other.id] = Keyboard.binding(id);
                next[id] = c; State.keyBindings = next;
            }
            Keyboard.stopCapture(); Keyboard.save();
        };
        Keyboard._captureHandler = onKey; window.addEventListener('keydown', onKey, true);
    },
    stopCapture: () => {
        if (Keyboard._captureHandler) window.removeEventListener('keydown', Keyboard._captureHandler, true);
        Keyboard._captureHandler = null; Keyboard.capturing = null; Keyboard.render();
    },
    initDrop: () => {
        let depth = 0; const isFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
        window.addEventListener('dragenter', e => { if (!isFiles(e)) return; depth++; document.body.classList.add('mujic-drop-active'); });
        window.addEventListener('dragleave', e => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('mujic-drop-active'); });
        window.addEventListener('dragover', e => { if (isFiles(e)) e.preventDefault(); });
        window.addEventListener('drop', e => {
            if (!isFiles(e)) return; e.preventDefault(); depth = 0; document.body.classList.remove('mujic-drop-active');
            const files = Array.from(e.dataTransfer.files || []); if (!files.length) return;
            Library.importFiles({ target: { files, value: '' } }, State.playlistImportTargetId || null);
        });
    },
    init: () => {
        document.addEventListener('keydown', Keyboard.onKeyDown);
        document.addEventListener('keyup', Keyboard.onKeyUp, true);
        document.addEventListener('click', (e) => {
            const kb = e.target.closest('[data-kb-action]'); if (kb) { e.preventDefault(); Keyboard.startCapture(kb); return; }
            if (e.target.closest('#kb-reset')) { State.keyBindings = {}; Keyboard.save(); Keyboard.render(); UI.showToast('Keyboard shortcuts reset', 'check_circle'); return; }
            if (e.target.closest('#kb-help')) { Keyboard.showHelp(); return; }
            if (e.target.closest('[data-action="open-settings-group"]')) setTimeout(Keyboard.render, 0);
        });
        document.getElementById('kb-enabled')?.addEventListener('change', (e) => { State.keyboardShortcutsEnabled = !!e.target.checked; Keyboard.save(); });
        Keyboard.render(); Keyboard.initDrop();
        setTimeout(Keyboard.render, 1500);
    }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Keyboard.init); else Keyboard.init();
