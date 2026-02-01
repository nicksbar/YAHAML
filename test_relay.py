#!/usr/bin/env python3
"""
Test relay server with database logging
"""
import socket
import time
import threading

def encode_message(msg):
    """Encode with UTF-16LE and N3FJP framing"""
    bor = b'\x00\x01'
    eor = b'\x00\x03\x00\x04\x00\x07'
    utf16_msg = msg.encode('utf-16le')
    return bor + utf16_msg + eor

def decode_message(data):
    """Decode UTF-16LE message"""
    try:
        return data.decode('utf-16le', errors='ignore').split('\x00')[0]
    except:
        return "[decode error]"

def client_test(client_name, bands):
    """Run a test client"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        sock.connect(("127.0.0.1", 10000))
        print(f"✓ [{client_name}] Connected to relay")
        
        mode = "CW"
        for i, band in enumerate(bands):
            msg = f"<BAMS><STATION>{client_name}</STATION><BAND>{band}</BAND><MODE>{mode}</MODE></BAMS>"
            encoded = encode_message(msg)
            sock.sendall(encoded)
            mode = "PH" if mode == "CW" else "CW"
            print(f"  [{client_name}] SEND: Band {band}m {mode}")
            
            # Listen for relay messages
            start = time.time()
            while time.time() - start < 2:
                try:
                    data = sock.recv(1024)
                    if data:
                        decoded = decode_message(data)
                        if "STATION" in decoded and client_name not in decoded:
                            print(f"  [{client_name}] ← RELAY received from other station")
                except socket.timeout:
                    pass
            
            time.sleep(1)
        
        sock.close()
        print(f"✓ [{client_name}] Closed")
    except Exception as e:
        print(f"✗ [{client_name}] Error: {e}")

print("=" * 70)
print("YAHAML RELAY TEST - Multiple Clients with Database Logging")
print("=" * 70)
print("\nStarting 3 clients on different bands...")
print("Relay server should log all band changes to database\n")

clients = [
    ("TEST-ALPHA", ["20", "15", "10"]),
    ("TEST-BRAVO", ["40", "80", "160"]),
    ("TEST-CHARLIE", ["2", "3", "6"]),
]

threads = []
for client_name, bands in clients:
    t = threading.Thread(target=client_test, args=(client_name, bands))
    t.start()
    threads.append(t)
    time.sleep(0.5)

for t in threads:
    t.join()

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)
print("\nCheck database for:")
print("  • Stations: TEST-ALPHA, TEST-BRAVO, TEST-CHARLIE")
print("  • Band activities logged for each band change")
print("  • Context logs showing BAND_CHANGE events")
print("  • Network status showing connected = true")
