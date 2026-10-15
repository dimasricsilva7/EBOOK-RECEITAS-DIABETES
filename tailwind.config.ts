import type { Config } from "tailwindcss";

/** Tokens do design system Além da Fome — cores vêm de CSS vars (editáveis no admin, em canais RGB). */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: token("primary"),
        secondary: token("secondary"),
        accent: token("accent"),
        ink: token("ink"),
        bg: token("bg"),
        sand: token("sand"),
        surface: token("surface"),
        muted: token("muted"),
        line: token("line"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        bead: "999px",
        card: "1.5rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(59 42 34 / 0.04), 0 10px 30px -14px rgb(59 42 34 / 0.18)",
        lift: "0 2px 6px rgb(59 42 34 / 0.05), 0 24px 50px -22px rgb(59 42 34 / 0.30)",
      },
      maxWidth: { page: "72rem", prose: "40rem" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { "0%": { transform: "scale(0.96)" }, "100%": { transform: "scale(1)" } },
        slidein: { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        slideup: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        float: { "0%, 100%": { transform: "translateY(0) rotate(-1.5deg)" }, "50%": { transform: "translateY(-10px) rotate(-0.5deg)" } },
        bob: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(5px)" } },
      },
      animation: {
        rise: "rise .55s cubic-bezier(.2,.7,.2,1) both",
        fade: "fade .4s ease-out both",
        pop: "pop .25s ease-out",
        slidein: "slidein .28s cubic-bezier(.2,.7,.2,1)",
        slideup: "slideup .28s cubic-bezier(.2,.7,.2,1)",
        float: "float 7s ease-in-out infinite",
        bob: "bob 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
