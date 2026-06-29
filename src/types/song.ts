export type SongContentV1 = {
    version: 1;
    lines: Array<{
        chords: string;
        text: string;
    }>;
};

export type ParsedSongContent = SongContentV1 | null;

export type Song = {
    id: number;
    title: string;
    artist: string;
    created_at: string;
    parsedContent: ParsedSongContent;
};
