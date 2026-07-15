# Conversion Booster — Shopify App MVP

All-in-one conversion widget suite: Announcement Bar, Countdown Timer, Trust Badges, Sticky Add-to-Cart, and Social Proof Popup. Built as a **Theme App Extension** so the storefront never calls your server — hosting cost stays near zero at any install count.

## What's inside

```
extensions/conversion-booster/
├── shopify.extension.toml
├── blocks/
│   ├── announcement-bar.liquid   (app embed — whole store)
│   ├── sticky-atc.liquid         (app embed — product pages only)
│   ├── sales-popup.liquid        (app embed — whole store)
│   ├── countdown-timer.liquid    (app block — merchant places it in any section)
│   └── trust-badges.liquid       (app block — merchant places it in any section)
└── assets/
    ├── cb-core.css               shared styles, all classes prefixed cb-
    ├── cb-announcement.js
    ├── cb-countdown.js
    ├── cb-sticky-atc.js
    └── cb-popup.js
```

**App embeds** are toggled on in Theme Editor → App embeds. **App blocks** are added by the merchant inside any section (typically the product page) via "Add block". All settings live in the theme editor — no custom dashboard needed for the MVP, which is why there is no backend to pay for.

## Feature notes

- **Announcement bar** — up to 3 rotating messages, optional CTA button, sticky mode, dismiss button remembered per session.
- **Countdown timer** — fixed end date or evergreen mode (each visitor gets their own timer stored in localStorage — great for urgency). Configurable expiry behavior.
- **Trust badges** — 4 editable badges with inline SVG icons; zero image requests.
- **Sticky add-to-cart** — appears when the main buy button scrolls out of view (IntersectionObserver). Variant selector, live price, AJAX add-to-cart, cart count refresh, mobile safe-area aware.
- **Social proof popup** — shows **real products** from a collection the merchant picks (e.g. best-sellers) with a "Popular right now" label. Honest social proof with zero backend. True "X just bought this" popups need an orders webhook + server — that's your v1.1 paid upsell, not the MVP.

## Run it locally

1. Install prerequisites: Node 18+, and a free [Shopify Partner account](https://partners.shopify.com) with a development store.
2. Create the app shell and drop the extension in:
   ```bash
   shopify app init            # choose "Start with Remix" (or the minimal template)
   # copy the extensions/conversion-booster folder from this project into your app's extensions/
   shopify app dev             # opens a tunnel + installs on your dev store
   ```
3. In the dev store: **Online Store → Themes → Customize → App embeds** — toggle on Announcement Bar, Sticky Add to Cart, Social Proof Popup. Then open a product page section and **Add block → Countdown Timer / Trust Badges**.

## Before submitting to the App Store

- Test on the free themes reviewers use: **Dawn** first, then Sense, Craft, Refresh. Theme conflicts are the #1 source of 1-star reviews.
- Add an app listing: 5+ screenshots (before/after per widget), a 30–60s demo video, and copy that leads with "replace 5 apps with 1".
- Shopify requires the embedded app to load and show *something* — a simple welcome page with setup instructions ("turn widgets on in your theme editor") satisfies review for a theme-extension app.
- Fill in mandatory webhooks (customer data erasure etc.) — the CLI template includes them.

## Roadmap (each release = a marketing announcement)

- **v1.1** — Real-time sales popups via `orders/create` webhook (needs a small server + DB; this is the Pro-plan hook)
- **v1.2** — Free-shipping progress bar mode for the announcement bar (reads cart total from `/cart.js`)
- **v1.3** — Scheduling (start/end dates per widget), geo-targeting
- **v1.4** — Analytics dashboard: views, clicks, add-to-carts per widget

## Pricing suggestion

- **Free** — Announcement bar + trust badges, small "Powered by" link
- **Pro $9.99/mo** — everything, no branding, priority support, 7-day trial
