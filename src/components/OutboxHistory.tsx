import React from "react";
import { EmailHistoryItem } from "../types";
import { X, Trash2, Mail, CheckCircle2, AlertCircle, Calendar, Paperclip, Download } from "lucide-react";
import { playBeepSound } from "../utils/audio";

interface OutboxHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  emails: EmailHistoryItem[];
  onClearHistory: () => void;
  isLoading: boolean;
}

export default function OutboxHistory({
  isOpen,
  onClose,
  emails,
  onClearHistory,
  isLoading,
}: OutboxHistoryProps) {
  if (!isOpen) return null;

  const handleClear = () => {
    playBeepSound("error");
    if (confirm("Tem certeza que deseja limpar o histórico de envios? Isso irá apagar todos os registros de capturas e anexos do servidor.")) {
      onClearHistory();
    }
  };

  const downloadAttachment = (base64Url: string, filename: string) => {
    playBeepSound("click");
    const link = document.createElement("a");
    link.href = base64Url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="outbox_panel"
        className="w-full max-w-md bg-zinc-950 border-l border-zinc-900 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900 bg-zinc-950">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-bold tracking-widest text-zinc-100 uppercase">
              Histórico de Envios
            </h2>
            <span className="bg-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {emails.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              playBeepSound("click");
              onClose();
            }}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-zinc-500 font-mono">Buscando registros...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600">
                <Paperclip className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-zinc-400">Nenhum envio registrado</p>
              <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                Tire fotos ou grave vídeos e clique em &quot;Enviar&quot; para listá-los neste histórico com segurança.
              </p>
            </div>
          ) : (
            emails.map((email) => {
              const isImage = email.fileType.startsWith("image/") || email.filename.endsWith(".jpg") || email.filename.endsWith(".png");
              const isVideo = email.fileType.startsWith("video/") || email.filename.endsWith(".webm") || email.filename.endsWith(".mp4");

              return (
                <div
                  key={email.id}
                  className="bg-zinc-900/50 border border-zinc-900/80 hover:border-zinc-850 rounded-2xl p-4 space-y-3 transition-all"
                >
                  {/* Status header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-zinc-300 block leading-tight truncate max-w-[240px]">
                        {email.to}
                      </span>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {email.timestamp}
                      </span>
                    </div>
                    <div>
                      {email.status === "success" ? (
                        <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Enviado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/20">
                          <AlertCircle className="w-3 h-3" />
                          Falhou
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Preview context */}
                  {email.previewUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-zinc-950 aspect-video flex items-center justify-center border border-zinc-850">
                      {isImage ? (
                        <img
                          src={email.previewUrl}
                          alt={email.filename}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : isVideo ? (
                        <video
                          src={email.previewUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center text-center p-3">
                          <Paperclip className="w-6 h-6 text-zinc-500 mb-1" />
                          <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[200px]">
                            {email.filename}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-850 text-[10px] flex items-center justify-between">
                      <span className="text-zinc-500 truncate max-w-[220px] font-mono">
                        {email.filename}
                      </span>
                      <span className="text-zinc-600 font-mono text-[9px] uppercase">
                        {email.fileSize}
                      </span>
                    </div>
                  )}

                  {/* Meta data and download */}
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <div className="flex flex-col">
                      <span className="text-zinc-500 font-mono text-[10px]">
                        Anexo: <strong className="text-zinc-400">{email.filename}</strong>
                      </span>
                      <span className="text-zinc-600 font-mono text-[9px]">
                        Tamanho: {email.fileSize} | Formato: {email.fileType.split("/")[1] || "PNG"}
                      </span>
                    </div>
                    {email.previewUrl && (
                      <button
                        type="button"
                        onClick={() => downloadAttachment(email.previewUrl!, email.filename)}
                        title="Baixar anexo para o dispositivo"
                        className="bg-zinc-805 hover:bg-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-center"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Error display if any */}
                  {email.error && (
                    <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-950/40 p-2 rounded-xl font-mono leading-normal">
                      Erro: {email.error}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        {emails.length > 0 && (
          <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center justify-center gap-1.5 text-zinc-500 hover:text-red-400 transition-colors text-xs font-semibold py-2 px-3 rounded-xl hover:bg-red-500/5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Limpar Tudo
            </button>
            <span className="text-[10px] text-zinc-600 font-mono">
              JUBA FOTO v1.0.0
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
