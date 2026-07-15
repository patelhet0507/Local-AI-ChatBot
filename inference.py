import os
from llama_cpp import Llama

_ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.environ.get("LOCAL_AI_MODEL_PATH") or os.path.join(_ROOT, "models", "Llama-3.2-3B-Instruct-Q4_K_M.gguf")

llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=2048,
    n_threads=4,
    n_batch=256,
    n_gpu_layers=0,
    use_mmap=False,
    verbose=False
)

def chat(messages, temperature=0.7, max_tokens=512, top_p=0.95):
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

if __name__ == "__main__":
    history = [{"role": "user", "content": "Hello, who are you?"}]
    for token in chat(history):
        print(token, end="", flush=True)