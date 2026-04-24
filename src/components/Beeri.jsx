// Inline SVG mascot — a football with a face. Used in emotional moments
// (empty states, submit celebration, welcome). Not a generic icon.
const MOODS = {
  idle: { eyeY: 30, mouthPath: "M 35 46 Q 50 50 65 46" },
  excited: { eyeY: 28, mouthPath: "M 32 42 Q 50 58 68 42" },
  trophy: { eyeY: 28, mouthPath: "M 32 42 Q 50 58 68 42" },
};

export default function Beeri({ mood = "idle", size = 80, className = "" }) {
  const { eyeY, mouthPath } = MOODS[mood] || MOODS.idle;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="בארי"
      role="img"
    >
      <circle cx="50" cy="50" r="44" fill="#FFFFFF" stroke="#222" strokeWidth="3" />
      {/* Football pentagons */}
      <polygon
        points="50,22 62,32 57,46 43,46 38,32"
        fill="#222"
      />
      <polygon
        points="22,42 34,40 38,54 28,62 18,54"
        fill="#222"
        opacity="0.85"
      />
      <polygon
        points="78,42 82,54 72,62 62,54 66,40"
        fill="#222"
        opacity="0.85"
      />
      {/* Eyes (white over pentagon) */}
      <circle cx="42" cy={eyeY + 8} r="4" fill="#FFFFFF" />
      <circle cx="58" cy={eyeY + 8} r="4" fill="#FFFFFF" />
      <circle cx="42" cy={eyeY + 9} r="2" fill="#222" />
      <circle cx="58" cy={eyeY + 9} r="2" fill="#222" />
      {/* Mouth */}
      <path d={mouthPath} stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Trophy (only in trophy mood) */}
      {mood === "trophy" && (
        <g transform="translate(58, 8)">
          <rect x="6" y="12" width="14" height="4" fill="#FFC800" rx="1" />
          <path d="M 8 0 L 18 0 L 17 11 Q 13 13 9 11 Z" fill="#FFC800" stroke="#CC9900" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}
