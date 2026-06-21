export interface KeyerResult {
  success: boolean;
  transmitted: boolean;
  message: string;
}

export class SimulatedKeyer {
  async send(message: string): Promise<KeyerResult> {
    return {
      success: true,
      transmitted: false,
      message,
    };
  }
}
