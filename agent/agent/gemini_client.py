"""
agent/gemini_client.py — Gemini API 統一呼叫入口（多 Key × 多模型 fallback）

retry 順序：outer loop = 模型，inner loop = API key
  (model_0, key_0) → (model_0, key_1) → (model_0, key_2)
    → (model_1, key_0) → (model_1, key_1) → ...

非配額錯誤（invalid input、network error 等）立即 raise，不繼續嘗試。
"""

from collections.abc import Callable
from typing import Any

from google import genai

import config


def is_quota_error(e: Exception) -> bool:
    """True if the error is a 429 RESOURCE_EXHAUSTED quota error."""
    msg = str(e)
    return "RESOURCE_EXHAUSTED" in msg or "429" in msg


def call_with_fallback(
    use_case: str,
    func: Callable[[genai.Client, str], Any],
) -> Any:
    """
    用指定 use_case 的 fallback chain 呼叫 Gemini API。

    Args:
        use_case: "search" | "tag" | "caption" | "planner"
        func:     (client, model) -> result
                  由呼叫端提供，包含實際 API 呼叫邏輯。

    Returns:
        func 的回傳值（第一個成功的 combination）

    Raises:
        ValueError:   use_case 不存在於 config.MODELS
        RuntimeError: 未設定任何 API key
        RuntimeError: 所有 (model × key) 組合均已超出配額
        任何非配額錯誤: 立即 re-raise
    """
    models = config.MODELS.get(use_case)
    if models is None:
        raise ValueError(f"Unknown use_case: {use_case!r}")

    keys = config.GOOGLE_API_KEYS
    if not keys:
        raise RuntimeError("No GOOGLE_API_KEY configured")

    for model in models:
        for api_key in keys:
            key_hint = api_key[:8] + "..."
            try:
                client = genai.Client(api_key=api_key)
                return func(client, model)
            except Exception as e:
                if is_quota_error(e):
                    print(f"[Gemini] ⚠ {key_hint} / {model} → 配額已用盡，嘗試下一個")
                    continue
                raise

    raise RuntimeError(
        f"[Gemini] {use_case}: 所有 API key 與模型均已超出配額\n"
        f"  嘗試過: {models} × {[k[:8] + '...' for k in keys]}"
    )
