export function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') return resolve(false);

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 dark:bg-black/80 z-[999999] flex items-center justify-center backdrop-blur-sm transition-opacity opacity-0';
        
        const modal = document.createElement('div');
        modal.className = 'bg-white dark:bg-gray-900 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4 transform scale-95 transition-transform flex flex-col gap-4 text-black dark:text-white border-2 border-black/10 dark:border-white/10';
        
        const text = document.createElement('p');
        text.className = 'font-bold text-lg text-center';
        text.textContent = message;
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'flex items-center justify-center gap-4 mt-2';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'px-4 py-2 rounded-lg font-bold bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition';
        cancelBtn.textContent = 'Ні';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'px-4 py-2 rounded-lg font-bold bg-red-600 text-white hover:bg-red-700 transition';
        okBtn.textContent = 'Так';

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(okBtn);
        modal.appendChild(text);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = (result: boolean) => {
            overlay.classList.remove('opacity-100');
            modal.classList.remove('scale-100');
            setTimeout(() => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            }, 300);
            resolve(result);
        };

        cancelBtn.onclick = () => close(false);
        okBtn.onclick = () => close(true);
        overlay.onclick = (e) => {
            if (e.target === overlay) close(false);
        };

        requestAnimationFrame(() => {
            overlay.classList.add('opacity-100');
            modal.classList.add('scale-100');
        });
    });
}

export function showPrompt(message: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') return resolve(null);

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 dark:bg-black/80 z-[999999] flex items-center justify-center backdrop-blur-sm transition-opacity opacity-0';
        
        const modal = document.createElement('div');
        modal.className = 'bg-white dark:bg-gray-900 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4 transform scale-95 transition-transform flex flex-col gap-4 text-black dark:text-white border-2 border-black/10 dark:border-white/10';
        
        const text = document.createElement('p');
        text.className = 'font-bold text-center';
        text.textContent = message;

        const input = document.createElement('input');
        input.className = 'w-full rounded-lg border-2 border-black/20 bg-black/5 px-4 py-2 text-center text-lg font-black outline-none dark:border-white/20 dark:bg-white/10 focus:border-black dark:focus:border-white';
        input.value = defaultValue;
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'flex items-center justify-center gap-4 mt-2';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'px-4 py-2 rounded-lg font-bold bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition';
        cancelBtn.textContent = 'Відміна';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'px-4 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 transition';
        okBtn.textContent = 'ОК';

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(okBtn);
        modal.appendChild(text);
        modal.appendChild(input);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = (result: string | null) => {
            overlay.classList.remove('opacity-100');
            modal.classList.remove('scale-100');
            setTimeout(() => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            }, 300);
            resolve(result);
        };

        cancelBtn.onclick = () => close(null);
        okBtn.onclick = () => close(input.value);
        overlay.onclick = (e) => {
            if (e.target === overlay) close(null);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        };

        requestAnimationFrame(() => {
            overlay.classList.add('opacity-100');
            modal.classList.add('scale-100');
            input.focus();
            if (defaultValue) input.select();
        });
    });
}
