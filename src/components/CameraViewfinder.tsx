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
      // Simulator scene capture (using local canvas vectors to guarantee zero CORS canvas tainting on Safari/iOS)
      const currentScene = SIMULATED_SCENES[simSceneIndex];
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Underlay backdrop
        ctx.fillStyle = "#0c0a0f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // DRAW PROCEDURAL ARTWORK BASED ON THE SCENE INDEX
        if (simSceneIndex === 0) {
          // "Estúdio Juba Foto": Warm radial gradient highlight with visual guides
          const grad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 80,
            canvas.width / 2, canvas.height / 2, 550
          );
          grad.addColorStop(0, "#2a2830");
          grad.addColorStop(0.5, "#16141c");
          grad.addColorStop(1, "#08070b");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw geometric softbox / studio rig wireframes
          ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(120, 150, 160, 220);
          ctx.beginPath();
          ctx.moveTo(200, 370);
          ctx.lineTo(200, 580);
          ctx.stroke();
          
          // Outer spotlight circles
          ctx.strokeStyle = "rgba(16, 185, 129, 0.2)";
          ctx.beginPath();
          ctx.arc(canvas.width - 250, 250, 90, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.fillStyle = "rgba(16, 185, 129, 0.1)";
          ctx.fill();
          
          // Golden ratio focus circle in center
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(canvas.width / 2, canvas.height / 2, 120, 0, Math.PI * 2);
          ctx.stroke();
        } else if (simSceneIndex === 1) {
          // "Modelo Retrato Clássico": Classic elegant deep blue gradient and portrait outline
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, "#111827"); // Indigo-950
          grad.addColorStop(0.5, "#1f1e3d"); // Purple-950
          grad.addColorStop(1, "#030712");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Golden/amber hair backdrop light glow
          const halo = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2 - 40, 30,
            canvas.width / 2, canvas.height / 2 - 40, 250
          );
          halo.addColorStop(0, "rgba(245, 158, 11, 0.35)"); // warm amber
          halo.addColorStop(1, "rgba(245, 158, 11, 0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(canvas.width / 2, canvas.height / 2 - 40, 220, 0, Math.PI * 2);
          ctx.fill();
          
          // Silhouette profile of model avatar (shoulders)
          ctx.fillStyle = "#09050d";
          ctx.beginPath();
          ctx.ellipse(canvas.width / 2, canvas.height + 60, 250, 190, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          
          // neck
          ctx.fillRect(canvas.width / 2 - 45, canvas.height - 200, 90, 140);
          
          // head
          ctx.beginPath();
          ctx.arc(canvas.width / 2, canvas.height / 2 - 30, 95, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw cool minimalist camera viewfinder brackets on head
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 3;
          
          // top left bracket
          ctx.beginPath();
          ctx.moveTo(canvas.width / 2 - 130, canvas.height / 2 - 130);
          ctx.lineTo(canvas.width / 2 - 100, canvas.height / 2 - 130);
          ctx.moveTo(canvas.width / 2 - 130, canvas.height / 2 - 130);
          ctx.lineTo(canvas.width / 2 - 130, canvas.height / 2 - 100);
          ctx.stroke();
          
          // bottom right bracket
          ctx.beginPath();
          ctx.moveTo(canvas.width / 2 + 130, canvas.height / 2 + 70);
          ctx.lineTo(canvas.width / 2 + 100, canvas.height / 2 + 70);
          ctx.moveTo(canvas.width / 2 + 130, canvas.height / 2 + 70);
          ctx.lineTo(canvas.width / 2 + 130, canvas.height / 2 + 40);
          ctx.stroke();
        } else if (simSceneIndex === 2) {
          // "Ensaio Fotográfico Natureza": Vibrant dusk sunset with geometric mountain peaks and pines
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, "#f97316"); // bright sunset orange
          grad.addColorStop(0.5, "#db2777"); // dark magenta
          grad.addColorStop(1, "#311042"); // deep purple
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Sun disc
          ctx.fillStyle = "#fffbeb";
          ctx.beginPath();
          ctx.arc(canvas.width / 2 + 180, 240, 75, 0, Math.PI * 2);
          ctx.fill();
          
          // Dark mountain silhouette
          ctx.fillStyle = "#0c051a";
          ctx.beginPath();
          ctx.moveTo(-50, canvas.height);
          ctx.lineTo(300, 420);
          ctx.lineTo(700, canvas.height);
          ctx.closePath();
          ctx.fill();
          
          ctx.beginPath();
          ctx.moveTo(500, canvas.height);
          ctx.lineTo(950, 360);
          ctx.lineTo(canvas.width + 100, canvas.height);
          ctx.closePath();
          ctx.fill();
          
          // Local helper to draw vector pine trees
          const drawPine = (x: number, baseHeight: number) => {
            const trunkWidth = 14;
            const trunkHeight = 45;
            
            // Draw Trunk
            ctx.fillStyle = "#05010a";
            ctx.fillRect(x - trunkWidth / 2, canvas.height - baseHeight, trunkWidth, baseHeight);
            
            // Draw pine leaf layers
            ctx.fillStyle = "#080312";
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              const levelY = canvas.height - baseHeight - (i * 40);
              ctx.moveTo(x, levelY - 80);
              ctx.lineTo(x - 55 + (i * 10), levelY);
              ctx.lineTo(x + 55 - (i * 10), levelY);
              ctx.closePath();
              ctx.fill();
            }
          };
          
          drawPine(130, 100);
          drawPine(1120, 120);
        } else {
          // "Arquitetura Urbana": Dark cityscape with blue/pink neon windows & gridded gridstars
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, "#020617"); // midnight slate
          grad.addColorStop(0.6, "#1e1b4b"); // indigo sky
          grad.addColorStop(1, "#170c24"); // neon glow base
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw random pixel stars
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          for (let i = 0; i < 30; i++) {
            const sx = (i * 81 + 29) % canvas.width;
            const sy = (i * 59 + 47) % 320;
            ctx.fillRect(sx, sy, 2, 2);
          }
          
          // Draw geometric skyscrapers (neon framed silhouettes)
          const drawSkyscraper = (xOffset: number, width: number, height: number, neonColor: string) => {
            const topY = canvas.height - height;
            ctx.fillStyle = "#030206";
            ctx.fillRect(xOffset, topY, width, height);
            
            // Neon accent border
            ctx.strokeStyle = neonColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(xOffset, topY, width, height);
            
            // Draw windows helper
            ctx.fillStyle = "rgba(56, 189, 248, 0.65)"; // glowing cyan sky window
            for (let wy = topY + 25; wy < canvas.height - 15; wy += 40) {
              for (let wx = xOffset + 15; wx < xOffset + width - 15; wx += 25) {
                if ((wx + wy) % 5 !== 0) {
                  ctx.fillRect(wx, wy, 8, 12);
                }
              }
            }
          };
          
          drawSkyscraper(90, 140, 480, "rgba(236, 72, 153, 0.45)"); // pink neon
          drawSkyscraper(290, 190, 530, "rgba(16, 185, 129, 0.45)"); // green neon
          drawSkyscraper(550, 130, 410, "rgba(236, 72, 153, 0.45)"); 
          drawSkyscraper(740, 170, 500, "rgba(56, 189, 248, 0.45)"); // sky blue neon
          drawSkyscraper(980, 150, 460, "rgba(245, 158, 11, 0.45)"); // amber neon
        }
        
        // 1/3 rules grid lines overlay
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        // vertical lines
        ctx.moveTo(canvas.width / 3, 0);
        ctx.lineTo(canvas.width / 3, canvas.height);
        ctx.moveTo((canvas.width / 3) * 2, 0);
        ctx.lineTo((canvas.width / 3) * 2, canvas.height);
        // horizontal lines
        ctx.moveTo(0, canvas.height / 3);
        ctx.lineTo(canvas.width, canvas.height / 3);
        ctx.moveTo(0, (canvas.height / 3) * 2);
        ctx.lineTo(canvas.width, (canvas.height / 3) * 2);
        ctx.stroke();
        
        // Watermark tag banner JUBA FOTO / SIMULATION MODE info
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(35, 35, 290, 80);
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(35, 35, 290, 80);
        
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("JUBA FOTO ©", 55, 68);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px monospace";
        ctx.fillText(`CENA SIMULADA: ${currentScene.title}`, 55, 91);
        ctx.fillText(`Zoom Digital: ${zoomLevel.toFixed(1)}x`, 55, 105);
        
        // Export base64 jpeg
        const base64Url = canvas.toDataURL("image/jpeg", 0.85);
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
      
      // Let's create a real valid small inline base64-encoded webm dummy dataUrl
      // using a lightweight 20-byte dummy chunk read safely as data URL.
      const dummyData = new Uint8Array([26, 69, 223, 163, 1, 0, 0, 0, 25, 134, 129, 1, 66, 134, 129, 8, 66, 247, 129, 1]);
      const blob = new Blob([dummyData], { type: "video/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        onMediaCaptured({
          id: "mock_vid_" + Math.random().toString(36).substr(2, 9),
          type: "video",
          url: base64Url,
          name: filename,
          sizeFormatted: "0.15 KB",
          fileType: "video/webm",
        });
      };
      reader.readAsDataURL(blob);
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
