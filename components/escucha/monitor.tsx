// Wrapper server del monitor: arma las claves marcadas y delega el render del
// tablero EN VIVO al client component LiveMonitor.
import { TERRITORY } from "@/lib/config";
import type { ListeningResult } from "@/lib/listening";
import type { Marca } from "@/lib/escucha-marcas";
import type { AlAire } from "@/lib/al-aire";
import { LiveMonitor } from "@/components/escucha/live-monitor";
import { AlAireBar } from "@/components/escucha/al-aire";

interface MonitorProps {
  result: ListeningResult;
  marcas: Marca[];
  descartados: string[];
  persistOk: boolean;
  alAire: AlAire | null;
}

export function Monitor({ result, marcas, descartados, persistOk, alAire }: MonitorProps) {
  const markedKeys = marcas.map((m) => m.itemKey);
  return (
    <>
      <AlAireBar state={alAire} />
      <LiveMonitor
        initial={result}
        markedKeys={markedKeys}
        dismissedKeys={descartados}
        persistOk={persistOk}
        territory={TERRITORY}
      />
    </>
  );
}
