'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SongContentV1 } from '@/types/song';
import { transposeLineChords } from '@/lib/transpose';
import { getUserId } from '@/lib/user';
import { showToast } from '@/lib/toast';
import { showPrompt } from '@/lib/dialog';

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

type Line = { chords: string; text: string; placements?: { i: number; c: string }[] };



function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function durationFromSpeed(speed: number) {
    const safe = Number.isFinite(speed) ? speed : 1;
    // speed>1 => faster (smaller duration)
    return clamp(900 / safe, 200, 1400);
}

function positionFromScrollTop(el: HTMLElement | null, top: number): ScrollPosition {
    if (!el) return { lineIndex: 0, offsetPercent: 0 };
    const children = el.firstElementChild?.children;
    if (!children || children.length === 0) return { lineIndex: 0, offsetPercent: 0 };

    let offset = 0;
    for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const h = child.offsetHeight;
        if (offset + h > top) {
            return { lineIndex: i, offsetPercent: h > 0 ? (top - offset) / h : 0 };
        }
        offset += h;
    }
    return { lineIndex: children.length - 1, offsetPercent: 1 };
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
        offset += targetChild.offsetHeight * (pos.offsetPercent || 0);
    }
    return offset;
}


function LineBlock({ line, transposeDelta, fontScale, showChords }: { line: Line; transposeDelta: number, fontScale: number, showChords: boolean }) {
    const placements = line.placements || [];
    const segments: { chord: string; text: string }[] = [];
    
    if (placements.length > 0) {
        const sortedPlacements = [...placements].sort((a, b) => a.i - b.i);
        const trailingMatch = line.text.match(/ +$/);
        const trailingSpacesLen = trailingMatch ? trailingMatch[0].length : 0;

        if (sortedPlacements.length > 0) {
            if (sortedPlacements[0].i > 0) {
                segments.push({ chord: '', text: line.text.slice(0, sortedPlacements[0].i) });
            }
            for (let j = 0; j < sortedPlacements.length; j++) {
                const p = sortedPlacements[j];
                const nextP = sortedPlacements[j + 1];

                let endI = nextP ? nextP.i : undefined;
                if (!nextP) {
                    if (p.i < line.text.length - trailingSpacesLen) {
                        endI = line.text.length - trailingSpacesLen;
                    } else {
                        endI = undefined;
                    }
                }

                const textSlice = line.text.slice(p.i, endI);
                segments.push({ chord: p.c, text: textSlice });
            }

            // trailing spaces segment
            let currentEnd = 0;
            if (sortedPlacements.length > 0) {
                const lastP = sortedPlacements[sortedPlacements.length - 1];
                let lastEnd = lastP.i;
                if (lastEnd < line.text.length - trailingSpacesLen) {
                    lastEnd = line.text.length - trailingSpacesLen;
                } else {
                    lastEnd = line.text.length;
                }
                currentEnd = lastEnd;
            }
            
            if (currentEnd < line.text.length) {
                segments.push({ chord: '', text: line.text.slice(currentEnd) });
            }

        }
    } else {
        segments.push({ chord: line.chords?.trim() || '', text: line.text });
    }

    return (
        <div
            className="px-2 py-2 block text-center break-words shadow-[inset_2px_0_0_rgba(0,0,0,0.3)] dark:shadow-[inset_2px_0_0_rgba(255,255,255,0.2)]"
            style={{ minHeight: showChords ? '2.5em' : '1.5em' }}
        >
            {segments.map((seg, idx) => (
                <span key={idx} className="relative inline">
                    {showChords && (
                        <span className="absolute bottom-full left-0 font-black leading-tight text-blue-700 dark:text-blue-400 whitespace-pre flex items-center justify-center z-10" style={{ fontSize: `${18 * fontScale}px` }}>
                            <span className="text-center min-w-[1ch]">{seg.chord ? transposeLineChords(seg.chord, transposeDelta) : ''}</span>
                        </span>
                    )}
                    <span className={`font-black text-black dark:text-white ${seg.text.trim() === '' ? 'whitespace-pre' : 'whitespace-pre-wrap'}`} style={{ fontSize: `${28 * fontScale}px`, lineHeight: showChords ? '1.8' : '1.2' }}>
                        {seg.text}
                    </span>
                </span>
            ))}
        </div>
    );
}

