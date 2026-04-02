import { useState, useCallback, useRef, useEffect } from "react";

const DEFAULT_TRANSCRIPT_WIDTH = 352; // 22rem
const MIN_TRANSCRIPT_WIDTH = 240;
const MAX_TRANSCRIPT_WIDTH = 480;

interface UseResizablePanelOptions {
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizablePanel({
  storageKey,
  defaultWidth = DEFAULT_TRANSCRIPT_WIDTH,
  minWidth = MIN_TRANSCRIPT_WIDTH,
  maxWidth = MAX_TRANSCRIPT_WIDTH,
}: UseResizablePanelOptions) {
  const [width, setWidthState] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
      }
    } catch {}
    return defaultWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {}
  }, [width, storageKey]);

  // For right-side panels, dragging LEFT increases width
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setIsResizing(true);

    const onMouseMove = (ev: MouseEvent) => {
      // Dragging left (negative delta) = wider panel
      const delta = startXRef.current - ev.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidthState(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width, minWidth, maxWidth]);

  return { width, isResizing, startResize };
}
