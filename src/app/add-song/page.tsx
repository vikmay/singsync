'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { parseRawSong } from '@/lib/chordParser';
import VisualChordEditor from '@/components/VisualChordEditor';

type ApiResponse = { ok?: boolean; error?: string };

export default function AddSongPage() {
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [rawLines, setRawLines] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVisualMode, setIsVisualMode] = useState(true);

    const [activeTab, setActiveTab] = useState<'link' | 'manual'>('link');
    const [linkUrl, setLinkUrl] = useState('');
    const [parsingLink, setParsingLink] = useState(false);

    async function parseLink() {
        if (!linkUrl.trim()) return;
        setParsingLink(true);
        setError(null);
        try {
            const res = await fetch('/api/parse-link', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-password': localStorage.getItem('admin_pwd') || ''
                },
                body: JSON.stringify({ url: linkUrl.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to parse link');

            setTitle(data.title || '');
            setArtist(data.artist || '');
            setRawLines(data.rawLines || '');
            
            // Switch to manual tab to show the result
            setActiveTab('manual');
        } catch (e) {
            setError('Помилка парсингу: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setParsingLink(false);
        }
    }

    async function submit() {
        alert("Починаю збереження...");
        setError(null);
        setLoading(true);

        try {
            const parsedLines = parseRawSong(rawLines);
            
            const res = await fetch('/api/songs', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-password': localStorage.getItem('admin_pwd') || ''
                },
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

                <div className="mb-6 flex overflow-hidden rounded-lg border-2 border-black dark:border-white">
                    <button
                        type="button"
                        onClick={() => setActiveTab('link')}
                        className={`flex-1 px-4 py-2 text-sm font-black transition ${
                            activeTab === 'link'
                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                : 'bg-white text-black hover:bg-black/5 dark:bg-black dark:text-white dark:hover:bg-white/10'
                        }`}
                    >
                        За посиланням
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('manual')}
                        className={`flex-1 border-l-2 border-black px-4 py-2 text-sm font-black transition dark:border-white ${
                            activeTab === 'manual'
                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                : 'bg-white text-black hover:bg-black/5 dark:bg-black dark:text-white dark:hover:bg-white/10'
                        }`}
                    >
                        Вручну / Редагування
                    </button>
                </div>

                {activeTab === 'link' && (
                    <div className="space-y-4 mb-6 rounded-lg border-2 border-dashed border-black/30 p-4 dark:border-white/30">
                        <label className="block">
                            <div className="mb-1 text-sm font-bold">Посилання на пісню з акордами</div>
                            <input
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                className="w-full rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                                placeholder="https://pisennyk.com.ua/..."
                            />
                        </label>
                        <button
                            type="button"
                            onClick={parseLink}
                            disabled={parsingLink || !linkUrl.trim()}
                            className="w-full rounded border-2 border-black bg-black px-3 py-3 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                        >
                            {parsingLink ? 'Завантажую та паршу...' : 'Завантажити текст'}
                        </button>
                        <div className="text-xs opacity-70 mt-2 text-center">
                            Підтримує більшість сайтів (Pisennyk, Chords.com.ua, Pisni.org.ua, Amdm тощо).
                        </div>
                    </div>
                )}

                <div className={`space-y-3 ${activeTab !== 'manual' ? 'opacity-50 pointer-events-none' : ''}`}>
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

                    <div className="block">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-bold">Текст пісні</span>
                            <button
                                type="button"
                                onClick={() => setIsVisualMode(!isVisualMode)}
                                className="text-xs font-bold underline text-blue-600 dark:text-blue-400"
                            >
                                Перемкнути на {isVisualMode ? 'Текстовий режим' : 'Візуальний редактор'}
                            </button>
                        </div>
                        
                        {isVisualMode ? (
                            <VisualChordEditor 
                                rawLines={rawLines}
                                onChange={setRawLines}
                            />
                        ) : (
                            <textarea
                                value={rawLines}
                                onChange={(e) => setRawLines(e.target.value)}
                                className="min-h-[280px] w-full resize-y rounded border-2 border-black bg-white px-3 py-2 text-base text-black outline-none font-mono whitespace-pre dark:border-white dark:bg-black dark:text-white"
                                placeholder={`Am\nHello darkness\nF\nmy old friend\n`}
                            />
                        )}
                    </div>

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
