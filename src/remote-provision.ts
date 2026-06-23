import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { Client } from 'ssh2';

const execFile = promisify(execFileCb);

export type RemoteProvisionRequest = {
  host: string;
  port?: number;
  username: string;
  password: string;
  sudoPassword?: string;
  installRigctl?: boolean;
  /** Preferred flag: install/manage YAHAML audio publisher on remote host */
  installAudioPublisher?: boolean;
  /** @deprecated Backward-compat alias for installAudioPublisher */
  installJanus?: boolean;
  grantScopedSudo?: boolean;
  radioPort?: number;
  rigModel?: number;
  rigDevice?: string;
  rigBaud?: number;
  audioCaptureDevice?: string;
  audioPlaybackDevice?: string;
  /** Full HTTP URL the Pi should use to reach the YAHAML Janus server, e.g. http://192.168.1.10:8088/janus */
  yahamlJanusUrl?: string;
  /** Janus AudioBridge room ID the Pi should publish/receive in */
  janusRoomId?: string | number;
};

export type RemoteProvisionResult = {
  logs: string[];
  warnings: string[];
  publicKey: string;
  privateKeyPath: string;
  scopedSudoGranted: boolean;
};

export type RemoteProvisionHooks = {
  onLog?: (line: string) => void;
  onWarning?: (line: string) => void;
};

export type RigModelOption = {
  modelId: number;
  label: string;
};

export type RemoteHostProbeResult = {
  logs: string[];
  warnings: string[];
  connectionMethod: 'password' | 'privateKey';
  rigModels: RigModelOption[];
  serialDevices: string[];
  audioCaptureDevices: string[];
};

export class RemoteProvisionError extends Error {
  logs: string[];
  warnings: string[];

  constructor(message: string, logs: string[], warnings: string[]) {
    super(message);
    this.name = 'RemoteProvisionError';
    this.logs = logs;
    this.warnings = warnings;
  }
}

function shSingleQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

async function runLocalSshKeygen(comment: string): Promise<{ privateKey: string; publicKey: string }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'yahaml-ssh-'));
  const keyPath = path.join(tempDir, 'id_ed25519');

  try {
    await execFile('ssh-keygen', [
      '-t', 'ed25519',
      '-N', '',
      '-C', comment,
      '-f', keyPath,
      '-q',
    ]);

    const [privateKey, publicKey] = await Promise.all([
      readFile(keyPath, 'utf8'),
      readFile(`${keyPath}.pub`, 'utf8'),
    ]);

    return {
      privateKey,
      publicKey: publicKey.trim(),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function persistPrivateKey(radioId: string, privateKey: string, warnings: string[]): Promise<string> {
  const candidateDirs = [
    path.resolve(process.cwd(), 'data', 'ssh'),
    path.resolve(os.homedir(), '.yahaml', 'ssh'),
    path.resolve(os.tmpdir(), 'yahaml-ssh-persist'),
  ];

  let lastError: any = null;

  for (let index = 0; index < candidateDirs.length; index += 1) {
    const dir = candidateDirs[index];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const keyPath = path.join(dir, `${radioId}_id_ed25519`);
      await writeFile(keyPath, privateKey, { encoding: 'utf8', mode: 0o600 });

      if (index > 0) {
        warnings.push(`Local key storage fallback in use (${dir}) because default project path was not writable.`);
      }

      return keyPath;
    } catch (error: any) {
      lastError = error;
    }
  }

  throw new Error(`Failed to persist private key in any writable directory: ${lastError?.message || 'unknown error'}`);
}

function connectSsh(host: string, port: number, username: string, options: { password?: string; privateKey?: string }): Promise<Client> {
  if (!options.password && !options.privateKey) {
    throw new Error('Either password or privateKey must be provided for SSH connection');
  }

  return new Promise((resolve, reject) => {
    const client = new Client();

    client
      .on('ready', () => resolve(client))
      .on('error', (error) => reject(error))
      .connect({
        host,
        port,
        username,
        password: options.password,
        privateKey: options.privateKey,
        readyTimeout: 15000,
      });
  });
}

async function connectSshWithFallback(host: string, port: number, username: string, password?: string, privateKeyPath?: string): Promise<{ client: Client; method: 'password' | 'privateKey' }> {
  if (password) {
    const client = await connectSsh(host, port, username, { password });
    return { client, method: 'password' };
  }

  if (privateKeyPath) {
    const privateKey = await readFile(privateKeyPath, 'utf8');
    const client = await connectSsh(host, port, username, { privateKey });
    return { client, method: 'privateKey' };
  }

  throw new Error('No SSH auth available. Provide password or a valid stored private key path.');
}

function parseRigModelsFromRigctlList(raw: string): RigModelOption[] {
  const options: RigModelOption[] = [];
  const seen = new Set<number>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const modelId = Number(match[1]);
    const label = match[2].trim();
    if (!Number.isFinite(modelId) || modelId <= 0) continue;
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    options.push({ modelId, label });
  }

  return options.slice(0, 500);
}

