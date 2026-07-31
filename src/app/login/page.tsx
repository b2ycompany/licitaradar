import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function PaginaLogin() {
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Licita<span className="text-verde">Radar</span>
      </h1>
      <p className="mt-1 text-sm text-cinza">Entre com sua conta.</p>
      <div className="mt-6 rounded-lg border border-borda bg-white p-6">
        <LoginForm />
      </div>
    </div>
  );
}
