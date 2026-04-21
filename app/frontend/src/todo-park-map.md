# Park Interactive Map - Development Plan

## Goal
Replace the Leaflet GPS-based map in FoodPark.tsx with a beautiful interactive SVG park scheme.
Keep geolocation as optional secondary feature. Don't break existing food ordering flow.

## Design
- Green/nature theme matching existing park branding
- SVG-based interactive map of Парк Железнодорожников
- Zones: центральный вход, фонтан, детская площадка, карусели, сцена, аллеи, лавочки, аттракционы, спортплощадка
- Mobile-first, touch-friendly
- Points from DB rendered on the SVG map
- Click/tap to select a point → highlight + show name

## Files to modify/create (max 8)

1. **src/components/ParkMap.tsx** (NEW) - Interactive SVG park map component
   - SVG paths for park zones (paths, trees, water, buildings)
   - Clickable delivery points rendered from DB data
   - Selected point highlighting with animation
   - Touch-friendly for mobile
   - Optional user location indicator
   - Used by both FoodPark (customer) and FoodCourier (courier view)

2. **src/pages/FoodPark.tsx** (MODIFY) - Replace Leaflet map with ParkMap component
   - Remove leaflet imports and MapContainer
   - Use ParkMap component in map view
   - Keep geolocation as optional "find nearest point" helper
   - Keep all existing cart/checkout/tracking logic
   - Add mandatory "landmark" field

3. **src/pages/FoodCourier.tsx** (MODIFY) - Show park map in courier order details
   - Replace Leaflet map with ParkMap (read-only, showing delivery point)
   - Keep all existing courier logic

4. **src/pages/AdminParkPoints.tsx** (MODIFY) - Show park map in admin
   - Replace Leaflet map with ParkMap for visual reference
   - Keep existing CRUD functionality
   - Add ability to see points on the park scheme

## Implementation Notes
- ParkMap.tsx will be an SVG component with viewBox for the park layout
- Points will be positioned using relative coordinates mapped to the SVG viewBox
- The SVG will include: paths/alleys, trees, fountain, playground, stage, benches, entrance
- Each DB point has lat/lng - we'll map those to SVG x/y coordinates
- Mobile: full-width, scrollable if needed, with pinch-zoom disabled (fixed size)
- Keep leaflet as fallback for admin coordinate picking only