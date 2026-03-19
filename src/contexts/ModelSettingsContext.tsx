import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from "react";
import { toast } from "sonner";
import { isElectron, getElectronAPI, type LocalSetupResult } from "@/lib/electron-api";

function setupToastDescription(r: LocalSetupResult): string {
  const lines = [...r.steps]
  if (r.error) lines.push("", r.error)
  if (r.hint) lines.push("", r.hint)
  return lines.join("\n")
}

export type ModelProvider = {
  id: string;
  name: string;
  models: string[];
  icon: string;
  sttOnly?: boolean;
  /** Same API key can be used for STT when the provider supports it. */
  supportsStt?: boolean;
};

export const enterpriseProviders: ModelProvider[] = [
  { id: "openai", name: "OpenAI", models: ["GPT-4o", "GPT-4o mini", "GPT-4 Turbo", "o1-preview"], icon: "🟢" },
  { id: "anthropic", name: "Anthropic (Claude)", models: ["Claude 4 Sonnet", "Claude 4 Opus", "Claude 3.5 Haiku"], icon: "🟤" },
  { id: "google", name: "Google (Gemini)", models: ["Gemini 2.5 Pro", "Gemini 2.5 Flash", "Gemini 2.0 Flash"], icon: "🔵" },
  { id: "deepgram", name: "Deepgram", models: ["Nova-2", "Nova-2 Medical", "Nova-2 Meeting"], icon: "🟣", sttOnly: true },
  { id: "assemblyai", name: "AssemblyAI", models: ["Universal-2", "Nano"], icon: "🔴", sttOnly: true },
  { id: "groq", name: "Groq", models: ["Llama 3.3 70B", "Mixtral 8x7B", "Whisper Large V3"], icon: "🟠" },
];

export type LocalModel = {
  id: string;
  name: string;
  size: string;
  type: "stt" | "llm";
  description: string;
};

export const localModels: LocalModel[] = [
  { id: "mlx-whisper-large-v3-turbo", name: "MLX Whisper Large V3 Turbo", size: "~3 GB", type: "stt", description: "Apple Silicon — Syag auto-installs ffmpeg (Homebrew) + pip package; toasts show each step" },
  { id: "mlx-whisper-large-v3-turbo-8bit", name: "MLX Whisper Large V3 Turbo (8-bit)", size: "~864 MB", type: "stt", description: "Smaller MLX build — same auto steps (ffmpeg + pip); step-by-step toasts" },
  { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", size: "1.6 GB", type: "stt", description: "Recommended — model download + whisper-cli setup (build or Homebrew); toasts list progress" },
  { id: "llama-3.2-3b", name: "Llama 3.2 3B", size: "2.0 GB", type: "llm", description: "Compact local LLM" },
  { id: "phi-3-mini", name: "Phi-3 Mini", size: "2.3 GB", type: "llm", description: "Microsoft's efficient model" },
  { id: "gemma-2-2b", name: "Gemma 2 2B", size: "1.6 GB", type: "llm", description: "Google's lightweight model" },
];

type DownloadState = "idle" | "downloading" | "downloaded";
type DownloadProgress = { percent: number; bytesDownloaded: number; totalBytes: number };

const LS_KEY = "syag-model-settings";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveToStorage(data: {
  selectedAIModel: string;
  selectedSTTModel: string;
  useLocalModels: boolean;
  downloadStates: Record<string, DownloadState>;
  connectedProviders: Record<string, { connected: boolean; apiKey: string }>;
  hiddenLocalModels?: string[];
}) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}

interface ModelSettingsContextType {
  selectedAIModel: string;
  setSelectedAIModel: (model: string) => void;
  selectedSTTModel: string;
  setSelectedSTTModel: (model: string) => void;
  downloadStates: Record<string, DownloadState>;
  downloadProgress: Record<string, DownloadProgress>;
  handleDownload: (modelId: string) => void;
  handleDeleteModel: (modelId: string) => void;
  handleRepairModel: (modelId: string) => void;
  connectedProviders: Record<string, { connected: boolean; apiKey: string }>;
  setConnectedProviders: React.Dispatch<React.SetStateAction<Record<string, { connected: boolean; apiKey: string }>>>;
  connectProvider: (providerId: string, apiKey: string) => Promise<void>;
  disconnectProvider: (providerId: string) => Promise<void>;
  useLocalModels: boolean;
  setUseLocalModels: (v: boolean) => void;
  getActiveAIModelLabel: () => string;
  getAvailableAIModels: () => { value: string; label: string; group: string }[];
  appleFoundationAvailable: boolean;
  effectiveProviders: ModelProvider[];
  optionalProviderIds: string[];
  optionalFetchedModels: Record<string, { models: string[]; sttModels: string[] }>;
}

