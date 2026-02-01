#!/usr/bin/env python3
"""
Multi-client relay test - Keep connections alive and observe relay behavior.
"""
import socket
import time
import threading
from datetime import datetime

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"

class RelayTestClient:
    def __init__(self, client_id: int, band: int, mode: str):
        self.client_id = client_id
        self.band = band
        self.mode = mode
        self.sock = None
        self.name = f"RELAY-{client_id}"
        
    def send_msg(self, msg):
        """Send N3FJP formatted message."""
        body = BOR + msg + EOR
        payload = body.encode("utf-16le") + TRAILER.encode("latin1")
        self.sock.sendall(payload)
        print(f"[{self.name}] SEND: {msg[:70]}...")
    
    def connect_and_handshake(self):
        """Connect and send initial handshake."""
        print(f"[{self.name}] Connecting...")
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect(("127.0.0.1", 10000))
        print(f"[{self.name}] ✓ Connected")
        
        # Send handshake
        self.send_msg(f"<BAMS><STATION>{self.name}</STATION><BAND>{self.band}</BAND><MODE>{self.mode}</MODE></BAMS>")
        time.sleep(0.1)
        self.send_msg("<NTWK><OPEN></OPEN></NTWK>")
        time.sleep(0.1)
        self.send_msg("<WHO></WHO>")
        time.sleep(0.1)
        self.send_msg(f"<MESG><TO></TO><FROM>{self.name}</FROM><MSGTXT>Hello from {self.name}!</MSGTXT></MESG>")
    
    def keep_alive(self, duration):
        """Keep connection alive and listen."""
        start = time.time()
        self.sock.settimeout(2.0)
        
        while (time.time() - start) < duration:
            try:
                data = self.sock.recv(4096)
                if data:
                    # Just acknowledge we received something
                    text = data.decode("utf-16le", errors="ignore")
                    if "<BAMS>" in text:
                        print(f"[{self.name}] ← Relay: BAMS update received")
                    elif "<MESG>" in text:
                        print(f"[{self.name}] ← Relay: MESG received")
                    elif "<WHO>" in text:
                        print(f"[{self.name}] ← Relay: WHO received")
            except socket.timeout:
                pass
            except Exception as e:
                print(f"[{self.name}] Error: {e}")
                break
    
    def close(self):
        if self.sock:
            self.sock.close()
            print(f"[{self.name}] Closed")

def test_relay():
    print("\n" + "="*70)
    print("MULTI-CLIENT RELAY TEST")
    print("="*70 + "\n")
    
    # Create 3 clients with different bands/modes
    clients = [
        RelayTestClient(1, 20, "CW"),
        RelayTestClient(2, 15, "PH"),
        RelayTestClient(3, 40, "DIG"),
    ]
    
    print("Phase 1: Connect all clients...")
    for client in clients:
        client.connect_and_handshake()
        time.sleep(0.5)
    
    print("\nPhase 2: Keep connections alive and observe relay (30 seconds)...")
    print("(Watch your N3FJP UI for client connections and relay activity)\n")
    
    # Start threads to keep connections alive
    threads = []
    for client in clients:
        t = threading.Thread(target=client.keep_alive, args=(30,))
        threads.append(t)
        t.start()
    
    # Send some band changes during the test
    print("Sending band changes...\n")
    time.sleep(5)
    
    clients[0].send_msg("<BAMS><STATION>RELAY-1</STATION><BAND>40</BAND><MODE>SSB</MODE></BAMS>")
    print("  → Client 1 changed to 40m")
    
    time.sleep(5)
    
    clients[1].send_msg("<BAMS><STATION>RELAY-2</STATION><BAND>80</BAND><MODE>CW</MODE></BAMS>")
    print("  → Client 2 changed to 80m")
    
    time.sleep(5)
    
    clients[2].send_msg(f"<MESG><TO></TO><FROM>RELAY-3</FROM><MSGTXT>Multi-client test in progress</MSGTXT></MESG>")
    print("  → Client 3 sent broadcast message")
    
    time.sleep(10)
    
    # Wait for all threads
    for t in threads:
        t.join()
    
    # Close all
    for client in clients:
        client.close()
    
    print("\n" + "="*70)
    print("Test complete!")
    print("Check your N3FJP UI - did you see all 3 clients?")
    print("Did band changes appear for each?")
    print("Did relay messages appear?")
    print("="*70 + "\n")

if __name__ == "__main__":
    test_relay()
