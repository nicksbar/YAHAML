#!/usr/bin/env node
/**
 * N3FJP Protocol Log Analyzer
 * 
 * Parses and analyzes captured MITM relay logs
 * 
 * Usage:
 *   node scripts/analyze_n3fjp_log.js [log_file]
 */

import * as fs from 'fs';
import * as path from 'path';

const logFile = process.argv[2] || './captures/n3fjp_mitm.json';

if (!fs.existsSync(logFile)) {
  console.error(`Log file not found: ${logFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(logFile, 'utf-8'));

if (Array.isArray(data)) {
  // Multiple relay sessions
  data.forEach((relay) => analyzeRelay(relay));
} else {
  // Single relay session
  analyzeRelay(data);
}

function analyzeRelay(relay: any) {
  console.log('\n' + '='.repeat(80));
  console.log(`Connection: ${relay.id}`);
  console.log(`Time: ${relay.timestamp}`);
  console.log(`Server: ${relay.serverHost}:${relay.serverPort}`);
  console.log(`Messages: ${relay.messageCount}`);
  console.log('='.repeat(80));

  const clientToServer = relay.messages.filter(
    (m: any) => m.direction === 'client→server',
  );
  const serverToClient = relay.messages.filter(
    (m: any) => m.direction === 'server→client',
  );

  console.log(`\nClient → Server: ${clientToServer.length} messages`);
  clientToServer.forEach((msg: any, i: number) => {
    console.log(
      `  [${i + 1}] ${msg.timestamp} (${msg.length} bytes)`,
    );
    console.log(`      HEX: ${msg.hex}`);
    console.log(`      ASCII: ${msg.ascii}`);
  });

  console.log(`\nServer → Client: ${serverToClient.length} messages`);
  serverToClient.forEach((msg: any, i: number) => {
    console.log(
      `  [${i + 1}] ${msg.timestamp} (${msg.length} bytes)`,
    );
    console.log(`      HEX: ${msg.hex}`);
    console.log(`      ASCII: ${msg.ascii}`);
  });

  // Extract protocol patterns
  console.log('\n' + '-'.repeat(80));
  console.log('Protocol Analysis:');
  console.log('-'.repeat(80));

  const allMessages = relay.messages;
  const commands = new Set<string>();
  const responses = new Set<string>();

  allMessages.forEach((msg: any) => {
    const parts = msg.ascii.split(/[\r\n]/);
    parts.forEach((part: string) => {
      const trimmed = part.trim();
      if (trimmed) {
        if (msg.direction === 'client→server') {
          commands.add(trimmed);
        } else {
          responses.add(trimmed);
        }
      }
    });
  });

  console.log('\nUnique Client Commands:');
  Array.from(commands).forEach((cmd) => {
    console.log(`  - ${cmd}`);
  });

  console.log('\nUnique Server Responses:');
  Array.from(responses).forEach((resp) => {
    console.log(`  - ${resp}`);
  });
}
