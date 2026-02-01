# External Logging Software TCP Protocol

## Overview
Documentation of TCP-based multi-station networking protocol used by common Windows ham radio logging applications.

## Message Types
- `BAMS`: Station/band/mode announcement
  - Fields: `STATION`, `BAND`, `MODE`
- `NTWK OPEN`: Network session open
- `WHO`: Client querying for who is on the network
- `MESG`: Chat message
  - Fields: `TO` (empty in sample), `FROM`, `MSGTXT`
- `NTWK CHECK`: Heartbeat/keepalive

## Encoding
- Encoding: UTF-16LE (little-endian Unicode)
- Message framing: `<BOR>` (begin) and `<EOR>` (end) markers
- Trailer: Control bytes after EOR

## Server Implementation Requirements
To support external logging clients:
1. Accept TCP connection.
2. Parse incoming tag blocks from UTF-16LE payload.
3. Respond to `WHO` with a list of known stations.
4. Accept `MESG` and optionally broadcast to other clients.
5. Respond to `NTWK CHECK` heartbeats.
6. Broadcast station changes to connected clients.

## Implementation
The relay server (src/relay.ts) implements this protocol, supporting:
- Multi-client connection handling
- Message parsing and routing
- Station tracking and WHO responses
- Chat message broadcasting

## Protocol Details

### Message Format
- Payload is UTF-16LE encoded
- Messages are bounded by `<BOR>` (Begin of Record) and `<EOR>` (End of Record)
- Control bytes `\x03\x04\x07` appear after `<EOR>` as trailer
- Messages may be bundled without `<EOR>` between them; use `<BOR>` as split point

### Client Behavior
Typical connection sequence:
1. `<BAMS>` with station callsign, band, mode
2. `<NTWK><OPEN>` (network session open)
3. `<WHO>` (request for list of active stations)
4. `<SCLK>` with timestamp fields (YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, MILLISECOND)
5. Periodic `<NTWK><CHECK>` heartbeats
6. `<MESG>` for chat messages

### Server Responses
- Greeting: `<BOR><HELLO>Compatible Server<HELLO><EOR>`
- ACK to `NTWK OPEN`: `<BOR><NTWK><OPEN><EOR>`
- Response to `WHO`: `<BOR><WHO><STATION>callsign1</STATION><STATION>callsign2</STATION>...<EOR>`
- ACK to `NTWK CHECK`: `<BOR><NTWK><CHECK><EOR>`
- Broadcast `MESG` to all clients

### Message Types
- **BAMS**: Station/band/mode (fields: STATION, BAND, MODE)
- **NTWK OPEN**: Network session opening
- **NTWK CHECK**: Heartbeat
- **NTWK TRANSACTION**: Log entry submission (fields: FROM, TRANSACTION, XMLDATA)
  - TRANSACTION: ADD, UPDATE, DELETE
  - XMLDATA: XML-encoded QSO record with FLD* prefixed fields
- **WHO**: Query/response for stations
- **MESG**: Chat message (fields: TO, FROM, MSGTXT)
- **SCLK**: Sync clock (fields: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, MILLISECOND)

## QSO Transaction Format
```xml
<NTWK>
  <FROM>hostname</FROM>
  <TRANSACTION>ADD</TRANSACTION>
  <XMLDATA>
    <FLDBAND>15</FLDBAND>
    <FLDCALL>W1AW</FLDCALL>
    <FLDCLASS>1H</FLDCLASS>
    <FLDCOMPUTERNAME>LAPTOP-...</FLDCOMPUTERNAME>
    <FLDCONTESTID>ARRL-FD</FLDCONTESTID>
    <!-- ... 24+ additional fields ... -->
    <FLDOPERATOR>N7UF</FLDOPERATOR>
    <FLDDATESTR>2026/01/31</FLDDATESTR>
    <FLDTIMEONSTR>18:07:25</FLDTIMEONSTR>
  </XMLDATA>
</NTWK>
```

See [docs/canonical-log-model.md](canonical-log-model.md) for complete field mapping.

## Next Steps
- Test TRANSACTION ACK response to see if it improves connection stability.
- Capture additional traffic with multiple clients.
- Build canonical log model and adapters for N1MM/DXLab/etc.
- Capture additional traffic while saving a log entry.
- Capture traffic with two clients to see server broadcast patterns.
