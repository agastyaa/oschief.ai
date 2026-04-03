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
  { id: "openrouter", name: "OpenRouter", models: [], icon: "🌐" },
  { id: "deepgram", name: "Deepgram", models: ["Nova-2", "Nova-2 Medical", "Nova-2 Meeting"], icon: "🟣", sttOnly: true },
  { id: "microsoft", name: "Microsoft (MAI-Transcribe-1)", models: ["MAI-Transcribe-1"], icon: "🔷", sttOnly: true, supportsStt: true },
  { id: "assemblyai", name: "AssemblyAI", models: ["Universal-2", "Nano"], icon: "🔴", sttOnly: true },
  { id: "groq", name: "Groq", models: ["Whisper Large V3"], icon: "🟠", sttOnly: true, supportsStt: true },
  // For STT, users can also use OpenAI Whisper via openai key in keychain (legacy support for existing STT configs)
  { id: "openai", name: "OpenAI (STT)", models: ["Whisper"], icon: "🟢", sttOnly: true, supportsStt: true },
];

export type OpenRouterModel = {
  id: string;
  name: string;
  pricing?: { prompt: string; completion: string };
  context_length?: number;
};

export type CustomProviderConfig = {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
  models: string[];
};

export type LocalModel = {
  id: string;
  name: string;
  size: string;
  type: "stt" | "llm";
  description: string;
};

