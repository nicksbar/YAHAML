import readline from 'readline';
import { ARRL_FIELD_DAY } from '../../contest-templates';
import { createActivityProfile } from './activity-profile';
import { MemoryAuditLog } from './audit';
import { decideDeterministicRunMode } from './brain';
import { loadCwAgentConfig } from './config';
import { validateCwAction } from './safety';
import { createInitialQsoState, scheduleCq, stopQso } from './state-machine';
import { SimulatedKeyer } from './keyer/simulator';
import { YahamlAgentClient } from './yahaml-client';
import type {
  CwAgentConfig,
  CwQsoState,
  EffectiveCallsignContext,
  RadioAudioSource,
  RadioState,
  TxArmState,
} from './types';

function printHelp(): void {
  console.log([
    'Commands:',
    '/arm',
    '/disarm',
    '/kill',
    '/cq',
    '/stop',
    '/status',
    '/freq <hz>',
    '/mode <mode>',
    '/model list',
    '/model use <backend:model>',
    '/backend radio simulator|hamlib',
    '/backend keyer simulator|cat',
    '/backend decoder simulator|manual',
    '/backend logger yahaml|mock',
    '/inject <cw text>',
    '/help',
  ].join('\n'));
}

function inferBand(frequencyHz?: string): string | undefined {
  if (!frequencyHz) return undefined;
  const hz = Number(frequencyHz);
  if (!Number.isFinite(hz)) return undefined;
  const bands: Array<[number, number, string]> = [
    [1800000, 2000000, '160'],
    [3500000, 4000000, '80'],
    [7000000, 7300000, '40'],
    [10100000, 10150000, '30'],
    [14000000, 14350000, '20'],
    [18068000, 18168000, '17'],
    [21000000, 21450000, '15'],
    [24890000, 24990000, '12'],
    [28000000, 29700000, '10'],
    [50000000, 54000000, '6'],
  ];
  return bands.find(([low, high]) => hz >= low && hz <= high)?.[2];
}

class CwAgentCli {
  private config: CwAgentConfig;
  private qso: CwQsoState;
  private radio: RadioState;
  private audio: RadioAudioSource = { type: 'none' };
  private effectiveCallsign?: EffectiveCallsignContext;
  private readonly audit = new MemoryAuditLog();
  private readonly keyer = new SimulatedKeyer();
  private readonly yahamlClient: YahamlAgentClient;
  private readonly activity = createActivityProfile(ARRL_FIELD_DAY);

  constructor(config: CwAgentConfig) {
    this.config = {
      ...config,
      activityType: config.activityType || this.activity.type,
      activityName: config.activityName || this.activity.name,
      sentExchange: Object.keys(config.sentExchange).length > 0
        ? config.sentExchange
        : { class: '1A', section: 'ORG' },
    };
    this.qso = createInitialQsoState(this.config.sentExchange);
    this.radio = {
      frequencyHz: '14030000',
      band: '20',
      mode: 'CW',
      connected: true,
      ptt: false,
    };
    this.yahamlClient = new YahamlAgentClient(this.config.yahamlBaseUrl);
  }

  async initialize(): Promise<void> {
    if (!this.config.stationId) {
      this.audit.append({
        level: 'WARN',
        event: 'SESSION_SKIPPED',
        details: { reason: 'CW_AGENT_STATION_ID not configured' },
      });
      return;
    }

    const context = await this.yahamlClient.bootstrapAgentContext(this.config);
    if (context.session) {
      this.config = {
        ...this.config,
        sessionToken: context.session.token,
        stationCallsign: context.session.stationCallsign,
        operatorCallsign: context.session.operatorCallsign,
      };
      this.audit.append({
        level: 'INFO',
        event: 'SESSION_CREATED',
        details: {
          sessionId: context.session.sessionId,
          operatorCallsign: context.session.operatorCallsign,
          stationCallsign: context.session.stationCallsign,
        },
      });
    }

    if (context.radio) {
      this.radio = {
        ...this.radio,
        ...context.radio,
        band: this.radio.band,
      };
    }

    if (context.audio) {
      this.audio = context.audio;
      this.audit.append({ level: 'INFO', event: 'AUDIO_CONTEXT', details: { audio: context.audio } });
    }
  }

