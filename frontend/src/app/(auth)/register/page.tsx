import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Daftar" };

export default function RegisterPage() {
  return <RegisterForm />;
}
