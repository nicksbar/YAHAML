#!/usr/bin/env python3
"""
Simplest possible N3FJP test - just read raw bytes.
"""
import socket
import sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("127.0.0.1", 10000))
print("✓ Connected to N3FJP server")

sock.settimeout(5)
print("Waiting 5 seconds for any data...")

try:
    data = sock.recv(4096)
    if data:
        print(f"Received {len(data)} bytes:")
        print(f"HEX: {data.hex()}")
        print(f"TEXT: {data[:200]}")
    else:
        print("No data received (connection closed)")
except socket.timeout:
    print("Timeout - no data received")
except Exception as e:
    print(f"Error: {e}")

sock.close()
