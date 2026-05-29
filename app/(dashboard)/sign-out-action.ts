"use server";

import { signOut } from "@/lib/auth";

export async function cerrarSesion() {
  await signOut({ redirectTo: "/" });
}
