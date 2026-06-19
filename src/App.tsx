import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  Send, 
  Paperclip, 
  Settings, 
  History, 
  Trash2, 
  CheckCircle2, 
  X, 
  Mail, 
  AlertCircle, 
  Info,
  ExternalLink,
  ChevronDown
} from "lucide-react";
import CameraViewfinder from "./components/CameraViewfinder";
import SmtpSettings from "./components/SmtpSettings";
import OutboxHistory from "./components/OutboxHistory";
import { ActiveCapture, EmailHistoryItem, SmtpConfig } from "./types";
import { playBeepSound } from "./utils/audio";

export default function App() {
  // Load initial settings
  const [savedEmail, setSavedEmail] = useState<string>(() => {
    return localStorage.getItem("juba_dest_email") || "jubabarkika2@gmail.com";
  });

  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(() => {
    try {
      const stored = localStorage.getItem("juba_smtp_config");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { host: "", port: "587", user: "", pass: "", secure: false };
  });

  // Master States
  const [cameraMode, setCameraMode] = useState<"foto" | "video">("foto");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [activeCapture, setActiveCapture] = useState<ActiveCapture | null>(null);
  
  // UI Panels Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showOutbox, setShowOutbox] = useState(false);
  const [outboxEmails, setOutboxEmails] = useState<EmailHistoryItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingOutbox, setIsLoadingOutbox] = useState(false);

  // Toast Notifications
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync on startup
  useEffect(() => {
    fetchOutbox();
  }, []);

  // Set default initial greeting toast
  useEffect(() => {
    showToast("Bem-vindo ao JUBA FOTO! Câmera pronta.", "info");
  }, []);

  const showToast = (text: string, type: "success" | "error" | "info") => {
    setToast({ text, type });
    // Sound cue
    if (type === "success") playBeepSound("start");
    if (type === "error") playBeepSound("error");
    if (type === "info") playBeepSound("click");

    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const fetchOutbox = async () => {
    setIsLoadingOutbox(true);
    try {
      const res = await fetch("/api/emails");
      if (res.ok) {
        const data = await res.json();
        setOutboxEmails(data.emails || []);
      }
    } catch (e) {
      console.error("Erro ao carregar outbox do servidor:", e);
    } finally {
      setIsLoadingOutbox(false);
    }
  };

  const handleSaveEmail = (email: string) => {
    setSavedEmail(email);
    localStorage.setItem("juba_dest_email", email);
    showToast(`E-mail de destino atualizado: ${email}`, "success");
  };

  const handleSaveSmtp = (config: SmtpConfig) => {
    setSmtpConfig(config);
    localStorage.setItem("juba_smtp_config", JSON.stringify(config));
  };

  // Capture callback
  const handleMediaCaptured = (capture: ActiveCapture) => {
    setActiveCapture(capture);
    const mediaVerb = capture.type === "photo" ? "Foto batida" : "Vídeo gravado";
    showToast(`${mediaVerb}! Pronto para enviar para ${savedEmail}`, "success");
  };

  // FILE ATTACHMENT FROM DEVICE ("Anexar foto")
  const triggerFileSelect = () => {
    playBeepSound("click");
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      showToast("Por favor, selecione apenas arquivos de imagem ou vídeo.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      const sizeFormatted = (file.size / 1024).toFixed(1) + " KB";
      
      setActiveCapture({
        id: "attached_" + Math.random().toString(36).substr(2, 9),
        type: "attached",
        url: base64Url,
        name: file.name,
        sizeFormatted,
        fileType: file.type,
      });

      showToast(`Arquivo anexado: ${file.name}`, "success");
    };
    reader.onerror = () => {
      showToast("Erro ao processar o arquivo anexado.", "error");
    };
    reader.readAsDataURL(file);
    
    // Reset output to allow choosing the same file again if discarded
    e.target.value = "";
  };

  // SEND CAPTURED MEDIA VIA EMAIL API
  const handleSendEmail = async () => {
    playBeepSound("click");
    
    if (!activeCapture) {
      showToast("Nenhuma foto ou gravação para enviar. Tire uma foto ou anexe primeiro!", "error");
      return;
    }

    if (!savedEmail.trim()) {
      showToast("Por favor, configure o e-mail de destino nas configurações.", "error");
      setShowSettings(true);
      return;
    }

    setIsSending(true);
    showToast("Preparando transmissão de dados de mídia...", "info");

    try {
      const subject = `JUBA FOTO - Nova captura (${activeCapture.type === "photo" ? "Foto" : activeCapture.type === "video" ? "Vídeo" : "Anexo Device"})`;
      const message = `Olá!\n\nSegue em anexo o arquivo de mídia "${activeCapture.name}" capturado pelo aplicativo JUBA FOTO.\n\nEspecificações:\n- Tamanho: ${activeCapture.sizeFormatted}\n- Tipo: ${activeCapture.fileType}\n- Timestamp: ${new Date().toLocaleString("pt-BR")}\n\nEnviado automaticamente usando JUBA FOTO.`;

      const payload = {
        to: savedEmail.trim(),
        subject,
        message,
        fileBase64: activeCapture.url,
        filename: activeCapture.name,
        fileType: activeCapture.fileType,
        smtp: smtpConfig.host ? smtpConfig : undefined, // pass SMTP parameters if filled
      };

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let result: any = {};
      const responseText = await res.text();
      try {
        result = JSON.parse(responseText);
      } catch (err) {
        result = { error: `Erro de resposta do servidor (HTTP ${res.status}): ${responseText.substring(0, 160) || "Resposta vazia"}` };
      }

      if (res.ok) {
        // Success
        setActiveCapture(null); // Clear queue on success
        showToast(result.message || "Mídia enviada ao e-mail com sucesso!", "success");
        fetchOutbox(); // refresh history list
      } else {
        // API error
        showToast(result.error || `Erro (${res.status}): Falha no envio do e-mail.`, "error");
        fetchOutbox(); // refresh logs because failed state logging was saved in metadata outbox
      }
    } catch (e: any) {
      console.error(e);
      showToast(`Falha interna do cliente: ${e.message || "Erro desconhecido"}`, "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch("/api/emails/clear", { method: "POST" });
      if (res.ok) {
        showToast("Histórico de envios limpo.", "success");
        fetchOutbox();
      }
    } catch (e) {
      showToast("Erro ao limpar histórico no servidor.", "error");
    }
  };

  return (
    <div className="relative w-screen h-screen bg-zinc-950 overflow-hidden text-zinc-100 flex flex-col font-sans">
      
      {/* HIDDEN INPUT FOR FILE PICKER (Anexar foto) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* FIXED HEADER BAR (As requested: "barra fixa que tem uma logo um nome JUBA FOTO, um botão verde Enviar e ao lado botão anexar foto") */}
      <header className="fixed top-0 inset-x-0 h-18 bg-zinc-950/80 border-b border-zinc-900 backdrop-blur-md z-30 px-4 md:px-6 flex items-center justify-between select-none shadow-lg">
        {/* LOGO & BRAND (Left side) */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-400">
            <Camera className="w-5 h-5 font-bold animate-pulse duration-4000" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-[0.2em] text-white leading-none">
              JUBA FOTO
            </h1>
            <span className="text-[9px] text-zinc-500 font-mono tracking-wider font-semibold">
              CAMERA DIGITAL
            </span>
          </div>
        </div>

        {/* MIDDLE ACTIVE EMAIL BADGE STATUS (Shows destination saved in app) */}
        <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-850 px-3.5 py-1.5 rounded-full select-all">
          <Mail className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-bold font-mono text-zinc-300 tracking-wide max-w-[170px] truncate" title={savedEmail}>
            {savedEmail}
          </span>
          <button
            type="button"
            onClick={() => {
              playBeepSound("click");
              setShowSettings(true);
            }}
            title="Alterar e-mail salvo"
            className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* CONTROLS (Right side: GREEN SEND + ATTACH BUTTONS) */}
        <div className="flex items-center gap-2">
          
          {/* ANEXAR FOTO (Attach Photo from App) */}
          <button
            type="button"
            id="attach_photo_header_btn"
            onClick={triggerFileSelect}
            title="Anexar foto ou vídeo do aparelho"
            className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white rounded-full px-3 py-1.5 border border-zinc-800 text-[11px] font-bold tracking-wider uppercase transition-all shadow cursor-pointer active:scale-95"
          >
            <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden xs:inline">Anexar</span>
          </button>

          {/* VERDE ENVIAR (The green send button) */}
          <button
            type="button"
            id="send_media_header_btn"
            onClick={handleSendEmail}
            disabled={isSending}
            title={`Enviar captura ativa para ${savedEmail}`}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 rounded-full px-4.5 py-1.5 text-[11px] font-extrabold tracking-widest uppercase transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-95 cursor-pointer disabled:pointer-events-none"
          >
            {isSending ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-emerald-100" />
            )}
            <span>{isSending ? "ENVIANDO" : "ENVIAR"}</span>
          </button>

          {/* EXTRA GEAR & HISTORY ACTIONS */}
          <div className="flex items-center pl-1 border-l border-zinc-850 gap-1">
            {/* Quick Outbox Toggle */}
            <button
              type="button"
              onClick={() => {
                playBeepSound("click");
                setShowOutbox(true);
              }}
              title="Ver histórico de envios"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer relative"
            >
              <History className="w-4 h-4" />
              {outboxEmails.length > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-500 block" />
              )}
            </button>
            {/* Quick settings drawer */}
            <button
              type="button"
              onClick={() => {
                playBeepSound("click");
                setShowSettings(true);
              }}
              title="Configurar e-mail e SMTP"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* MAIN VIEWPORT CAMERA AREA (Janela de camera inteira) */}
      <main className="flex-1 w-full relative z-10 pt-18">
        
        {/* Full Screen Viewfinder layer */}
        <CameraViewfinder
          cameraMode={cameraMode}
          setCameraMode={setCameraMode}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          onMediaCaptured={handleMediaCaptured}
          isSending={isSending}
        />

        {/* CURRENT EMBEDDED QUEUE PREVIEW (Anexo de captura flutuante) */}
        {activeCapture && (
          <div className="absolute top-4 right-4 z-20 w-44 bg-zinc-950/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-300 p-2 space-y-2">
            
            {/* Image / Video thumbnail preview container */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-850 group">
              {activeCapture.type === "video" ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-1 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900">
                  <span className="bg-red-600 px-1 py-0.5 rounded text-[8px] text-white font-bold tracking-wider mb-1 animate-pulse">
                    VÍDEO WEBM
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 truncate max-w-full">
                    {activeCapture.sizeFormatted}
                  </span>
                </div>
              ) : (
                <img
                  src={activeCapture.url}
                  alt="Previa captura"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              
              {/* Overlay type label */}
              <div className="absolute bottom-1 left-1.5 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-zinc-300">
                {activeCapture.type === "attached" ? "Anexo" : activeCapture.type}
              </div>
            </div>

            {/* Captures description text */}
            <div className="space-y-1">
              <p className="text-[9px] text-zinc-400 font-mono font-medium truncate" title={activeCapture.name}>
                {activeCapture.name}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-emerald-400 font-bold font-mono">
                  {activeCapture.sizeFormatted}
                </span>

                {/* Excluir/Discard action */}
                <button
                  type="button"
                  onClick={() => {
                    playBeepSound("error");
                    setActiveCapture(null);
                    showToast("Captura descartada.", "info");
                  }}
                  title="Descartar captura"
                  className="text-zinc-500 hover:text-red-400 transition-colors font-bold text-[9px] flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" />
                  <span>Apagar</span>
                </button>
              </div>
            </div>

            {/* Tap to send cue action */}
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isSending}
              className="w-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white py-1 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1"
            >
              <Send className="w-2.5 h-2.5" />
              <span>Enviar Agora</span>
            </button>

          </div>
        )}

        {/* MOBILE SPECIFIC DESTINATION EMAIL ROW (Always visible below header on small displays) */}
        <div className="absolute top-4 left-4 z-20 sm:hidden bg-zinc-950/80 border border-zinc-900 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-emerald-400" />
          <span className="text-[9px] font-bold font-mono text-zinc-300 truncate max-w-[124px]">
            {savedEmail}
          </span>
          <button
            type="button"
            onClick={() => {
              playBeepSound("click");
              setShowSettings(true);
            }}
            className="text-zinc-500 hover:text-white"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>

        {/* ACTIVE SIMULATION BANNER NOTICE (Bottom floating helper) */}
        <div className="absolute bottom-28 left-4 z-20 hidden lg:flex items-center gap-1.5 bg-zinc-950/80 border border-zinc-900 backdrop-blur px-3.5 py-1.5 rounded-xl text-[10px] text-zinc-400 select-none">
          <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>E-mail salvo para disparos: <strong className="text-zinc-200">{savedEmail}</strong></span>
        </div>

      </main>

      {/* TOAST SYSTEM (iOS Dynamic Banner styling sliding down or up) */}
      {toast && (
        <div className="fixed top-20 inset-x-4 z-50 flex justify-center pointer-events-none select-none">
          <div 
            className={`flex items-center gap-2.5 px-4.5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md max-w-sm w-full animate-in slide-in-from-top-12 ease-out duration-300 pointer-events-auto ${
              toast.type === "success" 
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-900/50" 
                : toast.type === "error"
                ? "bg-red-950/90 text-red-200 border-red-900/50"
                : "bg-zinc-900/95 text-zinc-200 border-zinc-800"
            }`}
          >
            {toast.type === "success" && <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0" />}
            {toast.type === "info" && <Info className="w-4.5 h-4.5 text-emerald-400 shrink-0" />}
            <span className="text-xs font-bold leading-normal truncate">{toast.text}</span>
            <button 
              type="button"
              className="text-zinc-500 hover:text-white ml-auto cursor-pointer"
              onClick={() => setToast(null)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* DRAWER MODALS */}
      <SmtpSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        savedEmail={savedEmail}
        onSaveEmail={handleSaveEmail}
        smtpConfig={smtpConfig}
        onSaveSmtp={handleSaveSmtp}
      />

      <OutboxHistory
        isOpen={showOutbox}
        onClose={() => setShowOutbox(false)}
        emails={outboxEmails}
        onClearHistory={handleClearHistory}
        isLoading={isLoadingOutbox}
      />

    </div>
  );
}
