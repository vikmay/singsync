export type ChordPlacement = {
    i: number; // index in the text string
    c: string; // chord string
};

export type ParsedLine = {
    chords: string;
    text: string;
    placements?: ChordPlacement[];
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
    const lines = rawText.split('\n');
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
        if (line.includes('[') && line.includes(']')) {
            const placements: ChordPlacement[] = [];
            let text = '';
            let chordsStr = '';
            
            // Regex to match [Chord] or text
            const parts = line.split(/(\[[^\]]+\])/);
            
            for (const part of parts) {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const chord = part.slice(1, -1);
                    placements.push({ i: text.length, c: chord });
                    chordsStr += chord + '   ';
                } else {
                    text += part;
                }
            }
            
            result.push({
                chords: chordsStr.trim(),
                text: text.trimEnd(),
                placements
            });
            continue;
        }

        // 3. Normal text with chords above
        const isChord = isChordLine(line);
        if (isChord) {
            // If we already have pending chords but no text, push them as a standalone chord line.
            if (pendingChords) {
                const placements: ChordPlacement[] = [];
                let m;
                const regex = /\S+/g;
                while ((m = regex.exec(pendingChords)) !== null) {
                    placements.push({ i: m.index || 0, c: m[0] });
                }
                result.push({ chords: pendingChords.trim(), text: '', placements });
            }
            pendingChords = line; // Preserve spacing for alignment
        } else {
            // It's a text line
            let placements: ChordPlacement[] | undefined = undefined;
            if (pendingChords.trim()) {
                placements = [];
                let m;
                const regex = /\S+/g;
                while ((m = regex.exec(pendingChords)) !== null) {
                    placements.push({ i: m.index || 0, c: m[0] });
                }
            }
            result.push({ chords: pendingChords.trim(), text: line, placements });
            pendingChords = '';
        }
    }

    // If there's a leftover chord line at the end
    if (pendingChords) {
        const placements: ChordPlacement[] = [];
        let m;
        const regex = /\S+/g;
        while ((m = regex.exec(pendingChords)) !== null) {
            placements.push({ i: m.index || 0, c: m[0] });
        }
        result.push({ chords: pendingChords.trim(), text: '', placements });
    }

    return result;
}

export function parsedLinesToText(lines: ParsedLine[]): string {
    return lines.map(line => {
        if (!line.text && line.chords) {
            if (!line.placements || line.placements.length === 0) {
                return line.chords;
            }
            let chordLine = '';
            let currentPos = 0;
            const sorted = [...line.placements].sort((a, b) => a.i - b.i);
            for (const p of sorted) {
                if (p.i > currentPos) {
                    chordLine += ' '.repeat(p.i - currentPos);
                    currentPos = p.i;
                } else if (currentPos > 0) {
                    chordLine += ' ';
                    currentPos++;
                }
                chordLine += p.c;
                currentPos += p.c.length;
            }
            return chordLine;
        }
        if (!line.placements || line.placements.length === 0) {
            return line.text;
        }
        
        let chordLine = '';
        let currentPos = 0;
        const sorted = [...line.placements].sort((a, b) => a.i - b.i);
        for (const p of sorted) {
            if (p.i > currentPos) {
                chordLine += ' '.repeat(p.i - currentPos);
                currentPos = p.i;
            } else if (currentPos > 0) {
                chordLine += ' ';
                currentPos++;
            }
            chordLine += p.c;
            currentPos += p.c.length;
        }
        return chordLine + '\n' + line.text;
    }).join('\n');
}

export function mapChordsToNewLines(oldLines: ParsedLine[], newTextOnly: string): string {
    const newTextLines = newTextOnly.split('\n');
    const result: ParsedLine[] = newTextLines.map(text => ({ text, chords: '', placements: [] }));
    const usedNew = new Set<number>();
    
    for (const old of oldLines) {
        if (!old.placements || old.placements.length === 0) continue;
        
        let bestMatchIdx = -1;
        // 1. Exact match
        for (let i = 0; i < newTextLines.length; i++) {
            if (!usedNew.has(i) && newTextLines[i] === old.text) {
                bestMatchIdx = i;
                break;
            }
        }
        
        // 2. Substring match (if text was modified slightly)
        if (bestMatchIdx === -1) {
             for (let i = 0; i < newTextLines.length; i++) {
                 if (!usedNew.has(i) && newTextLines[i].trim() !== '' && old.text.trim() !== '') {
                     if (newTextLines[i].includes(old.text.trim()) || old.text.includes(newTextLines[i].trim())) {
                         bestMatchIdx = i;
                         break;
                     }
                 }
             }
        }
        
        if (bestMatchIdx !== -1) {
            result[bestMatchIdx].placements = old.placements;
            usedNew.add(bestMatchIdx);
        }
    }
    
    return parsedLinesToText(result);
}
