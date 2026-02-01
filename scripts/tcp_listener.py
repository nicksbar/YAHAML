#!/usr/bin/env python3
import argparse
import datetime as dt
import socket


def format_line(data: bytes) -> str:
    try:
        text = data.decode("utf-8")
        return text
    except UnicodeDecodeError:
        return data.hex()


def main() -> None:
    parser = argparse.ArgumentParser(description="Simple TCP listener that logs incoming data.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1000)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((args.host, args.port))
        server.listen(5)
        with open(args.out, "a", encoding="utf-8") as f:
            now = dt.datetime.now(dt.UTC).isoformat()
            f.write(f"[{now}] Listening on {args.host}:{args.port}\n")
            f.flush()
            while True:
                conn, addr = server.accept()
                with conn:
                    now = dt.datetime.now(dt.UTC).isoformat()
                    f.write(f"[{now}] Connection from {addr}\n")
                    f.flush()
                    while True:
                        data = conn.recv(4096)
                        if not data:
                            break
                        line = format_line(data)
                        now = dt.datetime.now(dt.UTC).isoformat()
                        f.write(f"[{now}] {line}\n")
                        f.flush()


if __name__ == "__main__":
    main()
