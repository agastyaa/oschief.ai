/// syag-parakeet-coreml — CoreML STT helper for Syag
///
/// Usage:
///   syag-parakeet-coreml transcribe <wav-path>     → prints transcription to stdout
///   syag-parakeet-coreml check                     → prints "ok" if models are ready
///   syag-parakeet-coreml download                  → downloads models, prints progress to stderr
///
/// The binary caches the CoreML model in ~/Library/Application Support/Syag/models/parakeet-coreml/
/// First run downloads ~600MB from HuggingFace. Subsequent runs load from cache.

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
            // Check if models are already downloaded/cached
            let cacheDir = modelCacheDir()
            let markerFile = cacheDir.appendingPathComponent(".models-ready")
            if FileManager.default.fileExists(atPath: markerFile.path) {
                print("ok")
            } else {
                print("not-ready")
            }

        case "download":
            fputs("Downloading Parakeet CoreML models...\n", stderr)
            let models = try await AsrModels.downloadAndLoad(version: .v2)
            // Write marker so future `check` calls are instant
            let cacheDir = modelCacheDir()
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

            // Load models (cached after first download)
            let models = try await AsrModels.downloadAndLoad(version: .v2)
            let manager = AsrManager(config: .default)
            try await manager.initialize(models: models)

            // Transcribe
            let result = try await manager.transcribe(url)
            print(result.text)

        default:
            fputs("Unknown command: \(command). Use: transcribe, check, download\n", stderr)
            exit(1)
        }
    }

    static func modelCacheDir() -> URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Syag/models/parakeet-coreml")
    }
}
