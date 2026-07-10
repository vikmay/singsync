'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { SongContentV1 } from '@/types/song';

type SongApiResponse = {
    song: {
        id: number;
        title: string;
        artist: string;
        created_at: string;
        parsedContent: SongContentV1 | null;
    };
};

type Line = { chords: string; text: string };

const LINE_KEY_HEIGHT_PX = 44; // must be consistent with room scroll math later

function LineBlock({ line, i }: { line: Line; i: number }) {
    return (
        <div
            className="border-l-2 border-black/30 dark:border-white/20 px-2 py-2"
            style={{ minHeight: `${LINE_KEY_HEIGHT_PX}px` }}
        >
            <div className="text-center text-[18px] font-black leading-tight text-black dark:text-white">
                {line.chords?.trim() ? line.chords : '\u00A0'}
            </div>
            <div className="mt-1 text-center text-[28px] font-black leading-tight text-black dark:text-white">
                {line.text}
            </div>
        </div>
    );
}

export default function SongPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [songTitle, setSongTitle] = useState<string>('');
    const [songArtist, setSongArtist] = useState<string>('');
    const [lines, setLines] = useState<Line[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function loadSong() {
            setLoading(true);
            setError(null);

            try {
                if (!id) throw new Error('Song id missing');

                const res = await fetch(`/api/song/${encodeURIComponent(id)}`);
                if (!res.ok) throw new Error('Song not found');

                const data = (await res.json()) as SongApiResponse;

                if (cancelled) return;

                setSongTitle(data.song.title);
                setSongArtist(data.song.artist);

                const parsed = data.song.parsedContent;
                if (!parsed?.lines) {
                    setLines([]);
                } else {
                    setLines(parsed.lines as Line[]);
                }
            } catch (e) {
                if (!cancelled)
                    setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadSong();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const title = useMemo(() => songTitle || 'Пісня', [songTitle]);

    return (
        <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
            <div className="mx-auto max-w-md md:max-w-3xl px-3 py-3 border-x-2 border-black/5 dark:border-white/5 min-h-screen">
                <header className="mb-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="truncate text-3xl font-black">
                                {title}
                            </h1>
                            <p className="truncate text-sm font-bold opacity-80">
                                {songArtist}
                            </p>
                        </div>
                    </div>
                </header>

                {error ?
                    <section className="rounded border-2 border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950">
                        {error}
                    </section>
                :   null}

                {loading ?
                    <section className="rounded border-2 border-black bg-white p-3 text-sm dark:border-white dark:bg-black">
                        Завантаження...
                    </section>
                :   null}

                {!loading && !error ?
                    <section className="space-y-2">
                        {lines.length === 0 ?
                            <div className="rounded border-2 border-dashed border-black p-3 text-sm opacity-80 dark:border-white">
                                Немає контенту для відображення.
                            </div>
                        :   null}

                        {lines.map((line, i) => (
                            <LineBlock key={i} line={line} i={i} />
                        ))}
                    </section>
                :   null}
            </div>
        </main>
    );
}
