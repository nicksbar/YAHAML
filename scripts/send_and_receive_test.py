#!/usr/bin/env python3
"""
Test sending messages to N3FJP server and waiting for response.
"""
import socket
import time

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"

def send_msg(sock, msg):
    """Send N3FJP formatted message."""
    body = BOR + msg + EOR
    payload = body.encode("utf-16le") + TRAILER.encode("latin1")
    print(f"SEND ({len(payload)} bytes): {msg[:60]}...")
    sock.sendall(payload)

def try_recv(sock, timeout=3):
    """Try to receive response."""
    sock.settimeout(timeout)
    try:
        data = sock.recv(4096)
        if data:
            print(f"RECV ({len(data)} bytes):")
            print(f"  HEX: {data.hex()[:100]}...")
            try:
                text = data.decode("utf-16le", errors="ignore")
                text = text.replace("\x03", "").replace("\x04", "").replace("\x07", "")
                print(f"  TEXT: {text[:100]}...")
            except:
                pass
            return data
        else:
            print("RECV: Connection closed by server")
            return None
    except socket.timeout:
        print("RECV: Timeout (no response)")
        return None

print("Connecting to N3FJP server...")
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("127.0.0.1", 10000))
print("✓ Connected\n")

# Try simple BAMS message
print("1. Sending BAMS (station update):")
send_msg(sock, "<BAMS><STATION>TEST</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>")
try_recv(sock)
time.sleep(1)

# Try NTWK OPEN
print("\n2. Sending NTWK OPEN:")
send_msg(sock, "<NTWK><OPEN></OPEN></NTWK>")
try_recv(sock)
time.sleep(1)

# Try WHO
print("\n3. Sending WHO:")
send_msg(sock, "<WHO></WHO>")
try_recv(sock)
time.sleep(1)

# Try SCLK
print("\n4. Sending SCLK (timestamp):")
send_msg(sock, "<SCLK><YEAR>2026</YEAR><MONTH>01</MONTH><DAY>31</DAY><HOUR>12</HOUR><MINUTE>00</MINUTE><SECOND>00</SECOND><MILLISECOND>0</MILLISECOND></SCLK>")
try_recv(sock)
time.sleep(1)

# Try MESG
print("\n5. Sending MESG (chat):")
send_msg(sock, "<MESG><TO></TO><FROM>WSL-TEST</FROM><MSGTXT>Hello from WSL!</MSGTXT></MESG>")
try_recv(sock)

sock.close()
print("\n✓ Done")
