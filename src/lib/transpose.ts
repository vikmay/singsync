const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteIndex(note: string) {
    // Normalize flats to sharps for easier math
    const flatToSharp: Record<string, string> = {
        'Db': 'C#',
        'Eb': 'D#',
        'Gb': 'F#',
        'Ab': 'G#',
        'Bb': 'A#',
        'H': 'B', // Support German notation if present
        'Hb': 'A#',
    };
    
    // Capitalize only the first letter to match our arrays/maps
    let normalized = note.charAt(0).toUpperCase() + note.slice(1).toLowerCase();
    normalized = flatToSharp[normalized] || normalized;
    
    return NOTES.indexOf(normalized);
}

export function transposeChord(chord: string, delta: number): string {
    if (!chord || !chord.trim()) return chord;
    
    // Replace all root notes in the chord.
    // Matches A-H (to support H) optionally followed by # or b.
    // Must be at the start of the string or immediately following a slash (for bass notes like /F#)
    return chord.replace(/(^|\/)([a-hA-H][b#]?)/g, (match, prefix, note) => {
        const index = getNoteIndex(note);
        if (index === -1) return match; // Not a recognized note
        
        // Calculate new index wrapping around 12
        let newIndex = (index + delta) % 12;
        if (newIndex < 0) newIndex += 12;
        
        return prefix + NOTES[newIndex];
    });
}

// Utility to apply transpose to a full line of chords
export function transposeLineChords(chordsStr: string, delta: number): string {
    if (!chordsStr || delta === 0) return chordsStr;
    
    // Split by spaces, transpose each chord token, then join back with original spacing
    // We use a regex to preserve exact whitespace between chords
    return chordsStr.replace(/\S+/g, (token) => {
        return transposeChord(token, delta);
    });
}

import { parseRawSong, parsedLinesToText } from './chordParser';

export function transposeRawSong(rawText: string, delta: number): string {
    const lines = parseRawSong(rawText);
    const newLines = lines.map(line => {
        if (line.placements) {
            return {
                ...line,
                placements: line.placements.map(p => ({
                    ...p,
                    c: transposeChord(p.c, delta)
                }))
            };
        }
        if (!line.text && line.chords) {
            return {
                ...line,
                chords: transposeLineChords(line.chords, delta)
            };
        }
        return line;
    });
    return parsedLinesToText(newLines);
}
