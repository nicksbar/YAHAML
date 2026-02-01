#!/usr/bin/env python3
import argparse
import re
from pathlib import Path

TAG_RE = re.compile(r"<([^>]+)>")
CONTROL_RE = re.compile(r"[\x00-\x1F]")


def strip_controls(text: str) -> str:
    return CONTROL_RE.sub("", text)


def normalize(text: str) -> str:
    # Remove nulls from UTF-16LE logs and control bytes
    text = text.replace("\x00", "")
    text = strip_controls(text)
    return text


def split_messages(text: str) -> list[str]:
    # Split on <BOR> and keep only non-empty entries
    parts = text.split("<BOR>")
    return [p for p in (part.strip() for part in parts) if p]


def parse_message(msg: str) -> dict:
    # Extract simple tag content pairs
    result = {"raw": msg}
    tags = TAG_RE.findall(msg)
    for tag in tags:
        if tag.startswith("/"):
            continue
        close = f"</{tag}>"
        if close in msg:
            start = msg.find(f"<{tag}>") + len(tag) + 2
            end = msg.find(close)
            value = msg[start:end].strip()
            if value:
                result[tag] = value
        else:
            # standalone tag
            result[tag] = True
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse N3FJP TCP log into readable messages.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", required=True)
    args = parser.parse_args()

    raw = Path(args.in_path).read_text(encoding="utf-8", errors="ignore")
    # Extract only payload lines (skip timestamp prefix)
    payload_lines = []
    for line in raw.splitlines():
        # Lines look like: [timestamp] <payload>
        if "] " in line:
            payload = line.split("] ", 1)[1]
            if payload.startswith("<"):
                payload_lines.append(payload)
    payload = "\n".join(payload_lines)
    payload = normalize(payload)

    messages = split_messages(payload)

    out_lines = []
    for idx, msg in enumerate(messages, start=1):
        parsed = parse_message(msg)
        out_lines.append(f"Message {idx}:")
        keys = [k for k in parsed.keys() if k != "raw"]
        for k in keys:
            out_lines.append(f"  {k}: {parsed[k]}")
        out_lines.append(f"  raw: {parsed['raw']}")
        out_lines.append("")

    Path(args.out_path).write_text("\n".join(out_lines), encoding="utf-8")


if __name__ == "__main__":
    main()
