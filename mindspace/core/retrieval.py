# ============================================================
# core/retrieval.py
# Vector search — FAISS (index nằm trong data/)
# ============================================================

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

import numpy as np
from dotenv import load_dotenv

from core.embedding import get_embedder

load_dotenv()

@dataclass
class Chunk:
    chunk_id:    int
    text:        str
    window_text: str
    source:      str
    metadata:    dict = field(default_factory=dict)


@dataclass
class RetrievalResult:
    chunks:  list[Chunk]
    scores:  list[float]
    query:   str
    context: str


# ============================================================
# Document Chunker
# ============================================================
class DocumentChunker:

    def __init__(self, chunk_size: int = 256, chunk_overlap: int = 30, window_size: int = 1):
        self.chunk_size    = chunk_size
        self.chunk_overlap = chunk_overlap
        self.window_size   = window_size

    def chunk_text(self, text: str, source: str = "unknown") -> list[Chunk]:
        words  = text.split()
        step   = max(1, self.chunk_size - self.chunk_overlap)
        starts = list(range(0, len(words), step))
        raw_chunks = []
        for start in starts:
            end = min(start + self.chunk_size, len(words))
            raw_chunks.append(" ".join(words[start:end]))
        chunks = []
        for i, chunk_txt in enumerate(raw_chunks):
            ws   = max(0, i - self.window_size)
            we   = min(len(raw_chunks), i + self.window_size + 1)
            wtxt = " ".join(raw_chunks[ws:we])
            chunks.append(Chunk(chunk_id=i, text=chunk_txt, window_text=wtxt, source=source))
        return chunks

    def chunk_file(self, file_path: str) -> list[Chunk]:
        ext    = os.path.splitext(file_path)[1].lower()
        source = os.path.basename(file_path)
        if ext == ".pdf":
            text = self._read_pdf(file_path)
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            print(f"  ⚠️  Unsupported: {ext} — skipping {source}")
            return []
        if not text.strip():
            return []
        return self.chunk_text(text, source=source)

    def _read_pdf(self, file_path: str) -> str:
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            pages  = [p.extract_text() for p in reader.pages if p.extract_text()]
            return "\n\n".join(pages)
        except ImportError:
            print("  ❌ pypdf chưa cài. Chạy: pip install pypdf")
            return ""
        except Exception as e:
            print(f"  ❌ Lỗi đọc PDF: {e}")
            return ""

    def chunk_directory(self, dir_path: str) -> list[Chunk]:
        all_chunks = []
        for filename in sorted(os.listdir(dir_path)):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in {".txt", ".pdf"}:
                continue
            chunks = self.chunk_file(os.path.join(dir_path, filename))
            if chunks:
                all_chunks.extend(chunks)
                print(f"  ✅ {filename}: {len(chunks)} chunks")
        return all_chunks


# ============================================================
# FAISS Retriever
# ============================================================
class FAISSRetriever:

    def __init__(self, embedder=None):
        self._embedder = embedder or get_embedder()
        self._index    = None
        self._chunks   = []
        self._is_built = False

    def build(self, chunks: list[Chunk]):
        import faiss
        if not chunks:
            return
        print(f"⏳ Building FAISS index from {len(chunks)} chunks...")
        texts   = [c.text for c in chunks]
        results = self._embedder.embed_batch(texts)
        matrix  = self._embedder.to_matrix(results)
        self._index  = faiss.IndexFlatIP(self._embedder.dim)
        self._index.add(matrix)
        self._chunks   = chunks
        self._is_built = True
        print(f"✅ FAISS index built! Total: {self._index.ntotal}")

    def save(self, index_path: str = "data/faiss.index", chunks_path: str = "data/chunks.json"):
        import faiss
        if not self._is_built:
            return
        os.makedirs("data", exist_ok=True)
        faiss.write_index(self._index, index_path)
        with open(chunks_path, "w", encoding="utf-8") as f:
            json.dump([
                {"chunk_id": c.chunk_id, "text": c.text,
                 "window_text": c.window_text, "source": c.source, "metadata": c.metadata}
                for c in self._chunks
            ], f, ensure_ascii=False, indent=2)
        print(f"✅ Saved FAISS → {index_path}")

    def load(self, index_path: str = "data/faiss.index", chunks_path: str = "data/chunks.json") -> bool:
        import faiss
        if not os.path.exists(index_path) or not os.path.exists(chunks_path):
            return False
        self._index = faiss.read_index(index_path)
        with open(chunks_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._chunks = [
            Chunk(chunk_id=c["chunk_id"], text=c["text"], window_text=c["window_text"],
                  source=c["source"], metadata=c.get("metadata", {}))
            for c in data
        ]
        self._is_built = True
        print(f"✅ Loaded FAISS: {self._index.ntotal} vectors")
        return True

    def retrieve(self, query: str, top_k: int = 3, emotion_summary: str = None,
                 score_threshold: float = 0.3) -> RetrievalResult:
        if not self._is_built:
            return RetrievalResult(chunks=[], scores=[], query=query, context="")
        embed_result    = (self._embedder.embed_with_emotion(query, emotion_summary)
                           if emotion_summary else self._embedder.embed(query))
        query_vector    = embed_result.vector.reshape(1, -1).astype(np.float32)
        scores, indices = self._index.search(query_vector, top_k)
        matched_chunks, matched_scores = [], []
        for score, idx in zip(scores[0], indices[0]):
            if idx != -1 and score >= score_threshold:
                matched_chunks.append(self._chunks[idx])
                matched_scores.append(round(float(score), 4))
        context = "\n\n---\n\n".join(
            f"[Source {i+1}: {c.source}]\n{c.window_text}"
            for i, c in enumerate(matched_chunks)
        )
        return RetrievalResult(chunks=matched_chunks, scores=matched_scores,
                               query=query, context=context)


# ============================================================
# Factory
# ============================================================
def get_retriever(embedder=None):
    return FAISSRetriever(embedder=embedder)