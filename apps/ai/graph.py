import json
import os
from typing import Callable, Awaitable

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent

from tools import make_tools

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MAX_ITERATIONS = 10

PublishFn = Callable[[str, str, str, dict | None], Awaitable[None]]


def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
        import re
        delay = re.search(r"retry[^\d]*(\d+)", msg, re.IGNORECASE)
        hint = f" Try again in ~{delay.group(1)}s." if delay else " Please wait a moment and try again."
        return f"Rate limit reached — you've hit the Gemini free-tier quota (20 requests/day).{hint}"
    if "INVALID_ARGUMENT" in msg or "400" in msg:
        return "The request was invalid. Check your inputs and try again."
    if "PERMISSION_DENIED" in msg or "403" in msg:
        return "API key rejected. Please check your Gemini API key configuration."
    if "UNAUTHENTICATED" in msg or "401" in msg:
        return "Authentication failed. Please check your API credentials."
    if "UNAVAILABLE" in msg or "503" in msg:
        return "Gemini is temporarily unavailable. Try again in a few seconds."
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return "The request timed out. Try a simpler query or try again shortly."
    return f"Something went wrong: {msg[:200]}"


async def run_agent(
    run_id: str,
    goal: str,
    user_id: str,
    api_token: str,
    publish_fn: PublishFn,
) -> None:
    async def publish(event_type: str, message: str, data: dict | None = None) -> None:
        await publish_fn(run_id, event_type, message, data)

    await publish("start", f"Starting: {goal}")

    tools = make_tools(api_token)
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=GEMINI_API_KEY,
        temperature=0,
    )
    agent = create_react_agent(llm, tools, prompt=(
        "You are a job hunt assistant. Help the user achieve their goal using the available tools. "
        "Always start by getting the user's CV. Be concise and action-oriented. "
        f"Hard limit: {MAX_ITERATIONS} tool calls total."
    ))

    iteration = 0
    try:
        async for event in agent.astream_events(
            {"messages": [HumanMessage(content=goal)]},
            version="v2",
        ):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk is not None:
                    content = getattr(chunk, "content", "")
                    if isinstance(content, str) and content:
                        await publish("llm_chunk", content, {"text": content})
                    elif isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                text = part.get("text", "")
                                if text:
                                    await publish("llm_chunk", text, {"text": text})

            elif kind == "on_tool_start":
                iteration += 1
                if iteration > MAX_ITERATIONS:
                    await publish("error", "Max iterations reached.")
                    return
                name = event["name"]
                inp = event["data"].get("input", {})
                summary = {
                    k: (v[:120] + "…" if isinstance(v, str) and len(v) > 120 else v)
                    for k, v in (inp.items() if isinstance(inp, dict) else {})
                }
                await publish("tool_start", f"→ {name}", {"tool": name, "input": summary})

            elif kind == "on_tool_end":
                name = event["name"]
                raw = event["data"].get("output", "")
                if hasattr(raw, "content"):
                    output = raw.content
                elif isinstance(raw, dict) and "content" in raw:
                    output = raw["content"]
                else:
                    output = raw
                if not isinstance(output, str):
                    output = json.dumps(output)
                output = output[:10000]
                await publish("tool_end", f"✓ {name}", {"tool": name, "output": output})

        await publish("done", "Agent finished.")

    except Exception as exc:
        await publish("error", _friendly_error(exc))
