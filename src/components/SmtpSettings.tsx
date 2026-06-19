import React, { useState, useEffect } from "react";
import { SmtpConfig } from "../types";
import { X, Save, Shield, HelpCircle, Mail, Key, Server, RefreshCw } from "lucide-react";
import { playBeepSound } from "../utils/audio";

interface SmtpSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  savedEmail: string;
  onSaveEmail: (email: string) => void;
  smtpConfig: SmtpConfig;
  onSaveSmtp: (config: SmtpConfig) => void;
}

export default function SmtpSettings({
  isOpen,
  onClose,
  savedEmail,
  onSaveEmail,
  smtpConfig,
  onSaveSmtp,
}: SmtpSettingsProps) {
  const [destEmail, setDestEmail] = useState(savedEmail);
  const [host, setHost] = useState(smtpConfig.host);
  const [port, setPort] = useState(smtpConfig.port);
  const [user, setUser] = useState(smtpConfig.user);
  const [pass, setPass] = useState(smtpConfig.pass);
  const [secure, setSecure] = useState(smtpConfig.secure);
  const [showHelp, setShowHelp] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync with current props
  useEffect(() => {
    setDestEmail(savedEmail);
    setHost(smtpConfig.host);
    setPort(smtpConfig.port);
    setUser(smtpConfig.user);
    setPass(smtpConfig.pass);
    setSecure(smtpConfig.secure);
  }, [savedEmail, smtpConfig, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    playBeepSound("click");

    if (!destEmail.trim()) {
      alert("Por favor, insira um e-mail de destino válido.");
      return;
    }

    onSaveEmail(destEmail.trim());
    onSaveSmtp({
      host: host.trim(),
      port: port.trim(),
      user: user.trim(),
      pass: pass,
      secure: secure,
    });

    setSaveStatus("Configurações salvas com sucesso!");
    setTimeout(() => {
      setSaveStatus(null);
      onClose();
    }, 1500);
  };

  const loadGmailPresets = () => {
    playBeepSound("click");
    setHost("smtp.gmail.com");
    setPort("465");
    setSecure(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div 
        id="settings_modal"
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-zinc-100 uppercase tracking-wider">Configurações</h2>
          </div>
          <button 
            type="button"
            onClick={() => {
              playBeepSound("click");
              onClose();
            }}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Main Destination Email */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-emerald-500" />
              E-mail de Destino Principal *
            </label>
            <p className="text-[11px] text-zinc-500">
              Todas os arquivos de foto ou vídeo capturados serão entregues neste endereço eletrônico.
            </p>
            <input
              type="email"
              required
              placeholder="exemplo@email.com"
              value={destEmail}
              onChange={(e) => setDestEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-4 py-2.5 text-zinc-100 text-sm placeholder-zinc-600 outline-none transition-all"
            />
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-zinc-400" />
                Configurar SMTP Real (Opcional)
              </span>
              <button
                type="button"
                onClick={() => {
                  playBeepSound("click");
                  setShowHelp(!showHelp);
                }}
                className="text-zinc-500 hover:text-emerald-500 transition-colors flex items-center gap-1 text-xs"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Como funciona?</span>
              </button>
            </div>

            {showHelp && (
              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl text-xs text-zinc-400 leading-relaxed space-y-2">
                <p>
                  <strong>Por padrão:</strong> Se deixar os campos SMTP em branco, o app funciona no 
                  <strong className="text-emerald-500"> Modo Simulador</strong>. Suas capturas são processadas e listadas com toda fidelidade de saída em tempo real no histórico.
                </p>
                <p>
                  <strong>Para disparos reais:</strong> Preencha as credenciais do seu servidor. Para o <strong>Gmail</strong>, você deve informar seu email e gerar uma <strong>&quot;Senha de App&quot;</strong> nas configurações de segurança do Google (a senha usual não funcionará por motivos de segurança).
                </p>
                <button
                  type="button"
                  onClick={loadGmailPresets}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 bg-zinc-900 border border-emerald-950/50 rounded-lg hover:border-emerald-500/50 text-[10px] text-emerald-500 uppercase font-bold tracking-wider transition-all"
                >
                  <RefreshCw className="w-3 h-3" />
                  Preencher padrão Gmail (SMTP)
                </button>
              </div>
            )}

            {/* SMTP Details */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="block text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                  Host SMTP
                </label>
                <input
                  type="text"
                  placeholder="smtp.exemplo.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-3 py-2 text-zinc-100 text-xs placeholder-zinc-700 outline-none transition-all"
                />
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="block text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                  Porta
                </label>
                <input
                  type="text"
                  placeholder="465"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-3 py-2 text-zinc-100 text-xs placeholder-zinc-700 text-center outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                Usuário do SMTP (Seu e-mail)
              </label>
              <input
                type="text"
                placeholder="seu-email@gmail.com"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-3.5 py-2 text-zinc-100 text-xs placeholder-zinc-700 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                  Senha de App / Token SMTP
                </label>
                <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5" /> Seguro e criptografado
                </span>
              </div>
              <input
                type="password"
                placeholder="•••• •••• •••• ••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-3.5 py-2 text-zinc-100 text-xs placeholder-zinc-700 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="secure_smtp"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 cursor-pointer rounded-md"
              />
              <label htmlFor="secure_smtp" className="text-xs text-zinc-400 cursor-pointer select-none">
                Conexão criptografada por SSL / TLS (Porta 465)
              </label>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950/50 border-t border-zinc-800/80 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">
            {host && user ? "Configuração de SMTP ativa" : "Modo Simulador ativo"}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!!saveStatus}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white rounded-xl px-5 py-2 text-xs font-bold tracking-wider uppercase transition-all shadow-md cursor-pointer"
          >
            {saveStatus ? "Salvo ✔" : (
              <>
                <Save className="w-3.5 h-3.5" />
                Salvar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
