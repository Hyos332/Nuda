import { Redis } from "ioredis";
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
// Conexión directa usando tu REDIS_URL
const redis = new Redis(process.env.REDIS_URL as string);

export async function POST(request: Request) {
  try {
    const { email, nombre } = await request.json();
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar en Redis (Expira en 10 min)
    await redis.set(`otp:${email}`, code, "EX", 600);

    await resend.emails.send({
      from: "NUDA <contactonuda@nuda.com.es>",
      to: [email],
      subject: `Código de Verificación: ${code}`,
      html: `<p>Hola ${nombre}, tu código es: <strong>${code}</strong></p>`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error OTP:", error);
    return NextResponse.json({ error: "Error en el sistema" }, { status: 500 });
  }
}