'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useParams } from 'next/navigation';
import type { SongContentV1 } from '@/types/song';
import { transposeLineChords } from '@/lib/transpose';
import { getUserId } from '@/lib/user';

type ScrollPosition = { lineIndex: number; offsetPercent: number };

type SongApiResponse = {
    song: {
        id: number;
        title: string;
        artist: string;
        created_at: string;
        parsedContent: SongContentV1 | null;
    };
};

type RoomJoinInitial = {
    roomId: string;
    leaderId: string | null;
    timestamp: number;
};

type RoomSongChange = {
    roomId: string;
    songId: number | null;
    timestamp: number;
};

type RoomLeaderChange = {
    roomId: string;
    leaderId: string | null;
    timestamp: number;
};

type RoomSpeedChange = {
    roomId: string;
    speed: number;
    timestamp: number;
};

type RoomScrollUpdate = {
    roomId: string;
    scrollPosition: ScrollPosition;
    speed: number;
    timestamp: number;
};

type RoomTransposeChange = {
    roomId: string;
    transposeDelta: number;
    timestamp: number;
};

type Line = { chords: string; text: string };



function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function durationFromSpeed(speed: number) {
    const safe = Number.isFinite(speed) ? speed : 1;
    // speed>1 => faster (smaller duration)
    return clamp(900 / safe, 200, 1400);
}

function positionFromScrollTop(el: HTMLElement | null, top: number): ScrollPosition {
    if (!el) return { lineIndex: 0, offsetPx: 0 };
    const children = el.firstElementChild?.children;
    if (!children || children.length === 0) return { lineIndex: 0, offsetPx: 0 };

    let offset = 0;
    for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const h = child.offsetHeight;
        if (offset + h > top) {
            return { lineIndex: i, offsetPx: h > 0 ? (top - offset) / h : 0 };
        }
        offset += h;
    }
    return { lineIndex: children.length - 1, offsetPx: 1 };
}

function scrollTopFromPosition(el: HTMLElement | null, pos: ScrollPosition): number {
    if (!el) return 0;
    const children = el.firstElementChild?.children;
    if (!children || children.length === 0) return 0;

    let offset = 0;
    for (let i = 0; i < pos.lineIndex && i < children.length; i++) {
        offset += (children[i] as HTMLElement).offsetHeight;
    }
    const targetChild = children[pos.lineIndex] as HTMLElement | undefined;
    if (targetChild) {
        offset += targetChild.offsetHeight * (pos.offsetPx || 0);
    }
    return offset;
}

function formatActionLabel(action: string) {
    switch (action) {
        case 'down':
            return 'Свайп/Клавіша: Вниз';
        case 'up':
            return 'Свайп/Клавіша: Вгору';
        case 'pageDown':
            return 'Свайп/Клавіша: Далі';
        case 'pageUp':
            return 'Свайп/Клавіша: Назад';
        case 'space':
            return 'Свайп/Клавіша: Space';
        default:
            return action;
    }
}

function LineBlock({ line, transposeDelta, fontScale }: { line: Line; transposeDelta: number, fontScale: number }) {
    return (
        <div
            className="border-l-2 border-black/30 dark:border-white/20 px-2 py-2"
            style={{ minHeight: '2em' }}
        >
            <div className="text-center font-black leading-tight text-black dark:text-white whitespace-pre-wrap" style={{ fontSize: `${18 * fontScale}px` }}>
                {line.chords?.trim() ? transposeLineChords(line.chords, transposeDelta) : '\u00A0'}
            </div>
            <div className="mt-1 text-center font-black leading-tight text-black dark:text-white" style={{ fontSize: `${28 * fontScale}px` }}>
                {line.text}
            </div>
        </div>
    );
}

