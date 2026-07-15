import os
import logging
import threading
from llama_cpp import Llama

logger = logging.getLogger("inference")

_ROOT = os.path.dirname(os.path.abspath(__file__))
# Default to the 0.5B model for the fastest CPU replies; override with LOCAL_AI_MODEL_PATH.
MODEL_PATH = os.environ.get("LOCAL_AI_MODEL_PATH") or os.path.join(_ROOT, "models", "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf")
N_CTX = 2048
N_THREADS = 4
N_BATCH = 1024
N_GPU_LAYERS = 0

# Serializes generation vs. reload so we never use a half-swapped model.
model_lock = threading.Lock()

def _build_llm(n_ctx):
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=n_ctx,
        n_threads=N_THREADS,
        n_batch=N_BATCH,
        n_gpu_layers=N_GPU_LAYERS,
        use_mmap=False,
        verbose=False,
    )
    # Warm-up: run a trivial inference so the first real request is fast
    for _ in llm.create_chat_completion(
        [{"role": "user", "content": "hi"}],
        max_tokens=1, temperature=0, stream=True
    ): pass
    return llm

llm = _build_llm(N_CTX)
logger.info("Model loaded (n_ctx=%s)", N_CTX)

def reload_model(n_ctx):
    global llm, N_CTX
    n_ctx = max(512, min(int(n_ctx), 32768))
    logger.info("Reloading model with n_ctx=%s", n_ctx)
    new_llm = _build_llm(n_ctx)  # build outside the lock so live chats aren't blocked
    with model_lock:
        llm = new_llm
        N_CTX = n_ctx
    logger.info("Model reloaded (n_ctx=%s)", N_CTX)

def _count_tokens(text):
    try:
        return len(llm.tokenize(text.encode("utf-8")))
    except Exception:
        # ponytail: naive fallback, ~4 chars/token
        return max(1, len(text) // 4)

def _trim_messages(messages, max_tokens):
    # Reserve room for the reply + chat-template overhead so we never exceed n_ctx.
    budget = max(256, N_CTX - max_tokens - 24)
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    kept = []
    total = sum(_count_tokens(m.get("content", "")) for m in system) + len(system) * 4
    for m in reversed(rest):
        t = _count_tokens(m.get("content", "")) + 4
        # Always keep at least the latest message (`and kept` guard).
        if total + t > budget and kept:
            break
        total += t
        kept.append(m)
    return system + list(reversed(kept))

def chat(messages, temperature=0.7, max_tokens=512, top_p=0.95):
    messages = _trim_messages(messages, max_tokens)
    try:
        with model_lock:
            stream = llm.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                stream=True
            )
            for chunk in stream:
                delta = chunk["choices"][0]["delta"].get("content", "")
                if delta:
                    yield delta
    except Exception as e:
        # ponytail: never die mid-stream silently; surface the failure to the UI
        logger.exception("inference failed")
        yield f"\n\n[Error: model failed to respond — {e}]"

if __name__ == "__main__":
    history = [{"role": "user", "content": "Hello, who are you?"}]
    for token in chat(history):
        print(token, end="", flush=True)