'use client';

import { useState, useEffect, useRef } from 'react';
import { ParsedLine, parseRawSong, ChordPlacement } from '@/lib/chordParser';
import { transposeChord, transposeLineChords } from '@/lib/transpose';

function parsedLinesToChordPro(lines: ParsedLine[]): string {
    return lines.map(line => {
        if (!line.text && line.chords) {
            if (!line.placements || line.placements.length === 0) {
                return line.chords;
            }
        }
        if (!line.placements || line.placements.length === 0) {
            return line.text;
        }
        
        let out = '';
        let lastI = 0;
        const sorted = [...line.placements].sort((a, b) => a.i - b.i);
        for (const p of sorted) {
            out += line.text.slice(lastI, p.i);
            out += `[${p.c}]`;
            lastI = p.i;
        }
        out += line.text.slice(lastI);
        return out;
    }).join('\n');
}

export default function VisualChordEditor({
    rawLines,
    fontScale = 1.0,
    onChange
}: {
    rawLines: string;
    fontScale?: number;
    onChange: (val: string) => void;
}) {
    const [lines, setLines] = useState<ParsedLine[]>([]);
    const [copiedBlock, setCopiedBlock] = useState<ChordPlacement[][] | null>(null);

    useEffect(() => {
        setLines(parseRawSong(rawLines));
    }, [rawLines]);

    const handleTextChange = (lineIndex: number, newText: string) => {
        const newLines = [...lines];
        newLines[lineIndex] = { ...newLines[lineIndex], text: newText };
        onChange(parsedLinesToChordPro(newLines));
    };

    const addChord = (lineIndex: number, charIndex: number) => {
        const line = lines[lineIndex];
        const placements = line.placements || [];
        const existingIdx = placements.findIndex(p => p.i === charIndex);
        
        if (existingIdx !== -1) {
            editChord(lineIndex, existingIdx);
            return;
        }

        const chord = prompt('Введіть акорд (напр. Am, C#m):');
        if (!chord) return;
        
        const newLines = [...lines];
        const newPlacements = [...placements, { i: charIndex, c: chord }];
        newLines[lineIndex] = { ...line, placements: newPlacements };
        onChange(parsedLinesToChordPro(newLines));
    };

    const moveChord = (lineIndex: number, placementIndex: number, delta: number) => {
        const newLines = [...lines];
        const line = newLines[lineIndex];
        if (!line.placements) return;

        const placements = [...line.placements];
        const p = placements[placementIndex];
        
        const newI = Math.max(0, Math.min(line.text.length, p.i + delta));
        placements[placementIndex] = { ...p, i: newI };
        
        newLines[lineIndex] = { ...line, placements };
        onChange(parsedLinesToChordPro(newLines));
    };

    const editChord = (lineIndex: number, placementIndex: number) => {
        const newLines = [...lines];
        const line = newLines[lineIndex];
        if (!line.placements) return;

        const placements = [...line.placements];
        const p = placements[placementIndex];
        
        const chord = prompt('Редагувати акорд (залиште пустим щоб видалити):', p.c);
        if (chord === null) return;
        
        if (chord.trim() === '') {
            placements.splice(placementIndex, 1);
        } else {
            placements[placementIndex] = { ...p, c: chord.trim() };
        }
        
        newLines[lineIndex] = { ...line, placements };
        onChange(parsedLinesToChordPro(newLines));
    };

    type BlockInfo = { startIdx: number; endIdx: number; lines: ParsedLine[] };
    const blocks: BlockInfo[] = [];
    let currentBlock: BlockInfo | null = null;
    lines.forEach((line, idx) => {
        if (line.text.trim() === '') {
            if (currentBlock) {
                blocks.push(currentBlock);
                currentBlock = null;
            }
        } else {
            if (!currentBlock) {
                currentBlock = { startIdx: idx, endIdx: idx, lines: [] };
            }
            currentBlock.endIdx = idx;
            currentBlock.lines.push(line);
        }
    });
    if (currentBlock) blocks.push(currentBlock);

    const copyBlock = (block: BlockInfo) => {
        const placementsArr = block.lines.map(l => l.placements ? [...l.placements] : []);
        setCopiedBlock(placementsArr);
    };

    const pasteBlock = (block: BlockInfo) => {
        if (!copiedBlock) return;
        const newLines = [...lines];
        for (let i = 0; i < block.lines.length; i++) {
            if (i >= copiedBlock.length) break;
            const lineIdx = block.startIdx + i;
            const line = newLines[lineIdx];
            const maxI = line.text.length;
            const placementsToPaste = copiedBlock[i].map(p => ({
                ...p,
                i: Math.min(p.i, maxI)
            }));
            newLines[lineIdx] = { ...line, placements: placementsToPaste };
        }
        setLines(newLines);
        onChange(parsedLinesToChordPro(newLines));
    };

    const applyTranspose = (delta: number) => {
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
        setLines(newLines);
        onChange(parsedLinesToChordPro(newLines));
    };

    useEffect(() => {
        // Dragging removed for proportional font support
    }, [lines, onChange, fontScale]);

    return (
        <div className="flex flex-col border-2 border-black dark:border-white rounded-lg bg-white dark:bg-black overflow-hidden h-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 border-b-2 border-black/10 dark:border-white/10 shrink-0">
                <p className="font-bold opacity-60" style={{ fontSize: '0.75rem', lineHeight: '1rem' }}>
                    Клікайте на будь-яку букву в тексті, щоб додати акорд.<br/>
                    Використовуйте &lt; та &gt; біля акорду для пересування.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold uppercase tracking-wider opacity-60" style={{ fontSize: '0.75rem', lineHeight: '1rem' }}>Тональність:</span>
                    <button 
                        onClick={() => applyTranspose(-1)}
                        className="px-3 py-1 bg-black/5 dark:bg-white/10 hover:bg-black/10 hover:dark:bg-white/20 rounded font-black text-sm transition"
                    >
                        -1
                    </button>
                    <button 
                        onClick={() => applyTranspose(1)}
                        className="px-3 py-1 bg-black/5 dark:bg-white/10 hover:bg-black/10 hover:dark:bg-white/20 rounded font-black text-sm transition"
                    >
                        +1
                    </button>
                </div>
            </div>

            <div 
                className="flex flex-col gap-4 p-3 overflow-auto flex-1"
                style={{ fontSize: `${28 * fontScale}px` }}
            >
            {lines.map((line, lineIndex) => {
                const placements = line.placements || [];
                const chars = line.text.split('');
                const isBlockStart = blocks.find(b => b.startIdx === lineIndex);
                
                const blockHeader = isBlockStart ? (
                    <div className="flex flex-wrap items-center gap-2 mb-2 mt-4 pt-4 border-t-2 border-black/10 dark:border-white/10 w-full" style={lineIndex === 0 ? { borderTop: 'none', marginTop: 0, paddingTop: 0 } : {}}>
                        <span className="text-xs font-bold opacity-50 uppercase tracking-widest">
                            Блок {blocks.indexOf(isBlockStart) + 1}
                        </span>
                        <button
                            onClick={() => copyBlock(isBlockStart)}
                            className="text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 px-2 py-1 rounded transition"
                        >
                            Копіювати акорди
                        </button>
                        {copiedBlock && (
                            <button
                                onClick={() => pasteBlock(isBlockStart)}
                                className="text-xs bg-blue-500/10 text-blue-700 dark:bg-blue-400/20 dark:text-blue-400 hover:bg-blue-500/20 px-2 py-1 rounded transition font-bold"
                            >
                                Вставити сюди
                            </button>
                        )}
                    </div>
                ) : null;

                if (chars.length === 0 && (!placements || placements.length === 0)) {
                    return (
                        <div key={lineIndex} className="flex flex-col w-full">
                            {blockHeader}
                            <div className="min-h-[1.5em] group flex items-center">
                                <input 
                                    value=""
                                    onChange={(e) => handleTextChange(lineIndex, e.target.value)}
                                    className="w-full bg-transparent outline-none opacity-50 focus:opacity-100 placeholder:opacity-30"
                                    placeholder="(пустий рядок)"
                                />
                            </div>
                        </div>
                    );
                }

                const sortedPlacements = [...placements].sort((a, b) => a.i - b.i);
                const segments: { chord: string; text: string; startIndex: number; pIdx: number }[] = [];
                
                if (sortedPlacements.length > 0) {
                    if (sortedPlacements[0].i > 0) {
                        segments.push({ chord: '', text: line.text.slice(0, sortedPlacements[0].i), startIndex: 0, pIdx: -1 });
                    }
                    for (let j = 0; j < sortedPlacements.length; j++) {
                        const p = sortedPlacements[j];
                        const nextP = sortedPlacements[j + 1];
                        const textSlice = line.text.slice(p.i, nextP ? nextP.i : undefined);
                        const originalPIdx = placements.indexOf(p);
                        segments.push({ chord: p.c, text: textSlice, startIndex: p.i, pIdx: originalPIdx });
                    }
                } else {
                    segments.push({ chord: '', text: line.text, startIndex: 0, pIdx: -1 });
                }

                return (
                    <div key={lineIndex} className="flex flex-col w-full border-b border-black/5 dark:border-white/5 pb-2">
                        {blockHeader}
                        <div className="flex flex-wrap items-end justify-center w-full min-h-[2em] pt-4 mb-2 group">
                            {segments.map((seg, idx) => (
                                <span key={idx} className="inline-flex flex-col items-start mx-[1px] max-w-full">
                                    <span className="font-black leading-tight text-blue-700 dark:text-blue-400 whitespace-pre flex items-center group/chord" style={{ fontSize: `${18 * fontScale}px`, minHeight: '1.2em' }}>
                                        {seg.chord && (
                                            <>
                                                <button onClick={() => moveChord(lineIndex, seg.pIdx, -1)} className="opacity-0 group-hover/chord:opacity-100 px-1 hover:bg-black/10 rounded transition">&lt;</button>
                                                <span onClick={() => editChord(lineIndex, seg.pIdx)} className="cursor-pointer hover:underline text-center min-w-[1ch]">{seg.chord}</span>
                                                <button onClick={() => moveChord(lineIndex, seg.pIdx, 1)} className="opacity-0 group-hover/chord:opacity-100 px-1 hover:bg-black/10 rounded transition">&gt;</button>
                                            </>
                                        )}
                                    </span>
                                    <span className="font-black leading-tight text-black dark:text-white whitespace-pre-wrap break-words max-w-full" style={{ fontSize: `${28 * fontScale}px`, minHeight: '1.2em' }}>
                                        {seg.text.split('').map((char, charOffset) => (
                                            <span 
                                                key={charOffset}
                                                onClick={() => addChord(lineIndex, seg.startIndex + charOffset)}
                                                className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/20"
                                            >
                                                {char}
                                            </span>
                                        ))}
                                        {idx === segments.length - 1 && (
                                            <span 
                                                onClick={() => addChord(lineIndex, seg.startIndex + seg.text.length)}
                                                className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 inline-block"
                                                style={{ minWidth: '0.5em' }}
                                            >
                                                {' '}
                                            </span>
                                        )}
                                    </span>
                                </span>
                            ))}
                        </div>
                        <div className="w-full mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <input 
                                value={line.text}
                                onChange={(e) => handleTextChange(lineIndex, e.target.value)}
                                className="w-full text-xs font-mono bg-black/5 dark:bg-white/10 px-2 py-1 rounded outline-none"
                                placeholder="Редагувати рядок тексту..."
                            />
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}
