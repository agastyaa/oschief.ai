import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

export type ModelProvider = {
  id: string;
  name: string;
  models: string[];
  icon: string;
  sttOnly?: boolean;
  /** Same API key can be used for STT (e.g. Copart Genie). */
  supportsStt?: boolean;
};

export const enterpriseProviders: ModelProvider[] = [
  { id: "openai", name: "OpenAI", models: ["GPT-4o", "GPT-4o mini", "GPT-4 Turbo", "o1-preview"], icon: "🟢" },
  { id: "anthropic", name: "Anthropic (Claude)", models: ["Claude 4 Sonnet", "Claude 4 Opus", "Claude 3.5 Haiku"], icon: "🟤" },
  {
    id: "copart",
    name: "Copart Genie",
    models: [
      "GPT-4.1",
      "GPT-4o",
      "GPT-4o mini",
      "GPT-5",
      "GPT-5 mini",
      "Gemini 2.0 Flash",
      "Gemini 2.5 Flash",
      "Gemini 2.5 Pro",
      "Gemini 3 Flash Preview",
      "Gemini 3 Pro Preview",
      "Claude Haiku 4",
      "Claude Opus 4",
      "Claude Sonnet 4",
      "Opus Plan",
      "Whisper Large V3",
      "Whisper Large V3 Turbo",
    ],
    icon: "🟡",
    supportsStt: true,
  },
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
  { id: "mlx-whisper-large-v3-turbo", name: "MLX Whisper Large V3 Turbo", size: "~3 GB", type: "stt", description: "Best quality — uses Apple Neural Engine. Click Download to install (ffmpeg + mlx-whisper)." },
  { id: "mlx-whisper-large-v3-turbo-8bit", name: "MLX Whisper Large V3 Turbo (8-bit)", size: "~864 MB", type: "stt", description: "8-bit quantized — smaller, faster. Click Download to install (ffmpeg + mlx-audio-plus)." },
  { id: "thestage-whisper-apple", name: "TheStage Whisper (Apple)", size: "~2 GB", type: "stt", description: "Streaming, low power (CoreML). macOS only. Click Download to install." },
  { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", size: "1.6 GB", type: "stt", description: "Recommended — Nova-2 quality, 4x faster than Large V3" },
  { id: "whisper-large-v3", name: "Whisper Large V3", size: "3.1 GB", type: "stt", description: "Best accuracy, slower" },
  { id: "whisper-medium", name: "Whisper Medium", size: "1.5 GB", type: "stt", description: "Good balance of speed and accuracy" },
  { id: "whisper-small", name: "Whisper Small", size: "488 MB", type: "stt", description: "Fast, moderate accuracy" },
  { id: "whisper-tiny", name: "Whisper Tiny", size: "77 MB", type: "stt", description: "Fastest, basic accuracy" },
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
  connectedProviders: Record<string, { connected: boolean; apiKey: string }>;
  setConnectedProviders: React.Dispatch<React.SetStateAction<Record<string, { connected: boolean; apiKey: string }>>>;
  connectProvider: (providerId: string, apiKey: string) => Promise<void>;
  disconnectProvider: (providerId: string) => Promise<void>;
  useLocalModels: boolean;
  setUseLocalModels: (v: boolean) => void;
  getActiveAIModelLabel: () => string;
  getAvailableAIModels: () => { value: string; label: string; group: string }[];
  appleFoundationAvailable: boolean;
  copartFetchedModels: { models: string[]; sttModels: string[] } | null;
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
  const [copartFetchedModels, setCopartFetchedModels] = useState<{ models: string[]; sttModels: string[] } | null>(null);
  const [appleFoundationAvailable, setAppleFoundationAvailable] = useState(false);
  const [modelsListFetched, setModelsListFetched] = useState(false);

  // Apple (on-device) Foundation Model availability
  useEffect(() => {
    if (!api?.app?.isAppleFoundationAvailable) return;
    api.app.isAppleFoundationAvailable().then(setAppleFoundationAvailable).catch(() => setAppleFoundationAvailable(false));
  }, [api]);

  // Fetch Copart Genie models when connected
  useEffect(() => {
    if (!api?.copart?.listModels || !connectedProviders.copart?.connected) {
      setCopartFetchedModels(null);
      return;
    }
    api.copart.listModels().then(({ models, sttModels }) => {
      setCopartFetchedModels({
        models: models.map((m) => m.id),
        sttModels: sttModels.map((m) => m.id),
      });
    }).catch(() => setCopartFetchedModels(null));
  }, [api, connectedProviders.copart?.connected]);

  // Sync download states from Electron main process on mount
  useEffect(() => {
    if (!api) return;

    api.models.list().then((downloaded) => {
      const states: Record<string, DownloadState> = {};
      for (const id of downloaded) states[id] = "downloaded";
      setDownloadStates((prev) => ({ ...prev, ...states }));
      setModelsListFetched(true);
    });

    // Load API keys from keychain
    for (const provider of enterpriseProviders) {
      api.keychain.get(provider.id).then((key) => {
        if (key) {
          setConnectedProviders((prev) => ({
            ...prev,
            [provider.id]: { connected: true, apiKey: key },
          }));
        }
      });
    }
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
        if (data.modelId === "whisper-tiny") {
          setSelectedSTTModel((prev) => (prev === "" ? "local:whisper-tiny" : prev));
        }
        if (data.modelId === "gemma-2-2b") {
          setSelectedAIModel((prev) => (prev === "" ? "local:gemma-2-2b" : prev));
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
    if (!api) return;
    api.db.settings.get('model-settings').then((raw: string | null) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.selectedAIModel) setSelectedAIModel((prev: string) => prev || data.selectedAIModel);
        if (data.selectedSTTModel) setSelectedSTTModel((prev: string) => prev || data.selectedSTTModel);
        if (data.useLocalModels !== undefined) setUseLocalModels(data.useLocalModels);
        if (data.downloadStates) setDownloadStates((prev) => ({ ...prev, ...data.downloadStates }));
        if (data.connectedProviders) setConnectedProviders((prev) => ({ ...prev, ...data.connectedProviders }));
        if (Array.isArray(data.hiddenLocalModels)) setHiddenLocalModels(data.hiddenLocalModels);
      } catch { /* ignore corrupt data */ }
    });
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
        const success = await api.models.installMLXWhisper();
        if (success) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("MLX Whisper ready (ffmpeg + mlx-whisper installed)");
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("MLX Whisper install failed. Install Python 3, then: brew install ffmpeg && pip3 install mlx-whisper");
        }
      } catch (err) {
        console.error('MLX Whisper install failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("MLX Whisper install failed. Ensure Python 3 is installed.");
      }
      return;
    }
    if (modelId === 'mlx-whisper-large-v3-turbo-8bit' && api) {
      try {
        const success = api.models.installMLXWhisper8Bit ? await api.models.installMLXWhisper8Bit() : false;
        if (success) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("MLX Whisper 8-bit ready (ffmpeg + mlx-audio-plus installed)");
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("8-bit install failed. Run: brew install ffmpeg && pip3 install mlx-audio-plus");
        }
      } catch (err) {
        console.error('MLX Whisper 8-bit install failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("MLX Whisper 8-bit install failed. Ensure Python 3 is installed.");
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
  const DEFAULT_STT = "whisper-tiny";
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
  useEffect(() => {
    const data = { selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders, hiddenLocalModels };
    saveToStorage(data);
    if (api) {
      api.db.settings.set('model-settings', JSON.stringify(data)).catch(console.error);
    }
  }, [selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders, hiddenLocalModels]);

  const handleDeleteModel = useCallback((modelId: string) => {
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
      api.models.delete(modelId).catch(console.error);
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
    const provider = enterpriseProviders.find((p) => p.id === providerId);
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
        const provider = enterpriseProviders.find((p) => p.id === pid);
        if (!provider || provider.sttOnly) return;
        const aiModels =
          pid === "copart" && copartFetchedModels?.models?.length
            ? copartFetchedModels.models
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
        handleDownload, handleDeleteModel,
        connectedProviders, setConnectedProviders,
        connectProvider, disconnectProvider,
        useLocalModels, setUseLocalModels,
        getActiveAIModelLabel, getAvailableAIModels,
        appleFoundationAvailable,
        copartFetchedModels,
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
