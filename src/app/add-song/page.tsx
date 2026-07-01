'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { parseRawSong } from '@/lib/chordParser';
import { transposeRawSong } from '@/lib/transpose';
import VisualChordEditor from '@/components/VisualChordEditor';

type ApiResponse = { ok?: boolean; error?: string };

export default function AddSongPage() {
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [rawLines, setRawLines] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVisualMode, setIsVisualMode] = useState(true);
    const [defaultFontScale, setDefaultFontScale] = useState(1.0);
    const [showChords, setShowChords] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setFullscreen(true);
            } else {
                await document.exitFullscreen();
                setFullscreen(false);
            }
        } catch {
            // ignore
        }
    }

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
                    defaultFontScale,
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
        <main className="flex h-[100dvh] flex-col overflow-hidden bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto flex h-full w-full max-w-xl flex-col p-4 pb-4">
                <header className="mb-2 shrink-0 flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black">Додати пісню</h1>
                        <p className="mt-1 text-xs opacity-80">
                            Вставте текст з акордами. Ми розпізнаємо їх автоматично.
                        </p>
                    </div>
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
                </header>

                {error ?
                    <section className="mb-2 shrink-0 rounded border-2 border-red-600 bg-red-50 p-2 text-xs dark:border-red-400 dark:bg-red-950">
                        {error}
                    </section>
                :   null}

                <div className="mb-2 flex overflow-hidden rounded-lg border-2 border-black dark:border-white shrink-0">
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
                    <div className="flex flex-col gap-2 mb-2 rounded-lg border-2 border-dashed border-black/30 p-2 dark:border-white/30 shrink-0">
                        <label className="block">
                            <div className="mb-1 text-xs font-bold">Посилання на пісню з акордами</div>
                            <input
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                className="w-full rounded border-2 border-black bg-white px-2 py-1 text-base text-black outline-none dark:border-white dark:bg-black dark:text-white"
                                placeholder="https://pisennyk.com.ua/..."
                            />
                        </label>
                        <button
                            type="button"
                            onClick={parseLink}
                            disabled={parsingLink || !linkUrl.trim()}
                            className="w-full rounded border-2 border-black bg-black px-2 py-2 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                        >
                            {parsingLink ? 'Завантажую та паршу...' : 'Завантажити текст'}
                        </button>
                        <div className="text-[10px] opacity-70 text-center">
                            Підтримує більшість сайтів (Pisennyk, Chords.com.ua, Pisni.org.ua, Amdm тощо).
                        </div>
                    </div>
                )}

                <div className={`flex flex-col gap-2 shrink-0 overflow-y-auto max-h-[25vh] transition-opacity ${activeTab !== 'manual' ? 'opacity-50 pointer-events-none' : ''}`}>
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

                    <div className="flex items-center justify-between w-full">
                        <div className="flex-1 flex flex-col items-start">
                            <div className="flex flex-col items-center">
                                <div className="mb-1 text-xs font-bold text-center">Шрифт</div>
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

                        <div className="flex-1 flex flex-col items-center">
                            <div className="mb-1 text-xs font-bold text-center">Акорди</div>
                            <button
                                type="button"
                                onClick={() => setShowChords(!showChords)}
                                className={`relative flex h-8 w-16 shrink-0 items-center justify-center transition active:translate-y-[1px] active:translate-x-[1px] mx-auto ${
                                    showChords
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : 'text-black dark:text-white opacity-50'
                                }`}
                                title={showChords ? 'Сховати акорди' : 'Показати акорди'}
                            >
                                <svg 
                                    viewBox="-61.2 -61.2 734.40 734.40" 
                                    className="absolute inset-0 h-full w-full fill-current transition-transform scale-[1.8]"
                                >
                                    <g transform="rotate(45 306 306)"> 
                                        <path d="M68.635,513.758l-16.047,16.047l-7.385-7.385l16.047-16.047L68.635,513.758z M70.965,516.073l-16.047,16.048l7.385,7.385 l16.047-16.047L70.965,516.073z M80.688,525.765L64.64,541.813l7.386,7.386l16.048-16.048L80.688,525.765z M74.366,551.555 l7.385,7.387l16.051-16.046l-7.385-7.387L74.366,551.555z M612,28.05c-0.021,10.689-6.912,19.605-17.149,22.186l-2.91,0.734 c-2.638,0.666-4.917,2.407-6.253,4.775l-34.084,60.421c-2.75,4.527-7.587,7.229-12.943,7.229c-2.336,0-4.601-0.512-6.735-1.52 c-2.865-1.354-6.066-2.069-9.255-2.069c-5.784,0-11.223,2.252-15.313,6.342l-8.001,8.001L238.443,400.651 c-3.314,7.421-2.811,13.382,1.526,17.718c6.215,6.217,17.009,5.694,33-1.598c0.631-0.273,1.498-0.689,2.749-1.315 c5.096-2.493,10.363-2.388,14.875,0.281c5.362,3.171,8.91,9.732,9.26,17.123c0.421,8.874-2.922,16.546-10.517,24.141 c-8.877,8.878-29.309,18.901-44.109,24.789c-14.553,5.796-25.327,18.304-28.818,33.457c-5.274,22.95-12.89,41.103-22.637,53.956 c-3.195,5.407-7.084,10.417-11.564,14.896C167.995,598.313,149.1,606.142,129,606.144c-0.002,0-0.009,0-0.012,0 C108.891,606.146,90,598.32,75.791,584.11l-53.747-53.749C7.828,516.146-0.001,497.246,0,477.144 c0.002-20.1,7.83-38.997,22.044-53.209c4.16-4.161,8.776-7.803,13.783-10.88l-0.221-0.207l6.89-3.46 c5.333-2.556,10.923-4.479,16.624-5.722l32.552-11.176c21.921-7.537,38.886-24.268,46.543-45.898 c10.112-28.591,23.34-48.16,40.437-59.823c0.269-0.183,0.788-0.584,1.522-1.144c32.149-24.478,54.388-29.959,66.105-16.292 c1.804,2.107,2.596,4.754,2.29,7.658c-1.052,9.994-16.042,22.718-32.083,34.979c-1.388,1.059-2.584,1.974-3.128,2.428 c-4.006,3.345-8.238,10.7-8.579,18.291c-0.227,5.037,1.25,9.183,4.387,12.32c2.751,2.751,6.523,4.188,11.26,4.294l248.65-241.79 c2.29-2.218,4.001-4.99,4.953-8.022l1.567-4.989c1.689-5.377,5.248-9.945,10.036-12.903l5.072-3.993l-4.282-5.928 c-1.689-2.338-1.164-5.603,1.175-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.03,5.58l15.746-12.393l-4.291-5.938 c-1.689-2.338-1.163-5.603,1.176-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.038,5.59l15.694-12.352l-4.537-6.281 c-1.689-2.338-1.163-5.603,1.174-7.292c2.341-1.688,5.603-1.164,7.292,1.175l4.285,5.932l15.731-12.381l-4.617-6.392 c-1.689-2.338-1.163-5.603,1.175-7.292c2.336-1.688,5.604-1.164,7.291,1.175l4.365,6.042l3.901-3.071 c4.473-3.697,9.771-5.69,15.229-5.69c1.901,0,3.811,0.243,5.678,0.721C605.559,9.141,612.019,17.569,612,28.05z M232.584,425.755 c-3.58-3.579-5.728-7.824-6.46-12.52l-10.534,10.761l-35.482-35.484l31.146-30.286c-3.623-1.229-6.818-3.179-9.47-5.83 c-5.224-5.225-7.795-12.2-7.437-20.176c0.434-9.666,5.385-20.051,12.319-25.84c0.717-0.598,1.875-1.484,3.479-2.71 c25.482-19.476,28-25.982,28.049-27.717c-7.257-8.062-26.069-1.524-51.688,17.983c-0.949,0.722-1.622,1.229-1.966,1.463 c-14.985,10.222-27.258,28.619-36.475,54.677c-8.727,24.653-28.043,43.714-52.997,52.295l-33.452,11.444 c-4.695,1.003-9.311,2.543-13.734,4.584l-0.949,0.464c-6.522,3.174-12.411,7.365-17.502,12.457 c-12.241,12.241-18.983,28.516-18.984,45.825c0,17.311,6.741,33.587,18.983,45.827l53.746,53.749 c12.237,12.235,28.507,18.975,45.814,18.975c0.002,0,0.005,0,0.008,0c17.311-0.003,33.583-6.744,45.825-18.985 c3.931-3.932,7.334-8.334,10.112-13.087l0.383-0.654l0.247-0.232c10.947-14.521,17.276-35.087,20.666-49.834 c4.259-18.495,17.394-33.754,35.133-40.82c17.713-7.046,34.404-16.284,40.587-22.47c5.514-5.514,7.748-10.376,7.47-16.261 c-0.184-3.858-1.81-7.244-4.145-8.626c-1.443-0.854-3.054-0.825-4.924,0.092c-1.427,0.713-2.408,1.182-3.143,1.499 C269.796,429.699,246.946,440.118,232.584,425.755z M601.555,28.029c0.008-4.412-2.249-9.707-8.604-11.333 c-4.044-1.037-8.133-0.014-11.761,2.981l-89.609,70.528l-0.29,0.172c-2.738,1.635-4.773,4.208-5.728,7.25l-1.568,4.989 c-1.473,4.685-4.116,8.967-7.643,12.386L194.982,388.615l20.528,20.528L491.93,126.8l8.04-8.041 c6.064-6.062,14.125-9.401,22.698-9.401c4.722,0,9.467,1.062,13.718,3.071c2.269,1.073,5.009,0.353,6.253-1.631l33.949-60.188 c2.735-4.85,7.401-8.411,12.8-9.772l2.911-0.734C599.117,38.388,601.545,32.526,601.555,28.029z M151.096,503.437l-34.667-34.667 l19.904-19.904L171,483.532L151.096,503.437z M151.095,488.664l5.131-5.132l-19.894-19.895l-5.131,5.132L151.095,488.664z M157.836,465.242l-34.667-34.667l19.904-19.904l34.667,34.668L157.836,465.242z M157.835,450.47l5.131-5.131l-19.894-19.896 l-5.131,5.132L157.835,450.47z M184.433,545.078c0.914,8.087-4.922,15.412-13.01,16.329c-0.555,0.063-1.116,0.094-1.671,0.094 c0,0,0,0-0.001,0c-7.511-0.001-13.813-5.636-14.657-13.105c-0.442-3.917,0.666-7.774,3.124-10.858 c2.457-3.084,5.968-5.026,9.887-5.469c0.553-0.063,1.115-0.095,1.67-0.095C177.285,531.974,183.586,537.608,184.433,545.078z M174.054,546.252c-0.247-2.185-2.086-3.832-4.279-3.832c-0.165,0-0.329,0.008-0.497,0.027c-1.146,0.129-2.173,0.697-2.891,1.6 c-0.719,0.901-1.043,2.03-0.913,3.175c0.247,2.186,2.085,3.834,4.277,3.834c0,0,0,0,0.001,0c0.163,0,0.329-0.008,0.495-0.027 C172.614,550.761,174.322,548.617,174.054,546.252z M160.042,571.396c0.914,8.089-4.922,15.414-13.011,16.329 c-0.554,0.063-1.115,0.094-1.67,0.094c0,0,0,0-0.001,0c-7.511,0-13.813-5.634-14.656-13.104c-0.442-3.917,0.666-7.774,3.123-10.858 c2.458-3.084,5.969-5.027,9.887-5.47c0.554-0.063,1.115-0.094,1.67-0.094C152.893,558.293,159.194,563.926,160.042,571.396z M149.661,572.569c-0.247-2.185-2.086-3.832-4.278-3.832c-0.165,0-0.329,0.008-0.498,0.027c-1.145,0.129-2.173,0.697-2.891,1.6 c-0.719,0.902-1.043,2.03-0.913,3.175c0.247,2.187,2.085,3.834,4.277,3.834c0.165,0,0.331-0.008,0.498-0.027 C148.223,577.078,149.929,574.937,149.661,572.569z"></path> 
                                    </g>
                                    {!showChords && <line x1="0" y1="306" x2="612" y2="306" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />}
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col items-end">
                            <div className="flex flex-col items-center">
                                <div className="mb-1 text-xs font-bold text-center">Тональність</div>
                                <div className="flex items-center justify-end gap-2 shrink-0">
                                    <button 
                                        type="button"
                                        onClick={() => setRawLines(transposeRawSong(rawLines, -1))}
                                        className="flex h-8 px-2 shrink-0 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-sm font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                                    >
                                        -1
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setRawLines(transposeRawSong(rawLines, 1))}
                                        className="flex h-8 px-2 shrink-0 items-center justify-center rounded-lg border-2 border-black/20 bg-black/5 text-sm font-black transition active:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:active:bg-white/20"
                                    >
                                        +1
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`flex flex-1 flex-col min-h-0 overflow-hidden mt-2 mb-2 border-t-2 border-black/10 pt-2 dark:border-white/10 transition-opacity ${activeTab !== 'manual' ? 'opacity-50 pointer-events-none' : ''}`}>
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
                                showChords={showChords}
                                onChange={setRawLines}
                            />
                        ) : (
                            <textarea
                                value={showChords ? rawLines : parseRawSong(rawLines).map(l => l.text).filter(t => t !== undefined).join('\n')}
                                onChange={(e) => setRawLines(e.target.value)}
                                readOnly={!showChords}
                                placeholder={showChords ? "Type your song here..." : "Редагування вимкнено поки акорди приховані"}
                                className={`h-full w-full resize-none rounded border-2 border-black bg-white py-3 pl-[10px] pr-2 text-black outline-none font-black leading-tight whitespace-pre-wrap break-words overflow-auto dark:border-white dark:bg-black dark:text-white ${!showChords ? 'opacity-70 bg-black/5 dark:bg-white/5' : ''}`}
                                style={{ fontSize: `${28 * defaultFontScale}px` }}
                            />
                        )}
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={submit}
                        disabled={loading}
                        className="flex-1 rounded border-2 border-black bg-black px-2 py-2 text-center text-sm font-black text-white transition active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 dark:border-white dark:bg-white dark:text-black"
                    >
                        {loading ? 'Додаю...' : 'Додати'}
                    </button>

                    <Link
                        href="/"
                        className="flex-1 block rounded border-2 border-black bg-white px-2 py-2 text-center text-sm font-black text-black transition active:translate-x-[1px] active:translate-y-[1px] dark:border-white dark:bg-black dark:text-white"
                    >
                        Назад
                    </Link>
                </div>
            </div>
        </main>
    );
}
