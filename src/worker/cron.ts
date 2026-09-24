// Worker: cierra licitaciones vencidas y envía recordatorios cada minuto.
import cron from "node-cron";
import { runScheduler } from "../lib/events";

async function tick() {
  try {
    const r = await runScheduler();
    if (r.closed || r.reminders) console.log(new Date().toISOString(), "scheduler", r);
  } catch (e) {
    console.error("scheduler error", e);
  }
}

console.log("Compras AG worker iniciado");
tick();
cron.schedule("* * * * *", tick);
