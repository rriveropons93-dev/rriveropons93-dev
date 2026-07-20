import json
import logging
import numpy as np
from core.schemas_db import ChunkDict

logger = logging.getLogger(__name__)

def dynamic_subspace_cluster(data: list[ChunkDict], query_embedding: list[float], target_count: int, expected_dim: int = 768) -> list[ChunkDict]:
    """
    Dynamic Subspace Clustering (Zero-Cost Geometrical Reranker)
    Filters a list of chunks by clustering them in a subspace centered on their local mean.
    
    Args:
        data: List of dictionaries representing the chunks. Expected to contain 'id' and 'embedding_str' or 'embedding'.
        query_embedding: The vector of the query.
        target_count: Maximum number of chunks to return.
        expected_dim: The expected dimensionality of the embeddings (default 768).
        
    Returns:
        A new sorted list of ChunkDict with updated 'similarity' scores.
    """
    if not data:
        return []

    if len(data) <= target_count:
        return data

    # 1. Prepare data and filter out invalid embeddings (Fix for Zero-Vector Bug)
    valid_data = []
    vecs = []
    
    for row in data:
        # Support both 'embedding_str' (JSON string) or direct list
        vec_data = row.get("embedding_str") or row.get("embedding") or "[]"
        try:
            parsed = json.loads(vec_data) if isinstance(vec_data, str) else vec_data
        except json.JSONDecodeError:
            logger.error(f"Data integrity error: Chunk {row.get('id', 'unknown')} has invalid JSON embedding.")
            continue
        
        arr = np.array(parsed, dtype=np.float32)
        if arr.shape != (expected_dim,):
            logger.error(f"Data integrity error: Chunk {row.get('id', 'unknown')} has invalid embedding shape {arr.shape}. Skipping.")
            continue  # Drop corrupted chunks so they don't pollute the centroid
            
        # Copy the row so we don't mutate the input data
        valid_row = dict(row)
        valid_data.append(valid_row)
        vecs.append(arr)

    if not valid_data:
        return []

    q_vec = np.array(query_embedding, dtype=np.float32)

    # Work with index-based tracking
    active_indices = list(range(len(valid_data)))
    iteration = 0

    # The Dynamic Zoom Loop (max 5 cycles, stops when <= target_count survivors)
    while len(active_indices) > target_count and iteration < 5:
        iteration += 1

        # 1. Centroid of current cluster
        active_vecs = np.stack([vecs[i] for i in active_indices])  # Shape: (N, dim)
        centroid = active_vecs.mean(axis=0)                        # Shape: (dim,)

        # 2. Shift both query and all active vectors to new origin
        shifted_q = q_vec - centroid
        norm_q = np.linalg.norm(shifted_q)
        if norm_q == 0:
            break  # Degenerate cluster — impossible in practice, safety net

        shifted_vecs = active_vecs - centroid                      # Shape: (N, dim)
        norms_v = np.linalg.norm(shifted_vecs, axis=1)             # Shape: (N,)

        # Cosine similarity in shifted space for each vector
        dots = shifted_vecs @ shifted_q                            # Shape: (N,)
        with np.errstate(invalid='ignore', divide='ignore'):
            new_sims = np.where(norms_v == 0, 0.0, dots / (norms_v * norm_q))

        # 3. Local Contrastive Filtering
        next_indices = [active_indices[j] for j, s in enumerate(new_sims) if s > 0]
        next_sims    = {active_indices[j]: float(new_sims[j]) for j, s in enumerate(new_sims) if s > 0}

        # 4. Survival Rule: If next step drops below target, crown survivors and stop
        if len(next_indices) < target_count:
            # Apply +10 boost to the winners so they sort above the previous-step runners-up
            crowned_ids = {valid_data[i].get("id") for i in next_indices}
            for i in active_indices:
                if valid_data[i].get("id") in crowned_ids:
                    valid_data[i]["similarity"] = valid_data[i].get("similarity", 0.0) + 10.0
            break

        # 5. Proceed — update active set and their similarity scores
        active_indices = next_indices
        for i in active_indices:
            valid_data[i]["similarity"] = next_sims[i]

    # Final sort on the active set and hard cut to target_count
    active_rows = [valid_data[i] for i in active_indices]
    active_rows.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
    
    return active_rows[:target_count]
