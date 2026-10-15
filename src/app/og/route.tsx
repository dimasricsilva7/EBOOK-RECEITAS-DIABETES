import { ImageResponse } from "next/og";

const size = { width: 1200, height: 630 };

/** Imagem Open Graph padrão, usada quando Admin → Configurações → SEO não define uma imagem. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FAF6F1", alignItems: "center", padding: 80, fontFamily: "serif", position: "relative" }}>
        <div style={{ position: "absolute", right: -80, top: -80, width: 460, height: 460, borderRadius: 460, background: "#E9C9BF", display: "flex" }} />
        <div style={{ position: "absolute", right: 120, bottom: -140, width: 380, height: 380, borderRadius: 380, background: "#C9D1BF", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#6B7B5F", letterSpacing: 6, fontFamily: "sans-serif" }}>ALÉM DA FOME</div>
          <div style={{ display: "flex", fontSize: 70, color: "#3B2A22", lineHeight: 1.08, marginTop: 22 }}>Compreenda suas emoções e construa uma relação mais consciente com a comida.</div>
          <div style={{ display: "flex", fontSize: 28, color: "#6E5F57", marginTop: 26, fontFamily: "sans-serif" }}>Guia digital de autoconhecimento · conteúdo educativo</div>
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