const ModelSettingsContext = createContext<ModelSettingsContextType | null>(null);

const defaults = {
  selectedAIModel: "",
  selectedSTTModel: "",
  useLocalModels: true,
  downloadStates: {} as Record<string, DownloadState>,
  connectedProviders: {} as Record<string, { connected: boolean; apiKey: string }>,
  hiddenLocalModels: [] as string[],
};

export function ModelSettingsProvider({ children }: { children: ReactNode }) {
  const api = getElectronAPI();
  const stored = loadFromStorage();
  const init = stored || defaults;

  const [selectedAIModel, setSelectedAIModel] = useState(init.selectedAIModel);
  const [selectedSTTModel, setSelectedSTTModel] = useState(init.selectedSTTModel);
  const [useLocalModels, setUseLocalModels] = useState(init.useLocalModels);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>(init.downloadStates);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadProgress>>({});
  const [connectedProviders, setConnectedProviders] = useState<Record<string, { connected: boolean; apiKey: string }>>(init.connectedProviders);
  const [hiddenLocalModels, setHiddenLocalModels] = useState<string[]>(init.hiddenLocalModels ?? []);
  const [appleFoundationAvailable, setAppleFoundationAvailable] = useState(false);
  const [modelsListFetched, setModelsListFetched] = useState(false);
  const [dbSettingsLoaded, setDbSettingsLoaded] = useState(false);
  const [optionalProviders, setOptionalProviders] = useState<{ id: string; name: string; icon: string; supportsStt?: boolean }[]>([]);
  /** True after main process has responded with optional-provider list (may be empty). */
  const [optionalProvidersReady, setOptionalProvidersReady] = useState(false);
  const [optionalFetchedModels, setOptionalFetchedModels] = useState<Record<string, { models: string[]; sttModels: string[] }>>({});
  const lastInvalidAiPrefixToastRef = useRef<string | null>(null);

  const effectiveProviders = useMemo(
    () => [
      ...enterpriseProviders,
      ...optionalProviders.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        models: [] as string[],
        supportsStt: p.supportsStt,
      })),
    ],
    [optionalProviders]
  );

  // Apple (on-device) Foundation Model availability
  useEffect(() => {
    if (!api?.app?.isAppleFoundationAvailable) return;
    api.app.isAppleFoundationAvailable().then(setAppleFoundationAvailable).catch(() => setAppleFoundationAvailable(false));
  }, [api]);

  // Optional providers — only when user has the optional-providers files in userData
  useEffect(() => {
    if (!api?.app?.getOptionalProviders) {
      setOptionalProvidersReady(true);
      return;
    }
    api.app
      .getOptionalProviders()
      .then(setOptionalProviders)
      .catch(() => setOptionalProviders([]))
      .finally(() => setOptionalProvidersReady(true));
  }, [api]);

  /** Drop AI selection if it references a provider that isn’t built-in and isn’t loaded (e.g. copart without optional bundle). */
  useEffect(() => {
    if (!modelsListFetched || !dbSettingsLoaded || !optionalProvidersReady) return;
    const m = selectedAIModel;
    if (!m || !m.includes(":")) {
      return;
    }
    const prefix = m.split(":")[0];
    if (prefix === "local" || prefix === "apple") {
      lastInvalidAiPrefixToastRef.current = null;
      return;
    }
    const builtInAi = enterpriseProviders.filter((p) => !p.sttOnly).some((p) => p.id === prefix);
    if (builtInAi) {
      lastInvalidAiPrefixToastRef.current = null;
      return;
    }
    if (optionalProviders.some((p) => p.id === prefix)) {
      lastInvalidAiPrefixToastRef.current = null;
      return;
    }
    if (lastInvalidAiPrefixToastRef.current === prefix) return;
    lastInvalidAiPrefixToastRef.current = prefix;
    setSelectedAIModel("");
    toast.error("Previous AI model isn’t available", {
      description: `“${prefix}” isn’t loaded (optional providers live in Application Support → Syag → optional-providers). Choose another model under Settings → AI Models.`,
      duration: 12_000,
    });
  }, [
    selectedAIModel,
    optionalProviders,
    optionalProvidersReady,
    modelsListFetched,
    dbSettingsLoaded,
  ]);

  // Load keychain for optional providers when they become available
  useEffect(() => {
    if (!api?.keychain || optionalProviders.length === 0) return;
    for (const p of optionalProviders) {
      api.keychain.get(p.id).then((key) => {
        if (key) {
          setConnectedProviders((prev) => ({
            ...prev,
            [p.id]: { connected: true, apiKey: key },
          }));
        }
      });
    }
  }, [api, optionalProviders]);

  // Fetch models for each connected optional provider
  useEffect(() => {
    if (!api?.app?.invokeOptionalProvider || optionalProviders.length === 0) return;
    for (const p of optionalProviders) {
      if (!connectedProviders[p.id]?.connected) continue;
      api.app.invokeOptionalProvider(p.id, 'listModels').then((res: { models?: { id: string }[]; sttModels?: { id: string }[] }) => {
        if (res?.models || res?.sttModels) {
          setOptionalFetchedModels((prev) => ({
            ...prev,
            [p.id]: {
              models: (res.models || []).map((m) => m.id),
              sttModels: (res.sttModels || []).map((m) => m.id),
            },
          }));
        }
      }).catch(() => {
        setOptionalFetchedModels((prev) => {
          const next = { ...prev };
          delete next[p.id];
          return next;
        });
      });
    }
  }, [api, optionalProviders, connectedProviders]);

  // Sync download states from Electron main process on mount
  useEffect(() => {
    if (!api) return;

    api.models.list().then((downloaded: string[]) => {
      const onDisk = new Set(downloaded);
      setDownloadStates((prev) => {
        const next = { ...prev };
        // Mark models found on disk as downloaded
        for (const id of downloaded) next[id] = "downloaded";
        // Clear stale "downloaded" state for binary models NOT on disk
        // (MLX models are checked separately, so skip those)
        const mlxIds = new Set(['mlx-whisper-large-v3-turbo', 'mlx-whisper-large-v3-turbo-8bit', 'thestage-whisper-apple']);
        for (const lm of localModels) {
          if (!mlxIds.has(lm.id) && !onDisk.has(lm.id) && next[lm.id] === 'downloaded') {
            delete next[lm.id];
          }
        }
        return next;
      });
      setModelsListFetched(true);
    });

    // Load API keys from keychain (effectiveProviders includes optional providers when loaded)
    const loadKeychain = (providers: ModelProvider[]) => {
      for (const provider of providers) {
        api.keychain.get(provider.id).then((key) => {
          if (key) {
            setConnectedProviders((prev) => ({
              ...prev,
              [provider.id]: { connected: true, apiKey: key },
            }));
          }
        });
      }
    };
    loadKeychain(enterpriseProviders);
  }, []);

  // Listen for download progress from main process
  useEffect(() => {
    if (!api) return;

    const cleanupProgress = api.models.onDownloadProgress((progress) => {
      setDownloadProgress((prev) => ({
        ...prev,
        [progress.modelId]: {
          percent: progress.percent,
          bytesDownloaded: progress.bytesDownloaded,
          totalBytes: progress.totalBytes,
        },
      }));
    });

    const cleanupComplete = api.models.onDownloadComplete((data) => {
      if (data.success) {
        setDownloadStates((prev) => ({ ...prev, [data.modelId]: "downloaded" }));
        // Auto-select default models when installed on first launch
        if (data.modelId === "whisper-large-v3-turbo") {
          setSelectedSTTModel((prev) => (prev === "" ? "local:whisper-large-v3-turbo" : prev));
        }
        if (data.modelId === "gemma-2-2b") {
          setSelectedAIModel((prev) => (prev === "" ? "local:gemma-2-2b" : prev));
        }
        if (data.modelId === "whisper-large-v3-turbo" && data.whisperCli) {
          const r = data.whisperCli
          const desc = setupToastDescription(r)
          if (r.ok) {
            toast.success("Whisper model + speech CLI ready", {
              description: desc,
              duration: 14_000,
            })
          } else {
            toast.warning("Model file saved — speech CLI still needed", {
              description: desc,
              duration: 22_000,
            })
          }
        }
      } else {
        setDownloadStates((prev) => {
          const next = { ...prev };
          delete next[data.modelId];
          return next;
        });
        console.error(`Download failed for ${data.modelId}:`, data.error);
      }
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[data.modelId];
        return next;
      });
    });

    return () => {
      cleanupProgress();
      cleanupComplete();
    };
  }, []);

  // Load settings from Electron DB on mount (localStorage may be empty in production Electron)
  useEffect(() => {
    if (!api) { setDbSettingsLoaded(true); return; }
    api.db.settings.get('model-settings').then((raw: string | null) => {
      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data.selectedAIModel) setSelectedAIModel((prev: string) => prev || data.selectedAIModel);
          if (data.selectedSTTModel) setSelectedSTTModel((prev: string) => prev || data.selectedSTTModel);
          if (data.useLocalModels !== undefined) setUseLocalModels(data.useLocalModels);
          if (data.downloadStates) setDownloadStates((prev) => ({ ...prev, ...data.downloadStates }));
          if (data.connectedProviders) setConnectedProviders((prev) => ({ ...prev, ...data.connectedProviders }));
          if (Array.isArray(data.hiddenLocalModels)) setHiddenLocalModels(data.hiddenLocalModels);
        } catch { /* ignore corrupt data */ }
      }
      setDbSettingsLoaded(true);
    }).catch(() => setDbSettingsLoaded(true));
  }, []);

  // Check if MLX Whisper and MLX 8-bit are installed on mount; don't show as downloaded if user removed them
  useEffect(() => {
    if (!api) return;
    Promise.all([
      api.models.checkMLXWhisper(),
      api.models.checkMLXWhisper8Bit?.(),
      api.models.checkTheStageWhisper?.(),
    ]).then(([mlxAvailable, mlx8BitAvailable, thestageAvailable]) => {
      setDownloadStates((prev) => {
        const next = { ...prev };
        if (mlxAvailable && !hiddenLocalModels.includes('mlx-whisper-large-v3-turbo')) next['mlx-whisper-large-v3-turbo'] = 'downloaded';
        if (mlx8BitAvailable && !hiddenLocalModels.includes('mlx-whisper-large-v3-turbo-8bit')) next['mlx-whisper-large-v3-turbo-8bit'] = 'downloaded';
        if (thestageAvailable && !hiddenLocalModels.includes('thestage-whisper-apple')) next['thestage-whisper-apple'] = 'downloaded';
        return next;
      });
    }).catch(() => {});
  }, [hiddenLocalModels]);

  const handleDownload = useCallback(async (modelId: string) => {
    setDownloadStates((prev) => ({ ...prev, [modelId]: "downloading" }));

    if (modelId === 'mlx-whisper-large-v3-turbo' && api) {
      try {
        const result = await api.models.installMLXWhisper();
        if (result.ok) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("MLX Whisper ready", {
            description: setupToastDescription(result),
            duration: 14_000,
          });
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("MLX Whisper install did not finish", {
            description: setupToastDescription(result),
            duration: 22_000,
          });
        }
      } catch (err) {
        console.error('MLX Whisper install failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("MLX Whisper install failed", {
          description: err instanceof Error ? err.message : "Ensure Python 3 and pip are available.",
          duration: 12_000,
        });
      }
      return;
    }
    if (modelId === 'mlx-whisper-large-v3-turbo-8bit' && api) {
      try {
        const result = api.models.installMLXWhisper8Bit ? await api.models.installMLXWhisper8Bit() : { ok: false, steps: [], error: "Not available" };
        if (result.ok) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("MLX Whisper 8-bit ready", {
            description: setupToastDescription(result),
            duration: 14_000,
          });
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("MLX 8-bit install did not finish", {
            description: setupToastDescription(result),
            duration: 22_000,
          });
        }
      } catch (err) {
        console.error('MLX Whisper 8-bit install failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("MLX 8-bit install failed", {
          description: err instanceof Error ? err.message : "Ensure Python 3 and pip are available.",
          duration: 12_000,
        });
      }
      return;
    }
    if (modelId === 'thestage-whisper-apple' && api) {
      try {
        const success = api.models.installTheStageWhisper ? await api.models.installTheStageWhisper() : false;
        if (success) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("TheStage Whisper ready (macOS)");
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("TheStage Whisper is macOS only. On Mac run: pip3 install thestage-speechkit[apple]");
        }
      } catch (err) {
        console.error('TheStage Whisper install failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("TheStage Whisper install failed. Ensure Python 3 is installed (macOS only).");
      }
      return;
    }

    if (api) {
      api.models.download(modelId).catch((err) => {
        console.error('Download failed:', err);
        setDownloadStates((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      });
    } else {
      setTimeout(() => {
        setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
      }, 3000);
    }
  }, [api]);

  // Install default local STT + LLM on first launch after onboarding (Quill-style).
  const DEFAULT_STT = "whisper-large-v3-turbo";
  const DEFAULT_LLM = "gemma-2-2b";
  useEffect(() => {
    if (!api || !modelsListFetched) return;
    if (typeof localStorage !== "undefined" && localStorage.getItem("syag-onboarding-complete") !== "true") return;

    api.db.settings.get("default-local-models-install-started").then((flag) => {
      if (flag === "true") return;
      const hasSTT = localModels.some((m) => m.type === "stt" && downloadStates[m.id] === "downloaded");
      const hasLLM = localModels.some((m) => m.type === "llm" && downloadStates[m.id] === "downloaded");
      if (hasSTT && hasLLM) return;

      api.db.settings.set("default-local-models-install-started", "true").then(() => {
        setUseLocalModels(true);
        if (!hasSTT) handleDownload(DEFAULT_STT);
        if (!hasLLM) handleDownload(DEFAULT_LLM);
      });
    });
  }, [api, modelsListFetched, downloadStates, handleDownload]);

  // Only auto-select a local STT model when "Use local by default" is on.
  // Prefer whisper.cpp models over MLX (MLX uses a Python worker that often times out).
  useEffect(() => {
    if (!useLocalModels || selectedSTTModel) return;
    const downloadedSTT = localModels.filter(m => m.type === 'stt' && downloadStates[m.id] === 'downloaded');
    if (downloadedSTT.length === 0) return;
    const preferWhisperCpp = downloadedSTT.find(m => m.id !== 'mlx-whisper-large-v3-turbo' && m.id !== 'mlx-whisper-large-v3-turbo-8bit' && m.id !== 'thestage-whisper-apple') ?? downloadedSTT[0];
    setSelectedSTTModel(`local:${preferWhisperCpp.id}`);
  }, [useLocalModels, downloadStates, selectedSTTModel]);

  // Persist to BOTH localStorage and DB so sync load always works
  // IMPORTANT: Only persist AFTER initial data has been fully loaded from filesystem + DB
  // to avoid overwriting saved states with empty defaults on mount
  useEffect(() => {
    if (!modelsListFetched || !dbSettingsLoaded) return;
    const data = { selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders, hiddenLocalModels };
    saveToStorage(data);
    if (api) {
      api.db.settings.set('model-settings', JSON.stringify(data)).catch(console.error);
    }
  }, [selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders, hiddenLocalModels, modelsListFetched, dbSettingsLoaded]);

  const handleDeleteModel = useCallback(async (modelId: string) => {
    setDownloadStates((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
    // If the deleted model was selected for STT or AI, clear selection so we don't keep using it
    setSelectedSTTModel((prev) => (prev === `local:${modelId}` ? "" : prev));
    setSelectedAIModel((prev) => (prev === `local:${modelId}` ? "" : prev));
    // MLX is re-detected on load; hide it so it doesn't reappear until user downloads again
    if (modelId === 'mlx-whisper-large-v3-turbo' || modelId === 'mlx-whisper-large-v3-turbo-8bit' || modelId === 'thestage-whisper-apple') {
      setHiddenLocalModels((prev) => (prev.includes(modelId) ? prev : [...prev, modelId]));
    }
    if (api) {
      // MLX models: full uninstall (pip uninstall + remove HuggingFace cache)
      if (modelId === 'mlx-whisper-large-v3-turbo' && api.models.uninstallMLXWhisper) {
        try {
          const result = await api.models.uninstallMLXWhisper();
          if (result.ok) toast.success("MLX Whisper uninstalled and cache cleared");
          if (result.error) console.warn('MLX uninstall note:', result.error);
        } catch (err) { console.error('MLX uninstall error:', err); }
      } else if (modelId === 'mlx-whisper-large-v3-turbo-8bit' && api.models.uninstallMLXWhisper8Bit) {
        try {
          const result = await api.models.uninstallMLXWhisper8Bit();
          if (result.ok) toast.success("MLX 8-bit uninstalled and cache cleared");
          if (result.error) console.warn('MLX 8-bit uninstall note:', result.error);
        } catch (err) { console.error('MLX 8-bit uninstall error:', err); }
      } else {
        api.models.delete(modelId).catch(console.error);
      }
    }
  }, [api]);

  const handleRepairModel = useCallback(async (modelId: string) => {
    if (!api) return;
    setDownloadStates((prev) => ({ ...prev, [modelId]: "downloading" }));
    try {
      let result: { ok: boolean; error?: string } = { ok: false, error: 'Unknown model' };
      if (modelId === 'mlx-whisper-large-v3-turbo' && api.models.repairMLXWhisper) {
        result = await api.models.repairMLXWhisper();
      } else if (modelId === 'mlx-whisper-large-v3-turbo-8bit' && api.models.repairMLXWhisper8Bit) {
        result = await api.models.repairMLXWhisper8Bit();
      }
      if (result.ok) {
        setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
        toast.success("MLX Whisper repaired successfully");
      } else {
        setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
        toast.error(`Repair failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
      toast.error(`Repair failed: ${err.message || 'Unknown error'}`);
    }
  }, [api]);

  const connectProvider = useCallback(async (providerId: string, apiKey: string) => {
    if (api) {
      await api.keychain.set(providerId, apiKey);
    }
    setConnectedProviders((prev) => ({
      ...prev,
      [providerId]: { connected: true, apiKey },
    }));
  }, [api]);

  const disconnectProvider = useCallback(async (providerId: string) => {
    if (api) {
      await api.keychain.delete(providerId);
    }
    setConnectedProviders((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  }, [api]);

  const getActiveAIModelLabel = (): string => {
    if (selectedAIModel.startsWith("apple:")) return "Apple (on-device)";
    if (selectedAIModel.startsWith("local:")) {
      const id = selectedAIModel.replace("local:", "");
      const m = localModels.find((lm) => lm.id === id);
      return m ? m.name : "Local";
    }
    const [providerId, ...rest] = selectedAIModel.split(":");
    const modelName = rest.join(":");
    const provider = effectiveProviders.find((p) => p.id === providerId);
    return provider ? `${modelName}` : selectedAIModel;
  };

  const getAvailableAIModels = () => {
    const models: { value: string; label: string; group: string }[] = [];
    const isDarwin = api?.app?.getPlatform?.() === "darwin";
    if (appleFoundationAvailable) {
      models.push({ value: "apple:foundation", label: "Apple (on-device)", group: "System" });
    } else if (isDarwin) {
      models.push({ value: "apple:foundation", label: "Apple (on-device) (requires macOS 26+)", group: "System" });
    }
    localModels
      .filter((m) => m.type === "llm" && downloadStates[m.id] === "downloaded")
      .forEach((m) => models.push({ value: `local:${m.id}`, label: `${m.name} (Local)`, group: "Local" }));
    Object.entries(connectedProviders)
      .filter(([_, v]) => v.connected)
      .forEach(([pid]) => {
        const provider = effectiveProviders.find((p) => p.id === pid);
        if (!provider || provider.sttOnly) return;
        const fetched = optionalFetchedModels[pid];
        const aiModels =
          fetched?.models?.length
            ? fetched.models
            : provider.supportsStt
              ? provider.models.filter((m) => !m.toLowerCase().includes("whisper"))
              : provider.models;
        aiModels.forEach((m) =>
          models.push({ value: `${pid}:${m}`, label: m, group: provider.name })
        );
      });
    return models;
  };

  return (
    <ModelSettingsContext.Provider
      value={{
        selectedAIModel, setSelectedAIModel,
        selectedSTTModel, setSelectedSTTModel,
        downloadStates, downloadProgress,
        handleDownload, handleDeleteModel, handleRepairModel,
        connectedProviders, setConnectedProviders,
        connectProvider, disconnectProvider,
        useLocalModels, setUseLocalModels,
        getActiveAIModelLabel, getAvailableAIModels,
        appleFoundationAvailable,
        effectiveProviders,
        optionalProviderIds: optionalProviders.map((p) => p.id),
        optionalFetchedModels,
      }}
    >
      {children}
    </ModelSettingsContext.Provider>
  );
}

export function useModelSettings() {
  const ctx = useContext(ModelSettingsContext);
  if (!ctx) throw new Error("useModelSettings must be used within ModelSettingsProvider");
  return ctx;
}
