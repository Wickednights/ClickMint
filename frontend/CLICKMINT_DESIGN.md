# Design System Specification: Cyber-Minimalist High-End Digital Experience

## 1. Overview & Creative North Star: "The Neon Monolith"
This design system is built for the "ClickMint" ecosystem on Base, moving away from the cluttered "dashboard" aesthetic toward a high-end, editorial tech experience. The Creative North Star is **The Neon Monolith**. 

Think of a dark room where only the essential information is illuminated by razor-sharp light. We reject the "standard" web container-based layouts in favor of intentional asymmetry, aggressive typography scales, and a "binary" visual language (on/off). This is not just a UI; it is a high-performance terminal that feels both premium and futuristic. We break the template look by utilizing massive focal points—oversized typography and data points—that bleed into the negative space of a pure black canvas.

## 2. Colors: High-Contrast Luminance
The palette is rooted in absolute darkness to allow the neon accents to vibrate. We treat light as a scarce and valuable resource.

### Core Palette
- **Background (`#131313`)**: The absolute foundation. While the prompt suggests pure black, we use `#131313` for the primary surface to allow for "Negative Depth" (using `#0e0e0e` for recessed areas).
- **Primary (`#ffffff`)**: Used for high-priority data and primary headers. 
- **Primary Container (`#00fbfb`)**: Our signature Neon Cyan. This is used sparingly to denote "Action" and "Connection."
- **Secondary (`#93d2d1`)**: A muted, tech-teal for secondary data and less urgent information.

### Surface Hierarchy & The "No-Line" Rule
Traditional sectioning is forbidden. 
- **The "No-Line" Rule:** Do not use 1px solid borders to separate sections. Boundaries are defined by shifting from `surface` (#131313) to `surface_container_low` (#1b1b1b).
- **Surface Nesting:** Depth is achieved through "Tonal Layering." An inner data module should sit on `surface_container_highest` (#353535) to feel physically closer to the user than the background.
- **The "Glass & Gradient" Rule:** Floating modals must use `surface_container` with a 20px backdrop-blur and 60% opacity. This creates a "frosted obsidian" look that integrates the UI into the background.
- **Signature Textures:** For hero sections, use a subtle radial gradient transitioning from `surface_container_lowest` (#0e0e0e) at the edges to `surface` (#131313) in the center to create a sense of infinite scale.

## 3. Typography: Geometric Authority
We utilize a pairing of **Space Grotesk** (Display) and **Inter** (Functional) to balance technical precision with high-end editorial flair.

- **Display (Space Grotesk):** Massive, tight-kerning headers. Use `display-lg` (3.5rem) for minting stats or primary headlines. It should feel imposing.
- **Body (Inter):** Clean, highly legible sans-serif. Use `body-md` (0.875rem) for all technical descriptions.
- **Label (Space Grotesk):** All-caps, tracked-out (10-15%) for metadata and "Compact Data Readouts." This reinforces the "terminal" aesthetic.

## 4. Elevation & Depth: Tonal Layering
In a cyber-minimalist system, traditional drop shadows are too "soft." We replace them with light and tone.

- **The Layering Principle:** Use the `surface_container` tiers to stack elements. A card doesn't "float" via shadow; it "exists" because it is a lighter shade of black (`#1f1f1f`) than the floor (`#131313`).
- **Ambient Glows:** Instead of shadows, use a 2px-4px outer glow using `primary_fixed` (#00fbfb) at 15% opacity for active elements. This mimics the light bleed of a high-end neon tube.
- **The "Ghost Border" Fallback:** Where a container needs a sharp edge (per the user's request for "thin neon borders"), use `outline_variant` (#3a4a49) at 30% opacity. It must look like a faint wireframe, not a solid box.
- **Zero Rounding:** The `Roundedness Scale` is strictly **0px**. Every corner is a sharp, 90-degree angle to maintain the "Cyber" edge.

## 5. Components: Precision Tools

### Buttons
- **Primary (Pulsing):** Sharp-edged, background `primary_fixed` (#00fbfb), text `on_primary_fixed` (#002020). Add a subtle CSS pulse animation on the box-shadow (0 0 10px #00ffff).
- **Tertiary:** Transparent background, `primary_fixed` text, no border. On hover, a 1px `outline` appears.

### Minimalist Cards
- **Construction:** Background `surface_container_low`. A 1px top-border of `primary_fixed` (#00fbfb). 
- **Content:** No dividers. Use `body-sm` for labels and `headline-sm` for values. Space them using strict 8px/16px increments.

### Compact Data Readouts
- Use `label-sm` in `secondary_fixed` (#aeeeed) for the key, and `title-md` in `primary` (#ffffff) for the value. 
- Example: `TOTAL_MINTED // 1,240.00`

### Input Fields
- **State:** Purely skeletal. A bottom-border only using `outline`. 
- **Active State:** The bottom border transforms to `primary_fixed` (#00fbfb) with a faint glow.

### Tooltips
- Background: `surface_bright` (#393939). Typography: `label-sm`. No arrows—just a sharp rectangle that appears instantly (0ms delay).

## 6. Do's and Don'ts

### Do
- **Embrace Negative Space:** If a screen feels "empty," leave it. Silence is premium.
- **Monospaced Alignment:** Align data points vertically to mimic a command-line interface.
- **High-Contrast Accents:** Use the Neon Cyan (#00ffff) only for interactive elements or critical status updates.

### Don't
- **No Border Radius:** Never use rounded corners. Not even 2px.
- **No Gradients (Standard):** Avoid multi-color "rainbow" gradients. Use only tonal shifts (Black to Grey or Cyan to Dark Cyan).
- **No Divider Lines:** Never use a horizontal rule `<hr>` to separate content. Use a 32px or 48px vertical gap instead.
- **No "Soft" Colors:** Avoid pastels or muddy browns. If it isn't Black, White, or Neon, it likely doesn't belong.