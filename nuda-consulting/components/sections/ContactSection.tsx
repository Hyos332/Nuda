"use client";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { toast } from "sonner";

export const ContactSection = () => {
  // Estados: idle -> requesting_otp -> awaiting_otp -> sending_final -> success
  const [status, setStatus] = useState<"idle" | "requesting_otp" | "awaiting_otp" | "sending_final" | "success">("idle");
  const formStartedAtRef = useRef<number>(Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  // 1. PRIMER PASO: Solicitar el OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    
    setStatus("requesting_otp");
    const formData = new FormData(formRef.current);
    
    try {
      const response = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          nombre: formData.get("nombre"),
        }),
      });

      if (response.ok) {
        setStatus("awaiting_otp");
      } else {
        throw new Error("Fallo en el protocolo de seguridad");
      }
    } catch (error) {
      console.error(error);
      setStatus("idle");
      toast.error("FALLO DE PROTOCOLO", { description: "EL NÚCLEO NO RESPONDE. REINTENTE TRANSMISIÓN."});
      }
    };

  // 1b. Reenviar OTP
  const handleResendOTP = async () => {
  if (!formRef.current) return;
  const formData = new FormData(formRef.current);
  
  const email = formData.get("email");
  const nombre = formData.get("nombre");

  // Definimos la promesa del fetch
  const resendPromise = fetch("/api/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, nombre }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("Fallo en el reenvío");
    return res;
  });

  // Usamos Sonner para gestionar los estados visuales automáticamente
  toast.promise(resendPromise, {
    loading: 'RE-GENERANDO TOKEN DE ACCESO...',
    success: 'NUEVO CÓDIGO TRANSMITIDO',
    error: 'ERROR EN EL PROTOCOLO DE REENVÍO',
  });
};

  // 2. SEGUNDO PASO: Enviar código y mensaje final
  const handleFinalSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!formRef.current) return;
  
  setStatus("sending_final");
  const formData = new FormData(formRef.current);
  
  const payload = {
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    mensaje: formData.get("mensaje"),
    otp: formData.get("otp"),
    website: formData.get("website"),
    formStartedAt: formStartedAtRef.current,
  };

  try {
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setStatus("success");
      // Notificación de éxito
      toast.success("TRANSMISIÓN COMPLETADA", {
        description: "PAYLOAD ALOJADO EN EL NÚCLEO DE NUDA."
      });
      
      setTimeout(() => {
        formRef.current?.reset();
        formStartedAtRef.current = Date.now();
        setStatus("idle");
      }, 5000);
    } else {
      const errorData = await response.json();
      // Notificación de error de validación (ej. OTP incorrecto)
      toast.error("ERROR DE VALIDACIÓN", {
        description: (errorData.error || "PROTOCOLO RECHAZADO").toUpperCase()
      });
      setStatus("awaiting_otp");
    }
  } catch (error) {
    setStatus("awaiting_otp");
    // Notificación de error de red o servidor
    toast.error("FALLO CRÍTICO", {
      description: "ERROR EN LA TRANSMISIÓN FINAL. REINTENTE."
    });
  }
};

