"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2 } from "lucide-react";
import { environment } from "@/environments/environments.prod";
import "@/components/catalog/catalog.css";

interface EmployeeData {
  CODIGO: string;
  NOMBRE: string;
}

interface CameraModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly employee: EmployeeData | null;
  readonly onValidationComplete: (result: ValidationResult) => void;
  readonly preloadedStream?: MediaStream | null;
  readonly countdownSeconds?: number;
}

interface ValidationResult {
  status: "approved" | "denied" | "update_required";
  message: string;
  tipo?: string;
  empleado?: { 
    nombre: string;
    codigo: string;
    departamento?: string;
    centro?: string;
  };
  error?: string;
}

export function CameraModal({
  isOpen,
  onClose,
  employee,
  onValidationComplete,
  preloadedStream,
  countdownSeconds = 3,
}: CameraModalProps) {
  const BASEURL = environment.apiAuthFacial;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [counter, setCounter] = useState<number>(countdownSeconds);
  const [videoReady, setVideoReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const hasCompletedRef = useRef(false);

  // Helper function for status message
  const getStatusMessage = () => {
    if (loading) return "Validando rostro...";
    if (photoTaken) return "Foto capturada";
    if (videoReady && counter > 0) return `Capturando en ${counter}...`;
    if (videoReady && counter === 0) return "Procesando...";
    return "Preparando cámara...";
  };

  // Helper function for subtitle message
  const getSubtitleMessage = () => {
    if (loading) return "Por favor espere";
    if (photoTaken) return "Procesando resultado";
    if (videoReady) return "Mantén la posición";
    return "Espera un momento";
  };

  // Stop camera stream - NO detener si es pre-cargado
  const stopCamera = useCallback(() => {
    // NO detener el video del elemento (streamRef.current)
    // porque si es pre-cargado, será reutilizado
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Take photo function
  const handleTakePhoto = useCallback(async () => {
    if (hasCompletedRef.current) return;
    if (!videoRef.current || !employee) return;
    
    hasCompletedRef.current = true;
    setPhotoTaken(true);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // Aplicar el efecto espejo al dibujar
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Guardar la imagen capturada para mostrarla durante la validación
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedImage(imageDataUrl);
      
      // Revertir la transformación para el blob
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          setLoading(true);
          try {
            const formData = new FormData();
            formData.append('codigo', employee.CODIGO);
            formData.append('foto', blob, `captured_${Date.now()}.jpg`);
            
            const response = await fetch(`${BASEURL}/validate_face`, {
              method: "POST",
              body: formData,
            });

            const result = await response.json();

            console.log("Respuesta del servicio facial:", result);

            // Normalizar diferentes shapes de respuesta del servicio facial
            // Chequear ambos formatos: field "success" (true/'true') o field "status" (approved)
            const successFlag = result?.success === true || result?.success === 'true' || result?.success === 'True' || result?.success === '1';
            const statusApproved = result?.status === 'approved';
            
            if (successFlag || statusApproved) {
              const empleadoData = result?.data || result?.empleado || result;
              const nombre = empleadoData?.NOMBRE || empleadoData?.nombre || employee.NOMBRE;
              const codigo = empleadoData?.CODIGO || empleadoData?.codigo || employee.CODIGO;
              const departamento = empleadoData?.DEPARTAMENTO || empleadoData?.departamento || empleadoData?.area || '';
              const centro = empleadoData?.CENTRO || empleadoData?.centro || '1000';
              const similarity = result?.similarity ?? null;
              onValidationComplete({
                status: 'approved',
                message: similarity ? `Rostro verificado (similitud ${similarity})` : (result?.message || 'Ingreso exitoso'),
                tipo: result?.tipo || 'Validación Facial',
                empleado: { nombre, codigo, departamento, centro },
              });
            } else {
              // Caso de fallo: construir mensaje desde campos conocidos
              const errMsg = result?.error || result?.message || (result?.distance ? `Distancia: ${result.distance}` : 'Rostros no coinciden');
              onValidationComplete({
                status: 'denied',
                message: errMsg,
                tipo: result?.tipo || 'Validación Facial',
                error: errMsg,
              });
            }
            
            // Esperar 1 segundo para mostrar resultado, luego cerrar
            setTimeout(() => {
              setLoading(false);
              handleClose();
            }, 1000);
            
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "Error desconocido";
            onValidationComplete({
              status: "denied",
              message: errorMessage || "No se pudo validar el rostro",
              error: errorMessage,
            });
            setLoading(false);
            handleClose();
          }
        }
      }, "image/jpeg", 0.9);
    }
  }, [employee, handleClose, onValidationComplete, BASEURL]);

  // Initialize camera when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset states when modal closes
      setVideoReady(false);
      setCounter(countdownSeconds);
      setLoading(false);
      setPhotoTaken(false);
      setCapturedImage(null);
      hasCompletedRef.current = false;
      return;
    }

    // Reset states when modal opens
    setVideoReady(false);
    setCounter(countdownSeconds);
    setLoading(false);
    setPhotoTaken(false);
    setCapturedImage(null);
    hasCompletedRef.current = false;

    const initCamera = async () => {
      try {
        let stream: MediaStream;
        
        // Usar stream pre-cargado si esta disponible
        if (preloadedStream?.active) {
          stream = preloadedStream;
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 }
            } 
          });
        }
        
        streamRef.current = stream;
        
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          
          // Usar una promesa para esperar que el video esté listo
          video.onloadeddata = () => {
            video.play()
              .then(() => {
                setVideoReady(true);
              })
              .catch(() => {
                // Error al reproducir video
              });
          };
        }
      } catch {
        alert("No se pudo acceder a la cámara. Verifique los permisos.");
      }
    };

    initCamera();

    return () => {
      // Solo desconectar el video del elemento, NO detener el stream
      // para mantenerlo listo para la próxima captura
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isOpen, preloadedStream]);

  // Countdown timer - solo si el video está listo y no se ha tomado foto
  useEffect(() => {
    if (!videoReady || !isOpen || photoTaken || hasCompletedRef.current) return;

    const timer = setInterval(() => {
      setCounter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTakePhoto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [videoReady, isOpen, photoTaken, handleTakePhoto]);

  if (!isOpen) return null;

  return (
    <div className="cx-cam">
      <div className="relative w-full max-w-lg mx-auto flex flex-col items-center">
        {/* Camera Container */}
        <div className="cx-cam-frame">
          {/* Video element - SIEMPRE renderizado */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ 
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
              backgroundColor: "transparent",
              display: capturedImage ? "none" : "block",
              zIndex: 1
            }}
          />

          {/* Imagen capturada - visible durante validación */}
          {capturedImage && (
            <img 
              src={capturedImage} 
              alt="Foto capturada"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: 1
              }}
            />
          )}

          {/* Indicador de carga de cámara - solo cuando no está listo y no hay imagen */}
          {!videoReady && !capturedImage && (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "black",
              zIndex: 2
            }}>
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-2" />
                <p className="text-white text-sm">Iniciando cámara...</p>
              </div>
            </div>
          )}

          {/* Corner brackets - z-index 3 para estar sobre el video */}
          <div className="absolute top-12 left-12 w-8 h-8 border-t-2 border-l-2 border-[#5aa2ff] rounded-tl-lg opacity-80 z-[3] pointer-events-none" />
          <div className="absolute top-12 right-12 w-8 h-8 border-t-2 border-r-2 border-[#5aa2ff] rounded-tr-lg opacity-80 z-[3] pointer-events-none" />
          <div className="absolute bottom-12 left-12 w-8 h-8 border-b-2 border-l-2 border-[#5aa2ff] rounded-bl-lg opacity-80 z-[3] pointer-events-none" />
          <div className="absolute bottom-12 right-12 w-8 h-8 border-b-2 border-r-2 border-[#5aa2ff] rounded-br-lg opacity-80 z-[3] pointer-events-none" />

          {/* Face guide oval */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[3]">
            <div className="w-64 h-80 rounded-[45%] border-2 border-[#5aa2ff]/40 shadow-[0_0_40px_rgba(90,162,255,0.2)]" />
          </div>

          {/* Counter/Status display - esquina inferior derecha */}
          <div className="absolute bottom-20 right-8 z-[5]">
            <div className="bg-black/50 backdrop-blur-md rounded-full w-16 h-16 flex items-center justify-center border border-white/20 shadow-lg">
              {loading ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <span className="text-white text-2xl font-bold drop-shadow-lg">
                  {counter > 0 ? counter : "✓"}
                </span>
              )}
            </div>
          </div>

          {/* Status message */}
          <div className="absolute bottom-6 left-0 right-0 text-center z-[5]">
            <div className="cx-cam-status">
              <span className="cx-cam-dot" />
              <span className="text-white font-medium text-sm">
                {getStatusMessage()}
              </span>
            </div>
            <p className="text-gray-300 text-xs mt-1">
              {getSubtitleMessage()}
            </p>
          </div>

          {/* Close button */}
          {!loading && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors z-[10]"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* Brand footer */}
        <div className="mt-6 flex flex-col items-center">
          <div className="flex items-center gap-3 opacity-70">
            <img src={`${environment.basePath}/img/logo_chaide.svg`} alt="Logo" className="w-35 h-35 object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
}
