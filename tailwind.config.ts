import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        card: "hsl(var(--card))",
        "card-soft": "hsl(var(--card-soft))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        "primary-soft": "hsl(var(--primary-soft))",
        accent: "hsl(var(--accent))",
        "accent-soft": "hsl(var(--accent-soft))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        warning: "hsl(var(--warning))",
        "warning-soft": "hsl(var(--warning-soft))",
        success: "hsl(var(--success))",
        "success-soft": "hsl(var(--success-soft))",
        danger: "hsl(var(--danger))",
        "danger-soft": "hsl(var(--danger-soft))",
        critical: "hsl(var(--critical))",
        "ai-surface": "hsl(var(--ai-surface))",
        "ai-surface-2": "hsl(var(--ai-surface-2))",
        "ai-border": "hsl(var(--ai-border))",
        "ai-foreground": "hsl(var(--ai-foreground))",
        "ai-accent": "hsl(var(--ai-accent))",
        "ai-accent-2": "hsl(var(--ai-accent-2))",
        "ai-accent-pink": "hsl(var(--ai-accent-pink))",
        "role-junior": "hsl(var(--role-junior))",
        "role-mid": "hsl(var(--role-mid))",
        "role-manager": "hsl(var(--role-manager))"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"]
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
        panel: "0 12px 36px rgba(15, 23, 42, 0.08)",
        brand: "0 18px 48px hsl(var(--primary) / 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
