"""
LLM Configuration — Groq Serverless Inference via OpenAI-compatible API.
Drop-in replacement for Vultr Serverless Inference.
Get a free API key (no credit card) at: https://console.groq.com

Groq model map (closest to original Vultr models):
  Vultr: mistralai/Mistral-7B-Instruct-v0.2     → Groq: llama-3.1-8b-instant
  Vultr: mistralai/Mixtral-8x7B-Instruct-v0.1   → Groq: llama-3.3-70b-versatile

Groq free tier limits (as of 2025):
  llama-3.1-8b-instant    — 30 req/min, 14,400 req/day
  llama-3.3-70b-versatile — 30 req/min,  1,000 req/day
"""
import os
from langchain_openai import ChatOpenAI

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")

# Fast model: llama-3.1-8b-instant  (replaces Mistral 7B)
# Smart model: llama-3.3-70b-versatile (replaces Mixtral 8x7B)
GROQ_FAST_MODEL  = os.environ.get("GROQ_FAST_MODEL",  "llama-3.1-8b-instant")
GROQ_SMART_MODEL = os.environ.get("GROQ_SMART_MODEL", "llama-3.3-70b-versatile")


def get_llm(temperature: float = 0.3, model: str | None = None) -> ChatOpenAI:
    """
    Returns a LangChain ChatOpenAI instance pointed at Groq.
    Groq exposes an OpenAI-compatible API — no other code changes needed.
    """
    return ChatOpenAI(
        model           = model or GROQ_FAST_MODEL,
        openai_api_key  = GROQ_API_KEY,
        openai_api_base = GROQ_BASE_URL,
        temperature     = temperature,
        max_tokens      = 2048,
        streaming       = True,
    )


def get_fast_llm() -> ChatOpenAI:
    """Llama 3.1 8B — fast, for classification/routing/simple tool calls."""
    return get_llm(temperature=0.1, model=GROQ_FAST_MODEL)


def get_smart_llm() -> ChatOpenAI:
    """Llama 3.3 70B — capable, for content generation and complex reasoning."""
    return get_llm(temperature=0.4, model=GROQ_SMART_MODEL)
