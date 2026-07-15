import { useState, useCallback, useRef, useEffect } from 'react';

export function useUndoRedo<T>(initialState: T) {
    const [state, setState] = useState<T>(initialState);
    const historyRef = useRef<T[]>([initialState]);
    const indexRef = useRef<number>(0);
    
    const setWithHistory = useCallback((newState: T | ((prev: T) => T)) => {
        const prev = historyRef.current[indexRef.current];
        const resolved = typeof newState === 'function' ? (newState as Function)(prev) : newState;
        
        // If the state didn't actually change, do nothing
        if (resolved === prev) return;
        
        // Slice off any future history if we were in the middle of an undo
        const history = historyRef.current.slice(0, indexRef.current + 1);
        history.push(resolved);
        
        // Limit history size to prevent memory leaks (e.g., 50 states)
        if (history.length > 50) {
            history.shift();
        }
        
        historyRef.current = history;
        indexRef.current = history.length - 1;
        
        setState(resolved);
    }, []);

    const undo = useCallback(() => {
        if (indexRef.current > 0) {
            indexRef.current -= 1;
            setState(historyRef.current[indexRef.current]);
        }
    }, []);

    const redo = useCallback(() => {
        if (indexRef.current < historyRef.current.length - 1) {
            indexRef.current += 1;
            setState(historyRef.current[indexRef.current]);
        }
    }, []);
    
    // Support keyboard shortcuts (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if we are typing inside standard input fields (other than our textarea)
            // Actually, we want to catch Ctrl+Z even inside textarea so we preventDefault.
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Initial state setter that replaces history (useful when loading data initially)
    const resetHistory = useCallback((newState: T) => {
        historyRef.current = [newState];
        indexRef.current = 0;
        setState(newState);
    }, []);

    return { 
        state, 
        setWithHistory, 
        undo, 
        redo, 
        canUndo: indexRef.current > 0, 
        canRedo: indexRef.current < historyRef.current.length - 1, 
        resetHistory,
        debugIndex: indexRef.current,
        debugLength: historyRef.current.length
    };
}