export default function RoomPage() {
    const params = useParams<{ roomId: string }>();
    const router = useRouter();
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
        offsetPercent: 0,
    });

    const scrollTargetRef = useRef(scrollTarget);
    scrollTargetRef.current = scrollTarget;



    const [fontScale, setFontScale] = useState(1);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const animatingRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const lastEmitRef = useRef<number>(0);
    const pendingScrollRef = useRef<{ pos: ScrollPosition; speed: number } | null>(null);
    const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFollowerUpdateRef = useRef<number>(0);

    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setFullscreen(!!document.fullscreenElement);
        };
        handleFullscreenChange();
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [showQr, setShowQr] = useState(false);

    const [isDetached, setIsDetached] = useState(false);

    const [proposal, setProposal] = useState<{songId: number, songTitle: string, artist: string} | null>(null);
    const isLeaderRef = useRef(isLeader);
    isLeaderRef.current = isLeader;

    const [adminClicks, setAdminClicks] = useState(0);

    const [fullscreenSupported, setFullscreenSupported] = useState(true);
    useEffect(() => {
        setFullscreenSupported(!!(document.documentElement as any).requestFullscreen || !!(document.documentElement as any).webkitRequestFullscreen);
    }, []);

    async function handleAdminClick() {
        const newCount = adminClicks + 1;
        if (newCount >= 10) {
            setAdminClicks(0);
            const pwd = await showPrompt("Введіть пароль адміністратора:");
            if (pwd) {
                localStorage.setItem("admin_pwd", pwd);
                showToast("Пароль збережено! Тепер у вас є права адміністратора на головному екрані.");
            }
        } else {
            setAdminClicks(newCount);
        }
    }

    const [showTransposeMenu, setShowTransposeMenu] = useState(false);
    const transposeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function resetTransposeTimeout() {
        if (transposeTimeoutRef.current) clearTimeout(transposeTimeoutRef.current);
        transposeTimeoutRef.current = setTimeout(() => {
            setShowTransposeMenu(false);
        }, 5000);
    }

    useEffect(() => {
        return () => {
            if (transposeTimeoutRef.current) clearTimeout(transposeTimeoutRef.current);
        };
    }, []);

    const [showChords, setShowChords] = useState(false);

    type Action = 'down' | 'up' | 'pageDown' | 'pageUp' | 'space';
    const [binding, setBinding] = useState<Record<Action, string>>({
        down: 'ArrowDown',
        up: 'ArrowUp',
        pageDown: 'PageDown',
        pageUp: 'PageUp',
        space: ' ',
    });

    useEffect(() => {
        const stored = localStorage.getItem('pedal_bindings');
        if (stored) {
            try {
                setBinding(JSON.parse(stored));
            } catch (e) {
                // Ignore
            }
        }
    }, []);

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
            setTransposeDelta(0);
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

        s.on('song_proposed', (payload: {songId: number, songTitle: string, artist: string} | null) => {
            if (payload) {
                setProposal({
                    songId: payload.songId,
                    songTitle: payload.songTitle,
                    artist: payload.artist,
                });
            } else {
                setProposal(null);
            }
        });
        s.on('room_deleted', () => {
            showToast("Ця кімната була видалена.");
            router.push('/');
        });

        return () => {
            s.removeAllListeners('leader_change');
            s.removeAllListeners('song_change');
            s.removeAllListeners('speed_change');
            s.removeAllListeners('transpose_change');
            s.removeAllListeners('scroll_update');
            s.removeAllListeners('song_proposed');
            s.removeAllListeners('room_deleted');
        };
    }, [socket, router]);

    // Fetch initial room state via HTTP (robust fallback if sockets are slow)
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;

        async function loadRoom() {
            try {
                const res = await fetch(`/api/room/${roomId}`);
                if (cancelled) return;
                
                if (res.status === 404) {
                    showToast("Ця кімната більше не існує.");
                    router.push('/');
                    return;
                }
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;

                if (data.room?.songId) {
                    setSongId(prev => prev || data.room.songId);
                }
                if (data.room?.leaderId) {
                    setLeaderId(prev => prev || data.room.leaderId);
                }
            } catch (e) {
                // ignore
            }
        }
        loadRoom();

        return () => { cancelled = true; };
    }, [roomId, router]);

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
            if (parsed.defaultFontScale !== undefined) {
                setFontScale(parsed.defaultFontScale);
            } else {
                setFontScale(1.0);
            }
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
            offsetPercent: current.offsetPercent,
        };

        setScrollTarget(nextPos);

        // leader updates immediately and emits
        el.scrollTop = scrollTopFromPosition(el, nextPos);
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
        
        if (newDelta > 11) newDelta = 11;
        if (newDelta < -11) newDelta = -11;
        if (newDelta === transposeDelta) return;

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

        resetTransposeTimeout();
    }

    function selectSong(newSongId: number) {
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

    function clearProposal() {
        setProposal(null);
        if (socket && roomId) {
            socket.emit('clear_proposal', {
                roomId,
                userId,
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
        if (pos.lineIndex === scrollTarget.lineIndex && pos.offsetPercent === scrollTarget.offsetPercent) return;

        setScrollTarget(pos);
        emitScroll(pos, speed);
    }

    // Keyboard mapping (acts as "Bluetooth pedal")
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {

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
        scrollTarget,
        lines.length,
        socket,
    ]);


    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
                const docEl = document.documentElement as any;
                if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                    setFullscreen(true);
                } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                    setFullscreen(true);
                } else {
                    showToast('Повноекранний режим не підтримується на цьому пристрої (iOS)', 'error');
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                    await (document as any).webkitExitFullscreen();
                }
                setFullscreen(false);
            }
        } catch {
            // ignore
        }
    }

    return (
        <main className="flex h-[100dvh] flex-col overflow-hidden bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pt-3 pb-0 border-x-2 border-black/5 dark:border-white/5">
                <header className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/"
                            className="relative h-10 w-10 shrink-0 transition active:translate-x-[1px] active:translate-y-[1px]"
                            title="На головну"
                        >
                            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full fill-white stroke-black stroke-2 dark:fill-black dark:stroke-white">
                                <path strokeLinejoin="round" strokeLinecap="round" d="M12 3 L2 11.5 L5 11.5 L5 21 L19 21 L19 11.5 L22 11.5 Z" />
                            </svg>
                        </Link>
                        
                        {socket?.connected && (
                            <button
                                type="button"
                                onClick={() => {
                                    // Always emit take_leadership as a fail-safe sync
                                    socket.emit('take_leadership', { roomId, userId });
                                    if (isLeader) {
                                        handleAdminClick();
                                    }
                                }}
                                className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border-2 transition active:translate-x-[1px] active:translate-y-[1px] ${
                                    !isLeader
                                        ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                        : 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                }`}
                                title={isLeader ? 'Роль: Ведучий' : 'Бути ведучим'}
                            >
                                {!isLeader ?
                                    <svg viewBox="0 0 28 24" className="h-6 w-7 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M 2 4 l 4 6 l 4 -6 l 4 6 l 4 -6 l 4 6 l 4 -6 v 13 a 2 2 0 0 1 -2 2 H 4 a 2 2 0 0 1 -2 -2 z" />
                                        <line x1="2" y1="2" x2="26" y2="22" />
                                    </svg>
                                :
                                    <svg viewBox="0 0 28 24" className="h-6 w-7 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M 2 4 l 4 6 l 4 -6 l 4 6 l 4 -6 l 4 6 l 4 -6 v 13 a 2 2 0 0 1 -2 2 H 4 a 2 2 0 0 1 -2 -2 z" />
                                    </svg>
                                }
                            </button>
                        )}

                        {isLeader && (
                            <div className="relative shrink-0">
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


                            </>
                        )}

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
                                        showToast('Посилання скопійовано!');
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
                                        showToast('Посилання скопійовано!');
                                    } catch (err) {
                                        showToast('Скопіюйте це посилання: ' + url);
                                    }
                                }
                            }}
                            className="flex h-10 shrink-0 items-center gap-2 text-sm font-black text-blue-700 bg-blue-100 px-3 rounded-lg border-2 border-blue-200 transition active:translate-x-[1px] active:translate-y-[1px] dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700/50"
                            title="Поділитися"
                        >
                            <span>{roomId}</span>
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </button>
                        
                        <button
                            type="button"
                            onClick={() => setShowQr(!showQr)}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 transition active:translate-x-[1px] active:translate-y-[1px] ${
                                showQr ? 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'border-black bg-white dark:border-white dark:bg-black'
                            }`}
                            title="Показати QR Код"
                        >
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                                <path d="M21 21v.01"></path>
                                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                                <path d="M3 12h.01"></path>
                                <path d="M12 3h.01"></path>
                                <path d="M12 16v.01"></path>
                                <path d="M16 12h1"></path>
                                <path d="M21 12v.01"></path>
                                <path d="M12 21v-1"></path>
                            </svg>
                        </button>
                    </div>

                    {fullscreenSupported && (
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
                    )}
                </header>




                <section className="mb-2">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <div className="truncate text-2xl font-black shrink">
                                {songTitle || '—'}
                            </div>
                            
                            {showChords && (
                                <div className="relative shrink-0 ml-auto">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showTransposeMenu) {
                                                setShowTransposeMenu(false);
                                                if (transposeTimeoutRef.current) clearTimeout(transposeTimeoutRef.current);
                                            } else {
                                                setShowTransposeMenu(true);
                                                resetTransposeTimeout();
                                            }
                                        }}
                                        className={`flex h-10 px-3 shrink-0 items-center justify-center rounded-lg border-2 transition active:translate-x-[1px] active:translate-y-[1px] font-black text-sm select-none touch-manipulation ${
                                            showTransposeMenu ? 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'border-black bg-white dark:border-white dark:bg-black'
                                        }`}
                                        title="Тональність"
                                    >
                                        Тон:{transposeDelta > 0 ? `+${transposeDelta}` : transposeDelta}
                                    </button>
                                    
                                    {showTransposeMenu && (
                                        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 flex h-10 items-center rounded-lg border-2 border-black bg-white font-black shadow-[3px_3px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-black dark:shadow-[3px_3px_0px_rgba(255,255,255,1)]">
                                            <button
                                                type="button"
                                                onClick={() => changeTranspose(-1)}
                                                disabled={transposeDelta <= -11}
                                                className="flex h-full w-12 items-center justify-center text-xl transition active:bg-black active:text-white dark:active:bg-white dark:active:text-black rounded-l-md disabled:opacity-20 disabled:active:bg-transparent disabled:active:text-inherit select-none touch-manipulation"
                                            >
                                                -
                                            </button>
                                            <div className="w-[2px] h-full bg-black dark:bg-white"></div>
                                            <button
                                                type="button"
                                                onClick={() => changeTranspose(1)}
                                                disabled={transposeDelta >= 11}
                                                className="flex h-full w-12 items-center justify-center text-xl transition active:bg-black active:text-white dark:active:bg-white dark:active:text-black rounded-r-md disabled:opacity-20 disabled:active:bg-transparent disabled:active:text-inherit select-none touch-manipulation"
                                            >
                                                +
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowChords(!showChords)}
                                className={`${showChords ? '' : 'ml-auto'} relative flex h-10 w-20 shrink-0 items-center justify-center transition active:translate-x-[1px] active:translate-y-[1px] select-none touch-manipulation ${
                                    showChords
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : 'text-black dark:text-white'
                                }`}
                                title={showChords ? 'Сховати акорди' : 'Показати акорди'}
                            >
                                <svg 
                                        viewBox="-61.2 -61.2 734.40 734.40" 
                                        className="absolute inset-0 h-full w-full fill-current transition-transform scale-[1.8] pointer-events-none"
                                    >
                                        <g transform="rotate(45 306 306)"> 
                                            <path d="M68.635,513.758l-16.047,16.047l-7.385-7.385l16.047-16.047L68.635,513.758z M70.965,516.073l-16.047,16.048l7.385,7.385 l16.047-16.047L70.965,516.073z M80.688,525.765L64.64,541.813l7.386,7.386l16.048-16.048L80.688,525.765z M74.366,551.555 l7.385,7.387l16.051-16.046l-7.385-7.387L74.366,551.555z M612,28.05c-0.021,10.689-6.912,19.605-17.149,22.186l-2.91,0.734 c-2.638,0.666-4.917,2.407-6.253,4.775l-34.084,60.421c-2.75,4.527-7.587,7.229-12.943,7.229c-2.336,0-4.601-0.512-6.735-1.52 c-2.865-1.354-6.066-2.069-9.255-2.069c-5.784,0-11.223,2.252-15.313,6.342l-8.001,8.001L238.443,400.651 c-3.314,7.421-2.811,13.382,1.526,17.718c6.215,6.217,17.009,5.694,33-1.598c0.631-0.273,1.498-0.689,2.749-1.315 c5.096-2.493,10.363-2.388,14.875,0.281c5.362,3.171,8.91,9.732,9.26,17.123c0.421,8.874-2.922,16.546-10.517,24.141 c-8.877,8.878-29.309,18.901-44.109,24.789c-14.553,5.796-25.327,18.304-28.818,33.457c-5.274,22.95-12.89,41.103-22.637,53.956 c-3.195,5.407-7.084,10.417-11.564,14.896C167.995,598.313,149.1,606.142,129,606.144c-0.002,0-0.009,0-0.012,0 C108.891,606.146,90,598.32,75.791,584.11l-53.747-53.749C7.828,516.146-0.001,497.246,0,477.144 c0.002-20.1,7.83-38.997,22.044-53.209c4.16-4.161,8.776-7.803,13.783-10.88l-0.221-0.207l6.89-3.46 c5.333-2.556,10.923-4.479,16.624-5.722l32.552-11.176c21.921-7.537,38.886-24.268,46.543-45.898 c10.112-28.591,23.34-48.16,40.437-59.823c0.269-0.183,0.788-0.584,1.522-1.144c32.149-24.478,54.388-29.959,66.105-16.292 c1.804,2.107,2.596,4.754,2.29,7.658c-1.052,9.994-16.042,22.718-32.083,34.979c-1.388,1.059-2.584,1.974-3.128,2.428 c-4.006,3.345-8.238,10.7-8.579,18.291c-0.227,5.037,1.25,9.183,4.387,12.32c2.751,2.751,6.523,4.188,11.26,4.294l248.65-241.79 c2.29-2.218,4.001-4.99,4.953-8.022l1.567-4.989c1.689-5.377,5.248-9.945,10.036-12.903l5.072-3.993l-4.282-5.928 c-1.689-2.338-1.164-5.603,1.175-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.03,5.58l15.746-12.393l-4.291-5.938 c-1.689-2.338-1.163-5.603,1.176-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.038,5.59l15.694-12.352l-4.537-6.281 c-1.689-2.338-1.163-5.603,1.174-7.292c2.341-1.688,5.603-1.164,7.292,1.175l4.285,5.932l15.731-12.381l-4.617-6.392 c-1.689-2.338-1.163-5.603,1.175-7.292c2.336-1.688,5.604-1.164,7.291,1.175l4.365,6.042l3.901-3.071 c4.473-3.697,9.771-5.69,15.229-5.69c1.901,0,3.811,0.243,5.678,0.721C605.559,9.141,612.019,17.569,612,28.05z M232.584,425.755 c-3.58-3.579-5.728-7.824-6.46-12.52l-10.534,10.761l-35.482-35.484l31.146-30.286c-3.623-1.229-6.818-3.179-9.47-5.83 c-5.224-5.225-7.795-12.2-7.437-20.176c0.434-9.666,5.385-20.051,12.319-25.84c0.717-0.598,1.875-1.484,3.479-2.71 c25.482-19.476,28-25.982,28.049-27.717c-7.257-8.062-26.069-1.524-51.688,17.983c-0.949,0.722-1.622,1.229-1.966,1.463 c-14.985,10.222-27.258,28.619-36.475,54.677c-8.727,24.653-28.043,43.714-52.997,52.295l-33.452,11.444 c-4.695,1.003-9.311,2.543-13.734,4.584l-0.949,0.464c-6.522,3.174-12.411,7.365-17.502,12.457 c-12.241,12.241-18.983,28.516-18.984,45.825c0,17.311,6.741,33.587,18.983,45.827l53.746,53.749 c12.237,12.235,28.507,18.975,45.814,18.975c0.002,0,0.005,0,0.008,0c17.311-0.003,33.583-6.744,45.825-18.985 c3.931-3.932,7.334-8.334,10.112-13.087l0.383-0.654l0.247-0.232c10.947-14.521,17.276-35.087,20.666-49.834 c4.259-18.495,17.394-33.754,35.133-40.82c17.713-7.046,34.404-16.284,40.587-22.47c5.514-5.514,7.748-10.376,7.47-16.261 c-0.184-3.858-1.81-7.244-4.145-8.626c-1.443-0.854-3.054-0.825-4.924,0.092c-1.427,0.713-2.408,1.182-3.143,1.499 C269.796,429.699,246.946,440.118,232.584,425.755z M601.555,28.029c0.008-4.412-2.249-9.707-8.604-11.333 c-4.044-1.037-8.133-0.014-11.761,2.981l-89.609,70.528l-0.29,0.172c-2.738,1.635-4.773,4.208-5.728,7.25l-1.568,4.989 c-1.473,4.685-4.116,8.967-7.643,12.386L194.982,388.615l20.528,20.528L491.93,126.8l8.04-8.041 c6.064-6.062,14.125-9.401,22.698-9.401c4.722,0,9.467,1.062,13.718,3.071c2.269,1.073,5.009,0.353,6.253-1.631l33.949-60.188 c2.735-4.85,7.401-8.411,12.8-9.772l2.911-0.734C599.117,38.388,601.545,32.526,601.555,28.029z M151.096,503.437l-34.667-34.667 l19.904-19.904L171,483.532L151.096,503.437z M151.095,488.664l5.131-5.132l-19.894-19.895l-5.131,5.132L151.095,488.664z M157.836,465.242l-34.667-34.667l19.904-19.904l34.667,34.668L157.836,465.242z M157.835,450.47l5.131-5.131l-19.894-19.896 l-5.131,5.132L157.835,450.47z M184.433,545.078c0.914,8.087-4.922,15.412-13.01,16.329c-0.555,0.063-1.116,0.094-1.671,0.094 c0,0,0,0-0.001,0c-7.511-0.001-13.813-5.636-14.657-13.105c-0.442-3.917,0.666-7.774,3.124-10.858 c2.457-3.084,5.968-5.026,9.887-5.469c0.553-0.063,1.115-0.095,1.67-0.095C177.285,531.974,183.586,537.608,184.433,545.078z M174.054,546.252c-0.247-2.185-2.086-3.832-4.279-3.832c-0.165,0-0.329,0.008-0.497,0.027c-1.146,0.129-2.173,0.697-2.891,1.6 c-0.719,0.901-1.043,2.03-0.913,3.175c0.247,2.186,2.085,3.834,4.277,3.834c0,0,0,0,0.001,0c0.163,0,0.329-0.008,0.495-0.027 C172.614,550.761,174.322,548.617,174.054,546.252z M160.042,571.396c0.914,8.089-4.922,15.414-13.011,16.329 c-0.554,0.063-1.115,0.094-1.67,0.094c0,0,0,0-0.001,0c-7.511,0-13.813-5.634-14.656-13.104c-0.442-3.917,0.666-7.774,3.123-10.858 c2.458-3.084,5.969-5.027,9.887-5.47c0.554-0.063,1.115-0.094,1.67-0.094C152.893,558.293,159.194,563.926,160.042,571.396z M149.661,572.569c-0.247-2.185-2.086-3.832-4.278-3.832c-0.165,0-0.329,0.008-0.498,0.027c-1.145,0.129-2.173,0.697-2.891,1.6 c-0.719,0.902-1.043,2.03-0.913,3.175c0.247,2.187,2.085,3.834,4.277,3.834c0.165,0,0.331-0.008,0.498-0.027 C148.223,577.078,149.929,574.937,149.661,572.569z"></path> 
                                        </g>
                                        {!showChords && <line x1="0" y1="306" x2="612" y2="306" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />}
                                    </svg>
                                </button>
                        </div>
                    </div>
                </section>

                <section className="flex flex-1 flex-col overflow-hidden rounded border-2 border-black bg-white dark:border-white dark:bg-black mb-2">
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
                        className="flex-1 overflow-y-auto scrollbar-hide overscroll-contain"
                    >
                        <div className="flex flex-col w-full font-sans pb-[50vh] border-2 border-transparent" style={{ fontSize: `${28 * fontScale}px` }}>
                            {lines.length === 0 ?
                                <div className="p-3 text-sm opacity-80">
                                    Завантаження контенту...
                                </div>
                            :   null}

                            {lines.map((line, idx) => (
                                <LineBlock key={idx} line={line} transposeDelta={transposeDelta} fontScale={fontScale} showChords={showChords} />
                            ))}
                        </div>
                    </div>
                </section>




                {showQr && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-sm rounded-xl border-2 border-black bg-white p-6 shadow-xl flex flex-col dark:border-white dark:bg-black">
                            <div className="mb-4 flex flex-shrink-0 items-center justify-between">
                                <h2 className="text-xl font-black text-black dark:text-white">QR Код кімнати</h2>
                                <button 
                                    onClick={() => setShowQr(false)}
                                    className="text-2xl font-black leading-none opacity-50 hover:opacity-100"
                                >
                                    ×
                                </button>
                            </div>

                            {qrLoading ? (
                                <div className="py-8 text-center font-bold opacity-70">Генерація QR...</div>
                            ) : qrDataUrl ? (
                                <div className="flex flex-col items-center gap-4 text-center">
                                    <img
                                        src={qrDataUrl}
                                        alt="QR code"
                                        className="h-[240px] w-[240px] border-4 border-black bg-white dark:border-white rounded-xl"
                                    />
                                    <div className="font-black text-lg break-all">
                                        {qrUrl || ''}
                                    </div>
                                    <div className="opacity-80 font-bold">
                                        Відскануйте цей QR-код на своєму телефоні, щоб приєднатися до кімнати.
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
                {proposal && isLeader && (
                    <div className="fixed top-0 left-0 right-0 z-[60] flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-4 border-blue-500 bg-blue-100 px-3 py-2 shadow-lg dark:border-blue-400 dark:bg-blue-900">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="shrink-0 rounded bg-blue-500 px-2 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-white dark:bg-blue-300 dark:text-blue-900">
                                Пропозиція
                            </div>
                            <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                                <span className="truncate text-base sm:text-xl font-black leading-tight text-black dark:text-white">
                                    {proposal.songTitle}
                                </span>
                                <span className="truncate text-[10px] sm:text-sm font-bold text-black/70 dark:text-white/70">
                                    {proposal.artist}
                                </span>
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-2 w-full sm:w-auto">
                            <button
                                onClick={() => { selectSong(proposal.songId); clearProposal(); }}
                                className="flex-1 sm:flex-none rounded-lg border-2 border-blue-700 bg-blue-600 px-4 py-2 text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] hover:bg-blue-700 dark:border-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
                            >
                                Увімкнути
                            </button>
                            <button
                                onClick={() => clearProposal()}
                                className="flex-1 sm:flex-none rounded-lg border-2 border-blue-700 bg-transparent px-4 py-2 text-sm font-black text-blue-800 transition active:translate-x-[1px] active:translate-y-[1px] hover:bg-blue-200 dark:border-blue-300 dark:text-blue-200 dark:hover:bg-blue-800/50"
                            >
                                Сховати
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
