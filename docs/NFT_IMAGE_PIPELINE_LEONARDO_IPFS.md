# Binary Trophy NFT images — Leonardo AI + IPFS (10k prep)

This doc is for **generating a visual set** and hosting it on **IPFS**, then wiring metadata so marketplaces and wallets show **raster/vector art** instead of (or in addition to) the current **on-chain SVG** in `BinaryTrophyNFT`.

**Important — current ClickMint code:** `BinaryTrophyNFT.tokenURI()` today returns **Base64 JSON** whose `image` is a **data URL of an SVG generated in Solidity** (`_buildSvg`). There is **no IPFS `ipfs://...` link** yet. To use the assets from this pipeline in production you will need a **contract or metadata change** (e.g. `baseTokenURI` + `{id}.json` on IPFS, or a resolver contract). This guide covers **asset creation + pinning**; engineering can follow with `tokenURI` / deploy work.

---

## Target specs (marketplaces + wallets)

| Setting | Recommendation | Why |
|--------|----------------|-----|
| **Image size** | **1024×1024 px** (square) | Sharp on OpenSea/BaseScan; downscales cleanly. 512×512 is acceptable for test batches. |
| **Aspect ratio** | **1:1** | Standard PFP / trophy card grid. |
| **Format** | **PNG** (lossless) or **WebP** (smaller) | Most tooling expects PNG; convert WebP → PNG if a platform chokes. |
| **Color** | **sRGB** | Avoid wild CMYK. |
| **File size** | Aim **&lt; 350 KB** per image when possible | Faster IPFS gateways; huge files hurt mobile wallets. |
| **Collection size** | **10_000** for mainnet preset | Testnet may use **10** supply — generate a **small golden set** first (e.g. 12–24), then scale. |

**Metadata JSON** (per token) typically includes:

- `name`, `description`
- `image`: `"ipfs://<CID>/0.png"` (or folder CID + path)
- `attributes`: array of `{ "trait_type": "...", "value": ... }` (marketplaces show these as **traits** / **properties** — same thing in practice)

---

## Leonardo.ai — account and model

1. Sign up at [Leonardo.ai](https://leonardo.ai) (subscription tier if you need batch speed and commercial terms).
2. For **consistent character / trophy geometry** across 10k images, prefer:
   - **Leonardo Phoenix** or **Leonardo Diffusion XL** (check current catalog — names shift; pick a **high-resolution** model that supports **fixed aspect ratio**).
3. Enable **fixed dimensions** output: **1024 × 1024** (or generate larger e.g. **1536 × 1536** and downscale in post for extra sharpness).

---

## Art direction: “Binary Trophy” (suggested prompt structure)

Use a **locked style preamble** + **variable trait** per batch or per file.

**Style preamble (repeat every time):**

> Single centered collectible trophy icon, binary / digital aesthetic, hexagonal base, cyan-to-magenta gradient accents on dark charcoal background `#0b0f14`, subtle grid texture, crisp vector-like edges, game collectible UI, no text, no watermark, no logo, studio lighting, orthographic front view, full bleed to edges, PFP square composition.

**Variable part (examples for rarity layers):**

- Fragment slot: “fragment index visual **N** encoded as **N** glowing hex glyphs along the base”
- Rarity: “common / rare / epic” material (glass, obsidian, holographic foil)

**Negative prompt (paste every time):**

> text, watermark, signature, logo, blurry, low quality, deformed, extra trophies, multiple objects, human face, hands, frame, border, realistic photo, 3d render noise, oversaturated, white background, cropped subject, asymmetrical composition, cartoon childish, NSFW.

**Tips:**

- Generate **12–24 seeds** first; pick **2–3** winners; save the **exact prompt + model + settings** as your **master recipe**.
- Use **Prompt Magic / Alchemy** sparingly; for **10k** you want **repeatability** over one-off wow shots.
- If Leonardo supports **image-to-image** with low strength, feed **one approved “canonical trophy”** reference to keep silhouette stable across the set.

---

## From hundreds to 10k — practical workflows

### A) Leonardo batch / variation (semi-manual)

1. Lock model, resolution, prompt template.
2. Use **variation** on approved base images or **bulk prompt** CSV if your tier supports it.
3. Export PNGs named **`0.png` … `9999.png`** (zero-padded 4 or 5 digits consistently).

### B) Automation (optional)

- Leonardo API (if enabled on your plan): script generations, download, QA folder.
- Or: generate **512 master layers** in Leonardo, then **assemble** 10k combinations in code (like classic PFP layering) — fewer AI calls, more deterministic metadata.

### C) QA pass

- Script: reject files **&lt; 256 px**, wrong aspect ratio, or **&gt; 2 MB**.
- Human spot-check random1% for **wrong text**, **multiple trophies**, **broken symmetry**.

---

## IPFS — pin the collection

You need a **directory** of images + later **metadata JSON** per token (or one **collection-level** contract base URI).

### Option 1: NFT.Storage (simple, good for public goods)

1. Install CLI or use web upload.
2. Upload folder **`images/`** → get CID `QmImageRoot...`.
3. Build **`metadata/`** JSON files where each file’s `image` field is  
   `ipfs://<IMAGE_FOLDER_CID>/1234.png`  
   (or use **single root CID** + paths `/images/1234.png` and `/metadata/1234.json`).
4. Upload **`metadata/`** folder → get `QmMetaRoot...`.
5. Contract **`baseURI`** (if you add it) would be  
   `ipfs://QmMetaRoot/`  
   and `tokenURI(tokenId)` returns   `ipfs://QmMetaRoot/{tokenId}` (with zero-padding if you name files that way).

### Option 2: Pinata

1. Create API key.
2. Upload directory via dashboard or API.
3. Note **CID**; optional **dedicated gateway** for faster reads (still `ipfs://` in metadata).

**Convention:** Use **directory CID** + relative paths so you don’t re-pin **10k** JSON files when you fix one image.

---

## Linking to ClickMint (engineering follow-up)

Today’s `BinaryTrophyNFT` **does not read IPFS**. To display these images on-chain/off-chain explorers you will need something like:

- **`baseURI` + `tokenURI` override** (OpenZeppelin `ERC721URIStorage` or custom), or
- **Upgrade** to a resolver that returns `ipfs://...` JSON for each `tokenId`, or
- **Keep SVG for testnet** and **deploy a v2 trophy** for mainnet with IPFS URIs.

Coordinate **metadata trait count** with whatever the JSON files contain so OpenSea/BaseScan **properties** match the art layers.

---

## Checklist

- [ ] Lock Leonardo model + master prompt + negative prompt
- [ ] Generate pilot set (12–24) at **1024×1024**
- [ ] Decide naming: `tokenId` ↔ filename (off-by-one: Solidity often starts at **1**)
- [ ] Generate / assemble **10k** PNGs + QA
- [ ] Pin **`images/`** → CID
- [ ] Generate **10k JSON** metadata files with matching `attributes`
- [ ] Pin **`metadata/`** → CID
- [ ] Deploy or upgrade trophy contract to use metadata CID
- [ ] Verify on OpenSea test / BaseScan **token URI** resolves---

## References

- [OpenSea metadata standards](https://docs.opensea.io/docs/metadata-standards) (attributes / trait_type)
- [EIP-721](https://eips.ethereum.org/EIPS/eip-721) (`tokenURI`)
- Leonardo product docs (models and API change frequently — confirm current UI)
