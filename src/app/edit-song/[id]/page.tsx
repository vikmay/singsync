'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseRawSong } from '@/lib/chordParser';
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    artist,
                    lines: parsedLines,
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

    if (loadingData) {
        return (
            <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white p-4">
                <div className="mx-auto max-w-xl text-center">Завантаження...</div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-xl p-4 pb-12">
                <header className="mb-4">
                    <h1 className="text-3xl font-black">Редагувати пісню</h1>
                    <p className="mt-1 text-sm opacity-80">
                        Вставте текст з акордами над словами або у форматі ChordPro (напр. <code>[Am]Привіт</code>). Ми розпізнаємо їх автоматично.
                    </p>
                </header>

                {error ?
                    <section className="mb-4 rounded border-2 border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950">
                        {error}
                    </section>
                :   null}

                <div className="space-y-3">
                    <label className="block">
                        <div className="mb-1 text-sm font-bold">Назва</div>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                            placeholder="Назва пісні"
                        />
                    </label>

                    <label className="block">
                        <div className="mb-1 text-sm font-bold">Виконавець</div>
                        <input
                            value={artist}
                            onChange={(e) => setArtist(e.target.value)}
                            className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                            placeholder="Artist"
                        />
                    </label>

                    <label className="block">
                        <div className="mb-1 text-sm font-bold">
                            Текст пісні
                        </div>
                        <textarea
                            value={rawLines}
                            onChange={(e) => setRawLines(e.target.value)}
                            className="min-h-[400px] w-full resize-y rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none font-mono whitespace-pre dark:border-white dark:bg-black dark:text-white"
                            placeholder={`Am\nHello darkness\nF\nmy old friend\n`}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={saving}
                        className="w-full rounded border-2 border-black bg-black px-3 py-3 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                    >
                        {saving ? 'Зберігаю...' : 'Зберегти зміни'}
                    </button>

                    <Link
                        href="/"
                        className="w-full block rounded border-2 border-black bg-white px-3 py-3 text-center text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                    >
                        Скасувати
                    </Link>
                </div>
            </div>
        </main>
    );
}
