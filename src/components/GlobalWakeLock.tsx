'use client';

import { useEffect } from 'react';

export default function GlobalWakeLock() {
    useEffect(() => {
        let wakeLock: any = null;

        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                    console.log('Screen Wake Lock API enabled');
                    
                    wakeLock.addEventListener('release', () => {
                        console.log('Screen Wake Lock was released');
                    });
                } catch (err: any) {
                    console.error(`Wake Lock API error: ${err.name}, ${err.message}`);
                }
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && wakeLock === null) {
                requestWakeLock();
            }
        };

        const initWakeLock = () => {
            requestWakeLock();
            document.removeEventListener('click', initWakeLock);
            document.removeEventListener('touchstart', initWakeLock);
        };

        // Needs user interaction to start initially
        document.addEventListener('click', initWakeLock);
        document.addEventListener('touchstart', initWakeLock);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLock !== null) {
                wakeLock.release().catch(() => {});
            }
            document.removeEventListener('click', initWakeLock);
            document.removeEventListener('touchstart', initWakeLock);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return null; // This component doesn't render anything
}
