# Food Section UX Improvements - TODO

## Changes Overview (MVP - no breaking changes)

### Files to modify:
1. **Food.tsx** - Main food page: redesign cards (2-col, square, no weight), product popup with recommendations, "add to order" suggestions in cart, delivery zones in checkout
2. **AdminFoodSettings.tsx** - Add delivery zones management (zone radius + price), "frequently ordered" toggle

### Key decisions:
- Delivery zones stored as JSON in `food_settings` table (key: `delivery_zones`)
- No new DB tables needed
- "Frequently ordered" uses items marked `is_recommended` + same-category items
- Address fields: street, house, apartment (optional)
- Delivery cost auto-calculated from zone settings
- Keep all existing functionality intact

### Implementation:
1. Update Food.tsx:
   - Menu grid: 2 columns on mobile, square images (aspect-ratio 1:1), remove weight
   - Card: name, short description (ellipsis 2 lines), price, add button
   - Product popup: big image, name, description, price, modifiers, "Recommend" block, add to cart
   - Cart drawer: add "Дополнить заказ" section (3-5 items)
   - Checkout: split address into street/house/apartment, auto-calculate delivery zone price, show "Доставка: +XXX тг"
   - Option: "без доставки до квартиры" checkbox

2. Update AdminFoodSettings.tsx:
   - Add delivery zones editor (zone name, radius km, price)
   - Toggle for recommendations display