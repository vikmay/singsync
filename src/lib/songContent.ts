import type { SongContentV1 } from '@/types/song';

export function parseSongContent(content: string | null): SongContentV1 | null {
    if (!content || typeof content !== 'string') return null;

    try {
        const parsed = JSON.parse(content) as unknown;

        if (!parsed || typeof parsed !== 'object') return null;

        const maybe = parsed as Partial<SongContentV1>;
        if (maybe.version !== 1) return null;

        if (!Array.isArray(maybe.lines)) return null;

        const lines = maybe.lines.map((l) => {
            if (!l || typeof l !== 'object') return { chords: '', text: '' };
            const chords =
                typeof (l as any).chords === 'string' ? (l as any).chords : '';
            const text =
                typeof (l as any).text === 'string' ? (l as any).text : '';
            return { chords, text };
        });

        return { version: 1, lines };
    } catch {
        return null;
    }
}
