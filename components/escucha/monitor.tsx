// Wrapper server del monitor: arma las claves marcadas y delega el render del
// tablero EN VIVO al client component LiveMonitor.
import { TERRITORY } from "@/lib/config";
import type { ListeningResult } from "@/lib/listening";
import type { Marca } from "@/lib/escucha-marcas";
import { LiveMonitor } from "@/components/escucha/live-monitor";

interface MonitorProps {
  result: ListeningResult;
  marcas: Marca[];
  descartados: string[];
  persistOk: boolean;
}

export function Monitor({ result, marcas, descartados, persistOk }: MonitorProps) {
  const markedKeys = marcas.map((m) => m.itemKey);
  return (
    <LiveMonitor
      initial={result}
      markedKeys={markedKeys}
      dismissedKeys={descartados}
      persistOk={persistOk}
      territory={TERRITORY}
    />
  );
}
