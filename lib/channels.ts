// Presentación de los canales: etiqueta y símbolo, en un solo lugar.
//
// Había cinco copias del mapa canal→emoji repartidas entre el embudo, el
// preview de canales, el filtro de segmentos, el query builder y el estudio de
// avisos. Cuando se sumó Telegram, tres de las cinco quedaron sin él: el mismo
// canal aparecía con avión en una pantalla y sin nada en otra.
//
// Emoji y no íconos lucide a propósito: estos símbolos van dentro de `<option>`
// de un `<select>` nativo, que no renderiza componentes. Los que sí pueden usar
// un ícono (badges, encabezados) tienen `Icon` disponible.
import {
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { CHANNELS, type Channel } from "@/lib/relationship";

export interface ChannelPresentation {
  label: string;
  // Símbolo de texto, para contextos donde no se puede renderizar un componente.
  emoji: string;
  Icon: LucideIcon;
}

export const CHANNEL_UI: Record<Channel, ChannelPresentation> = {
  email: { label: "Email", emoji: "📧", Icon: Mail },
  whatsapp: { label: "WhatsApp", emoji: "💬", Icon: MessageCircle },
  sms: { label: "SMS", emoji: "📱", Icon: Smartphone },
  voice: { label: "Voz", emoji: "☎️", Icon: Phone },
  telegram: { label: "Telegram", emoji: "✈️", Icon: Send },
  // No es un canal de mensajería (no tiene conector de envío), pero aparece en
  // el embudo y en los reportes.
  "meta-ad": { label: "Aviso Meta", emoji: "📣", Icon: Megaphone },
};

// Canales elegibles en los selectores de "canal preferido". Sale de CHANNELS,
// no de una lista escrita a mano: las cinco copias del mapa se habían quedado
// sin Telegram cuando se sumó, y el mismo canal aparecía en una pantalla y no
// en otra.
export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = CHANNELS.map(
  (c) => ({ value: c, label: `${CHANNEL_UI[c].emoji} ${CHANNEL_UI[c].label}` }),
);

// Etiqueta con símbolo, para `<option>` y textos planos.
export function channelOptionLabel(channel: Channel): string {
  const c = CHANNEL_UI[channel];
  return `${c.emoji} ${c.label}`;
}

export function channelEmoji(channel: Channel): string {
  return CHANNEL_UI[channel]?.emoji ?? "•";
}

export function channelLabel(channel: Channel): string {
  return CHANNEL_UI[channel]?.label ?? channel;
}
