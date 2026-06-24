"use client";

/**
 * Geometric hero artwork for the "tech" theme — pure SVG so it stays crisp at
 * any size and ships no image bytes. Floating hexagons, an isometric cube, a
 * flowing wave and a node network, echoing the reference mock.
 */
export function GeoBackground({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="hexA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="hexB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a7f3d0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="cubeTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="cubeLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="cubeRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>

      {/* node network lines */}
      <g stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" fill="none">
        <path d="M60 120 L180 200 L120 340 L40 300 Z" />
        <path d="M180 200 L360 150 L460 260" />
        <path d="M120 340 L300 420 L480 380" />
        <path d="M300 420 L260 600 L120 660" />
        <path d="M480 380 L520 560 L380 680" />
      </g>
      <g fill="#a7f3d0">
        <circle cx="60" cy="120" r="4" />
        <circle cx="180" cy="200" r="5" />
        <circle cx="360" cy="150" r="4" />
        <circle cx="460" cy="260" r="4" />
        <circle cx="300" cy="420" r="6" />
        <circle cx="120" cy="660" r="5" />
        <circle cx="520" cy="560" r="4" />
      </g>

      {/* hexagons */}
      <g>
        <polygon points="100,90 150,118 150,174 100,202 50,174 50,118" fill="url(#hexB)" />
        <polygon points="470,120 512,144 512,192 470,216 428,192 428,144" fill="url(#hexA)" />
        <polygon points="150,560 196,586 196,640 150,666 104,640 104,586" fill="url(#hexA)" />
        <polygon points="500,620 540,643 540,690 500,713 460,690 460,643" fill="url(#hexB)" />
      </g>

      {/* isometric cube (center) */}
      <g transform="translate(300 360)">
        <polygon points="0,-70 70,-30 0,10 -70,-30" fill="url(#cubeTop)" />
        <polygon points="-70,-30 0,10 0,90 -70,50" fill="url(#cubeLeft)" />
        <polygon points="70,-30 0,10 0,90 70,50" fill="url(#cubeRight)" />
      </g>

      {/* flowing wave */}
      <path
        d="M0 500 C 150 440, 300 560, 450 500 S 600 440, 600 500 L600 800 L0 800 Z"
        fill="rgba(52,211,153,0.18)"
      />
      <path
        d="M0 560 C 160 510, 320 620, 480 560 S 600 520, 600 560 L600 800 L0 800 Z"
        fill="rgba(14,165,233,0.16)"
      />
    </svg>
  );
}
