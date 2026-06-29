'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserId } from '@/lib/user';

type SongListItem = {
    id: number;
    title: string;
    artist: string;
    created_at: string;
};

export default function Home() {
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [songs, setSongs] = useState<SongListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmedQuery = useMemo(() => query.trim(), [query]);

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

    async function deleteSong(songId: number, title: string) {
        if (!confirm(`Ви впевнені, що хочете видалити пісню "${title}"?`)) return;

        try {
            const res = await fetch(`/api/song/${songId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete song');
            
            // Remove from list
            setSongs(songs.filter(s => s.id !== songId));
        } catch (e) {
            alert("Помилка видалення: " + (e instanceof Error ? e.message : String(e)));
        }
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-xl p-4 pb-12">
                <header className="mb-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="mb-2 text-3xl font-black tracking-tight">
                                SingSync
                            </h1>
                            <p className="text-sm opacity-80">
                                Спільний перегляд текстів пісень з синхронним
                                скролом.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    if (songs.length === 0) {
                                        alert('Додайте хоча б одну пісню!');
                                        return;
                                    }
                                    createRoomForSong(songs[0].id);
                                }}
                                className="rounded border-2 border-black bg-black px-3 py-2 text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black"
                                title="Створити кімнату та стати ведучим"
                            >
                                Відкрити кімнату
                            </button>
                            <a
                                href="/add-song"
                                className="rounded border-2 border-black bg-white px-3 py-2 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                title="Додати пісню"
                            >
                                Додати пісню
                            </a>
                        </div>
                    </div>
                </header>

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
                            className="rounded border-2 border-black bg-white p-3 shadow-[4px_4px_0px_#000] dark:border-white dark:bg-black dark:shadow-[4px_4px_0px_#fff]"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <h2 className="truncate text-xl font-black leading-tight">
                                        {song.title}
                                    </h2>
                                    <p className="truncate text-sm opacity-80">
                                        {song.artist}
                                    </p>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                                    <Link
                                        href={`/edit-song/${song.id}`}
                                        className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white px-3 py-2 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                                        title="Редагувати пісню"
                                    >
                                        ✎
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => deleteSong(song.id, song.title)}
                                        className="shrink-0 flex items-center justify-center rounded border-2 border-red-600 bg-white px-3 py-2 text-sm font-black text-red-600 transition active:translate-x-[1px] active:translate-y-[1px] dark:border-red-400 dark:bg-black dark:text-red-400"
                                        title="Видалити пісню"
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}
                </section>

                <footer className="mt-6 text-xs opacity-70">
                    Порада: на телефоні ведучий відкриває кімнату та керує
                    скролом, інші підключаються за QR/кодом.
                </footer>
            </div>
        </main>
    );
}
