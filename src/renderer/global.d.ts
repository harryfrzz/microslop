export {};

declare global {
  interface Window {
    microslop?: {
      startCapture: () => Promise<{ captureEnabled: boolean; captureIntervalSeconds: number }>;
      pauseCapture: () => Promise<{ captureEnabled: boolean }>;
      captureNow: () => Promise<unknown>;
      getCaptureState: () => Promise<{ captureEnabled: boolean; captureIntervalSeconds: number; lastCaptureResult: unknown }>;
      openDataFolder: () => Promise<string>;
    };
  }
}
