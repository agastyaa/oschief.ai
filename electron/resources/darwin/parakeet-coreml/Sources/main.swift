/// syag-parakeet-coreml — CoreML STT helper for OSChief
///
/// Usage:
///   syag-parakeet-coreml transcribe <wav-path>     → prints transcription to stdout
///   syag-parakeet-coreml check                     → prints "ok" if models are ready
///   syag-parakeet-coreml download                  → downloads models, prints progress to stderr
///
/// Model resolution (in order):
///   1. PARAKEET_MODEL_DIR env var (set by Electron for bundled models)
///   2. Sibling ../models/parakeet-coreml/ relative to binary (packaged app)
///   3. ~/Library/Application Support/Syag/models/parakeet-coreml/ (user cache)

import Foundation
import FluidAudio

@main
struct ParakeetCLI {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            fputs("Usage: syag-parakeet-coreml <transcribe|check|download> [wav-path]\n", stderr)
            exit(1)
        }

        let command = args[1]

        switch command {
        case "check":
            // Check if models are available (bundled or cached)
            if resolveModelReady() {
                print("ok")
            } else {
                print("not-ready")
            }

        case "download":
            // If bundled models exist, skip download
            if resolveModelReady() {
                fputs("Models already available (bundled or cached).\n", stderr)
                print("ok")
                return
            }
            fputs("Downloading Parakeet CoreML models...\n", stderr)
            let _ = try await AsrModels.downloadAndLoad(version: .v2)
            // Write marker so future `check` calls are instant
            let cacheDir = userCacheDir()
            try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
            let marker = cacheDir.appendingPathComponent(".models-ready")
            try "ok".write(to: marker, atomically: true, encoding: .utf8)
            fputs("Models ready.\n", stderr)
            print("ok")

        case "transcribe":
            guard args.count >= 3 else {
                fputs("Usage: syag-parakeet-coreml transcribe <wav-path>\n", stderr)
                exit(1)
            }
            let wavPath = args[2]
            let url = URL(fileURLWithPath: wavPath)

            guard FileManager.default.fileExists(atPath: wavPath) else {
                fputs("Error: WAV file not found: \(wavPath)\n", stderr)
                exit(1)
            }

            // If bundled models exist, ensure FluidAudio can find them by symlinking to its cache
            ensureBundledModelsLinked()

            // Load models (cached after first download, or found via symlink)
            let models = try await AsrModels.downloadAndLoad(version: .v2)
            let manager = AsrManager(config: .default)
            try await manager.initialize(models: models)

            // Transcribe with error recovery
            do {
                let result = try await manager.transcribe(url)
                print(result.text)
            } catch {
                // Return empty string instead of crashing on bad audio
                // (e.g. too short, wrong format, corrupt data)
                fputs("Transcription error (non-fatal): \(error.localizedDescription)\n", stderr)
                print("")
            }

        default:
            fputs("Unknown command: \(command). Use: transcribe, check, download\n", stderr)
            exit(1)
        }
    }

    // MARK: - Model Resolution

    /// Check all possible model locations for readiness
    static func resolveModelReady() -> Bool {
        // 1. Env var from Electron
        if let envDir = ProcessInfo.processInfo.environment["PARAKEET_MODEL_DIR"] {
            let marker = URL(fileURLWithPath: envDir).appendingPathComponent(".models-ready")
            if FileManager.default.fileExists(atPath: marker.path) { return true }
        }

        // 2. Sibling path (packaged app: binary at darwin/syag-parakeet-coreml, models at darwin/models/parakeet-coreml)
        let binaryPath = URL(fileURLWithPath: CommandLine.arguments[0])
        let siblingDir = binaryPath.deletingLastPathComponent()
            .appendingPathComponent("models")
            .appendingPathComponent("parakeet-coreml")
        let siblingMarker = siblingDir.appendingPathComponent(".models-ready")
        if FileManager.default.fileExists(atPath: siblingMarker.path) { return true }

        // 3. User cache
        let cacheMarker = userCacheDir().appendingPathComponent(".models-ready")
        return FileManager.default.fileExists(atPath: cacheMarker.path)
    }

    /// Resolve bundled model directory path (if exists)
    static func bundledModelDir() -> URL? {
        // Env var
        if let envDir = ProcessInfo.processInfo.environment["PARAKEET_MODEL_DIR"] {
            let url = URL(fileURLWithPath: envDir)
            if FileManager.default.fileExists(atPath: url.appendingPathComponent(".models-ready").path) {
                return url
            }
        }
        // Sibling
        let binaryPath = URL(fileURLWithPath: CommandLine.arguments[0])
        let siblingDir = binaryPath.deletingLastPathComponent()
            .appendingPathComponent("models")
            .appendingPathComponent("parakeet-coreml")
        if FileManager.default.fileExists(atPath: siblingDir.appendingPathComponent(".models-ready").path) {
            return siblingDir
        }
        return nil
    }

    /// If bundled models exist, symlink them to FluidAudio's cache location
    /// so AsrModels.downloadAndLoad() finds them without downloading.
    static func ensureBundledModelsLinked() {
        guard let bundled = bundledModelDir() else { return }
        let userCache = userCacheDir()

        // If user cache already has models, no need to link
        if FileManager.default.fileExists(atPath: userCache.appendingPathComponent(".models-ready").path) { return }

        // Create parent directory and symlink bundled → user cache
        let parent = userCache.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        try? FileManager.default.createSymbolicLink(at: userCache, withDestinationURL: bundled)
        fputs("Linked bundled models to cache.\n", stderr)
    }

    static func userCacheDir() -> URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Syag/models/parakeet-coreml")
    }
}
