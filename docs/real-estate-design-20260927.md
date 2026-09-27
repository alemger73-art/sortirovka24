# Real estate interface refresh — 2026-09-27

## Scope
Frontend catalogue, listing detail, shared create/edit form, and estate section of the user cabinet. Existing server, moderation and ownership rules retained. No production data or schema changes.

## Changes
- Compact district-specific header and visible publish / my listings links.
- Separate deal and property filters, expandable price/room controls, reset and invalid-range message.
- Consistent listing cards with independent accessible favourite button; honest no-photo placeholder instead of unrelated stock imagery.
- Detail gallery, characteristics, description, seller and contact panel.
- Three numbered form sections; owner/realtor choice; full-width contact fields on phones.
- Cabinet status explanations and larger action targets.
- Scoped light/dark colours, keyboard focus, reduced motion and Russian/Kazakh text.

## Verified
- TypeScript build and production Vite/PWA build passed.
- Browser against local test backend: rental empty result, filter reset, invalid price range warning, favourite toggle, listing detail navigation, cabinet/edit navigation.
- Saved price and rooms on local test listing; successful confirmation, pending moderation and new price appeared in cabinet.
- Mobile 375x812: detail, form, catalogue and Kazakh catalogue; measured no horizontal document overflow.
- Desktop dark catalogue/detail and mobile light form/detail inspected visually.
- Final build includes one-column mobile form fields.

## Limits
No real customer data changed. Image upload, native phone/WhatsApp handlers and physical-device keyboard were not retested for this styling release. Existing bundle-size, Browserslist, Tailwind delay and sonner chunk warnings remain. This is not a new platform-wide functional audit.
