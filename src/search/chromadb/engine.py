"""
ChromaDB Semantic Search Engine for the Remembrance Oracle.

Replaces the hand-rolled 64D embedding engine with:
  - sentence-transformers (all-MiniLM-L6-v2) for 384D dense embeddings
  - ChromaDB with HNSW indexing for O(log n) approximate nearest neighbor search
  - Coherence-aware filtering at query time
  - Hybrid re-ranking: semantic similarity + coherence score

Integrates with the existing Oracle's:
  - 5-dimension coherency scoring (kept as-is)
  - Covenant validation (kept as-is)
  - PULL/EVOLVE/GENERATE decision thresholds (kept as-is)

Usage:
    from engine import OracleSearchEngine
    engine = OracleSearchEngine()
    engine.index_pattern(id, code, description, tags, coherence)
    results = engine.search("rate limiter for API calls", n_results=5)
"""

import json
import sys
import hashlib
import os
from typing import List, Dict, Optional, Any

from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings

# ─── Constants (mirrored from constants/thresholds.js) ───

DECISION_THRESHOLDS = {
    "PULL": 0.68,
    "EVOLVE": 0.50,
    "GENERATE": 0.50,
    "RETIRE": 0.30,
}

RELEVANCE_GATES = {
    "FOR_PULL": 0.42,
    "FOR_EVOLVE": 0.33,
}

MIN_COHERENCY_THRESHOLD = 0.60

# ─── Engine ───

