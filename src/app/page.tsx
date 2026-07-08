'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/lib/toast';
import { showConfirm } from '@/lib/dialog';
import { getUserId } from '@/lib/user';

type SongListItem = {
    id: number;
    title: string;
    artist: string;
    created_at: string;
};

type ActiveRoom = {
    roomId: string;
    songId: number;
    leaderId: string;
    createdAt: string;
    songTitle: string;
    songArtist: string;
};

type ActiveRoomItemProps = {
    room: ActiveRoom;
    isAdmin: boolean;
    onDelete: (roomId: string) => void;
};

function ActiveRoomItem({ room, isAdmin, onDelete }: ActiveRoomItemProps) {
    const [offset, setOffset] = useState(0);
    const [startX, setStartX] = useState<number | null>(null);

    function onTouchStart(e: React.TouchEvent) {
        if (!isAdmin) return;
        setStartX(e.touches[0].clientX);
    }

    function onTouchMove(e: React.TouchEvent) {
        if (!isAdmin || startX === null) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0) {
            setOffset(Math.max(-80, diff));
        } else if (offset < 0) {
            setOffset(Math.min(0, offset + diff));
        }
    }

    function onTouchEnd() {
        if (!isAdmin) return;
        setStartX(null);
        if (offset < -40) {
            setOffset(-80);
        } else {
            setOffset(0);
        }
    }

    return (
        <div className="relative overflow-hidden rounded">
            <div className="absolute right-0 top-0 bottom-0 flex w-20 items-center justify-center bg-red-500">
                <button
                    onClick={async () => {
                        if (await showConfirm(`Ви впевнені, що хочете видалити вечірку ${room.roomId}?`)) {
                            onDelete(room.roomId);
                        } else {
                            setOffset(0);
                        }
                    }}
                    className="h-full w-full text-white font-bold"
                >
                    Видалити
                </button>
            </div>
            <div
                className="relative bg-white dark:bg-black transition-transform"
                style={{ transform: `translateX(${offset}px)` }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <Link
                    href={`/room/${room.roomId}`}
                    className="flex items-center gap-2 rounded border-2 border-green-600 bg-green-50 px-3 py-2 text-sm text-green-900 transition active:translate-x-[1px] active:translate-y-[1px] hover:bg-green-100 dark:border-green-400 dark:bg-green-950 dark:text-green-100 dark:hover:bg-green-900 shadow-[3px_3px_0px_#16a34a] dark:shadow-[3px_3px_0px_#4ade80] flex-1"
                >
                    <span className="font-bold text-lg">Вечірка №</span>
                    <span className="text-xl leading-none font-black text-red-600 dark:text-red-400">{room.roomId}</span>
                </Link>
            </div>
            {isAdmin && offset === 0 && (
                 <button
                 onClick={async () => {
                     if (await showConfirm(`Ви впевнені, що хочете видалити вечірку ${room.roomId}?`)) {
                         onDelete(room.roomId);
                     }
                 }}
                 className="absolute right-[-4px] top-[-4px] hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white font-bold text-xs opacity-0 hover:opacity-100 transition-opacity z-10"
                 title="Видалити вечірку"
             >
                 ✕
             </button>
            )}
        </div>
    );
}




