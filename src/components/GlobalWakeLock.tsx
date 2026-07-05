'use client';

import { useEffect, useRef, useState } from 'react';
import { showToast } from '@/lib/toast';

export default function GlobalWakeLock() {
    const wakeLockRef = useRef<any>(null);
    const [needsActivation, setNeedsActivation] = useState(false);

    useEffect(() => {
        if (!('wakeLock' in navigator)) {
            return;
        }

        const requestWakeLock = async (isManualClick = false) => {
            if ('wakeLock' in navigator && wakeLockRef.current === null && document.visibilityState === 'visible') {
                try {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    console.log('Screen Wake Lock API enabled');
                    setNeedsActivation(false);
                    
                    if (isManualClick) {
                        showToast('Екран більше не гаснутиме!', 'success');
                    }
                    
                    wakeLockRef.current.addEventListener('release', () => {
                        console.log('Screen Wake Lock was released');
                        wakeLockRef.current = null;
                        if (document.visibilityState === 'visible') {
                            setNeedsActivation(true);
                        }
                    });
                } catch (err: any) {
                    console.error(`Wake Lock API error: ${err.name}, ${err.message}`);
                    setNeedsActivation(true);
                }
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
                requestWakeLock(false);
            }
        };

        // Try automatically on mount (works on some Androids, fails on iOS Safari)
        requestWakeLock(false);

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLockRef.current !== null) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (!needsActivation) return null;

    return (
        <button
            onClick={() => {
                const requestWakeLockManual = async () => {
                    try {
                        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                        setNeedsActivation(false);
                        showToast('Екран більше не гаснутиме!', 'success');
                        wakeLockRef.current.addEventListener('release', () => {
                            wakeLockRef.current = null;
                            if (document.visibilityState === 'visible') setNeedsActivation(true);
                        });
                    } catch (e) {
                        showToast('Не вдалося заблокувати екран', 'error');
                    }
                };
                requestWakeLockManual();
            }}
            className="fixed bottom-[100px] left-1/2 -translate-x-1/2 z-50 rounded-full bg-black/80 px-6 py-3 font-bold text-white shadow-xl backdrop-blur-md border border-white/20 active:scale-95 transition-transform"
        >
            🔒 Не гасити екран
        </button>
    );
}
