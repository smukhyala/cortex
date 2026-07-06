interface LogoProps {
  size?: number;
  className?: string;
}

// Anthropic/Claude logo — terracotta starburst/asterisk
export function ClaudeLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Claude"
    >
      <path
        d="M12 2 L13.5 9.5 L20 6 L14.5 11 L22 12 L14.5 13 L20 18 L13.5 14.5 L12 22 L10.5 14.5 L4 18 L9.5 13 L2 12 L9.5 11 L4 6 L10.5 9.5 Z"
        fill="#D97757"
      />
    </svg>
  );
}

// OpenAI/ChatGPT logo — interlocking hexagonal flower
export function ChatGPTLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="ChatGPT"
    >
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071.005l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071-.005l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.657zM20.91 8.587l-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.37 9.089V6.757a.072.072 0 0 1 .033-.062l4.83-2.787a4.495 4.495 0 0 1 6.677 4.679zM8.256 12.86l-2.02-1.164a.08.08 0 0 1-.038-.057V6.056a4.494 4.494 0 0 1 7.375-3.453l-.142.08L8.652 5.44a.795.795 0 0 0-.393.681l-.003 6.739zm1.093-2.368L12 8.953l2.65 1.539v3.016L12 15.047l-2.65-1.539v-3.016z"
        fill="#10a37f"
      />
    </svg>
  );
}

// Poke logo — white palm tree on dusky blue
export function PokeLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Poke"
    >
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#4a6fa5" />
      {/* Trunk */}
      <line x1="12" y1="10" x2="12" y2="19" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      {/* Ground line */}
      <line x1="9" y1="19" x2="15" y2="19" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      {/* Fronds — 6 arcs radiating from top of trunk */}
      <path d="M12 10 Q8 6 5 5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q7 7 4 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q8 9 5 11" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q16 6 19 5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q17 7 20 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q16 9 19 11" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Granola logo — notepad/document icon
export function GranolaLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Granola"
    >
      <rect x="4" y="2" width="16" height="20" rx="3" fill="#f59e0b" />
      <line x1="8" y1="7" x2="16" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="16" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="15" x2="13" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Mapping from source type strings to logo components + metadata
const SERVICE_CONFIG: Record<string, {
  Logo: (props: LogoProps) => React.JSX.Element;
  bg: string;
}> = {
  chatgpt_export: { Logo: ChatGPTLogo, bg: "bg-emerald-50" },
  claude_code:    { Logo: ClaudeLogo,   bg: "bg-orange-50" },
  claude_export:  { Logo: ClaudeLogo,   bg: "bg-violet-50" },
  poke:           { Logo: PokeLogo,     bg: "bg-sky-50" },
  granola:        { Logo: GranolaLogo,  bg: "bg-amber-50" },
};

// Unified component: renders the correct logo for a source type
export function ServiceLogo({
  type,
  size = 20,
  className = "",
  showBackground = true,
}: {
  type: string;
  size?: number;
  className?: string;
  showBackground?: boolean;
}) {
  const config = SERVICE_CONFIG[type];

  if (!config) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-muted text-muted-foreground text-xs font-semibold ${className}`}
        style={{ width: size * 2, height: size * 2 }}
      >
        ??
      </div>
    );
  }

  const { Logo, bg } = config;

  if (!showBackground) {
    return <Logo size={size} className={className} />;
  }

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${bg} ${className}`}
      style={{ width: size * 2, height: size * 2 }}
    >
      <Logo size={size} />
    </div>
  );
}
