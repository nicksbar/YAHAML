#!/usr/bin/env python3
import argparse
from pathlib import Path


def decode_hex_line(line: str) -> str:
    # Extract hex payload from "RAW addr: hexdata" line
    if "RAW" in line and ":" in line:
        parts = line.split(": ", 1)
        if len(parts) == 2:
            hexdata = parts[1].strip()
            try:
                data = bytes.fromhex(hexdata)
                text = data.decode("utf-16le", errors="ignore")
                return text
            except Exception as e:
                return f"Error: {e}"
    return ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Decode N3FJP raw server log to text.")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", required=True)
    args = parser.parse_args()

    raw = Path(args.in_path).read_text(encoding="utf-8", errors="ignore")
    out_lines = []
    for line in raw.splitlines():
        if line.startswith("RAW"):
            decoded = decode_hex_line(line)
            if decoded:
                out_lines.append(line)
                out_lines.append(f"  DECODED: {repr(decoded)}")
        elif line.startswith("MSG"):
            out_lines.append(line)

    Path(args.out_path).write_text("\n".join(out_lines), encoding="utf-8")


if __name__ == "__main__":
    main()
