import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The signed-in user's brands, stored in the brand_kits table (see supabase/schema.sql) as one
 * library: { brands: [...], references: [...] }. Older rows hold a single brand and are upgraded
 * on the fly.
 */

type Library = { brands: Record<string, unknown>[]; references: unknown[] };

function normalize(data: unknown): Library {
  const d = (data ?? {}) as Record<string, unknown>;
  if (Array.isArray(d.brands)) return { brands: d.brands as Record<string, unknown>[], references: (d.references as unknown[]) ?? [] };
  const has = !!(d.name || d.logo || d.description);
  const { references, ...brand } = d;
  return { brands: has ? [{ ...brand, id: "marca-1" }] : [], references: Array.isArray(references) ? references : [] };
}

async function ctx() {
  if (!accountsEnabled()) return { res: Response.json({ error: "Cuentas no configuradas" }, { status: 404 }) };
  const account = await getAccount();
  if (!account) return { res: Response.json({ error: "Sin sesión" }, { status: 401 }) };
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("brand_kits").select("data").eq("user_id", account.user.id).maybeSingle();
  if (error) return { res: Response.json({ error: error.message }, { status: 500 }) };
  return { userId: account.user.id, admin, library: normalize(data?.data) };
}

async function write(c: Exclude<Awaited<ReturnType<typeof ctx>>, { res: Response }>, library: Library) {
  const { error } = await c.admin
    .from("brand_kits")
    .upsert({ user_id: c.userId, data: library, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function GET() {
  const c = await ctx();
  if ("res" in c) return c.res;
  return Response.json({ library: c.library });
}

/** Body: { brand } to add/replace one brand (by id), or { references } to replace the references. */
export async function PUT(req: Request) {
  const raw = await req.text();
  if (raw.length > 4_400_000)
    return Response.json({ error: "La marca pesa demasiado (logo o tipografías muy grandes)" }, { status: 413 });
  let body: { brand?: Record<string, unknown>; references?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const c = await ctx();
  if ("res" in c) return c.res;
  const lib = c.library;
  if (body.brand && typeof body.brand === "object") {
    const id = String(body.brand.id ?? "").slice(0, 60);
    if (!id) return Response.json({ error: "Falta el id de la marca" }, { status: 400 });
    const b = { ...body.brand, id };
    delete (b as Record<string, unknown>).references;
    lib.brands = lib.brands.some((x) => x.id === id) ? lib.brands.map((x) => (x.id === id ? b : x)) : [...lib.brands, b];
    if (lib.brands.length > 50) return Response.json({ error: "Llegaste al máximo de 50 marcas." }, { status: 400 });
  } else if (Array.isArray(body.references)) {
    lib.references = body.references;
  } else return Response.json({ error: "Nada para guardar" }, { status: 400 });
  return write(c, lib);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });
  const c = await ctx();
  if ("res" in c) return c.res;
  return write(c, { ...c.library, brands: c.library.brands.filter((x) => x.id !== id) });
}
