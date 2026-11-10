/** Decorative AAC-inspired cards. They do not represent working communication controls. */
export function AacCards() {
  return (
    <svg
      className="admin-aac-cards"
      viewBox="0 0 180 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-12 52 66)">
        <rect
          x="13"
          y="33"
          width="67"
          height="68"
          rx="12"
          fill="white"
          stroke="#cadbd5"
        />
        <circle
          cx="47"
          cy="67"
          r="11"
          stroke="var(--admin-clay)"
          strokeWidth="2"
        />
        <path
          d="M47 48v-4m0 46v-4M28 67h-4m46 0h-4M34 54l-3-3m32 32-3-3M34 80l-3 3m32-32-3 3"
          stroke="var(--admin-clay)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g transform="rotate(10 129 56)">
        <rect
          x="98"
          y="19"
          width="67"
          height="68"
          rx="12"
          fill="var(--admin-clay-surface)"
          stroke="#e3c7b9"
        />
        <path
          d="M131 68s-18-10-18-21c0-10 14-13 18-3 4-10 18-7 18 3 0 11-18 21-18 21Z"
          stroke="var(--admin-clay-ink)"
          strokeWidth="2"
        />
      </g>
      <rect
        x="59"
        y="25"
        width="69"
        height="72"
        rx="12"
        fill="var(--admin-nav)"
      />
      <path
        d="M78 47h32v23H93L82 80V70h-4V47Z"
        stroke="#e4f1ec"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="87" cy="58" r="1.5" fill="white" />
      <circle cx="94" cy="58" r="1.5" fill="white" />
      <circle cx="101" cy="58" r="1.5" fill="white" />
    </svg>
  );
}
