#!/usr/bin/env python3
"""
N3FJP Client - Connect to N3FJP server and observe protocol behavior.
This flips the perspective: we become the client, N3FJP is the server.
"""
import socket
import sys
import time
from typing import Optional

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"

def extract_messages(data: bytes) -> list[str]:
    """Extract messages from UTF-16LE encoded data with BOR/EOR framing."""
    try:
        text = data.decode("utf-16le", errors="ignore")
    except Exception as e:
        print(f"Decode error: {e}")
        return []
    
    # Strip control bytes
    text = text.replace("\x03", "").replace("\x04", "").replace("\x07", "")
    
    messages = []
    if BOR not in text:
        return []
    
    # Split on BOR markers
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

def send_message(sock: socket.socket, body: str) -> None:
    """Send a message in N3FJP format."""
    if not body.startswith(BOR):
        body = BOR + body
    if not body.endswith(EOR):
        body = body + EOR
    payload = body.encode("utf-16le", errors="ignore") + TRAILER.encode("latin1")
    try:
        sock.sendall(payload)
        print(f"SENT: {body[:60]}...")
    except OSError as e:
        print(f"Send error: {e}")

def connect_to_server(host: str, port: int, log_file: Optional[str] = None) -> None:
    """Connect to N3FJP server and capture messages."""
    print(f"Attempting to connect to {host}:{port}...")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))
        print(f"✓ Connected to {host}:{port}")
        
        buffer = b""
        message_count = 0
        start_time = time.time()
        
        # Send initial greeting/handshake
        print("\nSending initial BAMS (station announcement)...")
        send_message(sock, "<BAMS><STATION>WSL-CLIENT</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>")
        
        print("Sending NTWK OPEN...")
        send_message(sock, "<NTWK><OPEN></OPEN></NTWK>")
        
        print("Sending WHO query...")
        send_message(sock, "<WHO></WHO>")
        
        print("\nWaiting for server responses...\n")
        
        # Set a timeout so we can detect if nothing is happening
        sock.settimeout(3.0)
        
        while True:
            try:
                data = sock.recv(4096)
                if not data:
                    print("Connection closed by server")
                    break
                
                buffer += data
                messages, buffer = extract_and_clear_buffer(buffer)
                
                for msg in messages:
                    message_count += 1
                    print(f"\n[{message_count}] RECEIVED:")
                    print(f"  {msg[:100]}..." if len(msg) > 100 else f"  {msg}")
                    
                    if log_file:
                        with open(log_file, "a", encoding="utf-8") as f:
                            f.write(f"\n[{message_count}] RECV: {msg}\n")
                    
                    # Try to respond with appropriate ACK based on message content
                    respond_to_message(sock, msg, log_file)
                
            except socket.timeout:
                elapsed = time.time() - start_time
                print(f"\n[TIMEOUT after {elapsed:.1f}s, {message_count} messages received]")
                break
            except Exception as e:
                print(f"Error: {e}")
                break
        
        sock.close()
        print(f"\n✓ Connection closed. Total messages: {message_count}")
        
    except ConnectionRefusedError:
        print(f"✗ Connection refused to {host}:{port}")
        print("  Is N3FJP running as a server on that port?")
    except Exception as e:
        print(f"✗ Error: {e}")

def extract_and_clear_buffer(buffer: bytes) -> tuple[list[str], bytes]:
    """Extract messages from buffer, return remaining buffer."""
    messages = extract_messages(buffer)
    
    if not messages:
        return [], buffer
    
    # If we got messages, reconstruct what was consumed and remove it from buffer
    # For now, just clear the buffer if we successfully parsed something
    if len(messages) > 0:
        # Find the last EOR in the decoded text
        try:
            text = buffer.decode("utf-16le", errors="ignore")
            if EOR in text:
                # Simple approach: remove up to and including the last EOR we found
                last_eor_pos = text.rfind(EOR)
                if last_eor_pos >= 0:
                    # Account for UTF-16LE encoding (2 bytes per char) + trailer
                    consumed = (last_eor_pos + len(EOR)) * 2 + 3
                    return messages, buffer[consumed:]
        except:
            pass
    
    return messages, buffer

def respond_to_message(sock: socket.socket, msg: str, log_file: Optional[str] = None) -> None:
    """Respond to server messages with appropriate acknowledgments."""
    msg_lower = msg.lower()
    response = None
    
    if "<hello>" in msg_lower:
        print("  → Server sent greeting, acknowledging...")
        response = "<HELLO>N3FJP Compatible Client<HELLO>"
    elif "<ntwk>" in msg_lower and "<open>" in msg_lower:
        print("  → Server requested NTWK OPEN, responding...")
        response = "<NTWK><OPEN></OPEN></NTWK>"
    elif "<ntwk>" in msg_lower and "<check>" in msg_lower:
        print("  → Server sent NTWK CHECK, responding...")
        response = "<NTWK><CHECK></CHECK></NTWK>"
    elif "<who>" in msg_lower:
        print("  → Server requested WHO, sending station list...")
        response = "<BAMS><STATION>TEST-CLIENT</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>"
    
    if response:
        send_message(sock, response)
        if log_file:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"  RESP: {response}\n")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="N3FJP Client - Connect to server and observe protocol")
    parser.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=10000, help="Server port (default: 10000)")
    parser.add_argument("--log", dest="log_path", default=None, help="Log file for capture")
    args = parser.parse_args()
    
    if args.log_path:
        # Clear log file
        with open(args.log_path, "w", encoding="utf-8") as f:
            f.write(f"N3FJP Client Log - Connecting to {args.host}:{args.port}\n")
            f.write("=" * 60 + "\n\n")
    
    connect_to_server(args.host, args.port, args.log_path)

if __name__ == "__main__":
    main()
