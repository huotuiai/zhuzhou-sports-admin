<template>
  <div class="technology-visual relative mx-auto aspect-square w-full max-w-[680px]" aria-hidden="true">
    <div class="absolute inset-[12%] rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-400/15" />

    <svg class="relative size-full overflow-visible" viewBox="0 0 720 720" fill="none">
      <defs>
        <linearGradient id="technology-ring" x1="154" y1="126" x2="578" y2="592" gradientUnits="userSpaceOnUse">
          <stop stop-color="#38BDF8" />
          <stop offset="0.48" stop-color="#22D3EE" />
          <stop offset="1" stop-color="#0284C7" />
        </linearGradient>
        <radialGradient id="technology-core" cx="0" cy="0" r="1" gradientTransform="translate(360 360) rotate(90) scale(164)" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7DD3FC" stop-opacity="0.4" />
          <stop offset="0.52" stop-color="#0EA5E9" stop-opacity="0.12" />
          <stop offset="1" stop-color="#020617" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="technology-plane" x1="214" y1="230" x2="500" y2="496" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7DD3FC" stop-opacity="0.3" />
          <stop offset="1" stop-color="#0E7490" stop-opacity="0.02" />
        </linearGradient>
        <filter id="technology-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="technology-soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <clipPath id="technology-core-clip">
          <circle cx="360" cy="360" r="132" />
        </clipPath>
      </defs>

      <circle cx="360" cy="360" r="306" stroke="currentColor" stroke-opacity="0.08" />
      <circle cx="360" cy="360" r="270" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="2 13" />

      <g class="orbit orbit-slow">
        <circle cx="360" cy="360" r="286" stroke="url(#technology-ring)" stroke-opacity="0.26" stroke-width="1.25" stroke-dasharray="120 62 18 90" />
        <circle cx="646" cy="360" r="5" fill="#38BDF8" filter="url(#technology-glow)" />
        <circle cx="74" cy="360" r="3" fill="#22D3EE" />
      </g>

      <g class="orbit orbit-reverse">
        <circle cx="360" cy="360" r="238" stroke="url(#technology-ring)" stroke-opacity="0.42" stroke-width="1.5" stroke-dasharray="42 22 154 38" />
        <path d="M360 122A238 238 0 0 1 574 256" stroke="#67E8F9" stroke-width="3" stroke-linecap="round" />
        <circle cx="574" cy="256" r="4.5" fill="#67E8F9" filter="url(#technology-glow)" />
      </g>

      <g class="orbit orbit-medium">
        <circle cx="360" cy="360" r="192" stroke="currentColor" stroke-opacity="0.13" stroke-width="1" stroke-dasharray="4 8" />
        <path d="M196 460A192 192 0 0 1 202 250" stroke="#0EA5E9" stroke-opacity="0.65" stroke-width="2" stroke-linecap="round" />
        <circle cx="202" cy="250" r="4" fill="#38BDF8" />
      </g>

      <g opacity="0.45">
        <path d="M110 360H610M360 110V610" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 14" />
        <path d="M184 184L536 536M536 184L184 536" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3 16" />
      </g>

      <circle cx="360" cy="360" r="165" fill="url(#technology-core)" />
      <circle class="core-pulse" cx="360" cy="360" r="138" stroke="#38BDF8" stroke-opacity="0.16" />

      <g clip-path="url(#technology-core-clip)">
        <path d="M208 275L360 187L512 275V451L360 539L208 451V275Z" fill="url(#technology-plane)" stroke="#38BDF8" stroke-opacity="0.16" />
        <path d="M208 275L360 363L512 275M360 363V539M208 451L360 363L512 451" stroke="#7DD3FC" stroke-opacity="0.22" />
        <g class="scan-layer">
          <path d="M190 338H530" stroke="#67E8F9" stroke-opacity="0.12" stroke-width="18" filter="url(#technology-soft-glow)" />
          <path d="M190 338H530" stroke="#67E8F9" stroke-opacity="0.75" />
        </g>
      </g>

      <g class="core-float">
        <path d="M360 253L452 306V414L360 467L268 414V306L360 253Z" fill="#07172A" fill-opacity="0.82" stroke="url(#technology-ring)" stroke-width="1.5" />
        <path d="M360 280L428 319V399L360 438L292 399V319L360 280Z" fill="#0EA5E9" fill-opacity="0.06" stroke="#38BDF8" stroke-opacity="0.24" />
        <path d="M325 387C335 349 345 333 360 333C375 333 385 349 395 387" stroke="url(#technology-ring)" stroke-width="5" stroke-linecap="round" />
        <path d="M318 397H402M340 365L347 397M380 365L373 397" stroke="#67E8F9" stroke-width="3" stroke-linecap="round" />
        <circle cx="360" cy="316" r="8" fill="#7DD3FC" filter="url(#technology-glow)" />
      </g>

      <g fill="#38BDF8">
        <circle class="node node-one" cx="130" cy="246" r="3" />
        <circle class="node node-two" cx="586" cy="478" r="3.5" />
        <circle class="node node-three" cx="517" cy="146" r="2.5" />
      </g>

      <g stroke="currentColor" stroke-opacity="0.17">
        <path d="M130 246L202 270" />
        <path d="M586 478L526 448" />
        <path d="M517 146L482 202" />
      </g>

      <g class="data-bars" fill="#38BDF8">
        <rect x="99" y="379" width="3" height="18" rx="1.5" opacity="0.18" />
        <rect x="108" y="370" width="3" height="27" rx="1.5" opacity="0.3" />
        <rect x="117" y="360" width="3" height="37" rx="1.5" opacity="0.5" />
        <rect x="126" y="375" width="3" height="22" rx="1.5" opacity="0.25" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.technology-visual {
  color: var(--foreground);
  transform: translateZ(0);
}

