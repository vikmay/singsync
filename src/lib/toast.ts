export function showToast(message: string, duration = 3000) {
    if (typeof document === 'undefined') return;

    // Create toast container if it doesn't exist
    let container = document.getElementById('singsync-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'singsync-toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '999999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        container.style.pointerEvents = 'none';
        container.style.alignItems = 'center';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    
    // Inline styles for Tailwind-like appearance (in case tailwind classes get purged or are unavailable in the container context, though they should be)
    toast.className = 'bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-lg shadow-xl font-bold text-sm text-center transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto';
    
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Animate out
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => {
            if (container && toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 300);
    }, duration);
}
