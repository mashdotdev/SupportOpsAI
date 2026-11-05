from functools import lru_cache
from pathlib import Path
import threading

from fastembed import TextEmbedding
from tokenizers import Tokenizer

from .config import settings

MODEL = "BAAI/bge-small-en-v1.5"
DIMENSIONS = 384
# A single packaged artifact is shared by ingestion and queries.
MODEL_REPOSITORY = "Qdrant/bge-small-en-v1.5-onnx-Q"


class Embedder:
    def __init__(self):
        path = Path(settings().embedding_model_path).resolve()
        if not (path / "tokenizer.json").exists() or not (path / "model_optimized.onnx").exists():
            raise RuntimeError("Embedding model is not packaged. Run: uv run python -m supportops.package_model")
        self.tokenizer = Tokenizer.from_file(str(path / "tokenizer.json"))
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()
        self.model = TextEmbedding(model_name=MODEL, specific_model_path=str(path), local_files_only=True, threads=2)
        self.lock = threading.Lock()

    def passages(self, texts):
        with self.lock:
            return [vector.tolist() for vector in self.model.passage_embed(texts, batch_size=32)]

    def query(self, text):
        # A long chat question must not be silently truncated by the encoder.
        text = text[:12000]
        encoding = self.tokenizer.encode(text, add_special_tokens=False)
        if len(encoding.ids) > 460:
            text = text[:encoding.offsets[459][1]]
        with self.lock:
            return next(self.model.query_embed(text)).tolist()


@lru_cache
def embedder():
    return Embedder()
