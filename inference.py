import os
import logging
import threading
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inference")

_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_ROOT, ".env"))  # pick up LOCAL_AI_MODEL_PATH if set

MODELS_DIR = os.path.join(_ROOT, "models")
MODEL_STATE_FILE = os.path.join(_ROOT, ".model_selection.json")
DEFAULT_MODEL = "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"


def _load_saved_model():
    try:
        with open(MODEL_STATE_FILE) as f:
            return json.load(f).get("model_path")
    except Exception:
        return None


def _save_model(path):
    try:
        with open(MODEL_STATE_FILE, "w") as f:
            json.dump({"model_path": path}, f)
    except Exception:
        pass


_saved = _load_saved_model()
LOCAL_MODEL_PATH = (
    os.environ.get("LOCAL_AI_MODEL_PATH")
    or (_saved if _saved and os.path.isfile(_saved) else None)
    or os.path.join(MODELS_DIR, DEFAULT_MODEL)
)
N_CTX = 2048
N_THREADS = 4
N_BATCH = 1024
N_GPU_LAYERS = 0
MODEL_LOCK = threading.Lock()
MODEL_INFO = LOCAL_MODEL_PATH


def _build_llm(n_ctx, model_path=None):
    from llama_cpp import Llama
    llm = Llama(
        model_path=model_path or LOCAL_MODEL_PATH,
        n_ctx=n_ctx,
        n_threads=N_THREADS,
        n_batch=N_BATCH,
        n_gpu_layers=N_GPU_LAYERS,
        use_mmap=False,
        verbose=False,
    )
    for _ in llm.create_chat_completion([{"role": "user", "content": "hi"}], max_tokens=1, temperature=0, stream=True):
        pass
    return llm


def _count_tokens(text):
    try:
        return len(llm.tokenize(text.encode("utf-8")))
    except Exception:
        return max(1, len(text) // 4)


def _trim_messages(messages, max_tokens):
    budget = max(256, N_CTX - max_tokens - 24)
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    kept = []
    total = sum(_count_tokens(m.get("content", "")) for m in system) + len(system) * 4
    for m in reversed(rest):
        t = _count_tokens(m.get("content", "")) + 4
        if total + t > budget and kept:
            break
        total += t
        kept.append(m)
    return system + list(reversed(kept))


logger.info("Loading local model…")
llm = _build_llm(N_CTX)
logger.info("Model loaded (n_ctx=%s)", N_CTX)


def reload_model(n_ctx):
    global llm, N_CTX
    n_ctx = max(512, min(int(n_ctx), 32768))
    logger.info("Reloading model with n_ctx=%s", n_ctx)
    new_llm = _build_llm(n_ctx)
    with MODEL_LOCK:
        llm = new_llm
        N_CTX = n_ctx
    logger.info("Model reloaded (n_ctx=%s)", N_CTX)


def list_models():
    if not os.path.isdir(MODELS_DIR):
        return []
    return sorted(f for f in os.listdir(MODELS_DIR) if f.lower().endswith(".gguf"))


def current_model_name():
    return os.path.basename(LOCAL_MODEL_PATH)


def switch_model(name):
    global llm, LOCAL_MODEL_PATH, MODEL_INFO
    path = os.path.join(MODELS_DIR, os.path.basename(name))
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    logger.info("Switching model to %s (n_ctx=%s)", path, N_CTX)
    new_llm = _build_llm(N_CTX, path)
    with MODEL_LOCK:
        llm = new_llm
        LOCAL_MODEL_PATH = path
        MODEL_INFO = path
    _save_model(path)
    logger.info("Model switched to %s", path)


def chat(messages, temperature=0.7, max_tokens=512, top_p=0.95):
    messages = _trim_messages(messages, max_tokens)
    try:
        with MODEL_LOCK:
            stream = llm.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                stream=True,
            )
            for chunk in stream:
                delta = chunk["choices"][0]["delta"].get("content", "")
                if delta:
                    yield delta
    except Exception as e:
        logger.exception("inference failed")
        yield f"\n\n[Error: model failed to respond — {e}]"