function parseSerialDevices(raw: string): string[] {
  const devices = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/dev/'));

  return Array.from(new Set(devices));
}

function parseAudioCaptureDevices(raw: string): string[] {
  const devices: string[] = [];
  const lineRegex = /^card\s+(\d+):\s+([^\[]+)\[(.*?)\],\s+device\s+(\d+):\s+([^\[]+)\[(.*?)\]/i;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(lineRegex);
    if (!match) continue;
    const card = Number(match[1]);
    const device = Number(match[4]);
    const cardName = (match[3] || match[2] || '').trim();
    const deviceName = (match[6] || match[5] || '').trim();
    devices.push(`hw:${card},${device} (${cardName}${deviceName ? ` / ${deviceName}` : ''})`);
  }

  return Array.from(new Set(devices));
}

const COMMON_RIG_MODELS: RigModelOption[] = [
  { modelId: 3073, label: 'Icom IC-7300' },
  { modelId: 3077, label: 'Icom IC-7610' },
  { modelId: 1045, label: 'Yaesu FTDX101MP' },
  { modelId: 1035, label: 'Yaesu FT-991A' },
  { modelId: 2014, label: 'Kenwood TS-590SG' },
  { modelId: 2027, label: 'Elecraft K3' },
];

function mergeRigModels(primary: RigModelOption[], secondary: RigModelOption[]): RigModelOption[] {
  const merged: RigModelOption[] = [];
  const seen = new Set<number>();

  for (const option of [...primary, ...secondary]) {
    if (seen.has(option.modelId)) continue;
    seen.add(option.modelId);
    merged.push(option);
  }

  return merged;
}

function execRemote(
  client: Client,
  command: string,
  hooks?: {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';
      let code = 255;

      stream
        .on('close', (exitCode: number | null) => {
          code = exitCode ?? 0;
          resolve({ code, stdout, stderr });
        })
        .on('data', (data: Buffer) => {
          const chunk = data.toString('utf8');
          stdout += chunk;
          hooks?.onStdout?.(chunk);
        });

      stream.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8');
        stderr += chunk;
        hooks?.onStderr?.(chunk);
      });
    });
  });
}

function emitLines(text: string, emit?: (line: string) => void) {
  if (!emit) return;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) emit(trimmed);
  }
}

async function execRequired(
  client: Client,
  command: string,
  label: string,
  logs: string[],
  hooks?: RemoteProvisionHooks,
): Promise<void> {
  hooks?.onLog?.(`$ ${label}`);
  const result = await execRemote(client, command, {
    onStdout: (chunk) => emitLines(chunk, hooks?.onLog),
    onStderr: (chunk) => emitLines(chunk, hooks?.onLog),
  });
  logs.push(`$ ${label}`);
  if (result.stdout.trim()) logs.push(result.stdout.trim());
  if (result.stderr.trim()) logs.push(result.stderr.trim());

  if (result.code !== 0) {
    throw new Error(`${label} failed with exit code ${result.code}`);
  }
}

async function execBestEffort(
  client: Client,
  command: string,
  label: string,
  logs: string[],
  warnings: string[],
  hooks?: RemoteProvisionHooks,
): Promise<void> {
  hooks?.onLog?.(`$ ${label}`);
  const result = await execRemote(client, command, {
    onStdout: (chunk) => emitLines(chunk, hooks?.onLog),
    onStderr: (chunk) => emitLines(chunk, hooks?.onLog),
  });
  logs.push(`$ ${label}`);
  if (result.stdout.trim()) logs.push(result.stdout.trim());
  if (result.stderr.trim()) logs.push(result.stderr.trim());
  if (result.code !== 0) {
    const warning = `${label} did not complete successfully (exit ${result.code}).`;
    warnings.push(warning);
    hooks?.onWarning?.(warning);
  }
}

