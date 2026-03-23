#!/usr/bin/env python3
"""
Fine-tune Llama 3.2 3B on Syag meeting-notes data using Unsloth (QLoRA).

Prerequisites:
  pip install unsloth transformers datasets peft trl

Usage:
  # On Mac (Apple Silicon) or Colab T4:
  python scripts/fine-tune.py

  # With custom data path:
  python scripts/fine-tune.py --data /path/to/summarization.jsonl

  # Export only (skip training, load existing adapter):
  python scripts/fine-tune.py --export-only --adapter-path ./syag-llama-3b-adapter

Outputs:
  ./syag-llama-3b-adapter/   — LoRA adapter weights
  ./syag-llama-3b-gguf/      — Merged GGUF model (Q4_K_M quantized, ~2GB)
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Fine-tune Llama 3.2 3B for Syag")
    parser.add_argument("--data", default="/tmp/syag-training-data/summarization.jsonl",
                        help="Path to training JSONL file")
    parser.add_argument("--base-model", default="unsloth/Llama-3.2-3B-Instruct",
                        help="Base model to fine-tune")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=2, help="Per-device batch size")
    parser.add_argument("--grad-accum", type=int, default=4, help="Gradient accumulation steps")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--max-seq-len", type=int, default=4096, help="Max sequence length")
    parser.add_argument("--lora-r", type=int, default=16, help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=16, help="LoRA alpha")
    parser.add_argument("--output-dir", default="./syag-llama-3b-adapter", help="Adapter output dir")
    parser.add_argument("--gguf-dir", default="./syag-llama-3b-gguf", help="GGUF export dir")
    parser.add_argument("--export-only", action="store_true", help="Skip training, just export GGUF")
    parser.add_argument("--adapter-path", default=None, help="Path to existing adapter (for export-only)")
    args = parser.parse_args()

    # ── Check dependencies ──────────────────────────────────────────────────
    try:
        import torch
        from unsloth import FastLanguageModel
        from datasets import Dataset
        from trl import SFTTrainer
        from transformers import TrainingArguments
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("\nInstall with:")
        print("  pip install unsloth transformers datasets peft trl")
        sys.exit(1)

    # ── Load data ───────────────────────────────────────────────────────────
    if not args.export_only:
        print(f"\n{'='*60}")
        print(f"Loading training data from: {args.data}")
        print(f"{'='*60}\n")

        if not os.path.exists(args.data):
            print(f"Error: Training data not found at {args.data}")
            print("Run the generator first: npx tsx /tmp/syag-training-data/generate.ts")
            sys.exit(1)

        examples = []
        with open(args.data) as f:
            for line in f:
                ex = json.loads(line.strip())
                examples.append(ex)

        print(f"Loaded {len(examples)} training examples")

        # Format for Llama instruct template
        def format_example(ex):
            """Convert to Llama 3.x instruct chat format."""
            return {
                "text": (
                    f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
                    f"{ex['instruction']}<|eot_id|>"
                    f"<|start_header_id|>user<|end_header_id|>\n\n"
                    f"{ex['input']}<|eot_id|>"
                    f"<|start_header_id|>assistant<|end_header_id|>\n\n"
                    f"{ex['output']}<|eot_id|>"
                )
            }

        formatted = [format_example(ex) for ex in examples]

        # Split: 95% train, 5% eval
        split_idx = int(len(formatted) * 0.95)
        train_data = formatted[:split_idx]
        eval_data = formatted[split_idx:]

        train_dataset = Dataset.from_list(train_data)
        eval_dataset = Dataset.from_list(eval_data)

        print(f"Train: {len(train_data)} | Eval: {len(eval_data)}")

    # ── Load model ──────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Loading base model: {args.base_model}")
    print(f"{'='*60}\n")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.adapter_path if args.export_only else args.base_model,
        max_seq_length=args.max_seq_len,
        dtype=None,  # Auto-detect (bfloat16 on Apple Silicon)
        load_in_4bit=True,
    )

    if not args.export_only:
        # ── Apply LoRA adapters ─────────────────────────────────────────────
        model = FastLanguageModel.get_peft_model(
            model,
            r=args.lora_r,
            target_modules=[
                "q_proj", "k_proj", "v_proj", "o_proj",
                "gate_proj", "up_proj", "down_proj",
            ],
            lora_alpha=args.lora_alpha,
            lora_dropout=0,  # Optimized — Unsloth handles regularization
            bias="none",
            use_gradient_checkpointing="unsloth",  # 30% less VRAM
        )

        # ── Training ────────────────────────────────────────────────────────
        print(f"\n{'='*60}")
        print(f"Starting training: {args.epochs} epochs")
        print(f"  Batch size: {args.batch_size} x {args.grad_accum} grad accum = {args.batch_size * args.grad_accum} effective")
        print(f"  Learning rate: {args.lr}")
        print(f"  LoRA rank: {args.lora_r}, alpha: {args.lora_alpha}")
        print(f"{'='*60}\n")

        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            dataset_text_field="text",
            max_seq_length=args.max_seq_len,
            args=TrainingArguments(
                output_dir=args.output_dir,
                num_train_epochs=args.epochs,
                per_device_train_batch_size=args.batch_size,
                gradient_accumulation_steps=args.grad_accum,
                learning_rate=args.lr,
                weight_decay=0.01,
                warmup_steps=50,
                lr_scheduler_type="cosine",
                logging_steps=25,
                eval_strategy="steps",
                eval_steps=100,
                save_strategy="steps",
                save_steps=200,
                save_total_limit=3,
                fp16=not torch.cuda.is_bf16_supported(),
                bf16=torch.cuda.is_bf16_supported(),
                optim="adamw_8bit",
                seed=42,
                report_to="none",
            ),
        )

        print("Training started...\n")
        trainer.train()

        # Save adapter
        model.save_pretrained(args.output_dir)
        tokenizer.save_pretrained(args.output_dir)
        print(f"\nAdapter saved to: {args.output_dir}")

        # Evaluate
        eval_results = trainer.evaluate()
        print(f"\nEval loss: {eval_results.get('eval_loss', 'N/A'):.4f}")

    # ── Export GGUF ─────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Exporting to GGUF (Q4_K_M quantization)")
    print(f"{'='*60}\n")

    os.makedirs(args.gguf_dir, exist_ok=True)

    model.save_pretrained_gguf(
        args.gguf_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )

    # Find the exported file
    gguf_files = [f for f in os.listdir(args.gguf_dir) if f.endswith(".gguf")]
    if gguf_files:
        gguf_path = os.path.join(args.gguf_dir, gguf_files[0])
        size_gb = os.path.getsize(gguf_path) / (1024 ** 3)
        print(f"\nGGUF exported: {gguf_path} ({size_gb:.1f} GB)")
    else:
        print(f"\nGGUF files in {args.gguf_dir}:")
        for f in os.listdir(args.gguf_dir):
            print(f"  {f}")

    print(f"\n{'='*60}")
    print("Done! Next steps:")
    print("  1. Upload GGUF to HuggingFace: huggingface-cli upload syag/syag-llama-3b *.gguf")
    print("  2. Update electron/main/models/manager.ts with the HF URL")
    print("  3. Run scripts/eval-model.ts to verify quality")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