  start(): void {
    console.log('YAHAML CW agent starting in dry-run-first mode.');
    console.log(`Activity profile: ${this.activity.name}`);
    console.log(`Station callsign: ${this.config.stationCallsign}`);
    console.log(`Operator identity: ${this.config.operatorCallsign || this.config.stationCallsign}`);
    console.log(`Audio source: ${this.audio.type || 'none'}`);
    printHelp();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'cw-agent> ',
    });

    rl.prompt();
    rl.on('line', async (line) => {
      await this.handleCommand(line.trim());
      if (this.config.txArmState === 'KILLED') {
        rl.close();
        return;
      }
      rl.prompt();
    });
  }

  private async handleCommand(line: string): Promise<void> {
    if (!line) return;
    const [command, ...args] = line.split(/\s+/);
    const rest = args.join(' ');

    switch (command) {
      case '/arm':
        this.setArmState('ARMED');
        break;
      case '/disarm':
        this.setArmState('DISARMED');
        break;
      case '/kill':
        this.setArmState('KILLED');
        this.qso = stopQso(this.qso);
        console.log('Agent killed. No further autonomous action will run in this process.');
        break;
      case '/cq':
        this.qso = scheduleCq(this.qso);
        await this.evaluate();
        break;
      case '/stop':
        this.qso = stopQso(this.qso);
        this.audit.append({ level: 'WARN', event: 'STOPPED', details: { status: this.qso.status } });
        console.log('Stopped current QSO flow.');
        break;
      case '/status':
        this.printStatus();
        break;
      case '/freq':
        this.setFrequency(args[0]);
        break;
      case '/mode':
        this.setMode(args[0]);
        break;
      case '/model':
        this.handleModelCommand(args);
        break;
      case '/backend':
        this.handleBackendCommand(args);
        break;
      case '/inject':
        await this.inject(rest);
        break;
      case '/help':
        printHelp();
        break;
      default:
        console.log(`Unknown command: ${command}`);
    }
  }

  private setArmState(state: TxArmState): void {
    this.config = { ...this.config, txArmState: state };
    this.audit.append({ level: state === 'ARMED' ? 'WARN' : 'INFO', event: 'TX_ARM_STATE', details: { state } });
    console.log(`TX state: ${state}`);
  }

  private setFrequency(frequencyHz?: string): void {
    if (!frequencyHz) {
      console.log('Usage: /freq <hz>');
      return;
    }
    this.radio = { ...this.radio, frequencyHz, band: inferBand(frequencyHz) };
    this.audit.append({ level: 'INFO', event: 'FREQUENCY_SET', details: { frequencyHz, band: this.radio.band } });
    console.log(`Frequency set to ${frequencyHz} Hz (${this.radio.band || 'unknown band'})`);
  }

  private setMode(mode?: string): void {
    if (!mode) {
      console.log('Usage: /mode <mode>');
      return;
    }
    this.radio = { ...this.radio, mode: mode.toUpperCase() };
    this.audit.append({ level: 'INFO', event: 'MODE_SET', details: { mode: this.radio.mode } });
    console.log(`Mode set to ${this.radio.mode}`);
  }

  private handleModelCommand(args: string[]): void {
    if (args[0] === 'list') {
      console.log('No LLM backend connected yet. Deterministic CQ brain is active.');
      return;
    }
    if (args[0] === 'use' && args[1]) {
      console.log(`Model selection recorded for future adapter work: ${args[1]}`);
      return;
    }
    console.log('Usage: /model list OR /model use <backend:model>');
  }

  private handleBackendCommand(args: string[]): void {
    const [kind, value] = args;
    if (!kind || !value) {
      console.log('Usage: /backend radio simulator|hamlib');
      return;
    }

    if (kind === 'radio' && (value === 'simulator' || value === 'hamlib')) {
      this.config.backend.radio = value;
    } else if (kind === 'keyer' && (value === 'simulator' || value === 'cat')) {
      this.config.backend.keyer = value;
    } else if (kind === 'decoder' && (value === 'simulator' || value === 'manual')) {
      this.config.backend.decoder = value;
    } else if (kind === 'logger' && (value === 'yahaml' || value === 'mock')) {
      this.config.backend.logger = value;
    } else {
      console.log(`Unsupported backend selection: ${kind} ${value}`);
      return;
    }

    this.audit.append({ level: 'INFO', event: 'BACKEND_SET', details: { kind, value } });
    console.log(`${kind} backend set to ${value}`);
  }

  private async inject(rxText: string): Promise<void> {
    if (!rxText) {
      console.log('Usage: /inject <cw text>');
      return;
    }
    await this.evaluate(rxText);
  }

  private async evaluate(rxText?: string): Promise<void> {
    const observation = {
      timestamp: Date.now(),
      rxText,
      radio: this.radio,
      activity: this.activity,
      qso: this.qso,
      txArmState: this.config.txArmState,
    };

    const decision = decideDeterministicRunMode(observation, this.config);
    const safety = validateCwAction(decision.action, observation, this.config);

    this.audit.append({
      level: safety.allowed ? 'INFO' : 'WARN',
      event: 'DECISION',
      details: {
        action: decision.action.type,
        message: decision.action.message,
        rationale: decision.rationale,
        safety,
      },
    });

    console.log(`Action: ${decision.action.type}`);
    if (decision.action.message) console.log(`Proposed TX: ${decision.action.message}`);
    if (!safety.allowed) {
      console.log(`Rejected: ${safety.reasons.join('; ')}`);
      this.qso = decision.qso;
      return;
    }

    if (decision.action.message && this.config.backend.keyer === 'simulator') {
      const result = await this.keyer.send(decision.action.message);
      console.log(`Simulator keyer accepted: ${result.message}`);
    }

    if (decision.action.type === 'LOG_QSO') {
      console.log(`Mock log QSO: ${decision.action.callsign} ${JSON.stringify(decision.action.exchange || {})}`);
      this.qso = { ...decision.qso, status: 'LOGGED' };
      return;
    }

    this.qso = decision.qso.status === 'CQ_SENT'
      ? { ...decision.qso, status: 'LISTENING_FOR_CALL' }
      : decision.qso;
  }

  private printStatus(): void {
    console.log(JSON.stringify({
      txArmState: this.config.txArmState,
      activity: this.activity.name,
      station: this.config.stationCallsign,
      operator: this.config.operatorCallsign || this.config.stationCallsign,
      radio: this.radio,
      audio: this.audio,
      qso: this.qso,
      backend: this.config.backend,
      recentAudit: this.audit.recent(5),
    }, null, 2));
  }
}

if (require.main === module) {
  const cli = new CwAgentCli(loadCwAgentConfig());
  cli.initialize()
    .catch((error) => {
      console.warn(`CW agent YAHAML bootstrap warning: ${error instanceof Error ? error.message : String(error)}`);
    })
    .finally(() => {
      cli.start();
    });
}
