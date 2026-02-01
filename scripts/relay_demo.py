#!/usr/bin/env python3
"""
Clear demonstration of N3FJP relay with multiple unique clients.
Each client gets a unique ID and we show relay messages flowing between them.
"""
import socket
import threading
import time
from datetime import datetime

def create_message(station, band, mode, msg_type="BAMS"):
    """Create a properly formatted message."""
    if msg_type == "BAMS":
        return f"<BAMS><STATION>{station}</STATION><BAND>{band}</BAND><MODE>{mode}</MODE></BAMS>"
    return f"<{msg_type}><STATION>{station}</STATION></{msg_type}>"

def encode_message(msg):
    """Encode message in UTF-16LE with BOR/EOR framing."""
    bor = b'\x00\x01'
    eor = b'\x00\x03\x00\x04\x00\x07'
    utf16_msg = msg.encode('utf-16le')
    return bor + utf16_msg + eor

def decode_message(data):
    """Decode UTF-16LE message."""
    try:
        return data.decode('utf-16le', errors='ignore')
    except:
        return "[decode error]"

def client_thread(client_id, station_name, band_sequence):
    """Run a single client that cycles through bands."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        sock.connect(("127.0.0.1", 10000))
        print(f"\n[{station_name}] ✓ Connected to server")
        
        mode = "CW"
        band_idx = 0
        
        for cycle in range(3):  # 3 cycles of band changes
            band = band_sequence[band_idx % len(band_sequence)]
            
            # Send BAMS update
            msg = create_message(station_name, band, mode)
            encoded = encode_message(msg)
            sock.sendall(encoded)
            mode = "PH" if mode == "CW" else "CW"
            print(f"[{station_name}] SEND: Band {band}, Mode {mode}")
            
            # Listen for relay messages from other clients
            start_time = time.time()
            while time.time() - start_time < 2:
                try:
                    data = sock.recv(1024)
                    if data:
                        # Try to extract station info from relay
                        decoded = decode_message(data)
                        if "STATION" in decoded:
                            import re
                            station_match = re.search(r'<STATION>([^<]+)</STATION>', decoded)
                            band_match = re.search(r'<BAND>([^<]+)</BAND>', decoded)
                            if station_match:
                                relay_station = station_match.group(1)
                                relay_band = band_match.group(1) if band_match else "?"
                                if relay_station != station_name:
                                    print(f"[{station_name}] ← RELAY from {relay_station}: Band {relay_band}")
                except socket.timeout:
                    pass
                except Exception as e:
                    pass
            
            band_idx += 1
            time.sleep(1)
        
        sock.close()
        print(f"[{station_name}] ✓ Closed")
        
    except Exception as e:
        print(f"[{station_name}] ✗ Error: {e}")

def main():
    print("=" * 70)
    print("N3FJP RELAY DEMONSTRATION - Multiple Unique Clients")
    print("=" * 70)
    print("\nStarting 4 clients with unique IDs...")
    print("Each will change bands and we'll see relay messages between them.\n")
    
    # Define clients with unique names and different band sequences
    clients = [
        ("CLIENT-ALPHA", [20, 15, 10]),
        ("CLIENT-BRAVO", [40, 80, 160]),
        ("CLIENT-CHARLIE", [2, 3, 6]),
        ("CLIENT-DELTA", [20, 40, 80]),
    ]
    
    threads = []
    for client_id, (station_name, bands) in enumerate(clients):
        t = threading.Thread(target=client_thread, args=(client_id, station_name, bands))
        t.start()
        threads.append(t)
        time.sleep(0.5)  # Stagger connections slightly
    
    # Wait for all threads
    for t in threads:
        t.join()
    
    print("\n" + "=" * 70)
    print("RELAY DEMONSTRATION COMPLETE")
    print("=" * 70)
    print("\nIf relay is working correctly, you should see:")
    print("  • Each client sends band changes")
    print("  • Other clients receive relay messages showing those changes")
    print("  • This proves all clients receive each other's updates")

if __name__ == "__main__":
    main()
