import { runScheduler } from "@/lib/events";

// Tareas programadas (cierre de licitaciones vencidas y recordatorios).
// Lo llama el worker en el servidor interno, o Vercel Cron (GET con "Authorization: Bearer CRON_SECRET").
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });
  return Response.json(await runScheduler());
}

export const GET = handle;
export const POST = handle;
