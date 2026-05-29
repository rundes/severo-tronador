"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isValidEmail } from "@/lib/schemas";
import { sendContactEmail } from "@/lib/contact-email";

const ContactSchema = z.object({
  name: z.string().trim().min(2, "nombre muy corto").max(120),
  email: z.string().trim().refine(isValidEmail, "email inválido"),
  message: z.string().trim().min(10, "mensaje muy corto").max(5000),
});

export async function enviarContacto(formData: FormData) {
  const parsed = ContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    redirect(`/?contacto=invalido#contacto`);
  }
  const res = await sendContactEmail(parsed.data);
  if (!res.ok) {
    redirect(`/?contacto=error#contacto`);
  }
  redirect(`/?contacto=ok#contacto`);
}