.orbit,
.core-float,
.core-pulse,
.scan-layer,
.node,
.data-bars {
  transform-box: view-box;
  transform-origin: 360px 360px;
  will-change: transform, opacity;
}

.orbit-slow {
  animation: orbit-clockwise 34s linear infinite;
}

.orbit-reverse {
  animation: orbit-counterclockwise 24s linear infinite;
}

.orbit-medium {
  animation: orbit-clockwise 18s linear infinite;
}

.core-float {
  animation: core-float 6s ease-in-out infinite;
}

.core-pulse {
  animation: core-pulse 4.8s ease-in-out infinite;
}

.scan-layer {
  animation: scan 4.5s ease-in-out infinite;
}

.node-one {
  animation: node-pulse 3.2s ease-in-out infinite;
}

.node-two {
  animation: node-pulse 3.2s 0.8s ease-in-out infinite;
}

.node-three {
  animation: node-pulse 3.2s 1.6s ease-in-out infinite;
}

.data-bars {
  animation: bars-pulse 2.8s ease-in-out infinite;
}

@keyframes orbit-clockwise {
  to { transform: rotate(360deg); }
}

@keyframes orbit-counterclockwise {
  to { transform: rotate(-360deg); }
}

@keyframes core-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes core-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.96); }
  50% { opacity: 0.9; transform: scale(1.04); }
}

@keyframes scan {
  0%, 100% { transform: translateY(-86px); opacity: 0; }
  18%, 82% { opacity: 1; }
  50% { transform: translateY(86px); opacity: 0.75; }
}

@keyframes node-pulse {
  0%, 100% { opacity: 0.28; }
  50% { opacity: 1; }
}

@keyframes bars-pulse {
  0%, 100% { opacity: 0.55; transform: scaleY(0.8); }
  50% { opacity: 1; transform: scaleY(1.1); }
}

@media (prefers-reduced-motion: reduce) {
  .orbit,
  .core-float,
  .core-pulse,
  .scan-layer,
  .node,
  .data-bars {
    animation: none !important;
  }
}
</style>
