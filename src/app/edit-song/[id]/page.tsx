'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseRawSong } from '@/lib/chordParser';
import VisualChordEditor from '@/components/VisualChordEditor';
import type { SongContentV1, Line } from '@/types/song';

type ApiResponse = { ok?: boolean; error?: string };

type SongApiResponse = {
    song: {
        id: number;
        title: string;
        artist: string;
        parsedContent: SongContentV1 | null;
    };
};

export default function EditSongPage() {
    const params = useParams<{ id: string }>();
    const songId = params?.id;

    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [rawLines, setRawLines] = useState('');
    
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVisualMode, setIsVisualMode] = useState(true);
    const [defaultFontScale, setDefaultFontScale] = useState(1.0);

    useEffect(() => {
        if (!songId) return;

        let cancelled = false;
        async function fetchSong() {
            setLoadingData(true);
            try {
                const res = await fetch(`/api/song/${songId}`);
                if (!res.ok) throw new Error('Пісню не знайдено');
                const data = (await res.json()) as SongApiResponse;
                
                if (cancelled) return;

                setTitle(data.song.title || '');
                setArtist(data.song.artist || '');
                
                // Reconstruct raw text from JSON lines
                const lines = data.song.parsedContent?.lines || [];
                const reconstructed = lines.map((l: Line) => {
                    if (l.chords?.trim() && l.text?.trim()) {
                        return `${l.chords}\n${l.text}`;
                    } else if (l.chords?.trim()) {
                        return l.chords;
                    } else if (l.text?.trim()) {
                        return l.text;
                    }
                    return '';
                }).join('\n');
                
                setRawLines(reconstructed);
                
                if (data.song.parsedContent?.defaultFontScale !== undefined) {
                    setDefaultFontScale(data.song.parsedContent.defaultFontScale);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                if (!cancelled) setLoadingData(false);
            }
        }
        fetchSong();
        
        return () => { cancelled = true; };
    }, [songId]);

    async function submit() {
        setError(null);
        setSaving(true);

        try {
            const parsedLines = parseRawSong(rawLines);
            
            const res = await fetch(`/api/song/${songId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-password': localStorage.getItem('admin_pwd') || ''
                },
                body: JSON.stringify({
                    title,
                    artist,
                    lines: parsedLines,
                    defaultFontScale,
                }),
            });

            const data = (await res.json()) as ApiResponse;
            if (!res.ok) {
                alert("Помилка від сервера: " + data.error);
                throw new Error(data.error || 'Failed to update song');
            }

            window.location.href = '/';
        } catch (e) {
            alert("Сталась помилка: " + (e instanceof Error ? e.message : String(e)));
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSaving(false);
        }
    }

    async function deleteSong() {
        if (!confirm(`Ви впевнені, що хочете видалити пісню "${title}"?`)) return;

        try {
            const res = await fetch(`/api/song/${songId}`, {
                method: 'DELETE',
                headers: {
                    'x-admin-password': localStorage.getItem('admin_pwd') || ''
                }
            });
            if (!res.ok) throw new Error('Failed to delete song');
            
            window.location.href = '/';
        } catch (e) {
            alert("Помилка видалення: " + (e instanceof Error ? e.message : String(e)));
        }
    }

    if (loadingData) {
        return (
            <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white p-4">
                <div className="mx-auto max-w-xl text-center">Завантаження...</div>
            </main>
        );
    }

    return (
        <main className="flex h-[100dvh] flex-col overflow-hidden bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto flex h-full w-full max-w-xl flex-col p-4 pb-4">
                <header className="mb-2 shrink-0">
                    <h1 className="text-2xl font-black">Редагувати пісню</h1>
                    <p className="mt-1 text-xs opacity-80">
                        Вставте текст з акордами. Ми розпізнаємо їх автоматично.
                    </p>
                </header>

                {error ?
                    <section className="mb-4 rounded border-2 border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950">
                        {error}
                    </section>
                :   null}

                <div className="flex flex-col gap-2 shrink-0 overflow-y-auto max-h-[30vh]">
                    <label className="block">
                        <div className="mb-1 text-xs font-bold">Назва</div>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded border-2 border-black bg-white px-2 py-1 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                            placeholder="Назва пісні"
                        />
                    </label>

                    <label className="block">
                        <div className="mb-1 text-xs font-bold">Виконавець</div>
                        <input
                            value={artist}
                            onChange={(e) => setArtist(e.target.value)}
                            className="w-full rounded border-2 border-black bg-white px-2 py-1 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                            placeholder="Artist"
                        />
                    </label>

                    <div className="block">
                        <div className="mb-1 text-xs font-bold">Шрифт за замовчуванням</div>
                        <div className="flex items-center gap-2">
                            <button 
                                type="button"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-lg font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                                onClick={() => setDefaultFontScale(s => Math.max(0.5, Number((s - 0.1).toFixed(1))))}
                                title="Зменшити"
                            >
                                -
                            </button>
                            <span className="text-sm font-black min-w-[3ch] text-center">{defaultFontScale.toFixed(1)}</span>
                            <button 
                                type="button"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-lg font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                                onClick={() => setDefaultFontScale(s => Math.min(2.0, Number((s + 0.1).toFixed(1))))}
                                title="Збільшити"
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 flex-col min-h-0 overflow-hidden mt-2 mb-2 border-t-2 border-black/10 pt-2 dark:border-white/10">
                    <div className="mb-2 flex items-center justify-between shrink-0">
                        <span className="text-sm font-bold">Текст пісні</span>
                        <button
                            type="button"
                            onClick={() => setIsVisualMode(!isVisualMode)}
                            className="text-xs font-bold underline text-blue-600 dark:text-blue-400"
                        >
                            Перемкнути на {isVisualMode ? 'Редактор тексту' : 'Редактор акордів'}
                        </button>
                    </div>
                    
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {isVisualMode ? (
                            <VisualChordEditor 
                                rawLines={rawLines}
                                fontScale={defaultFontScale}
                                onChange={setRawLines}
                            />
                        ) : (
                            <textarea
                                value={rawLines}
                                onChange={(e) => setRawLines(e.target.value)}
                                className="h-full w-full resize-none rounded border-2 border-black bg-white py-3 pl-[10px] pr-2 text-black outline-none font-black leading-tight whitespace-pre-wrap break-words overflow-auto dark:border-white dark:bg-black dark:text-white"
                                placeholder={`Am\nHello darkness\nF\nmy old friend\n`}
                                style={{ fontSize: `${28 * defaultFontScale}px` }}
                            />
                        )}
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">

                    <button
                        type="button"
                        onClick={submit}
                        disabled={saving}
                        className="flex-1 rounded border-2 border-black bg-black px-2 py-2 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                    >
                        {saving ? 'Зберігаю...' : 'Зберегти'}
                    </button>

                    <Link
                        href="/"
                        className="flex-1 block rounded border-2 border-black bg-white px-2 py-2 text-center text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                    >
                        Скасувати
                    </Link>

                    <button
                        type="button"
                        onClick={deleteSong}
                        className="flex-1 block rounded border-2 border-red-600 bg-red-50 px-2 py-2 text-center text-sm font-black text-red-600 transition active:translate-x-[1px] active:translate-y-[1px] dark:border-red-400 dark:bg-red-950 dark:text-red-400"
                    >
                        Видалити
                    </button>
                </div>
            </div>
        </main>
    );
}
