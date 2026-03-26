/// syag-mlx-llm — On-device LLM inference via MLX for OSChief
///
/// Usage:
///   syag-mlx-llm check                → prints "ok" if model weights ready, else "not-ready"
///   syag-mlx-llm download             → downloads Qwen3-4B-4bit weights, progress to stderr
///   syag-mlx-llm chat                 → reads JSON from stdin, streams NDJSON to stdout
///
/// Chat input (stdin JSON):
///   { "messages": [{"role":"system","content":"..."}, ...],
///     "stream": true, "temperature": 0.7, "max_tokens": 2048 }
///
/// Chat output (stdout NDJSON):
///   {"text":"chunk"}
///   {"text":"more text"}
///   {"done":true}

import Foundation
import MLXLLM
import MLXLMCommon
import MLX

// Default model from HuggingFace mlx-community
let defaultModelId = "mlx-community/Qwen3-4B-4bit"

@main
struct MLXLLMHelper {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            fputs("Usage: syag-mlx-llm <check|download|chat>\n", stderr)
            exit(1)
        }

        let command = args[1]

        switch command {
        case "check":
            let dir = resolveModelDir()
            if let dir = dir, isModelReady(at: dir) {
                print("ok")
            } else {
                print("not-ready")
            }

        case "download":
            fputs("Downloading Qwen3-4B MLX model weights...\n", stderr)
            do {
                // Download model weights (this also tries to load, which needs Metal)
                let _ = try await loadModelContainer(id: defaultModelId) { progress in
                    let pct = Int(progress.fractionCompleted * 100)
                    fputs("\rDownloading... \(pct)%", stderr)
                }
                // Mark ready in our app support dir
                let cacheDir = appSupportModelDir()
                try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
                let marker = cacheDir.appendingPathComponent(".models-ready")
                try "ok".write(to: marker, atomically: true, encoding: .utf8)
                fputs("\nModel download complete.\n", stderr)
                print("ok")
            } catch {
                // The download may succeed but model LOADING fails (Metal/GPU not available).
                // Check if the weights actually downloaded to HuggingFace cache.
                let cacheBase = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
                let hfCache = cacheBase.appendingPathComponent("models/mlx-community/Qwen3-4B-4bit")
                let configExists = FileManager.default.fileExists(atPath: hfCache.appendingPathComponent("config.json").path)
                let weightsExist = FileManager.default.fileExists(atPath: hfCache.appendingPathComponent("model.safetensors").path)

                if configExists && weightsExist {
                    // Weights downloaded fine — Metal load failed (expected in some contexts)
                    fputs("\nModel weights downloaded. Metal GPU load deferred to first use.\n", stderr)
                    let cacheDir = appSupportModelDir()
                    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
                    let marker = cacheDir.appendingPathComponent(".models-ready")
                    try? "ok".write(to: marker, atomically: true, encoding: .utf8)
                    print("ok")
                } else {
                    fputs("Download failed: \(error.localizedDescription)\n", stderr)
                    exit(1)
                }
            }

        case "chat":
            try await handleChat()

        default:
            fputs("Unknown command: \(command). Use: check, download, chat\n", stderr)
            exit(1)
        }
    }

    // MARK: - Chat Handler

    static func handleChat() async throws {
        // Read JSON from stdin
        let inputData = FileHandle.standardInput.readDataToEndOfFile()
        guard !inputData.isEmpty else {
            fputs("Error: No input on stdin\n", stderr)
            exit(1)
        }

        guard let input = try? JSONSerialization.jsonObject(with: inputData) as? [String: Any],
              let rawMessages = input["messages"] as? [[String: Any]] else {
            fputs("Error: Invalid JSON input. Expected {\"messages\": [...]}\n", stderr)
            exit(1)
        }

        let temperature = (input["temperature"] as? Double) ?? 0.7
        let maxTokens = (input["max_tokens"] as? Int) ?? 2048
        let stream = (input["stream"] as? Bool) ?? true

        // Extract system message and build chat messages
        var systemPrompt: String? = nil
        var userMessages: [(role: Chat.Message.Role, content: String)] = []
        for msg in rawMessages {
            guard let role = msg["role"] as? String,
                  let content = msg["content"] as? String else { continue }
            if role == "system" {
                systemPrompt = content
            } else {
                let chatRole: Chat.Message.Role = role == "assistant" ? .assistant : .user
                userMessages.append((chatRole, content))
            }
        }

        guard !userMessages.isEmpty else {
            fputs("Error: No user messages in input\n", stderr)
            exit(1)
        }

        do {
            // Load model container
            let modelId = resolveModelId()
            fputs("Loading model: \(modelId)...\n", stderr)
            let container: ModelContainer
            if let dir = resolveModelDir() {
                container = try await loadModelContainer(directory: dir)
            } else {
                container = try await loadModelContainer(id: modelId)
            }

            // Build generation parameters
            var params = GenerateParameters()
            params.temperature = Float(temperature)

            // Build history from previous messages (all except the last user message)
            var history: [Chat.Message] = []
            if let sys = systemPrompt {
                history.append(.init(role: .system, content: sys))
            }
            for (i, msg) in userMessages.enumerated() {
                if i < userMessages.count - 1 {
                    history.append(.init(role: msg.role, content: msg.content))
                }
            }

            // Create chat session with history
            let session = ChatSession(container, instructions: systemPrompt, history: history, generateParameters: params)

            // Get the last user message as the prompt
            let prompt = userMessages.last!.content

            if stream {
                var tokenCount = 0
                for try await chunk in session.streamResponse(to: prompt) {
                    tokenCount += 1
                    let jsonLine = "{\"text\":\(escapeJSON(chunk))}"
                    print(jsonLine)
                    fflush(stdout)
                    if tokenCount >= maxTokens { break }
                }
                print("{\"done\":true}")
                fflush(stdout)
            } else {
                let response = try await session.respond(to: prompt)
                print(response)
            }
        } catch {
            fputs("Chat error: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }

    // MARK: - Model Resolution

    /// Resolve model directory in priority order:
    /// 1. MLX_MODEL_DIR env var (set by Electron for bundled models)
    /// 2. Sibling ../models/mlx-qwen3-4b/ relative to binary (packaged app)
    /// 3. HuggingFace cache (default loadModelContainer behavior)
    static func resolveModelDir() -> URL? {
        // 1. Env var
        if let envDir = ProcessInfo.processInfo.environment["MLX_MODEL_DIR"] {
            let url = URL(fileURLWithPath: envDir)
            if isModelReady(at: url) { return url }
        }

        // 2. Sibling path (packaged app: binary at darwin/syag-mlx-llm, models at darwin/models/mlx-qwen3-4b)
        let binaryPath = URL(fileURLWithPath: CommandLine.arguments[0])
        let siblingDir = binaryPath.deletingLastPathComponent()
            .appendingPathComponent("models")
            .appendingPathComponent("mlx-qwen3-4b")
        if isModelReady(at: siblingDir) { return siblingDir }

        // 3. App support cache
        let appDir = appSupportModelDir()
        if isModelReady(at: appDir) { return appDir }

        return nil
    }

    /// Resolve model ID or local path for loadModelContainer()
    static func resolveModelId() -> String {
        if let dir = resolveModelDir() {
            return dir.path
        }
        return defaultModelId
    }

    static func appSupportModelDir() -> URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("OSChief/models/mlx-qwen3-4b")
    }

    static func isModelReady(at dir: URL) -> Bool {
        // Check for marker file or config.json (HuggingFace model format)
        let marker = dir.appendingPathComponent(".models-ready")
        let config = dir.appendingPathComponent("config.json")
        return FileManager.default.fileExists(atPath: marker.path)
            || FileManager.default.fileExists(atPath: config.path)
    }

    // MARK: - JSON Helpers

    static func escapeJSON(_ s: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: s)
        return String(data: data, encoding: .utf8)!
    }
}
