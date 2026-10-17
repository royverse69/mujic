/* Shared accessible dialog controller. */
        const Dialog = {
            show: (opts) => {
                return new Promise(resolve => {
                    const overlay = document.getElementById('dialog-overlay');
                    const box = document.getElementById('dialog-box');
                    const input = document.getElementById('dialog-input');
                    const confirmBtn = document.getElementById('dialog-btn-confirm');
                    const cancelBtn = document.getElementById('dialog-btn-cancel');

                    overlay.classList.add('active');
                    document.getElementById('dialog-title').innerText = opts.title || 'Confirm';
                    const msgEl = document.getElementById('dialog-message');
                    if (opts.message) { msgEl.innerText = opts.message; msgEl.style.display = 'block'; }
                    else { msgEl.style.display = 'none'; }

                    if (opts.type === 'prompt') {
                        input.style.display = 'block'; input.value = opts.defaultText || '';
                        setTimeout(() => input.focus(), 100);
                    } else { input.style.display = 'none'; }

                    confirmBtn.innerText = opts.confirmText || 'OK';
                    cancelBtn.innerText = opts.cancelText || 'Cancel';
                    cancelBtn.className = 'dialog-btn ' + (opts.destructive ? 'destructive' : 'primary');
                    box.classList.add('active');

                    const cleanup = () => {
                        box.classList.remove('active'); overlay.classList.remove('active');
                        State.dialogResolve = null;
                        confirmBtn.removeEventListener('click', onConfirm); cancelBtn.removeEventListener('click', onCancel);
                        overlay.removeEventListener('click', onOverlay); document.removeEventListener('keydown', onKeyDown);
                    };

                    const onConfirm = () => { cleanup(); resolve(opts.type === 'prompt' ? input.value : true); };
                    const onCancel = () => { cleanup(); resolve(opts.type === 'prompt' ? null : false); };
                    const onOverlay = (e) => { if (e.target === overlay) onCancel(); };
                    const onKeyDown = (e) => {
                        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                        else if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
                    };

                    State.dialogResolve = (val) => { cleanup(); resolve(val); };
                    confirmBtn.addEventListener('click', onConfirm); cancelBtn.addEventListener('click', onCancel);
                    overlay.addEventListener('click', onOverlay); document.addEventListener('keydown', onKeyDown);
                });
            }
        };
