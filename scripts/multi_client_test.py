#!/usr/bin/env python3
"""
Multi-client test harness - Run multiple N3FJP clients and observe relay behavior.
"""
import socket
import sys
import time
import threading
from typing import Optional
from datetime import datetime

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"

class N3FJPClient:
    def __init__(self, client_id: int, host: str, port: int, log_file: str):
        self.client_id = client_id
        self.host = host
        self.port = port
        self.log_file = log_file
        self.sock: Optional[socket.socket] = None
        self.running = False
        self.send_count = 0
        self.recv_count = 0
        self.buffer = b""
        
    def log(self, msg: str, prefix: str = "INFO"):
        """Log message to file and stdout."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_msg = f"[{timestamp}] [{self.client_id:02d}] {prefix:6s} {msg}"
        print(log_msg)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(log_msg + "\n")
    
    def connect(self) -> bool:
        """Connect to N3FJP server."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.connect((self.host, self.port))
            self.sock.settimeout(2.0)
            self.log(f"Connected to {self.host}:{self.port}", "CONN")
            return True
        except Exception as e:
            self.log(f"Connection failed: {e}", "ERR")
            return False
    
    def send_message(self, msg: str) -> bool:
        """Send a message."""
        if not self.sock:
            return False
        try:
            body = BOR + msg + EOR
            payload = body.encode("utf-16le") + TRAILER.encode("latin1")
            self.sock.sendall(payload)
            self.send_count += 1
            self.log(f"SEND[{self.send_count}]: {msg[:80]}...", "SEND")
            return True
        except Exception as e:
            self.log(f"Send error: {e}", "ERR")
            return False
    
    def extract_messages(self, data: bytes) -> list[str]:
        """Extract messages from UTF-16LE data."""
        try:
            text = data.decode("utf-16le", errors="ignore")
        except Exception:
            return []
        
        text = text.replace("\x03", "").replace("\x04", "").replace("\x07", "")
        messages = []
        
        if BOR not in text:
            return []
        
        parts = text.split(BOR)
        for index, part in enumerate(parts[1:], start=1):
            part = part.strip()
            if not part:
                continue
            if EOR in part:
                msg, _rest = part.split(EOR, 1)
                messages.append(msg)
            else:
                if index < len(parts) - 1:
                    messages.append(part)
        
        return messages
    
    def run(self, duration: int = 30):
        """Run client for specified duration."""
        self.running = True
        start_time = time.time()
        last_heartbeat = start_time
        
        # Clear log file
        with open(self.log_file, "w", encoding="utf-8") as f:
            f.write(f"Client {self.client_id} - Started at {datetime.now()}\n")
            f.write("=" * 70 + "\n\n")
        
        if not self.connect():
            return
        
        # Send initial handshake
        self.log("Sending initial handshake...", "INIT")
        self.send_message(f"<BAMS><STATION>CLIENT-{self.client_id}</STATION><BAND>{10+self.client_id*5}</BAND><MODE>{'CW' if self.client_id % 2 else 'PH'}</MODE></BAMS>")
        time.sleep(0.1)
        self.send_message("<NTWK><OPEN></OPEN></NTWK>")
        time.sleep(0.1)
        self.send_message("<WHO></WHO>")
        time.sleep(0.1)
        
        # Send SCLK timestamp
        self.send_message("<SCLK><YEAR>2026</YEAR><MONTH>01</MONTH><DAY>31</DAY><HOUR>10</HOUR><MINUTE>25</MINUTE><SECOND>00</SECOND><MILLISECOND>0</MILLISECOND></SCLK>")
        
        # Send initial chat message
        time.sleep(0.2)
        self.send_message(f"<MESG><TO></TO><FROM>CLIENT-{self.client_id}</FROM><MSGTXT>Hello from client {self.client_id}!</MSGTXT></MESG>")
        
        # Listen and send heartbeats
        message_sequence = 0
        while self.running and (time.time() - start_time) < duration:
            elapsed = time.time() - start_time
            
            # Send heartbeat every 5 seconds
            if (time.time() - last_heartbeat) > 5:
                self.send_message("<NTWK><CHECK></CHECK></NTWK>")
                last_heartbeat = time.time()
                
                # Vary band/mode on subsequent heartbeats
                message_sequence += 1
                if message_sequence % 2 == 0:
                    new_band = 10 + (self.client_id + message_sequence) * 5
                    new_mode = "DIG" if message_sequence % 3 == 0 else ("CW" if self.client_id % 2 else "PH")
                    self.send_message(f"<BAMS><STATION>CLIENT-{self.client_id}</STATION><BAND>{new_band}</BAND><MODE>{new_mode}</MODE></BAMS>")
            
            try:
                data = self.sock.recv(4096)
                if not data:
                    self.log("Connection closed by server", "CLOSE")
                    break
                
                self.buffer += data
                messages = self.extract_messages(self.buffer)
                
                for msg in messages:
                    self.recv_count += 1
                    self.log(f"RECV[{self.recv_count}]: {msg[:80]}...", "RECV")
                
                # Clear buffer if we got messages
                if messages:
                    self.buffer = b""
                    
            except socket.timeout:
                continue
            except Exception as e:
                self.log(f"Receive error: {e}", "ERR")
                break
        
        if self.sock:
            self.sock.close()
        self.log(f"Closed. Sent: {self.send_count}, Recv: {self.recv_count}", "CLOSE")
        self.running = False

def run_multi_client_test(num_clients: int = 3, duration: int = 30):
    """Run multiple clients simultaneously."""
    print(f"\n{'='*70}")
    print(f"Multi-Client Test: {num_clients} clients for {duration} seconds")
    print(f"{'='*70}\n")
    
    clients = []
    threads = []
    
    # Create and start clients
    for i in range(num_clients):
        log_file = f"/home/nick/YAHAML/captures/client_{i+1:02d}.log"
        client = N3FJPClient(
            client_id=i+1,
            host="127.0.0.1",
            port=10000,
            log_file=log_file
        )
        clients.append(client)
        
        thread = threading.Thread(target=client.run, args=(duration,))
        threads.append(thread)
        thread.start()
        time.sleep(0.5)  # Stagger connections
    
    # Wait for all to complete
    for thread in threads:
        thread.join()
    
    print(f"\n{'='*70}")
    print("Test Complete!")
    print(f"{'='*70}\n")
    
    # Summary
    total_sent = sum(c.send_count for c in clients)
    total_recv = sum(c.recv_count for c in clients)
    print(f"Total messages sent: {total_sent}")
    print(f"Total messages received: {total_recv}")
    print(f"\nDetailed logs in captures/client_NN.log\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Multi-client N3FJP test")
    parser.add_argument("--clients", type=int, default=3, help="Number of clients")
    parser.add_argument("--duration", type=int, default=30, help="Test duration in seconds")
    args = parser.parse_args()
    
    run_multi_client_test(args.clients, args.duration)
