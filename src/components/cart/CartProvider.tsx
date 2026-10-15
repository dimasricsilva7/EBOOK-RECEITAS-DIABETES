"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { gaEvent, metaEvent, track } from "@/lib/client/tracking";
import type { CartQuote } from "@/types/catalog";

export type CartItem = { productId: string; quantity: number; source?: "cross_sell" | null };
type CartState = { items: CartItem[]; bumpIds: string[]; couponCode: string | null };
export type ProductRef = { id: string; name: string; sku: string; priceCents: number; category?: string };

type CartCtx = CartState & {
  ready: boolean;
  quote: CartQuote | null;
  loading: boolean;
  error: string | null;
  drawerOpen: boolean;
  count: number;
  lastAdded: string | null;
  add: (p: ProductRef, opts?: { source?: "cross_sell"; open?: boolean; element?: string }) => void;
  /** Compra direta (produto digital): o pedido passa a ter só este produto e segue para o checkout */
  buyNow: (p: ProductRef, element?: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  toggleBump: (bumpId: string, on: boolean) => void;
  setCoupon: (code: string | null) => void;
  clear: () => void;
  restore: (s: { items: CartItem[]; bumpIds?: string[]; couponCode?: string | null }) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "adf_cart";
const EMPTY: CartState = { items: [], bumpIds: [], couponCode: null };

function load(): CartState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as CartState | null;
    if (v && Array.isArray(v.items)) return { items: v.items.slice(0, 20), bumpIds: Array.isArray(v.bumpIds) ? v.bumpIds : [], couponCode: v.couponCode ?? null };
  } catch {
    /* storage indisponível */
  }
  return EMPTY;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  // Orçamento sempre calculado no servidor
  useEffect(() => {
    if (!ready) return;
    if (!state.items.length) {
      setQuote(null);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
        const json = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(json?.error ?? "erro");
        setQuote(json as CartQuote);
        setError(null);
        // Itens que deixaram de existir/estar ativos saem do carrinho
        const q = json as CartQuote;
        const valid = new Set(q.lines.map((l) => l.productId));
        const validBumps = new Set(q.bumps.map((b) => b.id));
        setState((s) => {
          const items = s.items.filter((i) => valid.has(i.productId));
          const bumpIds = s.bumpIds.filter((b) => validBumps.has(b));
          return items.length !== s.items.length || bumpIds.length !== s.bumpIds.length ? { ...s, items, bumpIds } : s;
        });
      } catch {
        if (id === reqId.current) setError("Não foi possível atualizar o carrinho. Verifique sua conexão.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [state, ready, tick]);

  const add = useCallback<CartCtx["add"]>((p, opts = {}) => {
    setState((s) => {
      const existing = s.items.find((i) => i.productId === p.id);
      const items = existing
        ? s.items.map((i) => (i.productId === p.id ? { ...i, quantity: Math.min(10, i.quantity + 1) } : i))
        : [...s.items, { productId: p.id, quantity: 1, source: opts.source ?? null }];
      return { ...s, items };
    });
    setLastAdded(p.id);
    setTimeout(() => setLastAdded(null), 1600);
    const params = { content_ids: [p.sku], content_name: p.name, content_type: "product", value: p.priceCents / 100, currency: "BRL" };
    metaEvent("AddToCart", params, { mirror: true, internal: { name: opts.source === "cross_sell" ? "cross_sell_add" : "add_to_cart", productId: p.id, valueCents: p.priceCents, element: opts.element ?? null } });
    if (opts.source === "cross_sell") track("add_to_cart", { productId: p.id, valueCents: p.priceCents, element: opts.element ?? "cross_sell" });
    gaEvent("add_to_cart", { currency: "BRL", value: p.priceCents / 100, items: [{ item_id: p.sku, item_name: p.name, price: p.priceCents / 100, quantity: 1, item_category: p.category }] });
    if (opts.open !== false) setDrawerOpen(true);
  }, []);

  const buyNow = useCallback<CartCtx["buyNow"]>((p, element) => {
    setState((s) => ({ items: [{ productId: p.id, quantity: 1, source: null }], bumpIds: [], couponCode: s.couponCode }));
    const params = { content_ids: [p.sku], content_name: p.name, content_type: "product", value: p.priceCents / 100, currency: "BRL" };
    metaEvent("AddToCart", params, { mirror: true, internal: { name: "add_to_cart", productId: p.id, valueCents: p.priceCents, element: element ?? null } });
    gaEvent("add_to_cart", { currency: "BRL", value: p.priceCents / 100, items: [{ item_id: p.sku, item_name: p.name, price: p.priceCents / 100, quantity: 1 }] });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setState((s) => ({ ...s, items: s.items.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, Math.min(10, quantity)) } : i)) }));
  }, []);

  const remove = useCallback((productId: string) => {
    setState((s) => ({ ...s, items: s.items.filter((i) => i.productId !== productId) }));
    track("remove_from_cart", { productId });
  }, []);

  const toggleBump = useCallback((bumpId: string, on: boolean) => {
    setState((s) => ({ ...s, bumpIds: on ? [...new Set([...s.bumpIds, bumpId])] : s.bumpIds.filter((b) => b !== bumpId) }));
  }, []);

  const setCoupon = useCallback((code: string | null) => setState((s) => ({ ...s, couponCode: code?.trim().toUpperCase() || null })), []);
  const clear = useCallback(() => setState(EMPTY), []);
  const restore = useCallback<CartCtx["restore"]>((s) => setState({ items: s.items.slice(0, 20), bumpIds: s.bumpIds ?? [], couponCode: s.couponCode ?? null }), []);

  const value = useMemo<CartCtx>(
    () => ({
      ...state,
      ready,
      quote,
      loading,
      error,
      drawerOpen,
      lastAdded,
      count: state.items.reduce((s, i) => s + i.quantity, 0),
      add,
      buyNow,
      setQuantity,
      remove,
      toggleBump,
      setCoupon,
      clear,
      restore,
      openDrawer: () => {
        setDrawerOpen(true);
        track("cart_view");
      },
      closeDrawer: () => setDrawerOpen(false),
      refresh: () => setTick((t) => t + 1),
    }),
    [state, ready, quote, loading, error, drawerOpen, lastAdded, add, buyNow, setQuantity, remove, toggleBump, setCoupon, clear, restore]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart fora do CartProvider");
  return ctx;
}
