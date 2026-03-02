import { kv } from '@vercel/kv';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, nombre } = await req.json();

    if (!email || !nombre) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 1. Generar código aleatorio de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Guardar en Vercel KV con expiración de 5 minutos (300 segundos)
    // Usamos el prefijo 'otp:' para mantener organizada la base de datos
    await kv.set(`otp:${email}`, code, { ex: 300 });

    // 3. Enviar el código al usuario desde tu correo profesional
    await resend.emails.send({
      from: 'NUDA <contactonuda@nuda.com.es>',
      to: [email],
      subject: 'Código de Verificación - NUDA CORE',
      html: `
        <div style="font-family: monospace; background: #fff; color: #000; padding: 20px; border: 1px solid #a31d1d; max-width: 500px;">
          <h2 style="letter-spacing: 2px; border-bottom: 2px solid #a31d1d; padding-bottom: 10px;">NUDA // SEGURIDAD</h2>
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Para procesar tu solicitud técnica, introduce el siguiente código de verificación en nuestra plataforma:</p>
          <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 10px; margin: 20px 0;">
            ${code}
          </div>
          <p style="font-size: 11px; color: #666;">Este protocolo expira en 5 minutos. Si no solicitaste este código, ignora este mensaje.</p>
          <br/>
          <p style="font-size: 10px; color: #888;">-- END OF PROTOCOL --</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en el sistema OTP:", error);
    return NextResponse.json({ error: "Error en el protocolo de verificación" }, { status: 500 });
  }
}