"""Free-only OpenRouter catalog shared by agent configuration and execution."""
from decimal import Decimal, InvalidOperation
import time

import httpx

AUTO_MODEL = {"id": "openrouter/free", "name": "Auto — free router", "provider": "OpenRouter", "context_length": None}
_catalog: tuple[float, list[dict]] | None = None


def eligible(entry: dict) -> bool:
    try:
        prices = entry["pricing"]
        free = all(Decimal(str(prices[key])) == 0 for key in ("prompt", "completion"))
        # Reject catalog entries carrying any other nonzero charge as well.
        free = free and all(Decimal(str(value)) == 0 for value in prices.values() if value is not None)
        architecture = entry.get("architecture", {})
        return bool(free and entry["id"].endswith(":free")
                    and {"tools", "tool_choice"}.issubset(entry.get("supported_parameters", []))
                    and "text" in architecture.get("input_modalities", ["text"])
                    and architecture.get("output_modalities", ["text"]) == ["text"])
    except (KeyError, TypeError, AttributeError, InvalidOperation):
        return False


async def list_models() -> list[dict]:
    global _catalog
    if _catalog and time.monotonic() - _catalog[0] < 300:
        return _catalog[1]
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get("https://openrouter.ai/api/v1/models")
            response.raise_for_status()
            entries = response.json()["data"]
        models = [{"id": item["id"], "name": item.get("name") or item["id"],
                   "provider": item["id"].split("/", 1)[0], "context_length": item.get("context_length")}
                  for item in entries if eligible(item)]
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError("The free model catalog is unavailable. Retry loading models shortly.") from error
    result = [AUTO_MODEL, *sorted(models, key=lambda item: item["name"].casefold())]
    _catalog = (time.monotonic(), result)
    return result


async def validate_model(model_id: str):
    if model_id == AUTO_MODEL["id"]:
        return
    if not model_id.endswith(":free") or model_id not in {item["id"] for item in await list_models()}:
        raise ValueError("Choose an available free model with tool support. No paid model or fallback is allowed.")
