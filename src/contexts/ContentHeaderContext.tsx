import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface ContentHeaderConfig {
  title?: string;
  backLabel?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  fullWidth?: boolean;
  hideAskBar?: boolean;
  /** Hide the default content header entirely (page renders its own) */
  hideHeader?: boolean;
}

interface ContentHeaderContextValue {
  config: ContentHeaderConfig;
  setConfig: (config: ContentHeaderConfig) => void;
  clearConfig: () => void;
}

const ContentHeaderContext = createContext<ContentHeaderContextValue | null>(null);

export function ContentHeaderProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<ContentHeaderConfig>({});

  const setConfig = useCallback((c: ContentHeaderConfig) => {
    setConfigState(c);
  }, []);

  const clearConfig = useCallback(() => {
    setConfigState({});
  }, []);

  return (
    <ContentHeaderContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </ContentHeaderContext.Provider>
  );
}

/** Pages call this to declare their header configuration. Clears on unmount. */
export function useContentHeader(config: ContentHeaderConfig) {
  const ctx = useContext(ContentHeaderContext);
  if (!ctx) throw new Error("useContentHeader must be used within ContentHeaderProvider");

  useEffect(() => {
    ctx.setConfig(config);
    return () => ctx.clearConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify({ title: config.title, backLabel: config.backLabel, fullWidth: config.fullWidth, hideAskBar: config.hideAskBar, hideHeader: config.hideHeader })]);
}

export function useContentHeaderConfig() {
  const ctx = useContext(ContentHeaderContext);
  if (!ctx) throw new Error("useContentHeaderConfig must be used within ContentHeaderProvider");
  return ctx.config;
}
