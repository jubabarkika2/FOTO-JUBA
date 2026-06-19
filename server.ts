import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

interface EmailHistoryItem {
  id: string;
  to: string;
  subject: string;
  timestamp: string;
  filename: string;
  fileSize: string;
  fileType: string;
  status: "success" | "failed";
  error?: string;
  previewUrl?: string; // stored base64 or subset for UI preview
}

const app = express();
const PORT = 3000;

// Set up large limit for base64 photo/video uploads
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// Store sent email history in server memory
const emailHistory: EmailHistoryItem[] = [];

// Helper to format bytes
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// REST API Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// Endpoint to list sent emails history
app.get("/api/emails", (req, res) => {
  res.json({ emails: emailHistory });
});

// Endpoint to clear emails history
app.post("/api/emails/clear", (req, res) => {
  emailHistory.length = 0;
  res.json({ success: true, message: "Histórico de e-mails limpo." });
});

// Endpoint to send email with base64 attachment (photo/video)
app.post("/api/send-email", async (req, res) => {
  const { to, subject, message, fileBase64, filename, fileType, smtp } = req.body;

  if (!to) {
    return res.status(400).json({ error: "E-mail de destino é obrigatório." });
  }

  const generatedId = "email_" + Math.random().toString(36).substr(2, 9);
  const sizeInBytes = fileBase64 ? Math.round((fileBase64.length * 3) / 4) : 0;
  const formattedSize = formatBytes(sizeInBytes);

  console.log(`[Email Dispatch] Attempting to send file "${filename}" (${formattedSize}) to ${to}`);

  // Base64 file format check
  let attachmentBuffer: Buffer | null = null;
  if (fileBase64) {
    try {
      // Remove data:image/png;base64,... header if present
      const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, "");
      attachmentBuffer = Buffer.from(cleanBase64, "base64");
    } catch (e) {
      console.error("Erro ao converter base64:", e);
      return res.status(400).json({ error: "Arquivo corrompido ou formato base64 inválido." });
    }
  }

  // Fallback to process.env variables if SMTP values are not sent from the request
  let rawHost = (smtp?.host || process.env.SMTP_HOST || "").trim();
  let rawPort = (smtp?.port || process.env.SMTP_PORT || "587").trim();
  let rawUser = (smtp?.user || process.env.SMTP_USER || "").trim();
  let rawPass = smtp?.pass || process.env.SMTP_PASS || "";

  // Highly robust sanitization for Gmail App Passwords
  // Google shows app passwords as "abcd efgh ijkl mnop", users copy paste with spaces, which breaks standard login
  if (rawHost.toLowerCase().includes("gmail") || rawUser.toLowerCase().includes("gmail")) {
    rawPass = rawPass.replace(/\s+/g, ""); // Strip all spaces from 16-character google app password
  } else {
    rawPass = rawPass.trim();
  }

  const activeSmtp = {
    host: rawHost,
    port: rawPort,
    user: rawUser,
    pass: rawPass,
    secure: smtp?.secure !== undefined ? smtp.secure : (process.env.SMTP_SECURE === "true" || rawPort === "465"),
  };

  // If smtp settings are present (from request or env), attempt a REAL send using nodemailer
  if (activeSmtp.host && activeSmtp.user && activeSmtp.pass) {
    try {
      console.log(`[SMTP REAL] Conectando ao host: ${activeSmtp.host}:${activeSmtp.port} (SSL/TLS: ${activeSmtp.secure}) como: ${activeSmtp.user}`);
      let transportConfig: any;

      // Gmail optimized built-in preset to bypass container port blocks and greeting handshaking timeouts!
      if (activeSmtp.host.toLowerCase().includes("gmail") || activeSmtp.user.toLowerCase().includes("gmail")) {
        console.log(`[SMTP REAL] Provável e-mail ou host Gmail detectado (${activeSmtp.user}). Usando provedor "gmail" otimizado.`);
        transportConfig = {
          service: "gmail",
          auth: {
            user: activeSmtp.user,
            pass: activeSmtp.pass,
          },
          tls: {
            rejectUnauthorized: false
          }
        };
      } else {
        transportConfig = {
          host: activeSmtp.host,
          port: parseInt(activeSmtp.port, 10) || 587,
          secure: activeSmtp.secure, // true for 465, false for other ports
          auth: {
            user: activeSmtp.user,
            pass: activeSmtp.pass,
          },
          connectionTimeout: 15000, // 15 seconds connection timeout
          greetingTimeout: 12000,   // More generous handshake greeting timeout
          socketTimeout: 20000,
          tls: {
            rejectUnauthorized: false // Ignore self-signed certificate errors to maximize ease of deployment
          }
        };
      }

      console.log(`[SMTP REAL] Inicializando transporter Nodemailer...`);
      const transporter = nodemailer.createTransport(transportConfig);

      const mailOptions: any = {
        from: activeSmtp.user,
        to: to,
        subject: subject || "JUBA FOTO - Captura",
        text: message || "Enviado usando JUBA FOTO.",
      };

      if (attachmentBuffer && filename) {
        mailOptions.attachments = [
          {
            filename: filename,
            content: attachmentBuffer,
            contentType: fileType || "image/png",
          },
        ];
      }

      await transporter.sendMail(mailOptions);

      // Save to history
      const logItem: EmailHistoryItem = {
        id: generatedId,
        to,
        subject: subject || "JUBA FOTO - Captura",
        timestamp: new Date().toLocaleTimeString("pt-BR") + " " + new Date().toLocaleDateString("pt-BR"),
        filename: filename || "Sem anexo",
        fileSize: formattedSize,
        fileType: fileType || "Nenhum",
        status: "success",
        previewUrl: fileBase64 ? fileBase64.substring(0, 50000) : undefined, // Keep a small preview
      };
      emailHistory.unshift(logItem);

      return res.json({
        success: true,
        message: "E-mail enviado com sucesso via SMTP real!",
        details: logItem,
      });
    } catch (error: any) {
      console.error("Erro ao enviar e-mail via SMTP:", error);
      
      const logItem: EmailHistoryItem = {
        id: generatedId,
        to,
        subject: subject || "JUBA FOTO - Captura (Falhou)",
        timestamp: new Date().toLocaleTimeString("pt-BR") + " " + new Date().toLocaleDateString("pt-BR"),
        filename: filename || "Sem anexo",
        fileSize: formattedSize,
        fileType: fileType || "Nenhum",
        status: "failed",
        error: error.message,
        previewUrl: fileBase64 ? fileBase64.substring(0, 50000) : undefined,
      };
      emailHistory.unshift(logItem);

      return res.status(500).json({
        error: `Falha no envio via SMTP: ${error.message}`,
        details: logItem,
      });
    }
  } else {
    // If SMTP details are empty, we do a premium fully logged simulation!
    // This allows testing the exact email flow inside the developer's client app easily.
    // It mocks a super-fast transmission network route.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const logItem: EmailHistoryItem = {
      id: generatedId,
      to,
      subject: subject || "JUBA FOTO - Captura (Inovação Digital)",
      timestamp: new Date().toLocaleTimeString("pt-BR") + " " + new Date().toLocaleDateString("pt-BR"),
      filename: filename || "Sem anexo",
      fileSize: formattedSize,
      fileType: fileType || "Nenhum",
      status: "success",
      previewUrl: fileBase64 ? fileBase64 : undefined, // Store full base64 in sandbox mode so they see it in the simulator outbox!
    };
    emailHistory.unshift(logItem);

    return res.json({
      success: true,
      message: "Envio simulado com sucesso! Salvo no histórico de saída.",
      details: logItem,
      simulated: true,
    });
  }
});

// Vite Middleware & production static asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
