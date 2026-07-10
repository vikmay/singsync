'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ParsedLine, parseRawSong, ChordPlacement, parsedLinesToText } from '@/lib/chordParser';
import { transposeChord, transposeLineChords } from '@/lib/transpose';
import { showToast } from '@/lib/toast';
import { showConfirm, showPrompt } from '@/lib/dialog';

export default function VisualChordEditor({
    rawLines,
    fontScale = 1.0,
    showChords = true,
    onChange
}: {
    rawLines: string;
    fontScale?: number;
    showChords?: boolean;
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
        onChange(parsedLinesToText(newLines));
    };

    const addChord = async (lineIndex: number, charIndex: number) => {
        const line = lines[lineIndex];
        const placements = line.placements || [];
        const existingIdx = placements.findIndex(p => p.i === charIndex);
        
        if (existingIdx !== -1) {
            editChord(lineIndex, existingIdx);
            return;
        }

        const chord = await showPrompt('Введіть акорд (напр. Am, C#m):');
        if (chord === null || chord.trim() === '') return;
        
        const newLines = [...lines];
        const newPlacements = [...placements, { i: charIndex, c: chord }];
        newLines[lineIndex] = { ...line, placements: newPlacements };
        onChange(parsedLinesToText(newLines));
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
        onChange(parsedLinesToText(newLines));
    };

    const editChord = async (lineIndex: number, placementIndex: number) => {
        const chord = await showPrompt('Редагувати акорд (залиште пустим щоб видалити):', lines[lineIndex].placements![placementIndex].c);
        if (chord === null) return;
        
        const newLines = [...lines];
        const line = newLines[lineIndex];
        const placements = [...line.placements!];
        
        if (chord.trim() === '') {
            placements.splice(placementIndex, 1);
        } else {
            placements[placementIndex] = { ...placements[placementIndex], c: chord.trim() };
        }
        
        newLines[lineIndex] = { ...line, placements };
        onChange(parsedLinesToText(newLines));
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
        showToast('Акорди блоку скопійовано!');
    };

    const clearBlock = async (block: BlockInfo) => {
        if (!(await showConfirm('Ви впевнені, що хочете очистити всі акорди в цьому блоці?'))) return;
        const newLines = [...lines];
        for (let i = 0; i < block.lines.length; i++) {
            const lineIdx = block.startIdx + i;
            newLines[lineIdx] = { ...newLines[lineIdx], placements: [] };
        }
        setLines(newLines);
        onChange(parsedLinesToText(newLines));
    };

    const copyBlockText = (block: BlockInfo) => {
        const pureText = block.lines.map(l => l.text).join('\n');
        navigator.clipboard.writeText(pureText);
        showToast('Чистий текст блоку скопійовано в буфер обміну!');
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
        onChange(parsedLinesToText(newLines));
    };

    const [dragging, setDragging] = useState<{ 
        lineIndex: number, 
        pIdx: number, 
        chord: string,
        clientX: number,
        clientY: number,
        charIndex: number
    } | null>(null);

    const dragDataRef = useRef<{ 
        lineIndex: number, 
        pIdx: number, 
        startI: number, 
        hasMoved: boolean,
        rects: { index: number, rect: DOMRect }[]
    } | null>(null);

    const linesRef = useRef(lines);
    linesRef.current = lines;

    useEffect(() => {
        const handleMove = (e: PointerEvent) => {
            const drag = dragDataRef.current;
            if (!drag) return;
            
            let closestChar = drag.startI;
            let minDist = Infinity;
            
            for (const rectData of drag.rects) {
                const rect = rectData.rect;
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                const dist = dx * dx + dy * dy * 5; 
                
                if (dist < minDist) {
                    minDist = dist;
                    closestChar = rectData.index;
                }
            }

            if (closestChar !== drag.startI) {
                drag.hasMoved = true;
            }

            setDragging(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY, charIndex: closestChar } : null);

            setLines(prev => {
                const newLines = [...prev];
                const line = newLines[drag.lineIndex];
                const newPlacements = [...line.placements!];
                if (newPlacements[drag.pIdx].i !== closestChar) {
                    newPlacements[drag.pIdx] = { ...newPlacements[drag.pIdx], i: closestChar };
                    newLines[drag.lineIndex] = { ...line, placements: newPlacements };
                }
                return newLines;
            });
        };

        const handleUp = () => {
            if (dragDataRef.current) {
                if (dragDataRef.current.hasMoved) {
                    onChange(parsedLinesToText(linesRef.current));
                }
                setDragging(null);
                setTimeout(() => {
                    dragDataRef.current = null;
                }, 50);
            }
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
        };
    }, [onChange]);

    const handlePointerDown = (e: React.PointerEvent, lineIndex: number, pIdx: number, currentI: number, chord: string) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        
        const charSpans = document.querySelectorAll(`span[data-line="${lineIndex}"]`);
        const rects: { index: number, rect: DOMRect }[] = [];
        charSpans.forEach(span => {
            const idxStr = span.getAttribute('data-char');
            if (idxStr !== null) {
                rects.push({ index: parseInt(idxStr, 10), rect: span.getBoundingClientRect() });
            }
        });

        const dragData = { lineIndex, pIdx, startI: currentI, hasMoved: false, rects };
        setDragging({ lineIndex, pIdx, chord, clientX: e.clientX, clientY: e.clientY, charIndex: currentI });
        dragDataRef.current = dragData;
    };

    const handleChordClick = (lineIndex: number, pIdx: number) => {
        if (dragDataRef.current?.hasMoved) return;
        editChord(lineIndex, pIdx);
    };

    const getMagnifierText = (lineIndex: number, charIndex: number) => {
        if (!lines[lineIndex]) return null;
        const text = lines[lineIndex].text;
        const start = Math.max(0, charIndex - 3);
        const end = Math.min(text.length, charIndex + 4);
        const slice = text.slice(start, end);
        const highlightIdx = charIndex - start;
        return (
            <span className="whitespace-pre">
                {slice.slice(0, highlightIdx)}
                <span className="text-blue-500 underline decoration-2">{slice[highlightIdx] || ' '}</span>
                {slice.slice(highlightIdx + 1)}
            </span>
        );
    };

    return (
        <div className="flex flex-col border-2 border-black dark:border-white rounded-lg bg-white dark:bg-black overflow-hidden h-full relative">
            {dragging && (
                <div 
                    className="fixed z-[9999] pointer-events-none bg-white dark:bg-black border-2 border-blue-500 rounded-lg shadow-2xl flex flex-col items-center justify-center p-2 min-w-[100px]"
                    style={{
                        left: dragging.clientX,
                        top: dragging.clientY - 90,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <span className="text-blue-500 font-black text-xl leading-none mb-1">{dragging.chord}</span>
                    <span className="text-black dark:text-white font-black text-2xl leading-none">
                        {getMagnifierText(dragging.lineIndex, dragging.charIndex)}
                    </span>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-blue-500"></div>
                </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 border-b-2 border-black/10 dark:border-white/10 shrink-0">
                <p className="font-bold opacity-60" style={{ fontSize: '0.75rem', lineHeight: '1rem' }}>
                    Клікайте на будь-яку букву в тексті, щоб додати акорд.<br/>
                    Використовуйте &lt; та &gt; біля акорду для пересування, або просто перетягніть його!
                </p>
            </div>

            <div 
                className="flex flex-col overflow-auto scrollbar-hide flex-1 font-sans"
                style={{ fontSize: `${28 * fontScale}px` }}
            >
            {lines.map((line, lineIndex) => {
                const placements = line.placements || [];
                const chars = line.text.split('');
                const isBlockStart = blocks.find(b => b.startIdx === lineIndex);
                
                const blockHeader = isBlockStart ? (
                    <div className="flex flex-nowrap items-center gap-1.5 mb-6 mt-8 pt-4 border-t-2 border-black/10 dark:border-white/10 w-full overflow-x-auto scrollbar-hide" style={lineIndex === 0 ? { borderTop: 'none', marginTop: 0, paddingTop: 0 } : {}}>
                        <span className="text-xs font-bold opacity-50 uppercase tracking-widest whitespace-nowrap mr-1 shrink-0">
                            Блок {blocks.indexOf(isBlockStart) + 1}
                        </span>
                        
                        <div className="flex bg-black/5 dark:bg-white/10 rounded-md overflow-hidden shrink-0">
                            <button
                                onClick={() => copyBlock(isBlockStart)}
                                title="Скопіювати акорди цього блоку"
                                className="flex items-center gap-1.5 hover:bg-black/10 dark:hover:bg-white/20 px-2 py-1.5 transition"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-70"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                <span className="text-[10px] font-bold uppercase tracking-wider">Акорди</span>
                            </button>
                            {copiedBlock && (
                                <button
                                    onClick={() => pasteBlock(isBlockStart)}
                                    title="Вставити скопійовані акорди"
                                    className="flex items-center bg-blue-500/10 text-blue-700 dark:bg-blue-400/20 dark:text-blue-400 hover:bg-blue-500/20 px-2.5 py-1.5 transition border-l border-black/10 dark:border-white/10"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                </button>
                            )}
                            <button
                                onClick={() => clearBlock(isBlockStart)}
                                title="Очистити всі акорди в блоці"
                                className="flex items-center justify-center bg-red-500/10 text-red-700 dark:bg-red-400/20 dark:text-red-400 hover:bg-red-500/20 px-2 py-1.5 transition border-l border-black/10 dark:border-white/10"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>

                        {!showChords && (
                            <div className="ml-auto flex shrink-0 gap-1.5">
                                <button
                                    onClick={() => copyBlockText(isBlockStart)}
                                    title="Скопіювати чистий текст блоку"
                                    className="flex items-center gap-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 px-2 py-1.5 rounded-md transition"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-70"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Текст</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : null;

                if (chars.length === 0 && (!placements || placements.length === 0)) {
                    return (
                        <div key={lineIndex} className="flex flex-col w-full border-l-2 border-black/30 dark:border-white/20 px-2 py-2 group">
                            {blockHeader}
                            <div className="flex flex-wrap items-end justify-center w-full min-h-[2em]">
                                <span 
                                    onClick={() => showChords && addChord(lineIndex, 0)}
                                    className="cursor-pointer w-full h-[2em] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center opacity-50"
                                >
                                    (пустий рядок - клікніть щоб додати акорд)
                                </span>
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
                    <div key={lineIndex} className="flex flex-col w-full px-2 py-2 group shadow-[inset_2px_0_0_rgba(0,0,0,0.3)] dark:shadow-[inset_2px_0_0_rgba(255,255,255,0.2)]">
                        {blockHeader}
                        <div 
                            className="flex flex-wrap items-end justify-center w-full min-h-[2em] cursor-text"
                            onClick={(e) => {
                                // Only trigger if clicking the empty space, not the characters
                                if (e.target === e.currentTarget && showChords) {
                                    addChord(lineIndex, line.text.length);
                                }
                            }}
                        >
                            {segments.map((seg, idx) => {
                                const isTextEmptyOrSpaces = seg.text.trim().length === 0;
                                return (
                                <span key={idx} className={`inline-flex flex-col items-start max-w-full ${isTextEmptyOrSpaces && seg.chord ? 'pr-3' : ''}`}>
                                    {showChords && (
                                        <span className="font-black leading-tight text-blue-700 dark:text-blue-400 whitespace-pre flex items-center justify-center relative group/chord" style={{ fontSize: `calc(min(${4.5 * fontScale}vw, ${34.56 * fontScale}px))`, minHeight: '1.2em' }}>
                                            {seg.chord && (
                                                <>
                                                    <button onClick={() => moveChord(lineIndex, seg.pIdx, -1)} className="absolute right-full opacity-0 group-hover/chord:opacity-100 px-1 hover:bg-black/10 rounded transition">&lt;</button>
                                                    <span 
                                                        onPointerDown={(e) => handlePointerDown(e, lineIndex, seg.pIdx, seg.startIndex, seg.chord)}
                                                        onClick={(e) => { e.stopPropagation(); handleChordClick(lineIndex, seg.pIdx); }} 
                                                        className={`cursor-pointer hover:underline text-center min-w-[1ch] select-none touch-none ${dragging?.lineIndex === lineIndex && dragging?.pIdx === seg.pIdx ? 'opacity-30 bg-blue-100 dark:bg-blue-900 rounded' : ''}`}
                                                    >
                                                        {seg.chord}
                                                    </span>
                                                    <button onClick={() => moveChord(lineIndex, seg.pIdx, 1)} className="absolute left-full opacity-0 group-hover/chord:opacity-100 px-1 hover:bg-black/10 rounded transition">&gt;</button>
                                                </>
                                            )}
                                        </span>
                                    )}
                                    <span className="font-black leading-tight text-black dark:text-white whitespace-pre-wrap break-words max-w-full" style={{ fontSize: `calc(min(${7.5 * fontScale}vw, ${57.6 * fontScale}px))`, minHeight: '1.2em' }}>
                                        {seg.text.split('').map((char, charOffset) => (
                                            <span 
                                                key={charOffset}
                                                data-line={lineIndex}
                                                data-char={seg.startIndex + charOffset}
                                                onClick={(e) => { e.stopPropagation(); showChords && addChord(lineIndex, seg.startIndex + charOffset); }}
                                                className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 select-none"
                                            >
                                                {char}
                                            </span>
                                        ))}
                                    </span>
                                </span>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}
