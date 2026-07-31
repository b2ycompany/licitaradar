import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PaginaAguardandoAprovacao() {
  const atual = await obterUsuarioAtual();
  if (!atual) redirect("/login");
  if (atual.usuario?.status === "aprovado") redirect("/");

  const rejeitado = atual.usuario?.status === "rejeitado";

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Licita<span className="text-verde">Radar</span>
      </h1>

      <div className={`mt-6 rounded-lg border-2 bg-white p-6 ${rejeitado ? "border-vermelho" : "border-ambar"}`}>
        {rejeitado ? (
          <>
            <p className="text-lg font-bold text-vermelho">Acesso não aprovado</p>
            <p className="mt-2 text-sm text-cinza">
              Seu cadastro ({atual.email}) foi analisado e não foi aprovado. Fale com o
              administrador da plataforma se achar que isso é um engano.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-ambar">Aguardando aprovação</p>
            <p className="mt-2 text-sm text-cinza">
              Seu cadastro ({atual.email}) foi recebido. Um administrador precisa
              aprovar seu acesso antes de você poder usar a plataforma.
            </p>
          </>
        )}
        <div className="mt-4">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