class OracleSearchEngine:
    """Semantic search engine backed by ChromaDB + sentence-transformers."""

    def __init__(
        self,
        db_path: str = ".remembrance/chromadb",
        model_name: str = "all-MiniLM-L6-v2",
    ):
        self.model_name = model_name
        self.db_path = os.path.abspath(db_path)

        # Load sentence-transformer model (cached after first download)
        self.model = SentenceTransformer(model_name)

        # Persistent ChromaDB client with HNSW indexing
        self.client = chromadb.PersistentClient(
            path=self.db_path,
            settings=Settings(anonymized_telemetry=False),
        )

        # Main pattern collection
        self.collection = self.client.get_or_create_collection(
            name="oracle_patterns",
            metadata={
                "hnsw:space": "cosine",
                "hnsw:M": 16,
                "hnsw:construction_ef": 200,
                "hnsw:search_ef": 100,
            },
        )

        # Candidate collection (unproven patterns)
        self.candidates = self.client.get_or_create_collection(
            name="oracle_candidates",
            metadata={"hnsw:space": "cosine"},
        )

    def _build_document(self, code: str, description: str, tags: List[str]) -> str:
        """Combine code, description, and tags into a single searchable document."""
        tag_str = " ".join(tags) if tags else ""
        return f"{description}\n\n{code}\n\n{tag_str}"

    def _encode(self, text: str) -> List[float]:
        """Encode text to a 384D embedding vector."""
        embedding = self.model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    # ─── Indexing ───

    def index_pattern(
        self,
        pattern_id: str,
        code: str,
        description: str,
        tags: List[str],
        coherence: float,
        language: str = "unknown",
        name: str = "",
        pattern_type: str = "utility",
        test_code: str = "",
        usage_count: int = 0,
        success_count: int = 0,
        metadata: Optional[Dict] = None,
    ) -> Dict:
        """Add or update a pattern in the vector index."""
        document = self._build_document(code, description, tags)
        embedding = self._encode(document)

        # ChromaDB metadata must be flat (str, int, float, bool)
        meta = {
            "code": code[:8000],  # ChromaDB metadata size limit
            "description": description,
            "tags": json.dumps(tags),
            "coherence": float(coherence),
            "language": language,
            "name": name,
            "pattern_type": pattern_type,
            "has_tests": bool(test_code),
            "usage_count": int(usage_count),
            "success_count": int(success_count),
        }
        if metadata:
            for k, v in metadata.items():
                if isinstance(v, (str, int, float, bool)):
                    meta[k] = v

        self.collection.upsert(
            ids=[pattern_id],
            embeddings=[embedding],
            documents=[document],
            metadatas=[meta],
        )

        return {
            "id": pattern_id,
            "coherence": coherence,
            "status": "indexed",
        }

    def index_candidate(
        self,
        candidate_id: str,
        code: str,
        description: str,
        tags: List[str],
        coherence: float,
        language: str = "unknown",
        parent_pattern: str = "",
        metadata: Optional[Dict] = None,
    ) -> Dict:
        """Add or update a candidate in the candidate collection."""
        document = self._build_document(code, description, tags)
        embedding = self._encode(document)

        meta = {
            "code": code[:8000],
            "description": description,
            "tags": json.dumps(tags),
            "coherence": float(coherence),
            "language": language,
            "parent_pattern": parent_pattern,
        }
        if metadata:
            for k, v in metadata.items():
                if isinstance(v, (str, int, float, bool)):
                    meta[k] = v

        self.candidates.upsert(
            ids=[candidate_id],
            embeddings=[embedding],
            documents=[document],
            metadatas=[meta],
        )

        return {"id": candidate_id, "coherence": coherence, "status": "candidate_indexed"}

    def remove_pattern(self, pattern_id: str) -> bool:
        """Remove a pattern from the index."""
        try:
            self.collection.delete(ids=[pattern_id])
            return True
        except Exception:
            return False

    # ─── Search ───

    def search(
        self,
        query: str,
        n_results: int = 5,
        min_coherence: float = 0.0,
        language: Optional[str] = None,
        include_candidates: bool = False,
    ) -> List[Dict]:
        """
        Semantic search with coherence filtering and hybrid re-ranking.

        The search pipeline:
          1. Encode query → 384D vector
          2. ChromaDB HNSW approximate nearest neighbor (oversample 3x)
          3. Filter by min_coherence and optional language
          4. Re-rank by composite score: semantic_similarity * 0.6 + coherence * 0.4
          5. Return top n_results
        """
        where_filter = None
        if min_coherence > 0 and language:
            where_filter = {
                "$and": [
                    {"coherence": {"$gte": min_coherence}},
                    {"language": {"$eq": language}},
                ]
            }
        elif min_coherence > 0:
            where_filter = {"coherence": {"$gte": min_coherence}}
        elif language:
            where_filter = {"language": {"$eq": language}}

        # Oversample to allow for coherence re-ranking
        fetch_count = min(n_results * 3, self.collection.count() or 1)
        if fetch_count == 0:
            return []

        results = self.collection.query(
            query_texts=[query],
            n_results=fetch_count,
            where=where_filter,
            include=["metadatas", "distances", "documents"],
        )

        hits = self._extract_hits(results)

        # Optionally search candidates too
        if include_candidates and self.candidates.count() > 0:
            candidate_fetch = min(n_results * 2, self.candidates.count())
            cand_results = self.candidates.query(
                query_texts=[query],
                n_results=candidate_fetch,
                include=["metadatas", "distances", "documents"],
            )
            cand_hits = self._extract_hits(cand_results, is_candidate=True)
            hits.extend(cand_hits)

        # Re-rank: composite = semantic_similarity * 0.6 + coherence * 0.4
        for hit in hits:
            similarity = 1.0 - hit["distance"]  # cosine distance → similarity
            hit["similarity"] = max(0, similarity)
            hit["composite"] = (similarity * 0.6) + (hit["coherence"] * 0.4)

        hits.sort(key=lambda x: -x["composite"])
        return hits[:n_results]

    def _extract_hits(self, results: Dict, is_candidate: bool = False) -> List[Dict]:
        """Extract structured hits from ChromaDB query results."""
        hits = []
        if not results or not results.get("ids") or not results["ids"][0]:
            return hits

        for i in range(len(results["ids"][0])):
            meta = results["metadatas"][0][i]
            hit = {
                "id": results["ids"][0][i],
                "distance": results["distances"][0][i],
                "coherence": meta.get("coherence", 0),
                "code": meta.get("code", ""),
                "description": meta.get("description", ""),
                "tags": json.loads(meta.get("tags", "[]")),
                "language": meta.get("language", "unknown"),
                "name": meta.get("name", ""),
                "pattern_type": meta.get("pattern_type", "utility"),
                "has_tests": meta.get("has_tests", False),
                "usage_count": meta.get("usage_count", 0),
                "success_count": meta.get("success_count", 0),
                "is_candidate": is_candidate,
            }
            hits.append(hit)
        return hits

    # ─── Decision Engine ───

    def resolve(
        self,
        description: str,
        language: Optional[str] = None,
        min_coherency: float = MIN_COHERENCY_THRESHOLD,
    ) -> Dict:
        """
        Smart retrieval — mirrors the existing PULL/EVOLVE/GENERATE decision engine.

        Decision matrix (from constants/thresholds.js):
          PULL:     composite >= 0.68 AND relevance >= 0.42
          EVOLVE:   composite >= 0.50 AND relevance >= 0.33
          GENERATE: composite < 0.50 OR no relevant match
        """
        results = self.search(
            query=description,
            n_results=5,
            min_coherence=0.0,  # Don't filter yet — need full ranking
            language=language,
        )

        if not results:
            return {
                "decision": "GENERATE",
                "confidence": 0.0,
                "pattern": None,
                "alternatives": [],
                "reason": "No patterns found in the library.",
            }

        best = results[0]
        composite = best["composite"]
        similarity = best["similarity"]

        # Decision logic with relevance gates
        if composite >= DECISION_THRESHOLDS["PULL"] and similarity >= RELEVANCE_GATES["FOR_PULL"]:
            decision = "PULL"
            reason = f"High-confidence match (composite={composite:.3f}, similarity={similarity:.3f})"
        elif composite >= DECISION_THRESHOLDS["EVOLVE"] and similarity >= RELEVANCE_GATES["FOR_EVOLVE"]:
            decision = "EVOLVE"
            reason = f"Partial match — fork and improve (composite={composite:.3f}, similarity={similarity:.3f})"
        else:
            decision = "GENERATE"
            reason = f"No strong match (composite={composite:.3f}, similarity={similarity:.3f})"

        return {
            "decision": decision,
            "confidence": composite,
            "similarity": similarity,
            "pattern": best if decision != "GENERATE" else None,
            "alternatives": results[1:3],
            "reason": reason,
        }

    # ─── Sync from SQLite ───

    def sync_from_sqlite(self, sqlite_patterns: List[Dict]) -> Dict:
        """
        Bulk index patterns from the existing SQLite store.
        Call this to hydrate ChromaDB from the current oracle.db.
        """
        indexed = 0
        skipped = 0
        errors = 0

        for p in sqlite_patterns:
            try:
                tags = p.get("tags", [])
                if isinstance(tags, str):
                    try:
                        tags = json.loads(tags)
                    except (json.JSONDecodeError, TypeError):
                        tags = [t.strip() for t in tags.split(",") if t.strip()]

                # Handle coherency from various field formats
                coherence_val = 0
                cs = p.get("coherencyScore")
                if isinstance(cs, dict):
                    coherence_val = float(cs.get("total", 0))
                else:
                    coherence_val = float(p.get("coherency_total", p.get("coherence", 0)))

                self.index_pattern(
                    pattern_id=p.get("id", hashlib.sha256(p.get("code", "").encode()).hexdigest()[:16]),
                    code=p.get("code", ""),
                    description=p.get("description", ""),
                    tags=tags,
                    coherence=coherence_val,
                    language=p.get("language", "unknown"),
                    name=p.get("name", ""),
                    pattern_type=p.get("patternType", p.get("pattern_type", "utility")),
                    test_code=p.get("testCode", p.get("test_code", "")),
                    usage_count=int(p.get("usageCount", p.get("usage_count", 0))),
                    success_count=int(p.get("successCount", p.get("success_count", 0))),
                )
                indexed += 1
            except Exception as e:
                errors += 1
                if os.environ.get("ORACLE_DEBUG"):
                    print(f"[chromadb:sync] Error indexing {p.get('id', '?')}: {e}", file=sys.stderr)

        return {
            "indexed": indexed,
            "skipped": skipped,
            "errors": errors,
            "total_in_collection": self.collection.count(),
        }

    # ─── Stats ───

    def stats(self) -> Dict:
        """Return engine statistics."""
        return {
            "engine": "chromadb",
            "model": self.model_name,
            "embedding_dimensions": 384,
            "index_type": "HNSW",
            "patterns_indexed": self.collection.count(),
            "candidates_indexed": self.candidates.count(),
            "db_path": self.db_path,
        }


