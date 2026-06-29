export type ParsedLine = {
    chords: string;
    text: string;
};

// Regex to detect if a word looks like a chord.
// Matches: A, Am, C#, C#m, Bb, Bbm7, F/A, Dsus4, etc. (Also supports H instead of B in some locales)
const CHORD_REGEX = /^[A-H]([b#])?(m|min|maj|dim|aug|sus)?\d*(\/[A-H]([b#])?)?$/i;

function isChordLine(line: string): boolean {
    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return false;

    let chordCount = 0;
    for (const token of tokens) {
        // Remove common punctuation that might be attached (e.g., "Am," -> "Am")
        const cleanToken = token.replace(/[.,:;()]/g, '');
        if (CHORD_REGEX.test(cleanToken)) {
            chordCount++;
        }
    }

    // If more than half of the words look like chords, we consider it a chord line.
    // This handles cases where people write "Chorus: Am G"
    return chordCount / tokens.length >= 0.5;
}

export function parseRawSong(rawText: string): ParsedLine[] {
    const lines = rawText.split('\n').map((l) => l.trimEnd()); // keep leading spaces for chords alignment if needed, but for MVP we center anyway.
    const result: ParsedLine[] = [];

    let pendingChords = '';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. If it's the old CHORDS|Text format, handle it gracefully.
        if (line.includes('|')) {
            const [chordsPart, ...textParts] = line.split('|');
            const textPart = textParts.join('|');
            result.push({ chords: chordsPart.trim(), text: textPart.trim() });
            continue;
        }

        // 2. ChordPro format check [Am]Hello [C]World
        // For our simple JSON schema (chords on top of line), we can extract chords from ChordPro and put them in `chords`, removing from `text`.
        if (line.includes('[') && line.includes(']')) {
            let extractedChords = '';
            let cleanedText = line;
            
            // Extract all [Chord] using regex
            const matches = [...line.matchAll(/\[(.*?)\]/g)];
            if (matches.length > 0) {
                extractedChords = matches.map(m => m[1]).join('   ');
                cleanedText = line.replace(/\[.*?\]/g, '');
                
                result.push({
                    chords: extractedChords.trim(),
                    text: cleanedText.trim()
                });
                continue;
            }
        }

        // 3. Normal text with chords above
        const isChord = isChordLine(line);
        if (isChord) {
            // If we already have pending chords but no text, push them as a standalone chord line.
            if (pendingChords) {
                result.push({ chords: pendingChords.trim(), text: '' });
            }
            pendingChords = line.trim(); // Just trim for now since UI centers it
        } else {
            // It's a text line
            result.push({ chords: pendingChords.trim(), text: line.trim() });
            pendingChords = '';
        }
    }

    // If there's a leftover chord line at the end
    if (pendingChords) {
        result.push({ chords: pendingChords.trim(), text: '' });
    }

    return result;
}
