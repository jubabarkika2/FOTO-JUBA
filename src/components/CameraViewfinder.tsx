import React, { useState, useEffect, useRef } from "react";
import { Camera, RefreshCw, ZoomIn, Info, AlertTriangle, Play, Pause, Square } from "lucide-react";
import { playShutterSound, playBeepSound } from "../utils/audio";
import { ActiveCapture } from "../types";

// High-quality mock environments for simulation mode when hardware is inaccessible
const SIMULATED_SCENES = [
  {
    title: "Estúdio Juba Foto",
    url: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&q=80&w=1200",
  },
  {
    title: "Modelo Retrato Clássico",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=1200",
  },
  {
    title: "Ensaio Fotográfico Natureza",
    url: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&q=80&w=1200",
  },
  {
    title: "Arquitetura Urbana",
    url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200",
  },
];

interface CameraViewfinderProps {
  cameraMode: "foto" | "video";
  setCameraMode: (mode: "foto" | "video") => void;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  onMediaCaptured: (capture: ActiveCapture) => void;
  isSending: boolean;
}

export default function CameraViewfinder({
  cameraMode,
  setCameraMode,
  zoomLevel,
  setZoomLevel,
  onMediaCaptured,
  isSending,
}: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [deviceState, setDeviceState] = useState<"loading" | "active" | "denied" | "unsupported">("loading");
  const [activeFacingMode, setActiveFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [flashActive, setFlashActive] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);

  // For simulation
  const [simSceneIndex, setSimSceneIndex] = useState(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start feed
  useEffect(() => {
    initCamera();
    return () => {
      stopCamera();
    };
  }, [activeFacingMode]);

  // Safely synchronize active stream to video element
  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        videoRef.current.play().catch((playErr) => {
          console.warn("Auto playing synced stream failed or was blocked:", playErr);
        });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, deviceState]);

  // Handle timer
  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = setInterval(() => {
        setRecordTimer((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      setRecordTimer(0);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const initCamera = async () => {
    setDeviceState("loading");
    
    // Stop and clear previous streams synchronously
    stopCamera();
    
    // Crucial 250ms sleep to allow the camera hardware and OS to release handles before requesting again
    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("WebRTC ou getUserMedia não é suportado neste navegador.");
      }

      let mediaStream: MediaStream | null = null;
      let errorAccumulator: any = null;

      // Robust progressive attempt ladder for maximum device compatibility!
      
      // Attempt 1: Standard HD Video with target facingMode, audio: false (faster permission & less intrusive)
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: activeFacingMode === "user" ? "user" : "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        console.warn("Attempt 1 (HD facingMode) failed, trying Attempt 2...", err);
        errorAccumulator = err;
      }

      // Attempt 2: Standard Video with target facingMode, no size constraints (crucial for lower resolution front cameras)
      if (!mediaStream) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: activeFacingMode === "user" ? "user" : "environment",
            },
            audio: false,
          });
        } catch (err) {
          console.warn("Attempt 2 (Generic facingMode) failed, trying Attempt 3...", err);
          errorAccumulator = err;
        }
      }

      // Attempt 3: Pure video fallback (any camera)
      if (!mediaStream) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (err) {
          console.warn("Attempt 3 (Pure video) failed:", err);
          errorAccumulator = err;
        }
      }

      if (!mediaStream) {
        throw errorAccumulator || new Error("Não foi possível acessar nenhum dispositivo de imagem.");
      }

      setStream(mediaStream);
      currentStreamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Explicitly trigger playing when loaded to handle strict mobile browser policies (prevent black screen)
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((playErr) => {
              console.warn("Autoplay was prevented by browser policy, waiting for user click:", playErr);
            });
          }
        };
        // Also call play immediately
        videoRef.current.play().catch(() => {});
      }
      
      setDeviceState("active");
    } catch (error: any) {
      console.warn("Nenhuma câmera física atribuída ou permissão negada. Ativando simulador.", error);
      setDeviceState("denied");
    }
  };

  const stopCamera = () => {
    // Stop the ref stream synchronously
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping track:", e);
        }
      });
      currentStreamRef.current = null;
    }
    
    // Stop hook state stream if reference holds any
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping active track state:", e);
        }
      });
    }
    setStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleFacingMode = () => {
    playBeepSound("click");
    setActiveFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Convert timer values
  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // ZOOM IPHONE-STYLE BEHAVIOR
  // Clicking cycles: 0.5x -> 1.0x -> 3.0x -> 10.0x -> 15.0x -> 0.5x
  const cycleZoom = () => {
    playBeepSound("click");
    if (zoomLevel === 0.5) setZoomLevel(1);
    else if (zoomLevel === 1) setZoomLevel(3);
    else if (zoomLevel === 3) setZoomLevel(10);
    else if (zoomLevel === 10) setZoomLevel(15);
    else setZoomLevel(0.5);
  };

  // Capture Photo Action
  const triggerTakePhoto = () => {
    playShutterSound();
    setFlashActive(true);
    setTimeout(() => {
      setFlashActive(false);
    }, 150);

    const filename = `JUBA_FOTO_${new Date().getTime()}.jpg`;

    if (deviceState === "active" && videoRef.current) {
      // Draw frame to canvas
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      
      // Keep real dimensions, but caps max dimension to 1600px to avoid memory overflow & string layout limits on Safari/iOS
      let targetWidth = video.videoWidth || 1280;
      let targetHeight = video.videoHeight || 720;
      const maxDimension = 1600;
      if (targetWidth > maxDimension || targetHeight > maxDimension) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
          targetHeight = maxDimension;
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Apply flip if user facing
        if (activeFacingMode === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Export base64 jpeg with safe 0.8 compression to keep base64 within small memory bounds
        const base64Url = canvas.toDataURL("image/jpeg", 0.8);
        const sizeInBytes = Math.round((base64Url.length * 3) / 4);
        const sizeFormatted = (sizeInBytes / 1024).toFixed(1) + " KB";
        
        onMediaCaptured({
          id: "cap_" + Math.random().toString(36).substr(2, 9),
          type: "photo",
          url: base64Url,
          name: filename,
          sizeFormatted,
          fileType: "image/jpeg",
        });
      }
    } else {
      // Simulator scene capture
      const currentScene = SIMULATED_SCENES[simSceneIndex];
      // Create mockup canvas with unsplash image or simulated metadata
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Render background color
        ctx.fillStyle = "#121212";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Load target scenic image
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentScene.url;
        img.onload = () => {
          // Draw image
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Draw watermark logo JUBA FOTO and simulation info
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(20, 20, 260, 60);
          
          ctx.fillStyle = "#10b981"; // Emerald green
          ctx.font = "bold 18px sans-serif";
          ctx.fillText("JUBA FOTO", 40, 48);
          
          ctx.fillStyle = "#ffffff";
          ctx.font = "12px monospace";
          ctx.fillText(`Zoom: ${zoomLevel}x | ${currentScene.title}`, 40, 65);
          
          const base64Url = canvas.toDataURL("image/jpeg", 0.95);
          const sizeInBytes = Math.round((base64Url.length * 3) / 4);
          const sizeFormatted = (sizeInBytes / 1024).toFixed(1) + " KB";
          
          onMediaCaptured({
            id: "slots_sim_" + Math.random().toString(36).substr(2, 9),
            type: "photo",
            url: base64Url,
            name: `SIM_${filename}`,
            sizeFormatted,
            fileType: "image/jpeg",
          });
        };
        // Simple immediate fallback if unsplash blocks load in canvas
        setTimeout(() => {
          ctx.fillStyle = "#10b981";
          ctx.font = "bold 42px sans-serif";
          ctx.fillText("JUBA FOTO", 300, 300);
          ctx.fillStyle = "#ffffff";
          ctx.font = "20px monospace";
          ctx.fillText(`CENA SIMULADA: ${currentScene.title} (${zoomLevel}x)`, 300, 350);
          
          const base64Url = canvas.toDataURL("image/jpeg", 0.85);
          const sizeInBytes = Math.round((base64Url.length * 3) / 4);
          const sizeFormatted = (sizeInBytes / 1024).toFixed(1) + " KB";
          
          onMediaCaptured({
            id: "sim_fallback_" + Math.random().toString(36).substr(2, 9),
            type: "photo",
            url: base64Url,
            name: `MOCK_${filename}`,
            sizeFormatted,
            fileType: "image/jpeg",
          });
        }, 300);
      }
    }
  };

  // Video recording actions
  const startRecording = () => {
    if (deviceState === "active" && stream) {
      playBeepSound("start");
      recordedChunksRef.current = [];
      
      let options = {};
      if (MediaRecorder.isTypeSupported("video/webm")) {
        options = { mimeType: "video/webm;codecs=vp9" };
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        options = { mimeType: "video/mp4" };
      }

      try {
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const actualType = mediaRecorder.mimeType || "video/webm";
          const blob = new Blob(recordedChunksRef.current, {
            type: actualType,
          });
          
          const fileExt = actualType.includes("mp4") ? "mp4" : "webm";
          const filename = `JUBA_VIDEO_${new Date().getTime()}.${fileExt}`;
          const sizeInBytes = blob.size;
          const sizeFormatted = (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Url = reader.result as string;
            onMediaCaptured({
              id: "vid_" + Math.random().toString(36).substr(2, 9),
              type: "video",
              url: base64Url,
              name: filename,
              sizeFormatted,
              fileType: actualType,
            });
          };
          reader.readAsDataURL(blob);
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Iniciando gravador falhou:", err);
        alert("Problema ao iniciar gravação de áudio/vídeo. Ative o simulador.");
      }
    } else {
      // Simulator Record
      playBeepSound("start");
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    playBeepSound("stop");
    setIsRecording(false);

    if (deviceState === "active" && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    } else {
      // Mock record completion: create a simulated small video log or mock scene log
      const filename = `MOCK_VIDEO_${new Date().getTime()}.webm`;
      
      // Let's create a beautiful generic mock video payload (a small duration simulated log)
      // Since it's web-only simulation, we'll configure a solid mock tag
      onMediaCaptured({
        id: "mock_vid_" + Math.random().toString(36).substr(2, 9),
        type: "video",
        url: "https://www.w3schools.com/html/mov_bbb.mp4", // Small sample trailer to demonstrate live emails & downloads!
        name: filename,
        sizeFormatted: "1.24 MB",
        fileType: "video/mp4",
      });
    }
  };

  const handleCaptureTrigger = () => {
    if (cameraMode === "foto") {
      triggerTakePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  // Change simulated background scenery
  const nextScene = () => {
    playBeepSound("click");
    setSimSceneIndex((prev) => (prev + 1) % SIMULATED_SCENES.length);
  };

  // Active styles for camera Zooming
  const zoomStyle = {
    transform: `scale(${zoomLevel}) ${activeFacingMode === "user" ? "scaleX(-1)" : ""}`,
    transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    transformOrigin: "center center",
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex items-center justify-center select-none">
      
      {/* SHUTTER FLASH EFFECT */}
      <div 
        className={`absolute inset-0 z-40 bg-white transition-opacity duration-150 pointer-events-none ${
          flashActive ? "opacity-100" : "opacity-0"
        }`} 
      />

      {/* RENDER ACTIVE STREAM */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={zoomStyle}
        className={`w-full h-full object-cover select-none transition-opacity duration-300 ${
          deviceState === "active" ? "opacity-100" : "opacity-0 pointer-events-none absolute"
        }`}
      />
      {deviceState !== "active" && (
        /* SIMULATION VIEWFINDER */
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Animated scenery layer */}
          <img
            src={SIMULATED_SCENES[simSceneIndex].url}
            alt={SIMULATED_SCENES[simSceneIndex].title}
            referrerPolicy="no-referrer"
            style={zoomStyle}
            className="w-full h-full object-cover blur-[0.5px] brightness-90 animate-pulse duration-10000"
          />

          {/* Warning indicator / notice */}
          <div className="absolute top-24 left-4 right-4 z-20 mx-auto max-w-sm bg-black/85 border border-zinc-800 backdrop-blur-md rounded-2xl p-4 flex flex-col gap-3 text-xs text-zinc-300 shadow-2xl">
            <div className="flex items-start gap-2.5">
              <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-zinc-100 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Modo Simulador Inteligente
                </p>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  A câmera física está desativada no iframe. <strong>Para usar a sua câmera real (Webcam / Aparelho)</strong>, você precisa abrir o app em uma <strong>Nova Guia</strong>!
                </p>
                <p className="text-[10px] text-zinc-500 leading-normal pt-1 bg-zinc-950 p-2 rounded-lg border border-zinc-900">
                  💡 Clique no ícone de <strong>seta diagonal saindo da caixa (Abrir em nova aba)</strong> no topo superior direito da tela do AI Studio!
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-2 border-t border-zinc-900 pt-2.5">
              <button
                type="button"
                onClick={nextScene}
                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-white font-black tracking-wider uppercase transition-colors"
                title="Mudar cenário simulado para testar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Trocar Cenário ({SIMULATED_SCENES[simSceneIndex].title})
              </button>
              
              <button
                type="button"
                onClick={() => {
                  window.open(window.location.href, "_blank");
                }}
                className="flex items-center gap-1 text-[9px] bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded-md font-bold uppercase transition-all"
                title="Abrir em Nova Aba"
              >
                <span>Nova Aba ↗</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEWPORT OVERLAY ELEMENTS (HUD) */}
      
      {/* Recording LED at the top */}
      {isRecording && (
        <div className="absolute top-24 z-20 flex items-center gap-2 bg-red-600/95 border border-red-500/30 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-white uppercase tracking-widest animate-pulse">
          <span className="w-2 h-2 rounded-full bg-white block animate-ping" />
          <span>GRAVANDO • {formatTime(recordTimer)}</span>
        </div>
      )}

      {/* GRID FOCUS LINES (iOS classic camera layout) */}
      <div className="absolute inset-0 pointer-events-none border border-white/5 grid grid-cols-3 grid-rows-3 z-10">
        <div className="border-r border-b border-white/10" />
        <div className="border-r border-b border-white/10" />
        <div className="border-b border-white/10" />
        <div className="border-r border-b border-white/10" />
        <div className="border-r border-b border-white/10" />
        <div className="border-b border-white/10" />
        <div className="border-r border-white/10" />
        <div className="border-r border-white/10" />
        <div />
      </div>

      {/* OVERLAY CONTROLS PANEL (CENTER / LEFT / RIGHT SPECS) */}
      <div className="absolute bottom-6 inset-x-0 z-30 px-6 flex flex-col items-center gap-5 pointer-events-auto">
        
        {/* UPPER CAPTURE SLIDERS (ZOOM & PRESETS) */}
        <div className="w-full flex items-center justify-between">
          
          {/* IPHONE ZOOM SWITCHER (Bottom Left inside layout) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              id="zoom_iphone_btn"
              onClick={cycleZoom}
              title="Trocar zoom (estilo iPhone)"
              className="w-11 h-11 rounded-full bg-zinc-950/80 border border-zinc-900 text-zinc-100 flex items-center justify-center text-xs font-bold font-mono tracking-tighter hover:bg-emerald-600 hover:border-emerald-500 active:scale-95 transition-all outline-none"
            >
              {zoomLevel.toFixed(1)}x
            </button>
            
            {/* Quick Micro slider */}
            <div className="flex gap-1.5 bg-black/60 px-2 py-1 rounded-full border border-white/10">
              <button
                type="button"
                className={`text-[9px] font-bold cursor-pointer px-1 rounded-md transition-all ${zoomLevel === 0.5 ? 'text-emerald-400 font-extrabold scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => { playBeepSound("click"); setZoomLevel(0.5); }}
              >
                0.5
              </button>
              <button
                type="button"
                className={`text-[9px] font-bold cursor-pointer px-1 rounded-md transition-all ${zoomLevel === 1.0 ? 'text-emerald-400 font-extrabold scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => { playBeepSound("click"); setZoomLevel(1.0); }}
              >
                1.0
              </button>
              <button
                type="button"
                className={`text-[9px] font-bold cursor-pointer px-1 rounded-md transition-all ${zoomLevel === 3.0 ? 'text-emerald-400 font-extrabold scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => { playBeepSound("click"); setZoomLevel(3.0); }}
              >
                3.0
              </button>
              <button
                type="button"
                className={`text-[9px] font-bold cursor-pointer px-1 rounded-md transition-all ${zoomLevel === 10.0 ? 'text-emerald-400 font-extrabold scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => { playBeepSound("click"); setZoomLevel(10.0); }}
              >
                10
              </button>
              <button
                type="button"
                className={`text-[9px] font-bold cursor-pointer px-1 rounded-md transition-all ${zoomLevel === 15.0 ? 'text-emerald-400 font-extrabold scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => { playBeepSound("click"); setZoomLevel(15.0); }}
              >
                15
              </button>
            </div>
          </div>

          {/* Quick Facing toggle for real camera */}
          {deviceState === "active" && (
            <button
              type="button"
              onClick={toggleFacingMode}
              className="w-10 h-10 rounded-full bg-zinc-950/80 border border-zinc-900 text-zinc-300 flex items-center justify-center hover:bg-zinc-800 active:scale-90 transition-all outline-none"
              title="Girar câmera"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* BOTTOMMOST TRIGGER AND MODE CONTROLS */}
        <div className="w-full grid grid-cols-3 items-center">
          
          {/* Left spacer / layout balance */}
          <div className="flex justify-start">
            {deviceState === "denied" && (
              <button
                type="button"
                onClick={initCamera}
                title="Tentar acionar camera real"
                className="flex items-center gap-1.5 bg-zinc-900/90 hover:bg-emerald-900/40 border border-zinc-800 px-3 py-1.5 rounded-full text-[9px] text-zinc-400 hover:text-emerald-400 font-bold uppercase transition-all"
              >
                <Camera className="w-3.5 h-3.5 rotate-12" />
                <span>Reativar</span>
              </button>
            )}
          </div>

          {/* CENTER CAPTURE TRIGGER (Tirar foto / Gravar) */}
          <div className="flex justify-center">
            <button
              type="button"
              id="camera_shutter_trigger"
              onClick={handleCaptureTrigger}
              disabled={isSending}
              className="group relative flex items-center justify-center rounded-full outline-none select-none transition-transform active:scale-90 focus:ring-4 focus:ring-emerald-500/20"
            >
              {/* Outer metal bezel */}
              <div className="w-18 h-18 rounded-full border-[3px] border-white flex items-center justify-center bg-transparent transition-colors group-hover:border-zinc-300">
                {/* Inner button based on mode and recording status */}
                {cameraMode === "foto" ? (
                  /* Photo trigger: solid filled white */
                  <div className="w-14 h-14 rounded-full bg-white transition-all group-hover:scale-95 group-active:scale-90" />
                ) : (
                  /* Video trigger: solid red record circle / square */
                  isRecording ? (
                    /* Square showing running node */
                    <div className="w-8 h-8 rounded-md bg-red-600 animate-pulse transition-all" />
                  ) : (
                    /* Red action trigger */
                    <div className="w-14 h-14 rounded-full bg-red-600 transition-all group-hover:scale-95 group-active:scale-105" />
                  )
                )}
              </div>
            </button>
          </div>

          {/* RIGHT TOGGLE (FOTO/VIDEO Selector) */}
          <div className="flex justify-end">
            <div className="bg-zinc-950/80 border border-zinc-900 rounded-full p-1 flex items-center gap-1 shadow-md">
              <button
                type="button"
                id="mode_foto_btn"
                onClick={() => {
                  playBeepSound("click");
                  setCameraMode("foto");
                }}
                disabled={isRecording}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
                  cameraMode === "foto"
                    ? "bg-white text-zinc-950 scale-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                FOTO
              </button>
              <button
                type="button"
                id="mode_video_btn"
                onClick={() => {
                  playBeepSound("click");
                  setCameraMode("video");
                }}
                disabled={isRecording}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
                  cameraMode === "video"
                    ? "bg-red-600 text-white scale-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                VIDEO
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
