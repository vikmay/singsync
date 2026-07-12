import { useRef, useEffect, useCallback } from 'react';

export function useHoldRepeat(action: () => void, initialDelay = 300, repeatInterval = 50) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const actionRef = useRef(action);
    
    // Keep action ref updated so we don't need it in deps
    useEffect(() => {
        actionRef.current = action;
    }, [action]);

    const start = useCallback((e: React.PointerEvent) => {
        // e.preventDefault(); // Sometimes needed to prevent mobile text selection, but breaks pointer events in some cases. CSS is better.
        actionRef.current();
        
        if (timerRef.current) clearTimeout(timerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);

        timerRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                actionRef.current();
            }, repeatInterval);
        }, initialDelay);
    }, [initialDelay, repeatInterval]);

    const stop = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, []);

    useEffect(() => stop, [stop]);

    return {
        onPointerDown: start,
        onPointerUp: stop,
        onPointerLeave: stop,
        onPointerCancel: stop,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties
    };
}
