/**
 * Open Graph Image — The Kingdom's Social Banner
 *
 * Oracle decision: GENERATE — no existing pattern, write new
 *
 * Auto-generated OG image using Next.js ImageResponse.
 * Shown when the site is shared on social media.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "[Company Name] — Life Insurance Quotes from Licensed Professionals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1B2D4F",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Shield icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: "#2D8659",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "#FAFBFC",
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 300,
            color: "#FFFFFF",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          Protect Your Legacy
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "#8CAA7E",
            textAlign: "center",
            maxWidth: 700,
          }}
        >
          Connect with licensed life insurance professionals. Free, no obligation.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(to right, #8CAA7E, #2D8659, #6BA3D6)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
