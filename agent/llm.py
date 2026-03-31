"""
LLM Configuration — Vultr Serverless Inference via OpenAI-compatible API.
All agents share this client. Switch model by changing VULTR_MODEL env var.
"""
import os
from langchain_openai import ChatOpenAI

VULTR_BASE_URL = "https://api.vultrinference.com/v1"
VULTR_API_KEY  = os.environ.get("VULTR_SERVERLESS_INFERENCE_API_KEY", "")

# Default: Mistral 7B Instruct — fast, instruction-tuned, good for structured output
# For higher quality use: "mistralai/Mixtral-8x7B-Instruct-v0.1"
VULTR_MODEL = os.environ.get("VULTR_MODEL", "mistralai/Mistral-7B-Instruct-v0.2")


def get_llm(temperature: float = 0.3, model: str | None = None) -> ChatOpenAI:
    """
    Returns a LangChain ChatOpenAI instance pointed at Vultr Serverless Inference.
    Vultr exposes an OpenAI-compatible API so langchain_openai works out of the box.
    """
    return ChatOpenAI(
        model           = model or VULTR_MODEL,
        openai_api_key  = VULTR_API_KEY,
        openai_api_base = VULTR_BASE_URL,
        temperature     = temperature,
        max_tokens      = 2048,
        streaming       = True,
    )


def get_fast_llm() -> ChatOpenAI:
    """Mistral 7B — fast, for simple classification/routing tasks."""
    return get_llm(temperature=0.1, model="mistralai/Mistral-7B-Instruct-v0.2")


def get_smart_llm() -> ChatOpenAI:
    """Mixtral 8x7B — more capable, for content generation and reasoning."""
    return get_llm(temperature=0.4, model="mistralai/Mixtral-8x7B-Instruct-v0.1")
