'use client';

import { useEffect } from 'react';

export default function SwRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        // Prevent double-register in dev HMR
        if ((window as any).__singsync_sw_registered) return;
        (window as any).__singsync_sw_registered = true;

        if (process.env.NODE_ENV === 'development') {
            // В режимі розробки ми видаляємо SW, щоб він не кешував стару сторінку
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        } else {
            // В продакшені реєструємо
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // ignore
            });
        }
    }, []);

    return null;
}
