import { redirect } from "next/navigation";

/** Entrada do site: a landing de vendas fica em /e-book. "/" redireciona preservando UTMs/click IDs. */
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => x != null && qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(q ? `/e-book?${q}` : "/e-book");
}
