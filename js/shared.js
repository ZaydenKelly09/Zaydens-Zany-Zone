/* Shared browser feedback for the tool pages. */
function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            
            const bg = type === 'error' ? 'bg-red-500/90' : (type === 'warn' ? 'bg-amber-500/90' : 'bg-emerald-500/90');
            toast.className = `${bg} backdrop-blur-md text-white px-4 py-3 rounded shadow-lg flex items-center gap-2 toast-enter text-sm font-medium border border-white/10`;
            toast.innerHTML = `
                ${type === 'error' ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' : ''}
                ${type === 'success' ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : ''}

            `;
            const text = document.createElement('span');
            text.textContent = message;
            toast.appendChild(text);
            container.appendChild(toast);
            // Keep rapid exports from filling the viewport with old notifications.
            while (container.children.length > 3) container.firstElementChild.remove();

            setTimeout(() => {
                toast.classList.remove('toast-enter');
                toast.classList.add('toast-exit');
                toast.addEventListener('animationend', () => toast.remove());
            }, 3000);
        }
