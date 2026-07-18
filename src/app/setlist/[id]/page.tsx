'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/lib/toast';
import { showConfirm } from '@/lib/dialog';

type SongListItem = {
    id: number;
    title: string;
    artist: string;
};

type SetlistItem = {
    item_id: number;
    song_id: number;
    order_index: number;
    title: string;
    artist: string;
};

export default function SetlistEditorPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = params?.id;
    const isNew = id === 'new';

    const [title, setTitle] = useState('');
    const [items, setItems] = useState<SetlistItem[]>([]);
    const playlistRef = useRef<HTMLDivElement>(null);
    
    const [query, setQuery] = useState('');
    const [allSongs, setAllSongs] = useState<SongListItem[]>([]);
    const [loadingSongs, setLoadingSongs] = useState(false);

    useEffect(() => {
        if (!isNew && id) {
            fetch(`/api/setlist/${id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.setlist) {
                        setTitle(data.setlist.title);
                        setItems(data.setlist.items || []);
                    }
                })
                .catch(e => showToast('Помилка завантаження плейлиста'));
        }
    }, [id, isNew]);

    const trimmedQuery = useMemo(() => query.trim(), [query]);

    useEffect(() => {
        let cancelled = false;
        async function loadSongs() {
            setLoadingSongs(true);
            try {
                const qs = trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : '';
                const res = await fetch(`/api/songs${qs}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setAllSongs(data.songs);
            } catch (e) {
                // ignore
            } finally {
                if (!cancelled) setLoadingSongs(false);
            }
        }
        loadSongs();
        return () => { cancelled = true; };
    }, [trimmedQuery]);

    async function handleSave() {
        if (!title.trim()) {
            showToast('Введіть назву плейлиста!');
            return;
        }

        const adminPassword = localStorage.getItem('admin_pwd') || '';
        const payload = {
            title: title.trim(),
            items: items.map(i => i.song_id)
        };

        try {
            const url = isNew ? '/api/setlists' : `/api/setlist/${id}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast('Плейлист збережено!');
                router.push('/');
            } else {
                const data = await res.json().catch(() => ({}));
                showToast(data.error || 'Помилка збереження');
            }
        } catch (e) {
            showToast('Помилка з\'єднання');
        }
    }

    async function handleDelete() {
        if (!id || isNew) return;
        if (!(await showConfirm('Дійсно видалити цей плейлист?'))) return;

        const adminPassword = localStorage.getItem('admin_pwd') || '';
        try {
            const res = await fetch(`/api/setlist/${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-password': adminPassword }
            });
            if (res.ok) {
                showToast('Плейлист видалено!');
                router.push('/');
            } else {
                showToast('Помилка видалення');
            }
        } catch (e) {
            showToast('Помилка з\'єднання');
        }
    }

    function addSong(song: SongListItem) {
        if (items.some(item => item.song_id === song.id)) {
            showToast('Ця пісня вже є у плейлисті!');
            return;
        }
        setItems(prev => [
            ...prev,
            {
                item_id: Math.random(), // temp id
                song_id: song.id,
                order_index: prev.length,
                title: song.title,
                artist: song.artist
            }
        ]);
        setTimeout(() => {
            if (playlistRef.current) {
                playlistRef.current.scrollTo({
                    top: playlistRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }

    function removeSong(index: number) {
        setItems(prev => prev.filter((_, i) => i !== index));
    }

    function moveSong(index: number, direction: -1 | 1) {
        if (index + direction < 0 || index + direction >= items.length) return;
        setItems(prev => {
            const newItems = [...prev];
            const temp = newItems[index];
            newItems[index] = newItems[index + direction];
            newItems[index + direction] = temp;
            return newItems;
        });
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto w-full max-w-3xl p-4 pb-32">
                <section className="space-y-4">
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-sm font-bold mb-1">Назва Плейлиста</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Наприклад: Концерт 24.08"
                                className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base font-bold text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                            />
                        </div>
                        <Link
                            href="/"
                            className="flex h-[44px] items-center justify-center rounded border-2 border-black bg-white px-4 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white shrink-0"
                        >
                            ✕ Назад
                        </Link>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 border-t-2 border-black/20 dark:border-white/20 pt-4">
                        <div className="flex-1 flex flex-col min-h-0 max-h-[60vh]">
                            {items.length === 0 && (
                                <div className="rounded border-2 border-dashed border-black/30 dark:border-white/30 p-4 text-center text-sm opacity-60">
                                    Плейлист порожній.
                                </div>
                            )}

                            <div ref={playlistRef} className="space-y-3 overflow-y-auto pr-2 pb-2">
                                {items.map((item, index) => (
                                    <article key={item.item_id + '-' + index} className="rounded border-2 border-black bg-white dark:border-white dark:bg-black overflow-hidden transition-all">
                                        <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3">
                                            <div className="min-w-0 flex-1">
                                                <h2 className="truncate text-lg sm:text-xl font-black leading-tight">
                                                    {item.title}
                                                </h2>
                                                <p className="truncate text-xs sm:text-sm opacity-80">
                                                    {item.artist}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => moveSong(index, -1)} disabled={index === 0} className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white w-10 h-10 text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white disabled:opacity-30">⬆️</button>
                                                <button onClick={() => moveSong(index, 1)} disabled={index === items.length - 1} className="shrink-0 flex items-center justify-center rounded border-2 border-black bg-white w-10 h-10 text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white disabled:opacity-30">⬇️</button>
                                                <button onClick={() => removeSong(index)} className="shrink-0 flex items-center justify-center rounded border-2 border-red-500 bg-red-50 w-10 h-10 text-red-600 font-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-red-400 dark:bg-red-950 dark:text-red-100">✕</button>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col min-h-0 max-h-[60vh] border-t-2 md:border-t-0 md:border-l-2 border-black/20 dark:border-white/20 md:pl-6 pt-4 md:pt-0">
                            <label className="block text-sm font-bold mb-1">Пошук пісень</label>
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="🔍 Пошук..."
                                className="w-full mb-2 shrink-0 rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                            />
                            
                            <div className="space-y-3 overflow-y-auto pr-2 pb-2">
                                {allSongs.map(song => {
                                    const isAdded = items.some(item => item.song_id === song.id);
                                    return (
                                        <article key={song.id} className={`rounded border-2 transition-all ${isAdded ? 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 opacity-70' : 'border-black bg-white dark:border-white dark:bg-black overflow-hidden'}`}>
                                            <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3">
                                                <div className="min-w-0 flex-1">
                                                    <h2 className="truncate text-lg sm:text-xl font-black leading-tight">
                                                        {song.title}
                                                    </h2>
                                                    <p className="truncate text-xs sm:text-sm opacity-80">
                                                        {song.artist}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <button
                                                        onClick={() => !isAdded && addSong(song)}
                                                        disabled={isAdded}
                                                        className={`shrink-0 flex items-center justify-center rounded border-2 w-10 h-10 transition ${
                                                            isAdded 
                                                                ? 'border-gray-400 bg-gray-200 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 cursor-not-allowed'
                                                                : 'border-green-600 bg-green-50 text-green-900 active:translate-x-[1px] active:translate-y-[1px] dark:border-green-400 dark:bg-green-950 dark:text-green-100 hover:bg-green-100 dark:hover:bg-green-900'
                                                        }`}
                                                        title={isAdded ? "Вже додано" : "Додати пісню"}
                                                    >
                                                        {isAdded ? (
                                                            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                        ) : (
                                                            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                                <line x1="5" y1="12" x2="19" y2="12" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="fixed bottom-0 left-0 w-full p-3 bg-white dark:bg-black border-t-2 border-black/20 dark:border-white/20 z-50">
                <div className="max-w-3xl mx-auto flex gap-3">
                    <button
                        onClick={handleSave}
                        className="flex-1 rounded border-2 border-black bg-black px-4 py-2 text-base font-bold text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black shadow-[3px_3px_0_0_#000] dark:shadow-[3px_3px_0_0_#fff]"
                    >
                        💾 Зберегти
                    </button>
                    
                    {!isNew && (
                        <button
                            onClick={handleDelete}
                            className="px-4 py-2 rounded border-2 border-red-500 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-950 transition"
                        >
                            Видалити
                        </button>
                    )}
                </div>
            </div>
        </main>
    );
}
