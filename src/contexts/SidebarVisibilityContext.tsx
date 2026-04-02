import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "syag_sidebar_open";
const WIDTH_STORAGE_KEY = "syag_sidebar_width";
const DEFAULT_WIDTH = 192; // w-48
const MIN_WIDTH = 160;
const MAX_WIDTH = 280;

function readStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
  } catch {}
  return true;
}

function readStoredWidth(): number {
  try {
    const v = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

interface SidebarVisibilityContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isResizing: boolean;
  startResize: (e: React.MouseEvent) => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibilityContextValue | null>(null);

export function SidebarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpenState] = useState(readStored);
  const [sidebarWidth, setSidebarWidthState] = useState(readStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpenState((prev) => !prev);
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    setIsResizing(true);

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setSidebarWidthState(newWidth);
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
  }, [sidebarWidth]);

  const value = React.useMemo(
    () => ({ sidebarOpen, setSidebarOpen, toggleSidebar, sidebarWidth, setSidebarWidth, isResizing, startResize }),
    [sidebarOpen, setSidebarOpen, toggleSidebar, sidebarWidth, setSidebarWidth, isResizing, startResize]
  );

  return (
    <SidebarVisibilityContext.Provider value={value}>
      {children}
    </SidebarVisibilityContext.Provider>
  );
}

export function useSidebarVisibility() {
  const ctx = useContext(SidebarVisibilityContext);
  if (!ctx) throw new Error("useSidebarVisibility must be used within SidebarVisibilityProvider");
  return ctx;
}
