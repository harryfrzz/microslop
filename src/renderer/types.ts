export type Snapshot = {
  id: string;
  timestamp: string;
  screenshotPath: string;
  thumbnailPath?: string;
  appName?: string;
  windowTitle?: string;
  screenHash: string;
  ocrText?: string;
  ocrStatus: 'pending' | 'success' | 'failed' | 'disabled';
  ocrError?: string;
  imageEmbeddingStatus?: 'pending' | 'success' | 'failed' | 'disabled';
  createdAt: string;
};

export type SearchResult = {
  snapshotId: string;
  timestamp: string;
  appName?: string;
  windowTitle?: string;
  screenshotPath: string;
  thumbnailPath?: string;
  ocrSnippet?: string;
  score: number;
  matchType: 'text' | 'image' | 'hybrid';
};

export type Settings = {
  captureEnabled: boolean;
  captureIntervalSeconds: number;
  retentionDays: number;
  backendUrl: string;
  ollamaModel: string;
  textEmbeddingModel: string;
  imageEmbeddingModel: string;
  enableOCR: boolean;
  enableImageEmbeddings: boolean;
  excludedApps: string[];
  excludedWindowTitlePatterns: string[];
  storagePath?: string;
};

export type Status = {
  backend: string;
  sqlite: string;
  lancedb: string;
  ollama: string;
  ocr: string;
  captureStats: {
    snapshotsToday: number;
    lastCapturedAt: string | null;
    storageUsedBytes: number;
  };
};
