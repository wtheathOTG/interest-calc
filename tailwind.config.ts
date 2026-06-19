import type { Config } from "tailwindcss";

const withOpacity = (variable: string) => `oklch(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        card: withOpacity("--card"),
        "card-foreground": withOpacity("--card-foreground"),
        popover: withOpacity("--popover"),
        "popover-foreground": withOpacity("--popover-foreground"),
        primary: withOpacity("--primary"),
        "primary-foreground": withOpacity("--primary-foreground"),
        secondary: withOpacity("--secondary"),
        "secondary-foreground": withOpacity("--secondary-foreground"),
        muted: withOpacity("--muted"),
        "muted-foreground": withOpacity("--muted-foreground"),
        accent: withOpacity("--accent"),
        "accent-foreground": withOpacity("--accent-foreground"),
        destructive: withOpacity("--destructive"),
        "destructive-foreground": withOpacity("--destructive-foreground"),
        border: withOpacity("--border"),
        input: withOpacity("--input"),
        ring: withOpacity("--ring"),
        "chart-1": withOpacity("--chart-1"),
        "chart-2": withOpacity("--chart-2"),
        "chart-3": withOpacity("--chart-3"),
        "chart-4": withOpacity("--chart-4"),
        "chart-5": withOpacity("--chart-5"),
        sidebar: withOpacity("--sidebar"),
        "sidebar-foreground": withOpacity("--sidebar-foreground"),
        "sidebar-primary": withOpacity("--sidebar-primary"),
        "sidebar-primary-foreground": withOpacity("--sidebar-primary-foreground"),
        "sidebar-accent": withOpacity("--sidebar-accent"),
        "sidebar-accent-foreground": withOpacity("--sidebar-accent-foreground"),
        "sidebar-border": withOpacity("--sidebar-border"),
        "sidebar-ring": withOpacity("--sidebar-ring"),
        ink: withOpacity("--foreground"),
        field: withOpacity("--muted"),
        line: withOpacity("--border"),
        mint: withOpacity("--primary"),
        gold: "#b57931"
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)"
      },
      boxShadow: {
        "2xs": "var(--shadow-2xs)",
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"]
      }
    }
  },
  plugins: []
};

export default config;
