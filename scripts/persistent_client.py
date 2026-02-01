#!/usr/bin/env python3
"""
Simple persistent client - stays connected and sends periodic updates.
Keep this running and watch the N3FJP UI.
"""
import socket
import time
import signal
import sys

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"

def send_msg(sock, msg):
    body = BOR + msg + EOR
    payload = body.encode("utf-16le") + TRAILER.encode("latin1")
    sock.sendall(payload)
    print(f"SEND: {msg[:70]}...")

print("Starting persistent client...")
print("This will stay connected and send periodic updates.")
print("Watch your N3FJP UI for the client to appear and change bands.\n")

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("127.0.0.1", 10000))
print("✓ Connected to N3FJP server\n")

# Initial handshake
send_msg(sock, "<BAMS><STATION>TEST-PERSIST</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>")
time.sleep(0.2)
send_msg(sock, "<NTWK><OPEN></OPEN></NTWK>")
time.sleep(0.2)
send_msg(sock, "<WHO></WHO>")
time.sleep(0.2)
send_msg(sock, "<MESG><TO></TO><FROM>TEST-PERSIST</FROM><MSGTXT>Client connected!</MSGTXT></MESG>")

print("\nNow keeping connection alive and sending periodic updates...")
print("Press Ctrl+C to stop.\n")

sock.settimeout(1.0)
start_time = time.time()
band_cycle = [20, 15, 40, 80, 10]
band_idx = 0
msg_count = 0

try:
    while True:
        elapsed = time.time() - start_time
        
        # Send band change every 5 seconds
        if int(elapsed) % 5 == 0 and int(elapsed) != msg_count:
            msg_count = int(elapsed)
            band = band_cycle[band_idx % len(band_cycle)]
            mode = "CW" if band_idx % 2 == 0 else "PH"
            send_msg(sock, f"<BAMS><STATION>TEST-PERSIST</STATION><BAND>{band}</BAND><MODE>{mode}</MODE></BAMS>")
            band_idx += 1
        
        # Listen for any incoming relay messages
        try:
            data = sock.recv(4096)
            if data:
                text = data.decode("utf-16le", errors="ignore")
                if any(x in text for x in ["<BAMS>", "<MESG>", "<WHO>"]):
                    print(f"← RELAY: Received update from other client")
        except socket.timeout:
            pass
        
        time.sleep(0.1)
        
except KeyboardInterrupt:
    print("\n\nClosing connection...")
    sock.close()
    print("Done!")
