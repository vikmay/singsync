'use client';

import { useEffect, useMemo, useState } from 'react';
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
                        if (await showConfirm(`Ви впевнені, що хочете видалити кімнату ${room.roomId}?`)) {
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
                    <span className="font-bold text-lg">Кімната №</span>
                    <span className="text-xl leading-none font-black text-red-600 dark:text-red-400">{room.roomId}</span>
                </Link>
            </div>
            {isAdmin && offset === 0 && (
                 <button
                 onClick={async () => {
                     if (await showConfirm(`Ви впевнені, що хочете видалити кімнату ${room.roomId}?`)) {
                         onDelete(room.roomId);
                     }
                 }}
                 className="absolute right-[-4px] top-[-4px] hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white font-bold text-xs opacity-0 hover:opacity-100 transition-opacity z-10"
                 title="Видалити кімнату"
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
    const [proposeModalSong, setProposeModalSong] = useState<SongListItem | null>(null);
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
                    showToast('Пісню запропоновано в кімнату ' + roomId);
                }
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || 'Помилка при пропонуванні');
            }
        } catch (e) {
            showToast('Помилка з\'єднання');
        } finally {
            setProposeModalSong(null);
        }
    }

    function handleProposeClick(song: SongListItem) {
        const userId = getUserId();
        const myRoom = activeRooms.find(r => r.leaderId === userId);

        if (myRoom) {
            proposeSongToRoom(myRoom.roomId, song);
        } else if (activeRooms.length === 1) {
            proposeSongToRoom(activeRooms[0].roomId, song);
        } else if (activeRooms.length > 1) {
            setProposeModalSong(song);
        }
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-xl p-4 pb-12">
                <header className="mb-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-start gap-4">
                            <div>
                                <h1 className="text-3xl font-black tracking-tight">
                                    SingSync
                                </h1>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (songs.length === 0) {
                                            showToast('Додайте хоча б одну пісню!');
                                            return;
                                        }
                                        createRoomForSong(songs[0].id);
                                    }}
                                    className="rounded border-2 border-black bg-black px-3 py-2 text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black"
                                    title="Створити вечірку та стати ведучим"
                                >
                                    Створити вечірку
                                </button>
                                {isAdmin && (
                                    <Link
                                        href="/add-song"
                                        className="rounded border-2 border-black bg-white px-3 py-2 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                        title="Додати пісню"
                                    >
                                        Додати пісню
                                    </Link>
                                )}

                            </div>
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
                </header>

                {lastRoomId && (
                    <div className="sticky top-0 z-50 mb-6 py-2 -mt-2 bg-white dark:bg-black">
                        <Link
                            href={`/room/${lastRoomId}`}
                            className="block w-full rounded-xl border-4 border-purple-500 bg-purple-100 p-4 text-center text-lg font-black text-purple-900 shadow-lg transition active:translate-x-[2px] active:translate-y-[2px] dark:border-purple-400 dark:bg-purple-900 dark:text-purple-100"
                        >
                            🎤 Повернутися на вечірку {lastRoomId}
                        </Link>
                    </div>
                )}

                <section className="mb-6">
                    <label className="mb-1 block text-sm font-bold">
                        Приєднатися за кодом
                    </label>
                    <input
                        type="number"
                        placeholder="4-значний код"
                        className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base font-black tracking-widest text-black outline-none dark:border-white dark:bg-black dark:text-white"
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
                </section>

                <section className="mb-4">
                    <label className="mb-1 block text-sm font-bold">
                        Пошук
                    </label>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Назва або виконавець..."
                        className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                    />
                </section>

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
                                    {activeRooms.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleProposeClick(song); }}
                                            className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white w-10 h-10 text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                            title="Запропонувати пісню в активну кімнату"
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

                {proposeModalSong && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-sm rounded-xl border-2 border-black bg-white p-4 shadow-xl flex flex-col dark:border-white dark:bg-black">
                            <h2 className="mb-2 text-xl font-black text-black dark:text-white">Оберіть кімнату</h2>
                            <p className="mb-4 text-sm font-bold opacity-80 text-black dark:text-white">В яку кімнату запропонувати пісню &quot;{proposeModalSong.title}&quot;?</p>
                            
                            <div className="flex flex-col gap-2 mb-4">
                                {activeRooms.map(room => (
                                    <button
                                        key={room.roomId}
                                        onClick={() => proposeSongToRoom(room.roomId, proposeModalSong)}
                                        className="w-full text-left rounded-lg border-2 border-black/20 bg-white hover:border-black p-3 transition dark:border-white/20 dark:bg-black dark:hover:border-white"
                                    >
                                        <div className="font-black text-lg text-black dark:text-white">Кімната №{room.roomId}</div>
                                        <div className="text-sm font-bold opacity-80 text-black dark:text-white">Зараз грає: {room.songTitle}</div>
                                    </button>
                                ))}
                            </div>
                            
                            <button 
                                onClick={() => setProposeModalSong(null)}
                                className="w-full rounded border-2 border-black bg-black p-3 font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black"
                            >
                                Скасувати
                            </button>
                        </div>
                    </div>
                )}

                <footer className="mt-6 text-xs opacity-70">
                    Порада: на телефоні ведучий відкриває кімнату та керує
                    скролом, інші підключаються за QR/кодом.
                </footer>
            </div>
        </main>
    );
}
