import { ImageResponse } from "next/og";

/** 512×512 publisher logo for structured data and the web manifest. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2f3a8f", borderRadius: 112 }}>
        <svg viewBox="0 0 32 32" width="512" height="512">
          <path d="M7 21h7l5-5h6" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 12h5" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
          <circle cx="25" cy="16" r="3.2" fill="#c98a0b" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
