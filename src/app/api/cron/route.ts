import { runScheduler } from "@/lib/events";

// Llamado por el worker (o un cron del servidor). Protegido con CRON_SECRET.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });
  return Response.json(await runScheduler());
}
