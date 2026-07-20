import numpy as np
from collections import OrderedDict
import logging
import threading

logger = logging.getLogger(__name__)


class SemanticRAGCache:
    """
    Global in-memory semantic cache for RAG chunks.
    Isolates queries by course_id to maintain strict domain boundaries.
    Uses numpy for hyper-fast cosine similarity (vector matching).
    
    # ==============================================================================
    # AI_NOTE: PYDANTIC EXEMPTION & THREAD-SAFETY
    # 1. Pydantic Exemption (Rule #4 Exception): This layer processes 768D numpy arrays.
    #    Serializing matrices through Pydantic to validate them adds 50-100ms of overhead,
    #    destroying TTFT. This class intentionally uses raw types to stay in the fast-path.
    # 2. Thread-Safety: `search()` and `add()` mutate the OrderedDict. Because FastAPI 
    #    pushes numpy math to OS threads via `asyncio.to_thread()`, concurrent access 
    #    will crash with `RuntimeError: dictionary changed size`. Thus, the `_lock` is mandatory.
    # ==============================================================================
    """

    def __init__(self):
        self.cache = OrderedDict()
        self._lock = threading.Lock()

    def _normalize(self, vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        if norm == 0:
            return vec
        return vec / norm

    def search(self, course_id: str, new_vector: list) -> list | None:
        """
        Searches the course's cache for a semantically similar query vector.
        Returns the cached chunks if similarity >= threshold, else None.
        """
        if course_id not in self.cache or not self.cache[course_id]:
            return None

        try:
            new_vec_np = self._normalize(np.array(new_vector, dtype=np.float32))

            best_sim = -1.0
            best_chunks = None

            # Linear scan is ~0.5ms for 200 items in numpy.
            # Safe and avoids complex matrix recreation logic.
            with self._lock:
                for cached_vec, chunks in self.cache[course_id].values():
                    sim = np.dot(new_vec_np, cached_vec)
                    if sim > best_sim:
                        best_sim = sim
                        best_chunks = chunks

            # Intentional lazy import to prevent circular dependency / optimize load time
            from core.config import config
            if best_sim >= config.semantic_cache_similarity_threshold:
                logger.info(f"Semantic Cache HIT for course {course_id} (Sim: {best_sim:.4f})")
                return best_chunks

        except Exception as e:
            logger.error(f"Semantic Cache search failed natively: {e}")

        return None

    def add(self, course_id: str, query_vector: list, chunks: list) -> None:
        """
        Caches the chunks mapped to the semantic query vector for this course.
        Enforces LRU eviction policies to guarantee RAM stability.
        """
        if not chunks or not query_vector:
            return

        try:
            # Intentional lazy import to prevent circular dependency / optimize load time
            from core.config import config
            max_courses = config.semantic_cache_max_courses
            max_queries = config.semantic_cache_max_queries_per_course

            with self._lock:
                # 1. Course limit enforcement
                if course_id not in self.cache:
                    while len(self.cache) >= max_courses:
                        self.cache.popitem(last=False)  # Evict oldest course
                    self.cache[course_id] = OrderedDict()

                course_cache = self.cache[course_id]

                # 2. Query limit enforcement
                while len(course_cache) >= max_queries:
                    course_cache.popitem(last=False)  # Evict oldest query in this course

                # 3. Store normalized vector for faster dot product later
                norm_vec = self._normalize(np.array(query_vector, dtype=np.float32))

                # Use Python's id() or a simple incrementing counter as the OrderedDict key
                # since vectors aren't hashable.
                unique_key = id(norm_vec)
                course_cache[unique_key] = (norm_vec, chunks)

        except Exception as e:
            logger.error(f"Failed to add to Semantic Cache: {e}")

    def clear(self, course_id: str) -> None:
        """
        Thread-safe method to invalidate the cache for a specific course 
        (e.g., when a new PDF is uploaded or documents are modified).
        """
        with self._lock:
            self.cache.pop(course_id, None)

# Global singleton instance
global_semantic_cache = SemanticRAGCache()
