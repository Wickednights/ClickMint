import { ImageResponse } from "next/og";

/** Avoid static prerender of @vercel/og on Windows/build agents (Invalid URL in fileURLToPath). */
export const dynamic = "force-dynamic";

export const alt = "ClickMint — neon CLICK button";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social preview (OG / Telegram / Discord / X) — matches in-app neon CLICK control.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
          backgroundImage:
            "linear-gradient(to right, rgba(58, 74, 73, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(58, 74, 73, 0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              color: "#00fbfb",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
            }}
          >
            CLICKMINT
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 400,
              height: 400,
              backgroundColor: "#00fbfb",
              boxShadow:
                "0 0 55px rgba(0, 251, 251, 0.6), 0 0 110px rgba(0, 251, 251, 0.35), inset 0 0 32px rgba(255, 255, 255, 0.12)",
            }}
          >
            <div
              style={{
                fontSize: 108,
                fontWeight: 900,
                color: "#000000",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              CLICK
            </div>
          </div>
          <div
            style={{
              color: "#9ca3af",
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            Base Sepolia · Credits · POT
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