const handleCancel = () => {
  setStatus("idle");
  // Opcional: limpiar el formulario si quieres que empiece de cero
  // formRef.current?.reset(); 
  toast.info("PROTOCOLO ABORTADO", {
    description: "VOLVIENDO AL ESTADO INICIAL."
  });
};


  
  return (
    <section id="contacto" className="min-h-screen w-full bg-black flex flex-col items-center justify-center py-32 px-6 relative overflow-hidden">
      <SectionHeader number="03" title="Contacto" />

      <div className="w-full max-w-2xl relative">
        <AnimatePresence mode="wait">
          {status !== "success" ? (
            <motion.form 
              key="form"
              ref={formRef}
              onSubmit={status === "awaiting_otp" ? handleFinalSubmit : handleRequestOTP} 
              className="space-y-12"
              exit={{ opacity: 0, filter: "blur(10px)" }}
            >
              {/* Campos principales (Nombre y Email) */}
              <div className={`space-y-12 transition-opacity duration-500 ${status === "awaiting_otp" ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
                <input type="text" name="website" tabIndex={-1} className="hidden" />

                <div className="group relative border-b border-white/10 focus-within:border-[#a31d1d]">
                  {/* <span className="text-[#a31d1d] font-mono text-[9px] block mb-2 opacity-0 group-focus-within:opacity-100 transition-opacity uppercase">VAR_IDENTITY</span> */}
                  <input required name="nombre" type="text" placeholder="01: Nombre o agencia" className="w-full bg-transparent py-4 text-white outline-none placeholder:text-white/20 uppercase font-bold tracking-tighter text-lg md:text-2xl" />
                </div>

                <div className="group relative border-b border-white/10 focus-within:border-[#a31d1d]">
                  {/* <span className="text-[#a31d1d] font-mono text-[9px] block mb-2 opacity-0 group-focus-within:opacity-100 transition-opacity uppercase">VAR_ENLACE</span> */}
                  <input required name="email" type="email" placeholder="02: Email" className="w-full bg-transparent py-4 text-white outline-none placeholder:text-white/20 uppercase font-bold tracking-tighter text-lg md:text-2xl" />
                </div>
              </div>

              {/* Sección de Mensaje y OTP (Solo aparece tras enviar el primer paso) */}
<AnimatePresence>
  {status === "awaiting_otp" || status === "sending_final" ? (
    <motion.div 
      initial={{ height: 0, opacity: 0 }} 
      animate={{ height: "auto", opacity: 1 }} 
      className="space-y-12 pt-4"
    >
      <div className="group relative border-b border-[#a31d1d] bg-[#a31d1d]/5 p-4">
        <input 
          required 
          name="otp" 
          type="text" 
          maxLength={6} 
          placeholder="******" 
          className="w-full bg-transparent text-white outline-none placeholder:text-white/20 uppercase font-bold tracking-[0.5em] text-xl" 
        />
        
        <div className="flex justify-between items-center mt-4">
          {/* Indicador de estado */}
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-[#a31d1d] animate-pulse" />
            <p className="text-[7px] text-[#a31d1d] font-mono uppercase tracking-widest">
              TTL: 600s // STATUS: ACTIVE
            </p>
          </div>

          {/* Grupo de Acciones */}
          <div className="flex gap-4">
            <button 
              type="button" 
              onClick={handleResendOTP}
              className="text-[7px] text-white/40 hover:text-white font-mono uppercase underline decoration-[#a31d1d] underline-offset-4 transition-all"
            >
              [ Reenviar ]
            </button>
            
            {/* NUEVO: Botón de Cancelar */}
            <button 
              type="button" 
              onClick={() => {
                setStatus("idle");
                toast.info("PROTOCOLO ABORTADO", {
                  description: "CORRIJA SUS DATOS E INTENTE DE NUEVO."
                });
              }}
              className="text-[7px] text-[#a31d1d] hover:text-white font-mono uppercase transition-all"
            >
              [ Cancelar ]
            </button>
          </div>
        </div>
      </div>

      <div className="group relative border-b border-white/10 focus-within:border-[#a31d1d]">
        <textarea 
          required 
          name="mensaje" 
          rows={3} 
          placeholder="03: Describe tu idea" 
          className="w-full bg-transparent py-4 text-white outline-none placeholder:text-white/20 uppercase font-bold tracking-tighter text-lg md:text-2xl resize-none" 
        />
      </div>
    </motion.div>
  ) : null}
</AnimatePresence>

              <button 
                type="submit"
                disabled={status === "requesting_otp" || status === "sending_final"}
                className="group relative w-full py-4 md:py-6 border border-white/10 hover:border-[#a31d1d] transition-all duration-500 overflow-hidden"
              >
                <span className="text-white font-mono text-[8px] md:text-[10px] uppercase tracking-[0.4em] group-hover:text-[#a31d1d]">
                  {status === "idle" && "Validar Identidad"}
                  {status === "requesting_otp" && "Generando Token..."}
                  {status === "awaiting_otp" && "Ejecutar Transmisión"}
                  {status === "sending_final" && "Sincronizando Socket..."}
                </span>
              </button>
            </motion.form>
          ) : (
            /* Pantalla de Éxito */
            <motion.div key="success-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 border border-green-500/30 flex items-center justify-center">
                <span className="text-green-500 font-mono text-xl">200</span>
              </div>
              <h3 className="text-white font-mono text-xs uppercase tracking-[0.5em]">Transmisión Exitosa</h3>
              <p className="text-white/40 font-mono text-[8px] uppercase tracking-[0.2em]">Identidad verificada. Payload alojado en el núcleo.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};