import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ModelProvider = {
  id: string;
  name: string;
  models: string[];
  icon: string;
  sttOnly?: boolean;
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
  { id: "whisper-large-v3", name: "Whisper Large V3", size: "3.1 GB", type: "stt", description: "Best accuracy, slower" },
  { id: "whisper-medium", name: "Whisper Medium", size: "1.5 GB", type: "stt", description: "Good balance of speed and accuracy" },
  { id: "whisper-small", name: "Whisper Small", size: "488 MB", type: "stt", description: "Fast, moderate accuracy" },
  { id: "whisper-tiny", name: "Whisper Tiny", size: "77 MB", type: "stt", description: "Fastest, basic accuracy" },
  { id: "llama-3.2-3b", name: "Llama 3.2 3B", size: "2.0 GB", type: "llm", description: "Compact local LLM" },
  { id: "phi-3-mini", name: "Phi-3 Mini", size: "2.3 GB", type: "llm", description: "Microsoft's efficient model" },
  { id: "gemma-2-2b", name: "Gemma 2 2B", size: "1.6 GB", type: "llm", description: "Google's lightweight model" },
];

type DownloadState = "idle" | "downloading" | "downloaded";

const LS_KEY = "granola-model-settings";

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
  handleDownload: (modelId: string) => void;
  handleDeleteModel: (modelId: string) => void;
  connectedProviders: Record<string, { connected: boolean; apiKey: string }>;
  setConnectedProviders: React.Dispatch<React.SetStateAction<Record<string, { connected: boolean; apiKey: string }>>>;
  useLocalModels: boolean;
  setUseLocalModels: (v: boolean) => void;
  getActiveAIModelLabel: () => string;
  getAvailableAIModels: () => { value: string; label: string; group: string }[];
}

const ModelSettingsContext = createContext<ModelSettingsContextType | null>(null);

const defaults = {
  selectedAIModel: "local:phi-3-mini",
  selectedSTTModel: "local:whisper-medium",
  useLocalModels: true,
  downloadStates: { "whisper-medium": "downloaded" as DownloadState, "phi-3-mini": "downloaded" as DownloadState },
  connectedProviders: {} as Record<string, { connected: boolean; apiKey: string }>,
};

export function ModelSettingsProvider({ children }: { children: ReactNode }) {
  const stored = loadFromStorage();
  const init = stored || defaults;

  const [selectedAIModel, setSelectedAIModel] = useState(init.selectedAIModel);
  const [selectedSTTModel, setSelectedSTTModel] = useState(init.selectedSTTModel);
  const [useLocalModels, setUseLocalModels] = useState(init.useLocalModels);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>(init.downloadStates);
  const [connectedProviders, setConnectedProviders] = useState<Record<string, { connected: boolean; apiKey: string }>>(init.connectedProviders);

  // Persist on change
  useEffect(() => {
    saveToStorage({ selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders });
  }, [selectedAIModel, selectedSTTModel, useLocalModels, downloadStates, connectedProviders]);

  const handleDownload = (modelId: string) => {
    setDownloadStates((prev) => ({ ...prev, [modelId]: "downloading" }));
    setTimeout(() => {
      setDownloadStates((prev) => ({ ...prev, [modelId]: "downloaded" }));
    }, 3000);
  };

  const handleDeleteModel = (modelId: string) => {
    setDownloadStates((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  };

  const getActiveAIModelLabel = (): string => {
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
    localModels
      .filter((m) => m.type === "llm" && downloadStates[m.id] === "downloaded")
      .forEach((m) => models.push({ value: `local:${m.id}`, label: `${m.name} (Local)`, group: "Local" }));
    Object.entries(connectedProviders)
      .filter(([_, v]) => v.connected)
      .forEach(([pid]) => {
        const provider = enterpriseProviders.find((p) => p.id === pid);
        if (!provider || provider.sttOnly) return;
        provider.models.forEach((m) =>
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
        downloadStates, handleDownload, handleDeleteModel,
        connectedProviders, setConnectedProviders,
        useLocalModels, setUseLocalModels,
        getActiveAIModelLabel, getAvailableAIModels,
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
