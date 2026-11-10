/** Original communication geometry; decorative, never a status indicator. */
export function CommunicationMotif() {
  return (
    <svg
      className="admin-communication"
      viewBox="0 0 240 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M28 111c0-46 38-84 84-84s84 38 84 84"
        stroke="currentColor"
        strokeDasharray="3 8"
      />
      <path
        d="M72 42h91c12 0 22 10 22 22v52c0 12-10 22-22 22h-43l-30 24v-24H72c-12 0-22-10-22-22V64c0-12 10-22 22-22Z"
        fill="currentColor"
        opacity=".1"
      />
      <path
        d="M53 60h87c10 0 18 8 18 18v43c0 10-8 18-18 18h-32l-25 21v-21H53c-10 0-18-8-18-18V78c0-10 8-18 18-18Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M60 91h72M60 107h45"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M171 127h32c7 0 12 5 12 12v19c0 7-5 12-12 12h-8v12l-16-12h-8c-7 0-12-5-12-12v-19c0-7 5-12 12-12Z"
        fill="var(--admin-nav)"
      />
      <circle cx="176" cy="148" r="2" fill="white" />
      <circle cx="187" cy="148" r="2" fill="white" />
      <circle cx="198" cy="148" r="2" fill="white" />
      <circle cx="203" cy="71" r="5" fill="currentColor" opacity=".4" />
    </svg>
  );
}
