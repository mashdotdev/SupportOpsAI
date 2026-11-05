"""Download a model artifact once; deployments load it without network access."""
import hashlib
import json
from pathlib import Path

from huggingface_hub import snapshot_download

from .config import settings
from .embeddings import MODEL_REPOSITORY


def main():
    manifest = Path(__file__).with_name("model-lock.json")
    lock = json.loads(manifest.read_text())
    path = Path(settings().embedding_model_path)
    snapshot_download(MODEL_REPOSITORY, revision=lock["revision"], local_dir=path,
                      allow_patterns=["*.json", "model_optimized.onnx"])
    for name, expected in lock["sha256"].items():
        actual = hashlib.sha256((path / name).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Model artifact checksum mismatch: {name}")
    print("Pinned embedding model packaged successfully.")


if __name__ == "__main__":
    main()
