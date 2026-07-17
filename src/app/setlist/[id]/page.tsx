'use client';

import { useEffect, useState, useMemo } from 'react';
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
            if (!trimmedQuery) {
                setAllSongs([]);
                return;
            }
            setLoadingSongs(true);
            try {
                const res = await fetch(`/api/songs?q=${encodeURIComponent(trimmedQuery)}`);
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
        setQuery('');
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
            <div className="mx-auto w-full max-w-3xl p-4 pb-12">
                <header className="mb-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-3xl font-black tracking-tight shrink-0">
                            {isNew ? 'Новий Плейлист' : 'Редагування Плейлиста'}
                        </h1>
                        <Link
                            href="/"
                            className="flex items-center justify-center rounded border-2 border-black bg-white px-3 py-2 text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                        >
                            ✕ Назад
                        </Link>
                    </div>
                </header>

                <section className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">Назва Плейлиста</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Наприклад: Концерт 24.08"
                            className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base font-bold text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                        />
                    </div>

                    <div className="border-t-2 border-black/20 dark:border-white/20 pt-4">
                        <h2 className="text-xl font-bold mb-3">Пісні у плейлисті ({items.length})</h2>
                        
                        {items.length === 0 && (
                            <div className="rounded border-2 border-dashed border-black/30 dark:border-white/30 p-4 text-center text-sm opacity-60">
                                Плейлист порожній. Знайдіть пісні нижче, щоб додати їх.
                            </div>
                        )}

                        <div className="space-y-2">
                            {items.map((item, index) => (
                                <div key={item.item_id + '-' + index} className="flex items-center justify-between gap-2 p-2 rounded border-2 border-black dark:border-white bg-black/5 dark:bg-white/5">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate">{item.title}</div>
                                        <div className="text-xs opacity-70 truncate">{item.artist}</div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={() => moveSong(index, -1)} disabled={index === 0} className="w-8 h-8 flex items-center justify-center rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-30">⬆️</button>
                                        <button onClick={() => moveSong(index, 1)} disabled={index === items.length - 1} className="w-8 h-8 flex items-center justify-center rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-30">⬇️</button>
                                        <button onClick={() => removeSong(index)} className="w-8 h-8 flex items-center justify-center rounded bg-red-500 text-white font-bold ml-2">✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t-2 border-black/20 dark:border-white/20 pt-4">
                        <label className="block text-sm font-bold mb-1">Додати пісню</label>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="🔍 Пошук..."
                            className="w-full mb-2 rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none transition-shadow focus:shadow-[4px_4px_0_0_#000] dark:border-white dark:bg-black dark:text-white dark:focus:shadow-[4px_4px_0_0_#fff]"
                        />
                        
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                            {allSongs.map(song => (
                                <div key={song.id} className="flex items-center justify-between gap-2 p-2 border-b border-black/10 dark:border-white/10">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">{song.title}</div>
                                        <div className="text-xs opacity-70 truncate">{song.artist}</div>
                                    </div>
                                    <button
                                        onClick={() => addSong(song)}
                                        className="shrink-0 px-3 py-1 bg-green-500 text-white font-bold rounded text-sm"
                                    >
                                        Додати
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t-2 border-black/20 dark:border-white/20 pt-6 flex gap-3">
                        <button
                            onClick={handleSave}
                            className="flex-1 rounded border-2 border-black bg-black px-4 py-3 text-lg font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-white dark:text-black shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#fff]"
                        >
                            💾 Зберегти
                        </button>
                        
                        {!isNew && (
                            <button
                                onClick={handleDelete}
                                className="px-4 py-3 rounded border-2 border-red-500 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-950 transition"
                            >
                                Видалити
                            </button>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
