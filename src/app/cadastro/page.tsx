import { CadastroForm } from "@/components/CadastroForm";

export const dynamic = "force-dynamic";

export default function PaginaCadastro() {
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Licita<span className="text-verde">Radar</span>
      </h1>
      <p className="mt-1 text-sm text-cinza">
        Crie sua conta. Seu acesso precisa ser aprovado por um administrador
        antes de você poder entrar.
      </p>
      <div className="mt-6 rounded-lg border border-borda bg-white p-6">
        <CadastroForm />
      </div>
    </div>
  );
}
