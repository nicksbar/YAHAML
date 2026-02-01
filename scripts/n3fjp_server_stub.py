#!/usr/bin/env python3
import argparse
import socket
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

BOR = "<BOR>"
EOR = "<EOR>"
TRAILER = "\x03\x04\x07"


@dataclass
class ClientState:
    addr: tuple[str, int]
    station: Optional[str] = None
    band: Optional[str] = None
    mode: Optional[str] = None


class Server:
    def __init__(self, host: str, port: int, log_path: Optional[str]) -> None:
        self.host = host
        self.port = port
        self.log_path = log_path
        self.clients: Dict[socket.socket, ClientState] = {}
        self.lock = threading.Lock()

    def start(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind((self.host, self.port))
            server.listen(5)
            print(f"Listening on {self.host}:{self.port}")
            while True:
                conn, addr = server.accept()
                with self.lock:
                    self.clients[conn] = ClientState(addr=addr)
                thread = threading.Thread(target=self.handle_client, args=(conn,), daemon=True)
                thread.start()

    def handle_client(self, conn: socket.socket) -> None:
        addr = conn.getpeername()
        print(f"Client connected: {addr}")
        
        # Send greeting/welcome on connect
        self.send_greeting(conn)
        
        try:
            buffer = b""
            heartbeat_count = 0
            idle_count = 0
            max_idle = 3  # Allow 3 empty recv calls before closing
            
            while True:
                try:
                    data = conn.recv(4096)
                except socket.timeout:
                    print(f"Timeout on {addr}")
                    break
                
                if not data:
                    idle_count += 1
                    if idle_count >= max_idle:
                        print(f"Client closed after {idle_count} empty recv calls: {addr}")
                        break
                    else:
                        print(f"No data received ({idle_count}/{max_idle}), continuing: {addr}")
                        continue
                
                idle_count = 0  # Reset on receiving data
                self.log_raw(addr, data)
                print(f"Received {len(data)} bytes from {addr}")
                buffer += data
                messages, buffer = self.extract_messages(buffer)
                print(f"Extracted {len(messages)} messages, buffer remaining: {len(buffer)} bytes")
                for msg in messages:
                    self.log_msg(addr, msg)
                    self.handle_message(conn, msg)
                    # Respond to heartbeats more aggressively
                    if "NTWK" in msg and "CHECK" in msg:
                        heartbeat_count += 1
                        if heartbeat_count % 5 == 0:
                            print(f"Heartbeat {heartbeat_count} from {addr}")
        except Exception as e:
            print(f"Error handling client {addr}: {e}")
        finally:
            with self.lock:
                self.clients.pop(conn, None)
            conn.close()
            print(f"Client disconnected: {addr}")

    def log_raw(self, addr: tuple[str, int], data: bytes) -> None:
        if not self.log_path:
            return
        line = data.hex()
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(f"RAW {addr}: {line}\n")

    def log_msg(self, addr: tuple[str, int], msg: str) -> None:
        if not self.log_path:
            return
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(f"MSG {addr}: {msg}\n")

    def extract_messages(self, data: bytes) -> tuple[List[str], bytes]:
        text = data.decode("utf-16le", errors="ignore")
        # Strip control bytes from parsed text to stabilize tag parsing
        text = text.replace("\x03", "").replace("\x04", "").replace("\x07", "")

        messages: List[str] = []
        remaining_text = ""

        if BOR not in text:
            return [], data  # Keep original bytes if no BOR found

        # Split on <BOR> markers
        parts = text.split(BOR)
        for index, part in enumerate(parts[1:], start=1):
            part = part.strip()
            if not part:
                continue
            if EOR in part:
                # Normal case: message has explicit EOR
                msg, _rest = part.split(EOR, 1)
                messages.append(msg)
            else:
                # Message without EOR: treat as complete if followed by another BOR
                if index < len(parts) - 1:
                    messages.append(part)
                else:
                    # Last part without EOR; keep in buffer as original bytes
                    remaining_text = BOR + part

        if remaining_text:
            remaining = remaining_text.encode("utf-16le", errors="ignore")
        else:
            remaining = b""
        return messages, remaining

    def handle_message(self, conn: socket.socket, msg: str) -> None:
        msg = msg.replace("\x03", "").replace("\x04", "").replace("\x07", "")
        tags = self.parse_tags(msg)
        if not tags:
            return
        
        print(f"Handling message with tags: {list(tags.keys())}")
        
        if "BAMS" in tags:
            self.update_station(conn, tags)
            # Broadcast station update to other clients
            self.broadcast_to_others(conn, msg)
        if "MESG" in tags:
            self.broadcast(msg)
        if "WHO" in tags:
            self.send_who(conn)
        if "NTWK" in tags and "OPEN" in tags:
            self.send_ack(conn, "OPEN")
        if "NTWK" in tags and "CHECK" in tags:
            self.send_ack(conn, "CHECK")
        if "NTWK" in tags and "TRANSACTION" in tags:
            # Log entry submission (ADD/UPDATE/DELETE)
            self.handle_transaction(conn, tags)
            self.send_ack(conn, "TRANSACTION")

    def broadcast_to_others(self, sender: socket.socket, msg: str) -> None:
        """Broadcast a message to all clients except the sender."""
        with self.lock:
            conns = [c for c in self.clients.keys() if c != sender]
        for conn in conns:
            try:
                self.send(conn, msg)
            except OSError:
                pass

    def parse_tags(self, msg: str) -> Dict[str, Optional[str]]:
        tags: Dict[str, Optional[str]] = {}
        while "<" in msg and ">" in msg:
            start = msg.find("<")
            end = msg.find(">", start + 1)
            if end == -1:
                break
            tag = msg[start + 1:end]
            close = f"</{tag}>"
            if close in msg:
                value_start = end + 1
                value_end = msg.find(close)
                value = msg[value_start:value_end].strip()
                tags[tag] = value if value else None
                msg = msg[value_end + len(close):]
            else:
                tags[tag] = None
                msg = msg[end + 1:]
        return tags

    def update_station(self, conn: socket.socket, tags: Dict[str, Optional[str]]) -> None:
        with self.lock:
            state = self.clients.get(conn)
            if not state:
                return
            if tags.get("STATION"):
                state.station = tags["STATION"].strip() if tags["STATION"] else None
            if tags.get("BAND"):
                state.band = tags["BAND"]
            if tags.get("MODE"):
                state.mode = tags["MODE"]

    def handle_transaction(self, conn: socket.socket, tags: Dict[str, Optional[str]]) -> None:
        """Handle log entry transaction (ADD/UPDATE/DELETE)."""
        transaction = tags.get("TRANSACTION", "UNKNOWN")
        from_station = tags.get("FROM", "UNKNOWN")
        
        # Extract XMLDATA if present
        xmldata = tags.get("XMLDATA")
        if xmldata:
            # Parse XML fields (simple tag extraction)
            xml_fields = self.parse_tags(xmldata)
            call = xml_fields.get("FLDCALL", "?")
            band = xml_fields.get("FLDBAND", "?")
            mode = xml_fields.get("FLDMODE", "?")
            print(f"Log entry {transaction}: from {from_station}, call {call}, band {band}m, mode {mode}")
            self.log_msg(conn.getpeername(), f"TRANSACTION {transaction}: {call} {band}m {mode}")
        else:
            print(f"Log entry {transaction}: from {from_station}")
            self.log_msg(conn.getpeername(), f"TRANSACTION {transaction}")


    def send_who(self, conn: socket.socket) -> None:
        with self.lock:
            stations = [s.station for s in self.clients.values() if s.station]
        payload = "".join(f"<STATION>{s}</STATION>" for s in stations)
        # WHO response may need to be formatted differently
        self.send(conn, f"<WHO>{payload}<EOR>")

    def send_greeting(self, conn: socket.socket) -> None:
        """Send initial greeting to new client."""
        # Try a simple greeting
        self.send(conn, "<HELLO>N3FJP Compatible Server<HELLO>")

    def send_ack(self, conn: socket.socket, event: str) -> None:
        self.send(conn, f"<NTWK><{event}><EOR>")

    def broadcast(self, msg: str) -> None:
        """Broadcast a message to all connected clients."""
        with self.lock:
            conns = list(self.clients.keys())
        print(f"Broadcasting to {len(conns)} clients")
        for conn in conns:
            try:
                self.send(conn, msg)
            except OSError:
                pass

    def send(self, conn: socket.socket, body: str) -> None:
        # Construct message as BOR + body + EOR + trailer
        if not body.startswith(BOR):
            body = BOR + body
        if not body.endswith(EOR):
            body = body + EOR
        payload = body.encode("utf-16le", errors="ignore") + TRAILER.encode("latin1")
        try:
            conn.sendall(payload)
            print(f"Sent to {conn.getpeername()}: {body[:50]}...")
        except OSError as e:
            print(f"Send error: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="N3FJP TCP server stub for message capture.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=10000)
    parser.add_argument("--log", dest="log_path", default=None)
    args = parser.parse_args()

    server = Server(args.host, args.port, args.log_path)
    server.start()


if __name__ == "__main__":
    main()
