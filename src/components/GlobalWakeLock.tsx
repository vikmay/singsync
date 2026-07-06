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
                        showToast('Екран більше не гаснутиме!');
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
                wakeLockRef.current.release().catch(() => { });
                wakeLockRef.current = null;
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (!needsActivation) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
                            setNeedsActivation(false); // Ховаємо навіть при помилці, щоб не блокувати сайт назавжди
                        }
                    };
                    requestWakeLockManual();
                }}
                className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-white p-8 text-black shadow-2xl active:scale-95 transition-transform max-w-sm text-center"
            >
                <div className="text-6xl">📱</div>
                <h2 className="text-2xl font-black">Увага!</h2>
                <p className="font-bold opacity-80">
                    Натисніть цю кнопку, щоб ваш екран не згасав під час використання програми.
                </p>
                <div className="mt-2 w-full rounded-xl bg-blue-600 py-4 font-black text-white text-lg">
                    Зрозуміло, увімкнути!
                </div>
            </button>
        </div>
    );
}
