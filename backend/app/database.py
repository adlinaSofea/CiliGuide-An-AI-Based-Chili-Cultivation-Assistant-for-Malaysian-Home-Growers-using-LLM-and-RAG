import chromadb
from chromadb.utils import embedding_functions
from app.config import CHROMADB_PATH, COLLECTIONS, EMBEDDING_MODEL
 
# ── Globals (shared across all routes) ───────────────────────
chroma_client = None
collections   = {}
embedding_fn  = None
 
 
def init_chromadb():
    """
    Load the existing ChromaDB that you downloaded from Google Drive.
    This does NOT re-index PDFs — it just loads what's already there.
    """
    global chroma_client, collections, embedding_fn
 
    embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )
 
    chroma_client = chromadb.PersistentClient(path=CHROMADB_PATH)
 
    for key, name in COLLECTIONS.items():
        try:
            collections[key] = chroma_client.get_collection(
                name=name,
                embedding_function=embedding_fn
            )
            count = collections[key].count()
            print(f" {name}: {count} chunks loaded into vector database")
        except Exception as e:
            print(f" {name}: collection not found — {e}")
            print(f" Make sure chroma_db folder is in database/chroma_db/")
    
    print("ChromaDB initialized successfully")
 
 
def get_collection(key: str):
    """Get a collection by key. Used by rag.py"""
    if key not in collections:
        raise ValueError(
    f"Collection '{key}' not found. Available: {list(collections.keys())}"
)
    return collections[key]