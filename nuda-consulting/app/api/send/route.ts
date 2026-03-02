import { Resend } from "resend";
import { NextResponse } from "next/server";
import { Redis } from "ioredis"; // Cambiado: Ahora usamos ioredis

export const runtime = "nodejs";

// Configuración de Redis
const redis = new Redis(process.env.REDIS_URL as string);

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Configuraciones de validación
const MAX_NOMBRE_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_MENSAJE_LENGTH = 3000;
const MIN_MENSAJE_LENGTH = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- FUNCIONES DE UTILIDAD ---

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    if (originHost === host.toLowerCase()) return true;
  } catch {
    return false;
  }

  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return allowedOrigins.includes(origin.toLowerCase());
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  const currentBucket = rateLimitBuckets.get(ip);
  if (!currentBucket || currentBucket.resetAt <= now) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (currentBucket.count >= RATE_LIMIT_MAX_REQUESTS) return true;
  currentBucket.count += 1;
  rateLimitBuckets.set(ip, currentBucket);
  return false;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function normalizeInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function hasBotSignal(payload: Record<string, unknown>): boolean {
  const honeypot = normalizeInput(payload.website);
  if (honeypot.length > 0) return true;

  const formStartedAt = typeof payload.formStartedAt === "number"
      ? payload.formStartedAt
      : Number(payload.formStartedAt);

  if (!Number.isFinite(formStartedAt)) return false;
  const elapsedMs = Date.now() - formStartedAt;
  return elapsedMs >= 0 && elapsedMs < 1500;
}

function validatePayload(payload: unknown): {
  ok: true;
  data: { nombre: string; email: string; mensaje: string; otp: string };
} | {
  ok: false;
} {
  if (!payload || typeof payload !== "object") return { ok: false };
  const input = payload as Record<string, unknown>;

  const nombre = normalizeInput(input.nombre);
  const email = normalizeInput(input.email).toLowerCase();
  const mensaje = normalizeInput(input.mensaje);
  const otp = normalizeInput(input.otp);

  if (nombre.length < 2 || nombre.length > MAX_NOMBRE_LENGTH) return { ok: false };
  if (email.length < 5 || email.length > MAX_EMAIL_LENGTH || !emailRegex.test(email)) return { ok: false };
  if (mensaje.length < MIN_MENSAJE_LENGTH || mensaje.length > MAX_MENSAJE_LENGTH) return { ok: false };
  if (otp.length !== 6) return { ok: false };

  return { ok: true, data: { nombre, email, mensaje, otp } };
}

// --- ENDPOINT PRINCIPAL ---

export async function POST(request: Request) {
  if (!resend) {
    return NextResponse.json({ error: "Servicio de correo no configurado" }, { status: 500 });
  }

  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const payload = rawPayload as Record<string, unknown>;
    
    if (hasBotSignal(payload)) {
      return NextResponse.json({ error: "Solicitud bloqueada" }, { status: 400 });
    }

    const validated = validatePayload(payload);
    if (!validated.ok) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

// --- VALIDACIÓN TÉCNICA CON IOREDIS ---
    const emailKey = `otp:${validated.data.email}`;
    const storedCode = await redis.get(emailKey);

    // 1. Validamos. Si NO coincide, devolvemos error pero NO borramos nada de Redis.
    if (!storedCode || storedCode !== validated.data.otp) {
      return NextResponse.json({ 
        error: "Código inválido. Verifica el último correo recibido." 
      }, { status: 401 });
    }

    // 2. SOLO si el código es CORRECTO, llegamos a esta línea y lo borramos.
    // Esto evita que el código se use dos veces, pero permite corregir errores de escritura.
    await redis.del(emailKey);

    // --- PREPARACIÓN Y ENVÍO ---
    const safeNombre = escapeHtml(validated.data.nombre);
    const safeEmail = escapeHtml(validated.data.email);
    const safeMensaje = escapeHtml(validated.data.mensaje);
    const safeNombreForSubject = sanitizeHeaderValue(validated.data.nombre);

    // Notificación para ti (Admin)
    const adminResult = await resend.emails.send({
      from: "SISTEMA NUDA <contactonuda@nuda.com.es>",
      to: ["contactonuda@nuda.com.es"],
      replyTo: validated.data.email,
      subject: `[NUDA CORE] Nuevo Payload: ${safeNombreForSubject}`,
      html: `
        <div style="font-family: monospace; background: #000; color: #fff; padding: 20px; border: 1px solid #a31d1d;">
          <h2 style="color: #a31d1d;">>>> INCOMING DATA (VERIFIED)</h2>
          <p><strong>IDENTIDAD:</strong> ${safeNombre}</p>
          <p><strong>RETORNO:</strong> ${safeEmail}</p>
          <br/>
          <p><strong>CONCEPTO:</strong> ${safeMensaje}</p>
          <br/>
          <p style="color: #444;">-- END OF TRANSMISSION --</p>
        </div>
      `,
    });

    if (adminResult.error) throw new Error(adminResult.error.message);

    // Confirmación para el cliente
    const userResult = await resend.emails.send({
      from: "NUDA <contactonuda@nuda.com.es>",
      to: [validated.data.email],
      subject: "Información recibida",
      html: `
        <div style="font-family: monospace; background: #fff; color: #000; padding: 20px; border-left: 4px solid #a31d1d;">
          <h2 style="letter-spacing: 2px;">NUDA // SISTEMAS</h2>
          <p>Hola ${safeNombre}, hemos recibido tu información correctamente (Protocolo Verificado).</p>
          <p>Nuestro equipo está analizando el concepto técnico enviado. Nos pondremos en contacto contigo a través de este canal de retorno a la brevedad.</p>
          <br/>
          <p style="font-size: 10px; color: #888;">Este es un mensaje automático de confirmación de protocolo.</p>
        </div>
      `,
    });

    if (userResult.error) throw new Error(userResult.error.message);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error en el protocolo de envío:", error);
    return NextResponse.json({ error: "Error en el protocolo de envío" }, { status: 500 });
  }
}