# Network Capture Plan

## Goal
Capture UDP/TCP traffic from the logging app without decompiling or modifying binaries.

## Approach Options
1. **Host capture** (simplest): run the app and capture with tcpdump/Wireshark on the host.
2. **Containerized capture**: run a dedicated capture container that listens on a mirrored interface or uses host networking.

## Recommended (MVP)
- Use a capture container with **host networking** and **tcpdump** to record traffic to a pcap file.
- Filter by port after discovery scans.

## Discovery Steps
1. Start the app normally.
2. Identify open ports (host-side scan).
3. Capture traffic with a port filter.

## Notes
- Do not capture or store unrelated traffic.
- Store captures under /captures with clear labels and timestamps.