export default function RoomPage() {
    const params = useParams<{ roomId: string }>();
    const roomId = params?.roomId;

    const [userId, setUserId] = useState<string>('');

    useEffect(() => {
        setUserId(getUserId());
    }, []);

    const socket = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return io(window.location.origin, {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 999999,
            reconnectionDelay: 300,
            reconnectionDelayMax: 1500,
        });
    }, []);

    const [isSocketConnected, setIsSocketConnected] = useState(false);
    const [socketError, setSocketError] = useState('');

    const [leaderId, setLeaderId] = useState<string | null>(null);
    const isLeader = !!leaderId && leaderId === userId;

    const [songId, setSongId] = useState<number | null>(null);
    const [songTitle, setSongTitle] = useState<string>('');
    const [songArtist, setSongArtist] = useState<string>('');
    const [lines, setLines] = useState<Line[]>([]);

    const [speed, setSpeed] = useState(1);
    const [transposeDelta, setTransposeDelta] = useState(0);
    const [scrollTarget, setScrollTarget] = useState<ScrollPosition>({
        lineIndex: 0,
        offsetPx: 0,
    });

    const scrollTargetRef = useRef(scrollTarget);
    scrollTargetRef.current = scrollTarget;

    // Wake Lock: prevent screen from turning off using NoSleep.js (works over HTTP)
    useEffect(() => {
        let noSleep: any = null;

        const enableNoSleep = () => {
            if (!noSleep) {
                // Використовуємо require замість import(), щоб уникнути ChunkLoadError через localtunnel
                const NoSleepModule = require('nosleep.js');
                const NoSleep = NoSleepModule.default || NoSleepModule;
                noSleep = new NoSleep();
            }
            if (!noSleep.isEnabled) {
                noSleep.enable();
                console.log('NoSleep enabled');
            }
            // Remove listeners once activated
            document.removeEventListener('click', enableNoSleep);
            document.removeEventListener('touchstart', enableNoSleep);
        };

        // Needs a user interaction to start
        document.addEventListener('click', enableNoSleep);
        document.addEventListener('touchstart', enableNoSleep);

        return () => {
            if (noSleep && noSleep.isEnabled) {
                noSleep.disable();
            }
            document.removeEventListener('click', enableNoSleep);
            document.removeEventListener('touchstart', enableNoSleep);
        };
    }, []);

    const [fontScale, setFontScale] = useState(1);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const animatingRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const lastEmitRef = useRef<number>(0);
    const pendingScrollRef = useRef<{ pos: ScrollPosition; speed: number } | null>(null);
    const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFollowerUpdateRef = useRef<number>(0);

    const [fullscreen, setFullscreen] = useState(false);

    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [showQr, setShowQr] = useState(false);

    const [isSongModalOpen, setIsSongModalOpen] = useState(false);
    const [availableSongs, setAvailableSongs] = useState<any[]>([]);
    const [loadingSongs, setLoadingSongs] = useState(false);
    const [songSearchQuery, setSongSearchQuery] = useState('');

    const [isDetached, setIsDetached] = useState(false);
    const [showPedalPanel, setShowPedalPanel] = useState(false);

    // Minimal keyboard pedal binding (default mapping to required keys)
    type Action = 'down' | 'up' | 'pageDown' | 'pageUp' | 'space';
    const [binding, setBinding] = useState<Record<Action, string>>({
        down: 'ArrowDown',
        up: 'ArrowUp',
        pageDown: 'PageDown',
        pageUp: 'PageUp',
        space: ' ',
    });

    const [waitingForKey, setWaitingForKey] = useState<Action | null>(null);

    useEffect(() => {
        if (!socket || !userId) return;
        const s = socket;

        function connectAndJoin() {
            if (!roomId) return;

            s.emit(
                'room_join',
                { roomId, userId },
                (ack: { ok: boolean; error?: string }) => {
                    if (!ack.ok) {
                        // eslint-disable-next-line no-console
                        console.warn('room_join failed', ack.error);
                    }
                },
            );
        }

        const onConnect = () => {
            setIsSocketConnected(true);
            setSocketError('');
            connectAndJoin();
        };

        const onDisconnect = () => setIsSocketConnected(false);
        const onConnectError = (err: Error) => setSocketError(err.message);

        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        s.on('connect_error', onConnectError);
        
        if (s.connected) {
            onConnect();
        } else {
            s.connect();
        }

        return () => {
            s.off('connect', onConnect);
            s.off('disconnect', onDisconnect);
            s.off('connect_error', onConnectError);
            s.removeAllListeners();
            s.disconnect();
        };
    }, [roomId, socket, userId]);


    // Socket events (attach only once)
    useEffect(() => {
        if (!socket) return;
        const s = socket;

        s.on('leader_change', (payload: RoomLeaderChange) => {
            setLeaderId(payload.leaderId);
        });

        s.on('song_change', (payload: RoomSongChange) => {
            setSongId(payload.songId);
        });

        s.on('speed_change', (payload: RoomSpeedChange) => {
            setSpeed(payload.speed);
        });

        s.on('transpose_change', (payload: RoomTransposeChange) => {
            setTransposeDelta(payload.transposeDelta);
        });

        s.on('scroll_update', (payload: RoomScrollUpdate) => {
            setSpeed(payload.speed);
            setScrollTarget(payload.scrollPosition);
        });

        return () => {
            s.removeAllListeners('leader_change');
            s.removeAllListeners('song_change');
            s.removeAllListeners('speed_change');
            s.removeAllListeners('transpose_change');
            s.removeAllListeners('scroll_update');
        };
    }, [socket]);

    // Fetch initial room state via HTTP (robust fallback if sockets are slow)
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;

        async function loadRoom() {
            try {
                const res = await fetch(`/api/room/${roomId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;

                if (data.room?.songId && !songId) {
                    setSongId(data.room.songId);
                }
                if (data.room?.leaderId && !leaderId) {
                    setLeaderId(data.room.leaderId);
                }
            } catch (e) {
                // ignore
            }
        }
        loadRoom();

        return () => { cancelled = true; };
    }, [roomId, songId, leaderId]);

    // QR for connecting devices
    useEffect(() => {
        if (!roomId) return;

        let cancelled = false;

        async function loadQr() {
            setQrLoading(true);
            setQrDataUrl(null);
            setQrUrl(null);

            try {
                const res = await fetch(
                    `/api/qr/${encodeURIComponent(roomId)}`,
                );
                if (!res.ok) return;

                const data = (await res.json()) as {
                    dataUrl: string;
                    url: string;
                };
                if (cancelled) return;

                setQrDataUrl(data.dataUrl);
                setQrUrl(data.url);
            } catch {
                // ignore
            } finally {
                if (!cancelled) setQrLoading(false);
            }
        }

        loadQr();
        return () => {
            cancelled = true;
        };
    }, [roomId]);

    // Fetch song when songId changes
    useEffect(() => {
        let cancelled = false;

        async function loadSong() {
            if (!songId) return;

            const res = await fetch(`/api/song/${songId}`);
            if (!res.ok) return;

            const data = (await res.json()) as SongApiResponse;
            if (cancelled) return;

            setSongTitle(data.song.title);
            setSongArtist(data.song.artist);

            const parsed = data.song.parsedContent;
            if (!parsed?.lines) {
                setLines([]);
                return;
            }

            let songLines = parsed.lines as unknown as Line[];
            // Trim leading empty lines to remove whitespace at start
            while(songLines.length > 0 && !songLines[0].text.trim() && !songLines[0].chords?.trim()) {
                songLines = songLines.slice(1);
            }

            setLines(songLines);
        }

        loadSong();
        return () => {
            cancelled = true;
        };
    }, [songId]);

    // Smooth scroll followers toward target
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const targetTop = scrollTopFromPosition(el, scrollTarget);

        if (!isLeader) {
            // If participant unlinked their scroll, ignore leader's target
            if (isDetached) return;

            // follower: animate
            if (rafRef.current) cancelAnimationFrame(rafRef.current);

            const fromTop = el.scrollTop;
            const delta = targetTop - fromTop;

            if (Math.abs(delta) < 1) return;

            const now = Date.now();
            const timeSinceLastUpdate = now - lastFollowerUpdateRef.current;
            lastFollowerUpdateRef.current = now;

            // If updates are arriving quickly (continuous native scroll from leader) 
            // OR if it's a small jump, snapping is much better than a long animation 
            // that gets perpetually interrupted and freezes the screen.
            if (timeSinceLastUpdate < 200 || Math.abs(delta) < 132) {
                el.scrollTop = targetTop;
            } else {
                const ms = durationFromSpeed(speed);
                const start = performance.now();
                animatingRef.current = true;

                const step = (nowFrame: number) => {
                    const t = clamp((nowFrame - start) / ms, 0, 1);
                    // ease in-out
                    const eased =
                        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                    el.scrollTop = fromTop + delta * eased;

                    if (t < 1) {
                        rafRef.current = requestAnimationFrame(step);
                    } else {
                        animatingRef.current = false;
                    }
                };

                rafRef.current = requestAnimationFrame(step);
            }
        } else {
            // leader: snap (so they feel control)
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            const delta = Math.abs(el.scrollTop - targetTop);
            if (delta > 50) {
                el.scrollTop = targetTop;
            }
        }
    }, [scrollTarget, isLeader, speed]);

    // Utility: leader emit with throttle that guarantees last packet
    function emitScroll(pos: ScrollPosition, nextSpeed: number) {
        if (!socket || !roomId) return;

        const now = Date.now();
        if (now - lastEmitRef.current < 40) {
            pendingScrollRef.current = { pos, speed: nextSpeed };
            if (!throttleTimerRef.current) {
                throttleTimerRef.current = setTimeout(() => {
                    throttleTimerRef.current = null;
                    if (pendingScrollRef.current) {
                        const p = pendingScrollRef.current;
                        pendingScrollRef.current = null;
                        lastEmitRef.current = Date.now();
                        socket.emit('scroll_update', {
                            roomId,
                            userId,
                            scrollPosition: p.pos,
                            speed: p.speed,
                            timestamp: Date.now(),
                        });
                    }
                }, 40);
            }
            return;
        }

        lastEmitRef.current = now;
        socket.emit('scroll_update', {
            roomId,
            userId,
            scrollPosition: pos,
            speed: nextSpeed,
            timestamp: now,
        });
    }

    function applyScrollByLines(deltaLines: number) {
        const el = scrollRef.current;
        if (!el) return;

        const totalLines = lines.length;
        if (!totalLines) return;

        const current = positionFromScrollTop(el, el.scrollTop);
        const nextLine = clamp(
            current.lineIndex + deltaLines,
            0,
            totalLines - 1,
        );

        const nextPos: ScrollPosition = {
            lineIndex: nextLine,
            offsetPx: current.offsetPx,
        };

        setScrollTarget(nextPos);

        // leader updates immediately and emits
        el.scrollTop = scrollTopFromPosition(el, nextPos);
        emitScroll(nextPos, speed);
    }

    function applyJumpTop() {
        const nextPos: ScrollPosition = { lineIndex: 0, offsetPx: 0 };
        const el = scrollRef.current;
        if (el) el.scrollTop = 0;
        setScrollTarget(nextPos);
        emitScroll(nextPos, speed);
    }

    function toggleSpeed() {
        const nextSpeed = speed >= 1.5 ? 1 : 2;
        setSpeed(nextSpeed);

        // server expects speed_change with speed + optional scrollPosition
        if (socket && roomId) {
            socket.emit('speed_change', {
                roomId,
                userId,
                speed: nextSpeed,
                timestamp: Date.now(),
                scrollPosition: scrollTarget,
            });
        }
    }

    function changeTranspose(deltaChange: number) {
        let newDelta = transposeDelta + deltaChange;
        if (deltaChange === 0) newDelta = 0; // reset
        
        // optimistic update
        setTransposeDelta(newDelta);
        
        if (socket && roomId) {
            socket.emit('transpose_change', {
                roomId,
                userId,
                transposeDelta: newDelta,
                timestamp: Date.now(),
            });
        }
    }

    async function openSongModal() {
        setIsSongModalOpen(true);
        setSongSearchQuery('');
        if (availableSongs.length > 0) return;
        setLoadingSongs(true);
        try {
            const res = await fetch('/api/songs');
            if (res.ok) {
                const data = await res.json();
                setAvailableSongs(data.songs || []);
            }
        } catch (e) {
            // ignore
        } finally {
            setLoadingSongs(false);
        }
    }

    function selectSong(newSongId: number) {
        setIsSongModalOpen(false);
        if (songId === newSongId) return;

        setSongId(newSongId);

        if (socket && roomId) {
            socket.emit('song_change', {
                roomId,
                userId,
                songId: newSongId,
                timestamp: Date.now(),
            });
        }
    }

    function onNativeScroll() {
        if (!isLeader) return;
        
        const el = scrollRef.current;
        if (!el) return;
        
        const pos = positionFromScrollTop(el, el.scrollTop);
        
        // Minor optimization: ignore exact same target
        if (pos.lineIndex === scrollTarget.lineIndex && pos.offsetPx === scrollTarget.offsetPx) return;

        setScrollTarget(pos);
        emitScroll(pos, speed);
    }

    // Keyboard mapping (acts as "Bluetooth pedal")
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (waitingForKey) {
                // Capture next key
                e.preventDefault();
                const key = e.key === ' ' ? ' ' : e.key;
                setBinding((prev) => ({ ...prev, [waitingForKey]: key }));
                setWaitingForKey(null);
                return;
            }

            if (!isLeader) return;
            if (!roomId) return;

            const key = e.key === ' ' ? ' ' : e.key;

            if (key === binding.down) {
                e.preventDefault();
                applyScrollByLines(1);
            } else if (key === binding.up) {
                e.preventDefault();
                applyScrollByLines(-1);
            } else if (key === binding.pageDown) {
                e.preventDefault();
                applyScrollByLines(8);
            } else if (key === binding.pageUp) {
                e.preventDefault();
                applyScrollByLines(-8);
            } else if (key === binding.space) {
                e.preventDefault();
                // MVP: Space toggles speed (and also keeps it usable as "pedal")
                toggleSpeed();
            }
        }

        window.addEventListener('keydown', onKeyDown, { passive: false });
        return () => window.removeEventListener('keydown', onKeyDown as any);
    }, [
        binding,
        isLeader,
        roomId,
        speed,
        waitingForKey,
        scrollTarget,
        lines.length,
        socket,
    ]);

    // Swipe on mobile (leader only)
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let startY = 0;
        let startX = 0;
        let started = false;

        const onTouchStart = (ev: TouchEvent) => {
            if (!isLeader) return;
            if (ev.touches.length !== 1) return;
            started = true;
            startY = ev.touches[0].clientY;
            startX = ev.touches[0].clientX;
        };

        const onTouchEnd = (ev: TouchEvent) => {
            if (!isLeader) return;
            if (!started) return;
            started = false;

            const t = ev.changedTouches[0];
            const dx = Math.abs(t.clientX - startX);
            const dy = t.clientY - startY;

            if (dx > 40) return; // ignore horizontal

            if (dy < -120) {
                // swipe up => down lines
                applyScrollByLines(8);
            } else if (dy < -40) {
                applyScrollByLines(1);
            } else if (dy > 120) {
                applyScrollByLines(-8);
            } else if (dy > 40) {
                applyScrollByLines(-1);
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchend', onTouchEnd);

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [isLeader, lines.length]);

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setFullscreen(true);
            } else {
                await document.exitFullscreen();
                setFullscreen(false);
            }
        } catch {
            // ignore
        }
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-3xl px-3 py-3">
                <header className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex flex-nowrap sm:flex-wrap items-center gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <a
                            href="/"
                            className="relative h-10 w-10 shrink-0 transition active:translate-x-[1px] active:translate-y-[1px]"
                            title="На головну"
                        >
                            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full fill-white stroke-black stroke-2 dark:fill-black dark:stroke-white">
                                <path strokeLinejoin="round" d="M12 2 L2 12 L2 22 L22 22 L22 12 Z" />
                            </svg>
                        </a>
                        
                        {isLeader && (
                            <span
                                className="flex h-10 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-black px-3 text-sm font-black text-white dark:border-white dark:bg-white dark:text-black"
                                title="Роль: Ведучий"
                            >
                                Ведучий
                            </span>
                        )}

                        {isLeader && (
                            <div className="flex h-10 shrink-0 items-center rounded-lg border-2 border-black bg-white font-black dark:border-white dark:bg-black">
                                <span className="px-3 text-center text-sm" title="Тональність">
                                    Тон:{transposeDelta > 0 ? `+${transposeDelta}` : transposeDelta}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => changeTranspose(-1)}
                                    className="flex h-full w-10 items-center justify-center border-l-2 border-black text-lg transition active:bg-black active:text-white dark:border-white dark:active:bg-white dark:active:text-black"
                                >
                                    -
                                </button>
                                <button
                                    type="button"
                                    onClick={() => changeTranspose(1)}
                                    className="flex h-full w-10 items-center justify-center border-l-2 border-black text-lg transition active:bg-black active:text-white dark:border-white dark:active:bg-white dark:active:text-black"
                                >
                                    +
                                </button>
                            </div>
                        )}



                        {!isLeader && socket?.connected && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setIsDetached(!isDetached)}
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 transition active:translate-x-[1px] active:translate-y-[1px] ${
                                        isDetached
                                            ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                            : 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    }`}
                                    title={isDetached ? 'Синхронізація: ВИМК' : 'Синхронізація: УВІМК'}
                                >
                                    {isDetached ? 
                                        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                            <line x1="4" y1="4" x2="20" y2="20" strokeLinecap="round" />
                                        </svg>
                                    : 
                                        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                        </svg>
                                    }
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        socket.emit('take_leadership', { roomId, userId });
                                    }}
                                    className="flex h-10 shrink-0 items-center justify-center rounded-lg border-2 border-green-600 bg-green-500/10 px-3 text-sm font-black text-green-600 transition active:translate-x-[1px] active:translate-y-[1px] dark:border-green-400 dark:text-green-400"
                                >
                                    Бути ведучим
                                </button>
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-white text-lg font-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                        title="Повний екран"
                    >
                        {fullscreen ?
                            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 9h-6V3 M15 9l7-7 M3 9h6V3 M9 9L2 2 M21 15h-6v6 M15 15l7 7 M3 15h6v6 M9 15l-7 7" />
                            </svg>
                        :
                            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6 M21 3l-7 7 M9 3H3v6 M3 3l7 7 M15 21h6v-6 M21 21l-7-7 M9 21H3v-6 M3 21l7-7" />
                            </svg>
                        }
                    </button>
                </header>

                {isLeader && showPedalPanel && (
                    <section className="mb-2 rounded border-2 border-black bg-white p-2 text-xs dark:border-white dark:bg-black">
                        <div className="flex flex-wrap items-center gap-2">
                            {(
                                [
                                    'down',
                                    'up',
                                    'pageDown',
                                    'pageUp',
                                    'space',
                                ] as Action[]
                            ).map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => setWaitingForKey(a)}
                                    className="rounded border-2 border-black bg-white px-2 py-1 font-black active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                    title="Натисніть кнопку — потім будь-яку клавішу/педаль"
                                >
                                    {waitingForKey === a ?
                                        'Натисни...'
                                    :   `${formatActionLabel(a)}: ${binding[a]}`
                                    }
                                </button>
                            ))}
                        </div>

                        <div className="mt-2 opacity-80">
                            Space: перемикає швидкість синхро-світу. Arrow/Page:
                            кроки по рядках.
                        </div>

                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                onClick={applyJumpTop}
                                className="rounded border-2 border-black bg-black px-2 py-1 text-xs font-black text-white active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black"
                            >
                                В початок
                            </button>
                        </div>
                    </section>
                )}

                {showQr && (
                    <section className="mb-2 rounded border-2 border-black bg-white p-2 text-xs dark:border-white dark:bg-black">
                        {qrLoading ?
                            <div className="opacity-80">Генерація QR...</div>
                        :   null}

                        {!qrLoading && qrDataUrl ?
                            <div className="flex items-start gap-3">
                                <img
                                    src={qrDataUrl}
                                    alt="QR code"
                                    className="h-[160px] w-[160px] border-2 border-black bg-white dark:border-white"
                                />

                                <div className="min-w-0">
                                    <div className="mb-1 font-black">Сайт:</div>
                                    <div className="break-all opacity-80">
                                        {qrUrl || ''}
                                    </div>
                                    <div className="mt-2 opacity-80">
                                        Інші сканують QR на телефоні.
                                    </div>
                                </div>
                            </div>
                        :   null}
                    </section>
                )}

                <section className="mb-2">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <div className="truncate text-2xl font-black shrink">
                                {songTitle || '—'}
                            </div>
                            
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowQr(!showQr)}
                                    className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-sm font-black transition active:translate-x-[1px] active:translate-y-[1px] ${
                                        showQr ? 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'border-black bg-white dark:border-white dark:bg-black'
                                    }`}
                                    title="QR Код"
                                >
                                    QR
                                </button>
                                
                                {isLeader && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPedalPanel(!showPedalPanel)}
                                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-xl transition active:translate-x-[1px] active:translate-y-[1px] ${
                                            showPedalPanel ? 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'border-black bg-white dark:border-white dark:bg-black'
                                        }`}
                                        title="Налаштування педалі"
                                    >
                                        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2">
                                            <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-bold opacity-80">
                                    {songArtist || ''}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const url = window.location.href;
                                        if (navigator.share) {
                                            navigator.share({
                                                title: 'SingSync',
                                                text: `Приєднуйся до кімнати №${roomId}!`,
                                                url: url,
                                            }).catch(() => {
                                                navigator.clipboard?.writeText(url);
                                                alert('Посилання скопійовано!');
                                            });
                                        } else {
                                            try {
                                                const textArea = document.createElement("textarea");
                                                textArea.value = url;
                                                textArea.style.position = "fixed";
                                                document.body.appendChild(textArea);
                                                textArea.focus();
                                                textArea.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(textArea);
                                                alert('Посилання скопійовано!');
                                            } catch (e) {
                                                alert('Скопіюйте це посилання: ' + url);
                                            }
                                        }
                                    }}
                                    className="text-sm font-black text-blue-700 bg-blue-100 px-3 py-1 rounded-lg border-2 border-blue-200 transition active:translate-x-[1px] active:translate-y-[1px] dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700/50"
                                    title="Поділитися"
                                >
                                    Кімната {roomId}
                                </button>
                            </div>
                            {isLeader && (
                                <button
                                    type="button"
                                    onClick={openSongModal}
                                    className="rounded-lg border-2 border-black px-3 py-1.5 text-sm font-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white"
                                >
                                    Змінити пісню
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                <section className="rounded border-2 border-black bg-white dark:border-white dark:bg-black flex flex-col">
                    <div className="flex items-center justify-between border-b-2 border-black/10 px-4 py-2 dark:border-white/10 shrink-0">
                        <button 
                            className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-xl font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                            onClick={() => setFontScale(s => Math.max(0.5, s - 0.1))}
                            title="Зменшити шрифт"
                        >
                            -
                        </button>
                        <span className="text-xs font-black opacity-50 uppercase tracking-wider">Шрифт</span>
                        <button 
                            className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-xl font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                            onClick={() => setFontScale(s => Math.min(2, s + 0.1))}
                            title="Збільшити шрифт"
                        >
                            +
                        </button>
                    </div>
                    <div
                        ref={scrollRef}
                        onScroll={onNativeScroll}
                        className="h-[calc(100dvh-260px)] overflow-y-auto overscroll-contain"
                    >
                        <div className="flex flex-col">
                            {lines.length === 0 ?
                                <div className="p-3 text-sm opacity-80">
                                    Завантаження контенту...
                                </div>
                            :   null}

                            {lines.map((line, idx) => (
                                <LineBlock key={idx} line={line} transposeDelta={transposeDelta} fontScale={fontScale} />
                            ))}
                        </div>
                    </div>
                </section>

                <div className="pb-6"></div>

                {isSongModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-md rounded-xl border-2 border-black bg-white p-4 shadow-xl flex flex-col max-h-[90vh] dark:border-white dark:bg-black">
                            <div className="mb-4 flex flex-shrink-0 items-center justify-between">
                                <h2 className="text-xl font-black text-black dark:text-white">Оберіть нову пісню</h2>
                                <button 
                                    onClick={() => setIsSongModalOpen(false)}
                                    className="text-2xl font-black leading-none opacity-50 hover:opacity-100"
                                >
                                    ×
                                </button>
                            </div>

                            <input
                                type="text"
                                placeholder="Пошук пісні або виконавця..."
                                value={songSearchQuery}
                                onChange={(e) => setSongSearchQuery(e.target.value)}
                                className="mb-4 w-full flex-shrink-0 rounded border-2 border-black p-2 font-bold focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white dark:bg-black dark:text-white dark:focus:ring-white/20"
                            />

                            {loadingSongs ? (
                                <div className="py-8 text-center font-bold opacity-70">Завантаження...</div>
                            ) : (
                                <div className="overflow-y-auto pr-2">
                                    {availableSongs.filter(s => 
                                        s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) || 
                                        s.artist.toLowerCase().includes(songSearchQuery.toLowerCase())
                                    ).length === 0 ? (
                                        <div className="text-center opacity-70">Пісень не знайдено.</div>
                                    ) : (
                                        availableSongs.filter(s => 
                                            s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) || 
                                            s.artist.toLowerCase().includes(songSearchQuery.toLowerCase())
                                        ).map(song => (
                                            <button
                                                key={song.id}
                                                onClick={() => selectSong(song.id)}
                                                className={`mb-2 w-full text-left rounded-lg border-2 p-3 transition ${
                                                    song.id === songId
                                                        ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                                                        : 'border-black/20 bg-white hover:border-black dark:border-white/20 dark:bg-black dark:hover:border-white'
                                                }`}
                                            >
                                                <div className="font-black text-lg">{song.title}</div>
                                                <div className="text-sm font-bold opacity-80">{song.artist}</div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