function sudoCommand(shellCommand: string, sudoPassword?: string): string {
  if (!sudoPassword) {
    return `sudo -n bash -lc ${shSingleQuote(shellCommand)}`;
  }

  return `printf '%s\\n' ${shSingleQuote(sudoPassword)} | sudo -S -p '' bash -lc ${shSingleQuote(shellCommand)}`;
}

export async function provisionRemoteRigHost(
  radioId: string,
  request: RemoteProvisionRequest,
  hooks?: RemoteProvisionHooks,
): Promise<RemoteProvisionResult> {
  const host = request.host.trim();
  const username = request.username.trim();
  const password = request.password;
  const port = request.port ?? 22;

  if (!host || !username || !password) {
    throw new Error('host, username, and password are required');
  }

  const logs: string[] = [];
  const warnings: string[] = [];
  const installRigctl = request.installRigctl !== false;
  const installAudioPublisher = request.installAudioPublisher !== undefined
    ? request.installAudioPublisher !== false
    : request.installJanus !== false;
  const grantScopedSudo = request.grantScopedSudo !== false;
  const rigModel = Number.isFinite(Number(request.rigModel)) ? Number(request.rigModel) : null;
  const rigDevice = typeof request.rigDevice === 'string' ? request.rigDevice.trim() : '';
  const rigBaud = Number.isFinite(Number(request.rigBaud)) ? Number(request.rigBaud) : 115200;
  const audioCaptureDevice = typeof request.audioCaptureDevice === 'string' ? request.audioCaptureDevice.trim() : '';

  const keyPair = await runLocalSshKeygen(`yahaml-${radioId}`);
  const privateKeyPath = await persistPrivateKey(radioId, keyPair.privateKey, warnings);

  const { client } = await connectSshWithFallback(host, port, username, password);
  hooks?.onLog?.(`SSH connected to ${host}:${port} as ${username}`);

  try {
    const authKeyCmd = [
      'mkdir -p ~/.ssh',
      'chmod 700 ~/.ssh',
      'touch ~/.ssh/authorized_keys',
      'chmod 600 ~/.ssh/authorized_keys',
      `grep -qxF ${shSingleQuote(keyPair.publicKey)} ~/.ssh/authorized_keys || echo ${shSingleQuote(keyPair.publicKey)} >> ~/.ssh/authorized_keys`,
    ].join(' && ');

    await execRequired(client, authKeyCmd, 'Install generated SSH public key', logs, hooks);

    const checkSudo = await execRemote(client, 'sudo -n true');
    const hasPasswordlessSudo = checkSudo.code === 0;
    const hasSudoPassword = Boolean(request.sudoPassword && request.sudoPassword.length > 0);

    if (!hasPasswordlessSudo && !hasSudoPassword) {
      const warning = 'Sudo password not provided and passwordless sudo is unavailable; package install and sudoers setup skipped.';
      warnings.push(warning);
      hooks?.onWarning?.(warning);
    }

    if (installRigctl && (hasPasswordlessSudo || hasSudoPassword)) {
      await execRequired(
        client,
        sudoCommand('DEBIAN_FRONTEND=noninteractive apt-get update && (DEBIAN_FRONTEND=noninteractive apt-get install -y libhamlib-utils || DEBIAN_FRONTEND=noninteractive apt-get install -y hamlib-utils)', request.sudoPassword),
        'Install rigctld dependencies (libhamlib-utils/hamlib-utils)',
        logs,
        hooks,
      );

      await execBestEffort(
        client,
        'ls -l /dev/serial/by-id 2>/dev/null || true && arecord -l 2>/dev/null || true && aplay -l 2>/dev/null || true',
        'Detect remote serial and audio devices',
        logs,
        warnings,
        hooks,
      );

      if (rigModel && rigDevice) {
        const serviceContents = [
          '[Unit]',
          'Description=YAHAML rigctld service',
          'After=network.target',
          '',
          '[Service]',
          'Type=simple',
          `ExecStart=/usr/bin/rigctld -m ${rigModel} -r ${rigDevice} -s ${rigBaud} -t ${request.radioPort && request.radioPort > 0 ? request.radioPort : 4532} -T 0.0.0.0`,
          'Restart=on-failure',
          'RestartSec=5',
          '',
          '[Install]',
          'WantedBy=multi-user.target',
          '',
        ].join('\n');

        const servicePath = '/tmp/yahaml-rigctld.service';
        const installServiceCmd = [
          `printf %s ${shSingleQuote(serviceContents)} > ${shSingleQuote(servicePath)}`,
          sudoCommand(`install -m 0644 ${servicePath} /etc/systemd/system/yahaml-rigctld.service && rm -f ${servicePath}`, request.sudoPassword),
          sudoCommand('systemctl daemon-reload && systemctl enable --now yahaml-rigctld.service', request.sudoPassword),
          sudoCommand('systemctl --no-pager --full status yahaml-rigctld.service || true', request.sudoPassword),
        ].join(' && ');

        await execBestEffort(
          client,
          installServiceCmd,
          'Configure and start yahaml-rigctld systemd service',
          logs,
          warnings,
          hooks,
        );
      } else {
        const warning = 'Rigctld service not auto-configured: provide rigModel and rigDevice to auto-create a systemd service for your specific radio.';
        warnings.push(warning);
        hooks?.onWarning?.(warning);
      }

      if (audioCaptureDevice) {
        const line = `Requested audio capture device hint: ${audioCaptureDevice}`;
        logs.push(line);
        hooks?.onLog?.(line);
      }
    }

    if (installAudioPublisher && (hasPasswordlessSudo || hasSudoPassword)) {
      // The Pi does NOT need Janus. It just needs to publish audio to (uplink) and receive
      // audio from (downlink) the YAHAML server's Janus AudioBridge room.
      //
      //  UPLINK:   ALSA capture  →  Opus RTP  →  YAHAML Janus room
      //  DOWNLINK: YAHAML Janus room mix  →  RTP forward  →  ALSA playback  →  radio TX
      //
      // PTT (via CAT/rigctld) gates the radio TX hardware — the audio chain is always connected.

      const installPublisherDepsCmd = [
        'DEBIAN_FRONTEND=noninteractive apt-get update',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y python3 ffmpeg',
      ].join('\n');

      await execRequired(
        client,
        sudoCommand(installPublisherDepsCmd, request.sudoPassword),
        'Install audio publisher dependencies (python3, ffmpeg)',
        logs,
        hooks,
      );

      // Write the fully bidirectional publisher script
      const publisherScript = `#!/usr/bin/env python3
"""
YAHAML Pi Audio Publisher/Receiver - bidirectional full-duplex
UPLINK:   ALSA capture -> Opus RTP -> YAHAML Janus AudioBridge room
DOWNLINK: YAHAML Janus room mix -> RTP forward -> ALSA playback -> radio TX
PTT is handled by rigctld (CAT commands to the radio hardware).
Config: /etc/yahaml-publisher.conf  or  environment variables.
"""
import json, os, socket, subprocess, time, urllib.request, random, string

def load_conf(path='/etc/yahaml-publisher.conf'):
    conf = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    conf[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return conf

conf = load_conf()
def cfg(key, default=''):
    return conf.get(key) or os.environ.get(key) or default

JANUS_URL        = cfg('JANUS_URL', 'http://localhost:8088/janus')
JANUS_ROOM       = int(cfg('JANUS_ROOM', '1234'))
ALSA_CAPTURE     = cfg('ALSA_CAPTURE', 'hw:0,0')
ALSA_PLAYBACK    = cfg('ALSA_PLAYBACK', 'hw:0,0')
DISPLAY_NAME     = cfg('DISPLAY_NAME', 'PiRadio')
DOWNLINK_PORT    = int(cfg('DOWNLINK_PORT', '5006'))

def txn():
    return ''.join(random.choices(string.ascii_lowercase, k=8))

def post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def my_ip(janus_host):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((janus_host, 80))
        return s.getsockname()[0]
    finally:
        s.close()

def run():
    janus_host = JANUS_URL.split('/')[2].split(':')[0]
    pi_ip = my_ip(janus_host)
    print(f'[publisher] Pi IP={pi_ip}  Janus={JANUS_URL}  Room={JANUS_ROOM}')

    r = post(JANUS_URL, {'janus': 'create', 'transaction': txn()})
    sid = r['data']['id']
    print(f'[publisher] Session: {sid}')

    r = post(f'{JANUS_URL}/{sid}', {'janus': 'attach', 'plugin': 'janus.plugin.audiobridge', 'transaction': txn()})
    hid = r['data']['id']
    print(f'[publisher] Handle: {hid}')

    r = post(f'{JANUS_URL}/{sid}/{hid}', {
        'janus': 'message',
        'body': {'request': 'join', 'room': JANUS_ROOM, 'display': DISPLAY_NAME},
        'transaction': txn(),
    })
    print(f'[publisher] Joined room {JANUS_ROOM}')

    # Configure publisher - get the RTP port Janus expects us to send to
    r = post(f'{JANUS_URL}/{sid}/{hid}', {
        'janus': 'message',
        'body': {'request': 'configure', 'muted': False},
        'transaction': txn(),
    })
    rtp_uplink_port = (r.get('plugindata', {}) or {}).get('data', {}).get('rtp_port')
    if not rtp_uplink_port:
        raise RuntimeError(f'No rtp_port from Janus configure. Full response: {json.dumps(r)}')
    print(f'[publisher] UPLINK: {ALSA_CAPTURE} -> Opus -> {janus_host}:{rtp_uplink_port}')

    # Set up DOWNLINK: ask Janus to forward the room mix to us via RTP
    r = post(f'{JANUS_URL}/{sid}/{hid}', {
        'janus': 'message',
        'body': {
            'request': 'rtp_forward',
            'room': JANUS_ROOM,
            'host': pi_ip,
            'port': DOWNLINK_PORT,
        },
        'transaction': txn(),
    })
    stream_id = (r.get('plugindata', {}) or {}).get('data', {}).get('stream_id')
    print(f'[publisher] DOWNLINK: Janus mix -> {pi_ip}:{DOWNLINK_PORT} -> {ALSA_PLAYBACK}  (stream_id={stream_id})')

    # Start UPLINK process: ALSA capture -> Opus RTP -> Janus
    uplink = subprocess.Popen([
        'ffmpeg', '-hide_banner', '-loglevel', 'warning',
        '-f', 'alsa', '-i', ALSA_CAPTURE,
        '-ar', '48000', '-ac', '1',
        '-c:a', 'libopus', '-b:a', '64k', '-application', 'voip',
        '-f', 'rtp', f'rtp://{janus_host}:{rtp_uplink_port}',
    ])

    # Start DOWNLINK process: receive Janus RTP mix -> ALSA playback (radio TX audio)
    downlink = subprocess.Popen([
        'ffmpeg', '-hide_banner', '-loglevel', 'warning',
        '-f', 'rtp', '-i', f'rtp://0.0.0.0:{DOWNLINK_PORT}',
        '-f', 'alsa', ALSA_PLAYBACK,
    ])

    print(f'[publisher] Running. Uplink PID={uplink.pid}, Downlink PID={downlink.pid}. PTT is via CAT/rigctld.')
    try:
        while True:
            time.sleep(5)
            try:
                post(f'{JANUS_URL}/{sid}', {'janus': 'keepalive', 'transaction': txn()})
            except Exception as e:
                print(f'[publisher] Keepalive failed: {e}')
                break
            if uplink.poll() is not None:
                print('[publisher] Uplink died, reconnecting...')
                break
    except KeyboardInterrupt:
        pass
    finally:
        uplink.terminate()
        downlink.terminate()
        try:
            if stream_id:
                post(f'{JANUS_URL}/{sid}/{hid}', {
                    'janus': 'message',
                    'body': {'request': 'stop_rtp_forward', 'room': JANUS_ROOM, 'stream_id': stream_id},
                    'transaction': txn(),
                })
        except Exception:
            pass
        try:
            post(f'{JANUS_URL}/{sid}/{hid}', {'janus': 'detach', 'transaction': txn()})
            post(f'{JANUS_URL}/{sid}', {'janus': 'destroy', 'transaction': txn()})
        except Exception:
            pass
        print('[publisher] Disconnected.')

if __name__ == '__main__':
    while True:
        try:
            run()
        except Exception as e:
            print(f'[publisher] Error: {e}  -- retrying in 10s')
            time.sleep(10)
`;

      const captureDevice = audioCaptureDevice ? audioCaptureDevice.split(' ')[0] : 'hw:0,0';
      const playbackDevice = request.audioPlaybackDevice
        ? request.audioPlaybackDevice.split(' ')[0]
        : captureDevice;  // USB audio codec is usually the same card for capture + playback

      const janusUrl = request.yahamlJanusUrl || 'http://YAHAML_SERVER_IP:8088/janus';
      const janusRoom = request.janusRoomId ? String(request.janusRoomId) : '1234';
      const isFullyConfigured = !janusUrl.includes('YAHAML_SERVER_IP');

      const scriptPath = '/usr/local/bin/yahaml-audio-publisher';
      const writeScriptCmd = [
        `printf %s ${shSingleQuote(publisherScript)} > /tmp/yahaml-publisher.py`,
        sudoCommand(`install -m 0755 /tmp/yahaml-publisher.py ${scriptPath} && rm -f /tmp/yahaml-publisher.py`, request.sudoPassword),
      ].join(' && ');
      await execRequired(client, writeScriptCmd, 'Install yahaml-audio-publisher script', logs, hooks);

      const publisherConf = [
        '# YAHAML Pi Audio Publisher config',
        '# Janus runs on the YAHAML server, NOT on the Pi.',
        '# UPLINK:  ALSA_CAPTURE -> Opus RTP -> Janus room (radio RX audio to operators)',
        '# DOWNLINK: Janus room mix -> RTP -> ALSA_PLAYBACK -> radio TX (operators talking to radio)',
        `JANUS_URL=${janusUrl}`,
        `JANUS_ROOM=${janusRoom}`,
        `ALSA_CAPTURE=${captureDevice}`,
        `ALSA_PLAYBACK=${playbackDevice}`,
        `DISPLAY_NAME=PiRadio`,
        `DOWNLINK_PORT=5006`,
        '',
      ].join('\n');

      const writeConfCmd = [
        `printf %s ${shSingleQuote(publisherConf)} > /tmp/yahaml-publisher.conf`,
        sudoCommand('install -m 0644 /tmp/yahaml-publisher.conf /etc/yahaml-publisher.conf && rm -f /tmp/yahaml-publisher.conf', request.sudoPassword),
      ].join(' && ');
      await execRequired(client, writeConfCmd, 'Write /etc/yahaml-publisher.conf', logs, hooks);

      const publisherService = [
        '[Unit]',
        'Description=YAHAML Pi Audio Publisher (bidirectional: ALSA <-> YAHAML Janus)',
        'After=network-online.target sound.target',
        'Wants=network-online.target',
        '',
        '[Service]',
        'Type=simple',
        `ExecStart=/usr/bin/python3 ${scriptPath}`,
        'Restart=always',
        'RestartSec=10',
        'StandardOutput=journal',
        'StandardError=journal',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        '',
      ].join('\n');

      const startNow = isFullyConfigured ? ' && systemctl start yahaml-audio-publisher.service' : '';
      const serviceInstallCmd = [
        `printf %s ${shSingleQuote(publisherService)} > /tmp/yahaml-publisher.service`,
        sudoCommand(`install -m 0644 /tmp/yahaml-publisher.service /etc/systemd/system/yahaml-audio-publisher.service && rm -f /tmp/yahaml-publisher.service`, request.sudoPassword),
        sudoCommand(`systemctl daemon-reload && systemctl enable yahaml-audio-publisher.service${startNow}`, request.sudoPassword),
      ].join(' && ');
      await execBestEffort(
        client,
        serviceInstallCmd,
        isFullyConfigured
          ? 'Install and START yahaml-audio-publisher service'
          : 'Install yahaml-audio-publisher service (not started — JANUS_URL needs updating in /etc/yahaml-publisher.conf)',
        logs,
        warnings,
        hooks,
      );

      if (!isFullyConfigured) {
        const note = `NEXT STEP on Pi: sudo nano /etc/yahaml-publisher.conf — set JANUS_URL to your YAHAML server's Janus address, then: sudo systemctl start yahaml-audio-publisher`;
        logs.push(note);
        hooks?.onLog?.(note);
      } else {
        await execBestEffort(
          client,
          sudoCommand('systemctl --no-pager status yahaml-audio-publisher.service || true', request.sudoPassword),
          'Check yahaml-audio-publisher service status',
          logs, warnings, hooks,
        );
      }
    }

    let scopedSudoGranted = false;
    if (grantScopedSudo && (hasPasswordlessSudo || hasSudoPassword)) {
      const sudoersContents = [
        `# Managed by YAHAML for radio ${radioId}`,
        `${username} ALL=(root) NOPASSWD: /usr/bin/systemctl start yahaml-rigctld, /usr/bin/systemctl stop yahaml-rigctld, /usr/bin/systemctl restart yahaml-rigctld, /usr/bin/systemctl status yahaml-rigctld, /usr/bin/systemctl start yahaml-audio-publisher, /usr/bin/systemctl stop yahaml-audio-publisher, /usr/bin/systemctl restart yahaml-audio-publisher, /usr/bin/systemctl status yahaml-audio-publisher`,
      ].join('\n');

      const sudoersPath = `/tmp/yahaml-${radioId}.sudoers`;
      const sudoersInstallCmd = [
        `printf %s ${shSingleQuote(sudoersContents)} > ${shSingleQuote(sudoersPath)}`,
        sudoCommand(`install -m 0440 ${sudoersPath} /etc/sudoers.d/yahaml-${radioId} && rm -f ${sudoersPath}`, request.sudoPassword),
      ].join(' && ');

      await execRequired(client, sudoersInstallCmd, 'Install scoped sudoers policy for janus/rigctld controls', logs);
      scopedSudoGranted = true;
    }

    if (request.radioPort && request.radioPort > 0) {
      const warning = `rigctld install complete, but service configuration on port ${request.radioPort} remains manual (radio model/device vary by station).`;
      warnings.push(warning);
      hooks?.onWarning?.(warning);
    }

    return {
      logs,
      warnings,
      publicKey: keyPair.publicKey,
      privateKeyPath,
      scopedSudoGranted,
    };
  } catch (error: any) {
    hooks?.onWarning?.(error?.message || 'Remote provisioning failed');
    throw new RemoteProvisionError(error?.message || 'Remote provisioning failed', logs, warnings);
  } finally {
    client.end();
    hooks?.onLog?.('SSH session closed');
  }
}

