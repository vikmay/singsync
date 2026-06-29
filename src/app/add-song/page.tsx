'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { parseRawSong } from '@/lib/chordParser';

type ApiResponse = { ok?: boolean; error?: string };

export default function AddSongPage() {
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [rawLines, setRawLines] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit() {
        alert("Починаю збереження...");
        setError(null);
        setLoading(true);

        try {
            const parsedLines = parseRawSong(rawLines);
            
            const res = await fetch('/api/songs', {
                method: 'POST',
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
                throw new Error(data.error || 'Failed to add song');
            }

            alert("Пісня успішно додана! Повертаємось на головну...");
            window.location.href = '/';
        } catch (e) {
            alert("Сталась помилка: " + (e instanceof Error ? e.message : String(e)));
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-xl p-4 pb-12">
                <header className="mb-4">
                    <h1 className="text-3xl font-black">Додати пісню</h1>
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
                            className="min-h-[280px] w-full resize-y rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none font-mono whitespace-pre dark:border-white dark:bg-black dark:text-white"
                            placeholder={`Am\nHello darkness\nF\nmy old friend\n`}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={loading}
                        className="w-full rounded border-2 border-black bg-black px-3 py-3 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                    >
                        {loading ? 'Додаю...' : 'Додати'}
                    </button>

                    <Link
                        href="/"
                        className="w-full block rounded border-2 border-black bg-white px-3 py-3 text-center text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                    >
                        Назад
                    </Link>
                </div>
            </div>
        </main>
    );
}