export default function Home() {
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [songs, setSongs] = useState<SongListItem[]>([]);
    const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [fullscreenSupported, setFullscreenSupported] = useState(true);
    const [lastRoomId, setLastRoomId] = useState<string | null>(null);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setFullscreen(!!document.fullscreenElement);
        };
        handleFullscreenChange(); // Initialize
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        
        setFullscreenSupported(!!(document.documentElement as any).requestFullscreen || !!(document.documentElement as any).webkitRequestFullscreen);
        
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const [socket, setSocket] = useState<Socket | null>(null);
    const [leaderRequestCountdown, setLeaderRequestCountdown] = useState(0);
    const leaderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);

    async function handleExport() {
        try {
            const adminPassword = localStorage.getItem('admin_pwd') || '';
            const res = await fetch('/api/songs/export', {
                headers: { 'x-admin-password': adminPassword }
            });
            if (!res.ok) throw new Error('Помилка експорту');
            const data = await res.json();
            
            const blob = new Blob([JSON.stringify(data.songs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `singsync-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Невідома помилка');
        }
    }

    async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setImporting(true);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            
            const songsToImport = Array.isArray(parsed) ? parsed : parsed.songs;
            if (!songsToImport || !Array.isArray(songsToImport)) {
                throw new Error('Неправильний формат файлу. Очікувався масив пісень.');
            }

            const adminPassword = localStorage.getItem('admin_pwd') || '';
            const res = await fetch('/api/songs/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify({ songs: songsToImport })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Помилка імпорту');
            }

            const data = await res.json();
            showToast(`Успішно імпортовано: ${data.imported}. Пропущено існуючих: ${data.skipped}.`);
            
            // Reload songs
            const qs = trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : '';
            const songsRes = await fetch(`/api/songs${qs}`);
            if (songsRes.ok) {
                const songsData = await songsRes.json();
                setSongs(songsData.songs);
            }

        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Невідома помилка');
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    useEffect(() => {
        if (leaderRequestCountdown <= 0 && leaderIntervalRef.current) {
            clearInterval(leaderIntervalRef.current);
            leaderIntervalRef.current = null;
        }
    }, [leaderRequestCountdown]);

    useEffect(() => {
        if (!lastRoomId) return;
        
        const s = io(window.location.origin, {
            autoConnect: true,
            reconnection: true,
        });
        setSocket(s);

        const onConnect = () => {
            s.emit('room_join', { roomId: lastRoomId, userId: getUserId() });
        };

        s.on('connect', onConnect);
        if (s.connected) onConnect();

        s.on('leader_request', () => {
            // We can't perfectly know if we are still the leader unless we check ActiveRooms, 
            // but the server only sends leader_request if a request is made. 
            // We just assume we are the leader if we receive this, or the server will ignore our leader_keep anyway.
            setLeaderRequestCountdown(10);
            if (leaderIntervalRef.current) clearInterval(leaderIntervalRef.current);
            leaderIntervalRef.current = setInterval(() => {
                setLeaderRequestCountdown((c) => {
                    if (c <= 1) return 0;
                    return c - 1;
                });
            }, 1000);
        });

        s.on('leader_change', () => {
            setLeaderRequestCountdown(0);
        });

        return () => {
            s.disconnect();
            if (leaderIntervalRef.current) clearInterval(leaderIntervalRef.current);
        };
    }, [lastRoomId]);

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setFullscreen(true);
            } else {
                await document.exitFullscreen();
                setFullscreen(false);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const [expandedSongId, setExpandedSongId] = useState<number | null>(null);
    const [previewCache, setPreviewCache] = useState<Record<number, string[]>>({});



    useEffect(() => {
        if (localStorage.getItem('admin_pwd')) {
            setIsAdmin(true);
        }
        const savedRoom = localStorage.getItem('last_room_id');
        if (savedRoom) {
            setLastRoomId(savedRoom);
        }
    }, []);

    const trimmedQuery = useMemo(() => query.trim(), [query]);

    function fetchActiveRooms() {
        fetch(`/api/rooms/active?limit=5`)
            .then((res) => res.json())
            .then((data) => setActiveRooms(data.rooms || []))
            .catch(() => {});
    }

    useEffect(() => {
        let cancelled = false;

        async function loadRooms() {
            try {
                const res = await fetch(`/api/rooms/active?limit=5`);
                if (!res.ok) return;
                const data = (await res.json()) as { rooms: ActiveRoom[] };
                if (!cancelled) setActiveRooms(data.rooms);
            } catch (e) {
                // Ignore errors for active rooms
            }
        }
        
        loadRooms();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadSongs() {
            setLoading(true);
            setError(null);

            try {
                const qs =
                    trimmedQuery ?
                        `?q=${encodeURIComponent(trimmedQuery)}`
                    :   '';
                const res = await fetch(`/api/songs${qs}`, { method: 'GET' });
                if (!res.ok) throw new Error('Failed to load songs');
                const data = (await res.json()) as { songs: SongListItem[] };

                if (!cancelled) setSongs(data.songs);
            } catch (e) {
                if (!cancelled)
                    setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadSongs();
        return () => {
            cancelled = true;
        };
    }, [trimmedQuery]);

    async function createRoomForSong(songId: number) {
        setError(null);

        try {
            const leaderId = getUserId();

            const res = await fetch(`/api/room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId,
                    leaderId,
                }),
            });

            if (!res.ok) throw new Error('Failed to create room');
            const data = (await res.json()) as { ok: boolean; roomId: string };

            if (!data.roomId) throw new Error('Room id missing');
            router.push(`/room/${data.roomId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        }
    }

    async function deleteRoom(roomId: string) {
        try {
            const adminPassword = localStorage.getItem('admin_pwd') || '';
            const res = await fetch(`/api/room/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'x-admin-password': adminPassword,
                },
            });
            if (res.ok) {
                fetchActiveRooms();
            } else {
                const data = await res.json();
                showToast(`Помилка видалення: ${data.error || 'Unknown'}`);
            }
        } catch (e) {
            showToast('Помилка з\'єднання');
        }
    }

    async function proposeSongToRoom(roomId: string, song: SongListItem) {
        try {
            const userId = getUserId();
            const res = await fetch(`/api/room/${roomId}/propose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    songId: song.id,
                    songTitle: song.title,
                    artist: song.artist,
                    userId: userId,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.changed) {
                    showToast('Пісню змінено!');
                    router.push(`/room/${roomId}`);
                } else {
                    showToast('Пісню запропоновано на вечірку ' + roomId);
                }
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || 'Помилка при пропонуванні');
            }
        } catch (e) {
            showToast('Помилка з\'єднання');
        }
    }

    function handleProposeClick(song: SongListItem) {
        if (lastRoomId) {
            proposeSongToRoom(lastRoomId, song);
        } else {
            showToast('Спочатку приєднайтеся до вечірки!');
        }
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-xl p-4 pb-12">
                <header className="mb-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-3xl font-black tracking-tight shrink-0">
                            SingSync
                        </h1>

                        <div className="flex-grow max-w-[200px]">
                            <input
                                type="number"
                                placeholder="Код (4 цифри)"
                                className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base font-black tracking-widest text-center text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                                onChange={(e) => {
                                    if (e.target.value.length === 4) {
                                        router.push(`/room/${e.target.value}`);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value;
                                        if (val) router.push(`/room/${val}`);
                                    }
                                }}
                            />
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
                    </div>

                    <div className={`grid gap-2 w-full ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                            type="button"
                            onClick={() => {
                                if (songs.length === 0) {
                                    showToast('Додайте хоча б одну пісню!');
                                    return;
                                }
                                createRoomForSong(songs[0].id);
                            }}
                            className="flex items-center justify-center rounded border-2 border-black bg-black px-3 py-2 text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black text-center"
                            title="Створити вечірку та стати ведучим"
                        >
                            Створити вечірку
                        </button>

                        {isAdmin && (
                            <>
                                <Link
                                    href="/add-song"
                                    className="flex items-center justify-center rounded border-2 border-black bg-white px-3 py-2 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white text-center"
                                    title="Додати пісню"
                                >
                                    Додати пісню
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                    className="flex items-center justify-center rounded border-2 border-green-600 bg-green-50 px-3 py-2 text-sm font-black text-green-900 transition active:translate-x-[1px] active:translate-y-[1px] dark:border-green-400 dark:bg-green-950 dark:text-green-100 text-center disabled:opacity-50"
                                    title="Імпортувати базу"
                                >
                                    {importing ? "⏳..." : "📥 Імпорт"}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleExport}
                                    className="flex items-center justify-center rounded border-2 border-blue-600 bg-blue-50 px-3 py-2 text-sm font-black text-blue-900 transition active:translate-x-[1px] active:translate-y-[1px] dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100 text-center"
                                    title="Експортувати базу"
                                >
                                    📤 Експорт
                                </button>
                                
                                <input 
                                    type="file" 
                                    accept=".json" 
                                    ref={fileInputRef} 
                                    style={{ display: 'none' }} 
                                    onChange={handleImport} 
                                />
                            </>
                        )}
                    </div>
                </header>

                <div className="sticky top-0 z-50 mb-6 py-2 -mt-2 bg-white dark:bg-black space-y-4 shadow-[0_10px_10px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_10px_-10px_rgba(255,255,255,0.05)]">
                    {lastRoomId && (
                        <Link
                            href={`/room/${lastRoomId}`}
                            className="block w-full rounded-xl border-4 border-purple-500 bg-purple-100 p-4 text-center text-lg font-black text-purple-900 shadow-lg transition active:translate-x-[2px] active:translate-y-[2px] dark:border-purple-400 dark:bg-purple-900 dark:text-purple-100"
                        >
                            🎤 Повернутися на вечірку {lastRoomId}
                        </Link>
                    )}

                    <section>
                        <div className="relative">
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="🔍 Пошук пісні або виконавця..."
                                className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base font-bold text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                            />
                        </div>
                    </section>
                </div>

                {error ?
                    <section className="mb-4 rounded border-2 border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950">
                        {error}
                    </section>
                :   null}

                <section aria-busy={loading} className="space-y-3">
                    {loading ?
                        <div className="rounded border-2 border-black p-3 dark:border-white">
                            Завантаження...
                        </div>
                    :   null}

                    {!loading && songs.length === 0 ?
                        <div className="rounded border-2 border-dashed border-black p-3 text-sm opacity-80 dark:border-white">
                            Нічого не знайдено.
                        </div>
                    :   null}

                    {songs.map((song) => (
                        <article
                            key={song.id}
                            className="rounded border-2 border-black bg-white dark:border-white dark:bg-black overflow-hidden transition-all"
                        >
                            <div 
                                className="flex items-center justify-between gap-2 p-2.5 sm:p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition"
                                onClick={() => {
                                    if (expandedSongId === song.id) {
                                        setExpandedSongId(null);
                                    } else {
                                        setExpandedSongId(song.id);
                                        if (!previewCache[song.id]) {
                                            fetch(`/api/song/${song.id}`)
                                                .then(res => res.json())
                                                .then(data => {
                                                    const lines = data.song?.parsedContent?.lines || [];
                                                    const previewText = lines
                                                        .map((l: any) => l.text)
                                                        .filter((t: string) => t.trim().length > 0)
                                                        .slice(0, 5);
                                                    if (previewText.length === 0) previewText.push('Немає тексту');
                                                    setPreviewCache(prev => ({ ...prev, [song.id]: previewText }));
                                                })
                                                .catch(() => {});
                                        }
                                    }
                                }}
                            >
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate text-lg sm:text-xl font-black leading-tight">
                                        {song.title}
                                    </h2>
                                    <p className="truncate text-xs sm:text-sm opacity-80">
                                        {song.artist}
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    {lastRoomId && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleProposeClick(song); }}
                                            className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white w-10 h-10 text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                            title="Запропонувати пісню на поточну вечірку"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="18" cy="5" r="3"></circle>
                                                <circle cx="6" cy="12" r="3"></circle>
                                                <circle cx="18" cy="19" r="3"></circle>
                                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                            </svg>
                                        </button>
                                    )}

                                    {isAdmin && (
                                    <Link
                                        href={`/edit-song/${song.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white w-10 h-10 text-base font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                        title="Редагувати пісню"
                                    >
                                        ✎
                                    </Link>
                                )}
                                </div>
                            </div>
                            
                            {expandedSongId === song.id && (
                                <div className="border-t-2 border-black/10 dark:border-white/10 p-3 bg-black/5 dark:bg-white/5 text-sm font-medium italic opacity-80">
                                    {previewCache[song.id] ? (
                                        <div className="whitespace-pre-wrap leading-tight">
                                            {previewCache[song.id].join('\n')}
                                            <div className="mt-1 text-xs opacity-50 not-italic">...</div>
                                        </div>
                                    ) : (
                                        <div>Завантаження...</div>
                                    )}
                                </div>
                            )}
                        </article>
                    ))}
                </section>




            </div>

            {leaderRequestCountdown > 0 && lastRoomId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-sm rounded-xl border-4 border-orange-500 bg-white p-6 shadow-2xl flex flex-col text-center dark:bg-black">
                        <div className="text-6xl mb-4">👑</div>
                        <h2 className="mb-2 text-2xl font-black text-black dark:text-white">Увага!</h2>
                        <p className="mb-6 text-lg font-bold text-black dark:text-white">
                            Хтось хоче стати ведучим!<br/>
                            У вас є <span className="text-orange-500 text-2xl font-black">{leaderRequestCountdown}</span> сек, щоб втримати корону.
                        </p>
                        
                        <button 
                            onClick={() => {
                                setLeaderRequestCountdown(0);
                                if (socket && lastRoomId) {
                                    socket.emit('reject_leadership', { roomId: lastRoomId, userId: getUserId() });
                                }
                            }}
                            className="w-full rounded-xl border-4 border-orange-500 bg-orange-100 p-4 text-xl font-black text-orange-900 transition active:translate-x-[2px] active:translate-y-[2px] dark:border-orange-500 dark:bg-orange-900 dark:text-orange-100"
                        >
                            🛡️ Втримати корону
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