# ─── CLI Interface (called from Node.js via subprocess) ───

def main():
    """
    JSON-RPC style interface for Node.js bridge.

    Reads a JSON command from stdin, executes it, writes JSON result to stdout.

    Commands:
      {"action": "index", "pattern": {...}}
      {"action": "search", "query": "...", "n_results": 5, "min_coherence": 0.85}
      {"action": "resolve", "description": "...", "language": "javascript"}
      {"action": "sync", "patterns": [...]}
      {"action": "remove", "id": "..."}
      {"action": "stats"}
    """
    input_data = sys.stdin.read()
    if not input_data.strip():
        print(json.dumps({"error": "No input provided"}))
        return

    try:
        cmd = json.loads(input_data)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return

    action = cmd.get("action", "")
    db_path = cmd.get("db_path", ".remembrance/chromadb")

    try:
        engine = OracleSearchEngine(db_path=db_path)

        if action == "index":
            p = cmd.get("pattern", {})
            result = engine.index_pattern(
                pattern_id=p.get("id", ""),
                code=p.get("code", ""),
                description=p.get("description", ""),
                tags=p.get("tags", []),
                coherence=float(p.get("coherence", 0)),
                language=p.get("language", "unknown"),
                name=p.get("name", ""),
                pattern_type=p.get("pattern_type", "utility"),
                test_code=p.get("test_code", ""),
                usage_count=int(p.get("usage_count", 0)),
                success_count=int(p.get("success_count", 0)),
            )

        elif action == "search":
            result = engine.search(
                query=cmd.get("query", ""),
                n_results=cmd.get("n_results", 5),
                min_coherence=cmd.get("min_coherence", 0.0),
                language=cmd.get("language"),
                include_candidates=cmd.get("include_candidates", False),
            )

        elif action == "resolve":
            result = engine.resolve(
                description=cmd.get("description", ""),
                language=cmd.get("language"),
                min_coherency=cmd.get("min_coherency", MIN_COHERENCY_THRESHOLD),
            )

        elif action == "sync":
            patterns = cmd.get("patterns", [])
            result = engine.sync_from_sqlite(patterns)

        elif action == "remove":
            result = {"removed": engine.remove_pattern(cmd.get("id", ""))}

        elif action == "stats":
            result = engine.stats()

        else:
            result = {"error": f"Unknown action: {action}"}

        print(json.dumps(result, default=str))

    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}))


if __name__ == "__main__":
    main()
