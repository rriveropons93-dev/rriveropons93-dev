import logging
import json
import numpy as np
import asyncio
from typing import List, Dict, Optional
from core.database import get_db_manager
from core.schemas_db import ChunkDict

logger = logging.getLogger(__name__)

import threading

class VectorStore:
    """
    In-Memory Numpy RAG Store (Singleton).
    Replaces Supabase pgvector queries with sub-millisecond RAM matrix multiplications.

    Lifecycle per course_id:
      - ABSENT (not in self.matrices): course was created after boot. First search triggers load.
      - EMPTY  (np.array([]), []): course exists but has zero chunks (no PDFs yet). Returns [] immediately.
      - LOADED (matrix with rows): course has chunks. sub-ms cosine search applies.

    AI_NOTE: All internal _unsafe_* methods MUST be called while already holding the course lock.
             Never call them from outside this class or without the lock.
    """
    _instance = None
    _init_lock = threading.Lock()
    
    def __new__(cls):
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = super(VectorStore, cls).__new__(cls)
                cls._instance.matrices = {}  # Dict[course_id, np.ndarray]
                cls._instance.metadata = {}  # Dict[course_id, List[ChunkDict]]
                cls._instance.locks = {}     # Dict[course_id, asyncio.Lock]
                cls._instance._dict_lock = threading.Lock()
        return cls._instance
        
    def _get_lock(self, course_id: str) -> asyncio.Lock:
        with self._dict_lock:
            if course_id not in self.locks:
                self.locks[course_id] = asyncio.Lock()
            return self.locks[course_id]

    async def _unsafe_load_from_db(self, course_id: str) -> None:
        """
        Fetches all chunks from Supabase and populates matrices/metadata.
        AI_NOTE: MUST be called while already holding self._get_lock(course_id).
        """
        logger.info(f"[VectorStore] Loading course {course_id} from Supabase...")
        client = await get_db_manager().get_client()
        # AI_NOTE: Do NOT invent columns here. Check `ChunkSchema` in `schemas_db.py` to see valid columns.
        
        offset = 0
        limit = 1000
        all_data = []

        while True:
            r = await client.table("chunks").select(
                "id, document_id, content, embedding, chunk_index, documents!inner(is_public, name)"
            ).eq("course_id", course_id).eq("documents.is_public", True).range(offset, offset + limit - 1).execute()
            
            data = r.data or []
            all_data.extend(data)
            
            if len(data) < limit:
                break
            offset += limit

        if not all_data:
            self.matrices[course_id] = np.array([])
            self.metadata[course_id] = []
            logger.info(f"[VectorStore] Course {course_id} loaded with 0 chunks (no PDFs yet or none public).")
            return

        embeddings = []
        meta = []
        for row in all_data:
            emb = row["embedding"]
            if isinstance(emb, str):
                emb = json.loads(emb)
            embeddings.append(emb)
            # AI_NOTE: 'documents' is the Supabase JOIN object containing the parent document's fields.
            doc_join = row.get("documents") or {}
            meta.append({
                "id": row["id"],
                "document_id": row["document_id"],
                "document_name": doc_join.get("name", "Course Material"),
                "content": row["content"],
                "chunk_index": row.get("chunk_index")
            })

        self.matrices[course_id] = np.array(embeddings, dtype=np.float32)
        self.metadata[course_id] = meta
        logger.info(f"[VectorStore] Loaded {len(all_data)} vectors for course {course_id}.")

    async def load_course(self, course_id: str) -> None:
        """Public method: loads a course from DB into RAM (idempotent — safe to call multiple times)."""
        async with self._get_lock(course_id):
            if course_id in self.matrices:
                return  # Already loaded — skip
            await self._unsafe_load_from_db(course_id)

    async def register_course(self, course_id: str) -> None:
        """
        Registers a newly created course in the VectorStore as EMPTY.
        Called immediately after professor creates a course.
        This reserves the course_id slot so future add_chunks() don't trigger a DB roundtrip.
        """
        async with self._get_lock(course_id):
            if course_id in self.matrices:
                return  # Already known — skip
            self.matrices[course_id] = np.array([])
            self.metadata[course_id] = []
            logger.info(f"[VectorStore] Registered new empty course {course_id} in RAM.")

    async def add_chunks(self, course_id: str, chunks: List[ChunkDict]) -> None:
        """
        Injects new chunks into the RAM matrix (Zero-Latency write-through).
        If the course is not yet in RAM (created after boot, no register_course call),
        we load it from DB first BEFORE acquiring the lock to avoid deadlock.
        """
        # AI_NOTE: Load OUTSIDE the lock first to avoid deadlock (load_course acquires its own lock).
        if course_id not in self.matrices:
            await self.load_course(course_id)

        if not chunks:
            return

        async with self._get_lock(course_id):
            new_embeddings = []
            new_meta = []
            for chunk in chunks:
                if "embedding" not in chunk:
                    continue  # Skip chunks with no embedding (safety guard)
                emb = chunk["embedding"]
                if isinstance(emb, str):
                    emb = json.loads(emb)
                new_embeddings.append(emb)
                new_meta.append({
                    "id": chunk.get("id"),
                    "document_id": chunk.get("document_id"),
                    "document_name": chunk.get("document_name", "Course Material"),
                    "content": chunk.get("content"),
                    "chunk_index": chunk.get("chunk_index")
                })

            if not new_embeddings:
                return

            new_emb_array = np.array(new_embeddings, dtype=np.float32)

            if self.matrices[course_id].size == 0:
                self.matrices[course_id] = new_emb_array
            else:
                self.matrices[course_id] = np.vstack([self.matrices[course_id], new_emb_array])

            self.metadata[course_id].extend(new_meta)
            logger.info(f"[VectorStore] Injected {len(new_embeddings)} vectors for course {course_id}. Total: {len(self.metadata[course_id])}.")

    async def remove_document(self, course_id: str, document_id: str) -> None:
        """Removes all chunks associated with a document_id from the RAM matrix."""
        async with self._get_lock(course_id):
            if course_id not in self.matrices or not self.metadata[course_id]:
                return

            meta = self.metadata[course_id]
            indices_to_keep = [i for i, m in enumerate(meta) if m["document_id"] != document_id]

            if len(indices_to_keep) == len(meta):
                return  # Nothing to remove

            if not indices_to_keep:
                self.matrices[course_id] = np.array([])
                self.metadata[course_id] = []
            else:
                self.matrices[course_id] = self.matrices[course_id][indices_to_keep]
                self.metadata[course_id] = [meta[i] for i in indices_to_keep]

            removed = len(meta) - len(indices_to_keep)
            logger.info(f"[VectorStore] Removed {removed} vectors for course {course_id}. Remaining: {len(self.metadata[course_id])}.")

    async def search(self, course_id: str, query_embedding: List[float], limit: int = 50, is_public_only: bool = False, classification: str = None) -> List[ChunkDict]:
        """
        Performs cosine similarity search entirely in Numpy RAM.
        Falls back to DB load if the course is not yet registered (created after server boot).
        
        AI_NOTE (DICT CONTRACT / TECHNICAL DEBT):
        This returns a TypedDict (ChunkDict) for "Fast Path" performance. Any AI modifying this return 
        MUST ensure it contains EXACTLY these keys to prevent cascading failures in Clustering:
        'id', 'document_id', 'content', 'chunk_index', 'similarity', and 'embedding'.
        """
        # AI_NOTE: Load OUTSIDE the lock to avoid deadlock — load_course acquires its own lock.
        if course_id not in self.matrices:
            await self.load_course(course_id)

        async with self._get_lock(course_id):
            matrix = self.matrices.get(course_id)
            meta = self.metadata.get(course_id)

            if matrix is None or matrix.size == 0:
                return []

            q_vec = np.array(query_embedding, dtype=np.float32)

            def _compute_top_k(mat, q, k_val):
                # Cosine similarity: dot(A, B) / (||A|| * ||B||)
                norms = np.linalg.norm(mat, axis=1) * np.linalg.norm(q)
                norms[norms == 0] = 1e-10  # Guard against zero-division on empty embeddings
                sims = np.dot(mat, q) / norms

                actual_k = min(k_val, len(sims))
                if actual_k == 0:
                    return [], sims

                top_idx = np.argpartition(sims, -actual_k)[-actual_k:]
                sorted_top_idx = top_idx[np.argsort(sims[top_idx])[::-1]]
                return sorted_top_idx, sims

            top_k_idx, similarities = await asyncio.to_thread(_compute_top_k, matrix, q_vec, limit)

            if len(top_k_idx) == 0:
                return []

            return [
                {
                    "id": meta[idx]["id"],
                    "document_id": meta[idx]["document_id"],
                    "document_name": meta[idx].get("document_name", "Course Material"),
                    "content": meta[idx]["content"],
                    "chunk_index": meta[idx].get("chunk_index"),
                    "similarity": float(similarities[idx]),
                    "embedding": matrix[idx].tolist()
                }
                for idx in top_k_idx
            ]

vector_store = VectorStore()
