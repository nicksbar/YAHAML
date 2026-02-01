#!/usr/bin/env python3
"""
Diagnostic script to test connectivity to N3FJP server.
"""
import socket
import sys

def test_port(host: str, port: int, timeout: float = 2.0) -> bool:
    """Test if a port is open and responding."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception as e:
        print(f"Exception: {e}")
        return False

def main():
    print("N3FJP Server Connectivity Diagnostic")
    print("=" * 50)
    
    # Test various hosts/ports
    hosts_ports = [
        ("127.0.0.1", 10000, "Windows localhost"),
        ("localhost", 10000, "localhost DNS"),
        ("localhost", 1000, "Port 1000 (original)"),
        ("127.0.0.1", 1000, "Port 1000 on 127.0.0.1"),
    ]
    
    for host, port, desc in hosts_ports:
        print(f"\nTesting {desc} ({host}:{port})...", end=" ")
        if test_port(host, port):
            print("✓ OPEN")
        else:
            print("✗ CLOSED/TIMEOUT")
    
    print("\n" + "=" * 50)
    print("\nIf all are closed, N3FJP may not be running as a server.")
    print("Check N3FJP settings to ensure it's configured to accept connections.")

if __name__ == "__main__":
    main()
