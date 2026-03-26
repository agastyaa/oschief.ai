// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "syag-mlx-llm",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/ml-explore/mlx-swift-lm.git", from: "2.30.6"),
    ],
    targets: [
        .executableTarget(
            name: "syag-mlx-llm",
            dependencies: [
                .product(name: "MLXLLM", package: "mlx-swift-lm"),
                .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
            ],
            path: "Sources"
        ),
    ]
)
