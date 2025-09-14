import React from 'react';

export default function AuroraBackground() {
  return (
    <svg
      className="aurora-bg"
      viewBox="0 0 1200 800"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="blur70"><feGaussianBlur stdDeviation="70" /></filter>
        <radialGradient id="g1" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g2" cx="60%" cy="30%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g3" cx="45%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter="url(#blur70)">
        <circle className="aurora-bubble b1" cx="280" cy="180" r="280" fill="url(#g1)" />
        <circle className="aurora-bubble b2" cx="900" cy="120" r="260" fill="url(#g2)" />
        <circle className="aurora-bubble b3" cx="700" cy="520" r="320" fill="url(#g3)" />
      </g>
    </svg>
  );
}
