import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { desc } from "drizzle-orm";
import { exigirAdmin } from "@/lib/auth";
import { AdminUsuariosPainel } from "@/components/AdminUsuariosPainel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PaginaAdminUsuarios() {
  const atual = await exigirAdmin();
  const todos = await db.select().from(usuarios).orderBy(desc(usuarios.criadoEm));

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-verde">Administração</p>
      <h2 className="text-2xl font-extrabold tracking-tight">Usuários e acessos</h2>
      <p className="mt-1 max-w-2xl text-base text-cinza">
        Aprove novos cadastros e defina quem mais pode administrar a plataforma.
      </p>

      <div className="mt-6">
        <AdminUsuariosPainel usuarios={todos} meuId={atual.usuario.id} />
      </div>
    </div>
  );
}