export const localModels: LocalModel[] = [
  { id: "mlx-whisper-large-v3-turbo", name: "MLX Whisper Large V3 Turbo", size: "~3 GB", type: "stt", description: "Apple Silicon \u2014 auto-installs ffmpeg + pip package; best quality on-device STT" },
  { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo", size: "1.6 GB", type: "stt", description: "whisper.cpp \u2014 model download + whisper-cli setup (build or Homebrew)" },
  { id: "parakeet-coreml", name: "Parakeet CoreML (Apple Silicon)", size: "~600 MB", type: "stt", description: "NVIDIA Parakeet via CoreML — fastest on Mac (110x RTF), 6% WER, no Python needed. English only." },
  { id: "llama-3.2-3b", name: "Llama 3.2 3B", size: "2.0 GB", type: "llm", description: "Compact local LLM for summarization and chat (no internet needed)" },
  { id: "mlx-qwen3-4b", name: "Qwen3 4B (MLX)", size: "~2.5 GB", type: "llm", description: "MLX on Apple Silicon — fast 4-bit Qwen3 inference. Best quality on-device LLM." },
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

export type OllamaStatus = {
  available: boolean;
  models: string[];
  recommendedTier: { tag: string; label: string; size: string } | null;
  ramGB: number;
  pulling: string | null;
  pullPercent: number;
};

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
  ollamaStatus: OllamaStatus;
  refreshOllama: () => Promise<void>;
  pullOllamaModel: (modelTag: string) => Promise<void>;
  openRouterModels: OpenRouterModel[];
  refreshOpenRouterModels: () => Promise<void>;
  customProviders: CustomProviderConfig[];
  addCustomProvider: (config: CustomProviderConfig, apiKey: string) => Promise<void>;
  updateCustomProvider: (config: CustomProviderConfig) => Promise<void>;
  removeCustomProvider: (id: string) => Promise<void>;
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
  /** False until `isAppleFoundationAvailable()` finishes (avoids downloading GGUF before we know Apple AI exists). */
  const [appleFoundationChecked, setAppleFoundationChecked] = useState(false);
  /** Main process arch; null until fetched. */
  const [machineArch, setMachineArch] = useState<string | null>(null);
  const [modelsListFetched, setModelsListFetched] = useState(false);
  const [dbSettingsLoaded, setDbSettingsLoaded] = useState(false);
  const lastInvalidAiPrefixToastRef = useRef<string | null>(null);
  const [optionalProviders, setOptionalProviders] = useState<ModelProvider[]>([]);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
    available: false,
    models: [],
    recommendedTier: null,
    ramGB: 0,
    pulling: null,
    pullPercent: 0,
  });

  const effectiveProviders = useMemo(
    () => [...enterpriseProviders, ...optionalProviders],
    [optionalProviders]
  );

  // Apple (on-device) Foundation Model availability
  useEffect(() => {
    if (!api?.app?.isAppleFoundationAvailable) {
      setAppleFoundationChecked(true);
      return;
    }
    setAppleFoundationChecked(false);
    api.app
      .isAppleFoundationAvailable!()
      .then(setAppleFoundationAvailable)
      .catch(() => setAppleFoundationAvailable(false))
      .finally(() => setAppleFoundationChecked(true));
  }, [api]);

  useEffect(() => {
    if (!api?.app?.getArch) {
      setMachineArch("x64");
      return;
    }
    setMachineArch(null);
    api.app
      .getArch()
      .then(setMachineArch)
      .catch(() => setMachineArch("x64"));
  }, [api]);

  // Load optional providers registered via userData/optional-providers/
  useEffect(() => {
    if (!api?.app?.getOptionalProviders) return;
    api.app.getOptionalProviders().then((list) => {
      if (!list?.length) return;
      const mapped: ModelProvider[] = list.map((p) => ({
        id: p.id,
        name: p.name,
        models: [...(p.models || []), ...(p.sttModels || [])],
        icon: p.icon || "🔶",
        supportsStt: p.supportsStt,
      }));
      setOptionalProviders(mapped);
    }).catch(() => {});
  }, [api]);

  // Detect Ollama availability on mount
  const refreshOllama = useCallback(async () => {
    if (!api?.ollama) return;
    try {
      const [detection, tierInfo] = await Promise.all([
        api.ollama.detect(),
        api.ollama.recommendedTier(),
      ]);
      setOllamaStatus((prev) => ({
        ...prev,
        available: detection.available,
        models: detection.models,
        recommendedTier: tierInfo.tier,
        ramGB: tierInfo.ramGB,
      }));
    } catch {
      setOllamaStatus((prev) => ({ ...prev, available: false, models: [] }));
    }
  }, [api]);

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

  // Listen for Ollama pull progress
  useEffect(() => {
    if (!api?.ollama) return;
    const cleanup = api.ollama.onPullProgress((progress) => {
      setOllamaStatus((prev) => ({
        ...prev,
        pulling: progress.modelTag,
        pullPercent: progress.percent,
      }));
      if (progress.status === 'success' || progress.percent >= 100) {
        setOllamaStatus((prev) => ({ ...prev, pulling: null, pullPercent: 0 }));
        refreshOllama();
      }
    });
    return cleanup;
  }, [api, refreshOllama]);

  const pullOllamaModel = useCallback(async (modelTag: string) => {
    if (!api?.ollama) return;
    setOllamaStatus((prev) => ({ ...prev, pulling: modelTag, pullPercent: 0 }));
    try {
      await api.ollama.pull(modelTag);
      toast.success(`Model "${modelTag}" pulled successfully`);
      await refreshOllama();
    } catch (err: any) {
      toast.error(`Failed to pull "${modelTag}": ${err?.message ?? err}`);
    } finally {
      setOllamaStatus((prev) => ({ ...prev, pulling: null, pullPercent: 0 }));
    }
  }, [api, refreshOllama]);

  /** Drop AI selection if it references a provider that isn't known. */
  useEffect(() => {
    if (!modelsListFetched || !dbSettingsLoaded) return;
    const m = selectedAIModel;
    if (!m || !m.includes(":")) return;
    const prefix = m.split(":")[0];
    if (prefix === "local" || prefix === "apple" || prefix === "ollama") {
      lastInvalidAiPrefixToastRef.current = null;
      return;
    }
    if (effectiveProviders.some((p) => p.id === prefix)) {
      lastInvalidAiPrefixToastRef.current = null;
      return;
    }
    if (lastInvalidAiPrefixToastRef.current === prefix) return;
    lastInvalidAiPrefixToastRef.current = prefix;
    setSelectedAIModel("");
    toast.error("Previous AI model isn't available", {
      description: `Provider "${prefix}" is not recognized. Choose another model under Settings \u2192 AI Models.`,
      duration: 12_000,
    });
  }, [selectedAIModel, modelsListFetched, dbSettingsLoaded, effectiveProviders]);

  // Sync download states from Electron main process on mount
  useEffect(() => {
    if (!api) return;

    api.models.list().then((downloaded: string[]) => {
      const onDisk = new Set(downloaded);
      setDownloadStates((prev) => {
        const next = { ...prev };
        for (const id of downloaded) next[id] = "downloaded";
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

    // Load custom providers from main process
    if (api.app.listCustomProviders) {
      api.app.listCustomProviders().then((configs) => {
        if (configs?.length) setCustomProviders(configs);
      }).catch(() => {});
    }
  }, []);

  // Load OpenRouter models when connected
  useEffect(() => {
    if (!api?.app?.listOpenRouterModels) return;
    if (!connectedProviders['openrouter']?.connected) {
      setOpenRouterModels([]);
      return;
    }
    api.app.listOpenRouterModels().then((models) => {
      if (models?.length) setOpenRouterModels(models);
    }).catch(() => {});
  }, [api, connectedProviders['openrouter']?.connected]);

  // Load keychain for custom providers
  useEffect(() => {
    if (!api || customProviders.length === 0) return;
    for (const cp of customProviders) {
      api.keychain.get(cp.id).then((key) => {
        if (key) {
          setConnectedProviders((prev) => ({
            ...prev,
            [cp.id]: { connected: true, apiKey: key },
          }));
        }
      });
    }
  }, [api, customProviders]);

  // Load keychain for optional providers once they're discovered
  useEffect(() => {
    if (!api || optionalProviders.length === 0) return;
    for (const provider of optionalProviders) {
      api.keychain.get(provider.id).then((key) => {
        if (key) {
          setConnectedProviders((prev) => ({
            ...prev,
            [provider.id]: { connected: true, apiKey: key },
          }));
        }
      });
    }
  }, [api, optionalProviders]);

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
        if (data.modelId === "whisper-large-v3-turbo") {
          setSelectedSTTModel((prev) => (prev === "" ? "local:whisper-large-v3-turbo" : prev));
        }
        if (data.modelId === "llama-3.2-3b") {
          setSelectedAIModel((prev) => (prev === "" ? "local:llama-3.2-3b" : prev));
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
            toast.warning("Model file saved \u2014 speech CLI still needed", {
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
    if (modelId === 'mlx-qwen3-4b' && api) {
      try {
        const result = api.models.installMLXLLM ? await api.models.installMLXLLM() : { ok: false, error: "Not available in this build" };
        if (result.ok) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("Qwen3 4B (MLX) ready", {
            description: "On-device LLM — fast 4-bit inference on Apple Silicon.",
            duration: 8_000,
          });
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("Qwen3 4B setup failed", {
            description: result.error || "Requires macOS 14+ and Apple Silicon.",
            duration: 12_000,
          });
        }
      } catch (err) {
        console.error('MLX Qwen3 setup failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("Qwen3 4B setup failed", {
          description: err instanceof Error ? err.message : "Download error.",
          duration: 12_000,
        });
      }
      return;
    }
    if (modelId === 'parakeet-coreml' && api) {
      try {
        // CoreML Parakeet: build Swift binary + download models
        const result = api.models.installParakeetCoreML ? await api.models.installParakeetCoreML() : { ok: false, error: "Not available" };
        if (result.ok) {
          setHiddenLocalModels((prev) => prev.filter((id) => id !== modelId));
          setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
          toast.success("Parakeet CoreML ready", {
            description: "Apple Neural Engine STT — fastest on Mac, no Python needed.",
            duration: 8_000,
          });
        } else {
          setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
          toast.error("Parakeet CoreML setup failed", {
            description: result.error || "Requires macOS 14+ and Swift 6. Try Whisper instead.",
            duration: 12_000,
          });
        }
      } catch (err) {
        console.error('Parakeet CoreML setup failed:', err);
        setDownloadStates((prev) => { const n = { ...prev }; delete n[modelId]; return n; });
        toast.error("Parakeet CoreML setup failed", {
          description: err instanceof Error ? err.message : "Build error — check Swift installation.",
          duration: 12_000,
        });
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

  // Install default local STT + LLM on first launch after onboarding.
  // Apple Silicon: MLX Whisper 8-bit; else whisper.cpp. LLM: Ollama > Apple Foundation > Llama 3.2 3B GGUF.
  const DEFAULT_STT_WHISPER_CPP = "whisper-large-v3-turbo";
  const DEFAULT_STT_MLX = "mlx-whisper-large-v3-turbo-8bit";
  const DEFAULT_LLM = "llama-3.2-3b";
  useEffect(() => {
    if (!api || !modelsListFetched || !appleFoundationChecked || machineArch === null) return;
    if (typeof localStorage !== "undefined" && localStorage.getItem("syag-onboarding-complete") !== "true") return;

    api.db.settings.get("default-local-models-install-started").then((flag) => {
      if (flag === "true") return;
      const hasSTT = localModels.some((m) => m.type === "stt" && downloadStates[m.id] === "downloaded");
      const hasLLM = localModels.some((m) => m.type === "llm" && downloadStates[m.id] === "downloaded");
      const hasOllamaLLM = ollamaStatus.available && ollamaStatus.models.length > 0;
      if (hasSTT && (hasLLM || hasOllamaLLM)) return;

      const preferMlxStt = api.app.getPlatform() === "darwin" && machineArch === "arm64";
      const defaultSttId = preferMlxStt ? DEFAULT_STT_MLX : DEFAULT_STT_WHISPER_CPP;

      api.db.settings.set("default-local-models-install-started", "true").then(() => {
        setUseLocalModels(true);
        toast.info("Setting up on-device speech and AI", {
          description: "Downloading or installing models in the background. You can keep using OSChief.",
          duration: 6000,
        });
        if (!hasSTT) handleDownload(defaultSttId);
        if (hasOllamaLLM) {
          setSelectedAIModel(`ollama:${ollamaStatus.models[0]}`);
        } else if (!hasLLM) {
          if (appleFoundationAvailable) {
            setSelectedAIModel("apple:foundation");
          } else {
            handleDownload(DEFAULT_LLM);
          }
        }
      });
    });
  }, [
    api,
    modelsListFetched,
    downloadStates,
    handleDownload,
    ollamaStatus,
    appleFoundationAvailable,
    appleFoundationChecked,
    machineArch,
  ]);

  // Prefer whisper.cpp over MLX when both exist (MLX Python path can be flaky). If only MLX/TheStage, use that.
  useEffect(() => {
    if (!useLocalModels || selectedSTTModel) return;
    const downloadedSTT = localModels.filter(m => m.type === 'stt' && downloadStates[m.id] === 'downloaded');
    if (downloadedSTT.length === 0) return;
    const preferWhisperCpp = downloadedSTT.find(m => m.id !== 'mlx-whisper-large-v3-turbo' && m.id !== 'mlx-whisper-large-v3-turbo-8bit' && m.id !== 'thestage-whisper-apple') ?? downloadedSTT[0];
    setSelectedSTTModel(`local:${preferWhisperCpp.id}`);
  }, [useLocalModels, downloadStates, selectedSTTModel]);

  // If GGUF finished downloading but AI selection is still empty, select local Llama (e.g. after restore).
  useEffect(() => {
    if (!useLocalModels || !modelsListFetched || !dbSettingsLoaded) return;
    if (selectedAIModel) return;
    if (downloadStates["llama-3.2-3b"] === "downloaded") {
      setSelectedAIModel("local:llama-3.2-3b");
    }
  }, [useLocalModels, selectedAIModel, downloadStates, modelsListFetched, dbSettingsLoaded]);

  // Persist to BOTH localStorage and DB so sync load always works
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
    setSelectedSTTModel((prev) => (prev === `local:${modelId}` ? "" : prev));
    setSelectedAIModel((prev) => (prev === `local:${modelId}` ? "" : prev));
    if (modelId === 'mlx-whisper-large-v3-turbo' || modelId === 'mlx-whisper-large-v3-turbo-8bit' || modelId === 'thestage-whisper-apple') {
      setHiddenLocalModels((prev) => (prev.includes(modelId) ? prev : [...prev, modelId]));
    }
    if (api) {
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

  const refreshOpenRouterModels = useCallback(async () => {
    if (!api?.app?.refreshOpenRouterModels) return;
    try {
      const models = await api.app.refreshOpenRouterModels();
      if (models?.length) setOpenRouterModels(models);
    } catch {}
  }, [api]);

  const addCustomProviderFn = useCallback(async (config: CustomProviderConfig, apiKey: string) => {
    if (api?.app?.addCustomProvider) {
      await api.app.addCustomProvider(config);
    }
    await connectProvider(config.id, apiKey);
    setCustomProviders((prev) => [...prev.filter((p) => p.id !== config.id), config]);
  }, [api, connectProvider]);

  const updateCustomProviderFn = useCallback(async (config: CustomProviderConfig) => {
    if (api?.app?.updateCustomProvider) {
      await api.app.updateCustomProvider(config);
    }
    setCustomProviders((prev) => prev.map((p) => p.id === config.id ? config : p));
  }, [api]);

  const removeCustomProviderFn = useCallback(async (id: string) => {
    if (api?.app?.removeCustomProvider) {
      await api.app.removeCustomProvider(id);
    }
    await disconnectProvider(id);
    setCustomProviders((prev) => prev.filter((p) => p.id !== id));
  }, [api, disconnectProvider]);

  const getActiveAIModelLabel = (): string => {
    if (selectedAIModel.startsWith("apple:")) return "Apple (on-device)";
    if (selectedAIModel.startsWith("ollama:")) {
      const tag = selectedAIModel.replace("ollama:", "");
      return `${tag} (Ollama)`;
    }
    if (selectedAIModel.startsWith("local:")) {
      const id = selectedAIModel.replace("local:", "");
      const m = localModels.find((lm) => lm.id === id);
      return m ? m.name : "Local";
    }
    if (selectedAIModel.startsWith("openrouter:")) {
      const modelId = selectedAIModel.replace("openrouter:", "");
      const orModel = openRouterModels.find((m) => m.id === modelId);
      return orModel ? orModel.name : modelId;
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
    // MLX on-device models (Apple Silicon)
    if (downloadStates["mlx-qwen3-4b"] === "downloaded") {
      models.push({ value: "mlx:qwen3-4b", label: "Qwen3 4B (MLX, on-device)", group: "On-Device" });
    }
    // Ollama models (on-device, larger models)
    if (ollamaStatus.available && ollamaStatus.models.length > 0) {
      for (const tag of ollamaStatus.models) {
        models.push({ value: `ollama:${tag}`, label: `${tag}`, group: "Ollama (Local)" });
      }
    }
    localModels
      .filter((m) => m.type === "llm" && downloadStates[m.id] === "downloaded" && m.id !== "mlx-qwen3-4b")
      .forEach((m) => models.push({ value: `local:${m.id}`, label: `${m.name} (Local)`, group: "Local" }));
    // OpenRouter models grouped by sub-provider
    if (connectedProviders['openrouter']?.connected && openRouterModels.length > 0) {
      const grouped = new Map<string, OpenRouterModel[]>();
      for (const m of openRouterModels) {
        const slashIdx = m.id.indexOf('/');
        const subProvider = slashIdx > 0 ? m.id.slice(0, slashIdx) : 'other';
        if (!grouped.has(subProvider)) grouped.set(subProvider, []);
        grouped.get(subProvider)!.push(m);
      }
      // Sort sub-providers alphabetically, show top ones first
      const sorted = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
      for (const [subProvider, subModels] of sorted) {
        const groupName = `OpenRouter / ${subProvider}`;
        for (const m of subModels) {
          let label = m.name || m.id;
          if (m.pricing) {
            const promptCost = parseFloat(m.pricing.prompt) * 1_000_000;
            if (promptCost === 0) {
              label += ' (free)';
            } else if (promptCost < 1) {
              label += ` ($${(promptCost).toFixed(2)}/M in)`;
            } else {
              label += ` ($${promptCost.toFixed(0)}/M in)`;
            }
          }
          models.push({ value: `openrouter:${m.id}`, label, group: groupName });
        }
      }
    }

    // Custom providers (UI-created)
    for (const cp of customProviders) {
      if (!connectedProviders[cp.id]?.connected) continue;
      for (const m of cp.models) {
        models.push({ value: `${cp.id}:${m}`, label: m, group: `${cp.icon} ${cp.name}` });
      }
    }

    // File-based optional providers (legacy)
    Object.entries(connectedProviders)
      .filter(([_, v]) => v.connected)
      .forEach(([pid]) => {
        const provider = effectiveProviders.find((p) => p.id === pid);
        if (!provider || provider.sttOnly) return;
        // Skip openrouter (handled above) and custom providers (handled above)
        if (pid === 'openrouter') return;
        if (customProviders.some((cp) => cp.id === pid)) return;
        const aiModels = provider.supportsStt
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
        ollamaStatus, refreshOllama, pullOllamaModel,
        openRouterModels, refreshOpenRouterModels,
        customProviders,
        addCustomProvider: addCustomProviderFn,
        updateCustomProvider: updateCustomProviderFn,
        removeCustomProvider: removeCustomProviderFn,
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
