// Motor anti-bloqueo (spec §3). Presupuesto duro por plataforma/día, jitter
// real entre peticiones, concurrencia 1 (el orquestador await-ea cada unidad),
// pausa larga cada 15, y horario plausible. Un informe incompleto se recupera;
// una cuenta bloqueada, no: ante la duda, gana la prudencia.

export function plausibleHour(now = new Date(), win = [8, 25]) {
  const h = now.getHours() + (now.getHours() < 2 ? 24 : 0);
  return h >= win[0] && h <= win[1];
}

export function jitterMs(min = 6000, max = 20000) {
  return min + Math.floor(Math.random() * (max - min));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Budget {
  constructor(plan) {
    this.plan = plan;
    this.used = {};
    this.sinceLongPause = 0;
  }
  remaining(platform) {
    const cap = this.plan[platform] ? this.plan[platform].requests : 0;
    return cap - (this.used[platform] || 0);
  }
  async spend(platform) {
    this.used[platform] = (this.used[platform] || 0) + 1;
    this.sinceLongPause++;
    const p = this.plan[platform] || { pausaMinMs: 6000, pausaMaxMs: 20000 };
    await sleep(jitterMs(p.pausaMinMs, p.pausaMaxMs));
    if (this.sinceLongPause >= 15) {
      this.sinceLongPause = 0;
      await sleep(60000 + Math.floor(Math.random() * 120000));
    }
  }
}
