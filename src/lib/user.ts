export function getUserId(): string {
    if (typeof window === 'undefined') return '';

    let id = localStorage.getItem('singsync_user_id');
    if (!id) {
        id =
            (
                typeof crypto !== 'undefined' &&
                typeof crypto.randomUUID === 'function'
            ) ?
                crypto.randomUUID()
            :   `u-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem('singsync_user_id', id);
    }
    return id;
}