export async function probeRemoteHostOptions(options: {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
}): Promise<RemoteHostProbeResult> {
  const host = String(options.host || '').trim();
  const username = String(options.username || '').trim();
  const port = Number(options.port || 22);

  if (!host || !username) {
    throw new Error('host and username are required');
  }

  const logs: string[] = [];
  const warnings: string[] = [];
  const { client, method } = await connectSshWithFallback(
    host,
    port,
    username,
    options.password,
    options.privateKeyPath,
  );

  try {
    const modelProbe = await execRemote(
      client,
      'if command -v rigctl >/dev/null 2>&1; then rigctl --list; else echo "__RIGCTL_NOT_INSTALLED__"; fi',
    );
    logs.push('$ Probe supported rig models via rigctl --list');
    if (modelProbe.stderr.trim()) logs.push(modelProbe.stderr.trim());

    let rigModels = parseRigModelsFromRigctlList(modelProbe.stdout);
    if (modelProbe.stdout.includes('__RIGCTL_NOT_INSTALLED__')) {
      warnings.push('rigctl is not installed on remote host yet; showing common known model presets.');
      rigModels = mergeRigModels([], COMMON_RIG_MODELS);
    } else {
      rigModels = mergeRigModels(rigModels, COMMON_RIG_MODELS);
    }

    const serialProbe = await execRemote(
      client,
      'ls -1 /dev/serial/by-id 2>/dev/null; ls -1 /dev/ttyUSB* /dev/ttyACM* 2>/dev/null',
    );
    logs.push('$ Probe serial device candidates');
    if (serialProbe.stderr.trim()) logs.push(serialProbe.stderr.trim());
    const serialDevices = parseSerialDevices(serialProbe.stdout);
    if (serialDevices.length === 0) {
      warnings.push('No serial devices detected via /dev/serial/by-id, /dev/ttyUSB*, or /dev/ttyACM*.');
    }

    const audioProbe = await execRemote(client, 'arecord -l 2>/dev/null || true');
    logs.push('$ Probe ALSA capture devices (arecord -l)');
    if (audioProbe.stderr.trim()) logs.push(audioProbe.stderr.trim());
    const audioCaptureDevices = parseAudioCaptureDevices(audioProbe.stdout);
    if (audioCaptureDevices.length === 0) {
      warnings.push('No ALSA capture devices detected via arecord -l.');
    }

    return {
      logs,
      warnings,
      connectionMethod: method,
      rigModels,
      serialDevices,
      audioCaptureDevices,
    };
  } finally {
    client.end();
  }
}
