export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  secure: boolean;
}

export interface ActiveCapture {
  id: string;
  type: "photo" | "video" | "attached";
  url: string; // Base64 data URL
  name: string;
  sizeFormatted: string;
  fileType: string;
}

export interface EmailHistoryItem {
  id: string;
  to: string;
  subject: string;
  timestamp: string;
  filename: string;
  fileSize: string;
  fileType: string;
  status: "success" | "failed";
  error?: string;
  previewUrl?: string;
}
