'use client';

import { useEffect, useRef } from 'react';

export default function GlobalWakeLock() {
    const wakeLockRef = useRef<any>(null);

    useEffect(() => {
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator && wakeLockRef.current === null && document.visibilityState === 'visible') {
                try {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    console.log('Screen Wake Lock API enabled');
                    
                    wakeLockRef.current.addEventListener('release', () => {
                        console.log('Screen Wake Lock was released');
                        wakeLockRef.current = null;
                    });
                } catch (err: any) {
                    console.error(`Wake Lock API error: ${err.name}, ${err.message}`);
                }
            }
        };

        const handleInteraction = () => {
            requestWakeLock();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        // Будь-який клік або тап в додатку буде намагатися увімкнути WakeLock, якщо він ще не увімкнений
        document.addEventListener('click', handleInteraction);
        document.addEventListener('touchstart', handleInteraction, { passive: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLockRef.current !== null) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
            document.removeEventListener('click', handleInteraction);
            document.removeEventListener('touchstart', handleInteraction);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return null;
}
