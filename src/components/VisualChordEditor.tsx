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
    onChange
}: {
    rawLines: string;
    onChange: (val: string) => void;
}) {
    const [lines, setLines] = useState<ParsedLine[]>([]);
    const [copiedBlock, setCopiedBlock] = useState<ChordPlacement[][] | null>(null);
    const [draggingChord, setDraggingChord] = useState<{
        lineIndex: number;
        placementIndex: number;
        startX: number;
        initialI: number;
        currentI: number;
    } | null>(null);

    const dragStateRef = useRef<{
        lineIndex: number;
        placementIndex: number;
        startX: number;
        initialI: number;
        currentI: number;
    } | null>(null);

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
        const handleGlobalMove = (e: PointerEvent) => {
            if (!dragStateRef.current) return;
            e.preventDefault();
            
            const state = dragStateRef.current;
            const deltaX = e.clientX - state.startX;
            const charWidth = 9.5; 
            const charsMoved = Math.round(deltaX / charWidth);
            
            const lineText = lines[state.lineIndex]?.text || '';
            const newI = Math.max(0, Math.min(lineText.length, state.initialI + charsMoved));
            
            if (newI !== state.currentI) {
                state.currentI = newI;
                setDraggingChord({ ...state });
            }
        };

        const handleGlobalUp = (e: PointerEvent) => {
            if (!dragStateRef.current) return;
            const state = dragStateRef.current;
            dragStateRef.current = null;
            setDraggingChord(null);

            const deltaX = Math.abs(e.clientX - state.startX);

            if (state.currentI !== state.initialI) {
                setLines(prevLines => {
                    const newLines = [...prevLines];
                    const line = newLines[state.lineIndex];
                    if (line && line.placements) {
                        const placements = [...line.placements];
                        placements[state.placementIndex] = { ...placements[state.placementIndex], i: state.currentI };
                        newLines[state.lineIndex] = { ...line, placements };
                        setTimeout(() => onChange(parsedLinesToChordPro(newLines)), 0);
                    }
                    return newLines;
                });
            } else if (deltaX < 5) {
                // It was a click, not a drag
                editChord(state.lineIndex, state.placementIndex);
            }
        };

        window.addEventListener('pointermove', handleGlobalMove, { passive: false });
        window.addEventListener('pointerup', handleGlobalUp);
        window.addEventListener('pointercancel', handleGlobalUp);
        
        return () => {
            window.removeEventListener('pointermove', handleGlobalMove);
            window.removeEventListener('pointerup', handleGlobalUp);
            window.removeEventListener('pointercancel', handleGlobalUp);
        };
    }, [lines, onChange]);

    const handlePointerDown = (e: React.PointerEvent, lineIndex: number, placementIndex: number, initialI: number) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.stopPropagation();
        e.preventDefault();
        
        const state = {
            lineIndex,
            placementIndex,
            startX: e.clientX,
            initialI,
            currentI: initialI
        };
        dragStateRef.current = state;
        setDraggingChord(state);
    };

    return (
        <div className="flex flex-col gap-4 font-mono text-base border-2 border-black dark:border-white p-3 rounded-lg bg-white dark:bg-black overflow-x-auto min-h-[300px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 border-b-2 border-black/10 dark:border-white/10 pb-4">
                <p className="text-xs font-bold opacity-60">
                    Клікайте на будь-яку букву в тексті, щоб додати акорд.<br/>
                    Використовуйте &lt; та &gt; біля акорду для пересування.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">Тональність:</span>
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

                if (chars.length === 0) {
                    return (
                        <div key={lineIndex} className="min-h-[1.5em] group flex items-center">
                            <input 
                                value=""
                                onChange={(e) => handleTextChange(lineIndex, e.target.value)}
                                className="w-full bg-transparent outline-none opacity-50 focus:opacity-100 placeholder:opacity-30"
                                placeholder="(пустий рядок)"
                            />
                        </div>
                    );
                }

                return (
                    <div key={lineIndex} className="flex flex-col w-full">
                        {blockHeader}
                        <div className="relative pt-6 mb-2 flex flex-wrap group">
                            <div className="absolute top-0 left-0 right-0 flex pointer-events-none">
                            {placements.map((p, pIdx) => {
                                const isDraggingThis = draggingChord?.lineIndex === lineIndex && draggingChord?.placementIndex === pIdx;
                                const displayI = isDraggingThis ? draggingChord.currentI : p.i;
                                
                                return (
                                    <div 
                                        key={pIdx} 
                                        className={`absolute flex items-center gap-1 -translate-x-1/2 ${isDraggingThis ? 'z-50 pointer-events-none' : 'pointer-events-auto transition-all duration-75'}`}
                                        style={{ left: `calc(${displayI}ch + 0.5ch)` }}
                                    >
                                        <button 
                                            onClick={() => moveChord(lineIndex, pIdx, -1)}
                                            className={`w-4 h-4 flex items-center justify-center bg-black/10 dark:bg-white/10 rounded-full text-[10px] hover:bg-black/20 ${isDraggingThis ? 'opacity-0' : 'opacity-100'}`}
                                        >&lt;</button>
                                        
                                        <div className="relative">
                                            {/* Visual grab indicator that pops up when dragging */}
                                            {isDraggingThis && (
                                                <div className="absolute -inset-2 -top-6 bg-blue-500 rounded-lg shadow-xl opacity-90 scale-150 flex items-center justify-center pointer-events-none">
                                                    <span className="font-black text-white text-xs">{p.c}</span>
                                                </div>
                                            )}
                                            
                                            <button 
                                                onPointerDown={(e) => handlePointerDown(e, lineIndex, pIdx, p.i)}
                                                className={`font-black cursor-pointer text-sm touch-none select-none relative z-10 ${
                                                    isDraggingThis 
                                                        ? 'text-transparent' // Hide original text while grabbing indicator shows
                                                        : 'text-blue-700 dark:text-blue-400 hover:underline'
                                                }`}
                                            >
                                                {p.c}
                                            </button>
                                        </div>

                                        <button 
                                            onClick={() => moveChord(lineIndex, pIdx, 1)}
                                            className={`w-4 h-4 flex items-center justify-center bg-black/10 dark:bg-white/10 rounded-full text-[10px] hover:bg-black/20 ${isDraggingThis ? 'opacity-0' : 'opacity-100'}`}
                                        >&gt;</button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex w-full">
                            {chars.map((char, charIndex) => (
                                <span 
                                    key={charIndex}
                                    onClick={() => addChord(lineIndex, charIndex)}
                                    className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 whitespace-pre"
                                    title={`Додати акорд перед "${char}"`}
                                    style={{ width: '1ch', display: 'inline-block', textAlign: 'center' }}
                                >
                                    {char}
                                </span>
                            ))}
                            <span 
                                onClick={() => addChord(lineIndex, chars.length)}
                                className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 whitespace-pre inline-block"
                                style={{ width: '1ch' }}
                            >
                                {' '}
                            </span>
                        </div>
                        </div>
                        <div className="w-full mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <input 
                                value={line.text}
                                onChange={(e) => handleTextChange(lineIndex, e.target.value)}
                                className="w-full text-xs bg-black/5 dark:bg-white/10 px-2 py-1 rounded outline-none"
                                placeholder="Редагувати рядок тексту..."
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
