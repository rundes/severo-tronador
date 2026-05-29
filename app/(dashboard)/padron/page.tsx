import { redirect } from "next/navigation";

// /padron quedó renombrada a /contactos. Redirect para preservar bookmarks.
export default function PadronRedirect() {
  redirect("/contactos");
}
