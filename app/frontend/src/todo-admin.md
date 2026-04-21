# Admin Panel - Development Plan

## Architecture
- Simple password-based admin access (localStorage flag) as a lightweight layer on top of existing OIDC auth
- All CRUD via `client.entities.<table>` from web-sdk
- Single admin page file with tab-based navigation (to stay within file limit)
- Mobile-friendly, clean, minimal design

## Routes
- `/admin` — Admin login gate + dashboard with tabs

## Files to Create/Modify
1. `src/pages/Admin.tsx` — Main admin panel with all sections as tabs
2. `src/pages/AdminNews.tsx` — News CRUD (create, edit, delete, YouTube embed)
3. `src/pages/AdminComplaints.tsx` — Complaints management (status changes)
4. `src/pages/AdminMasters.tsx` — Masters CRUD + Master requests + Become master requests
5. `src/pages/AdminDirectory.tsx` — Directory entries CRUD
6. `src/pages/AdminBanners.tsx` — Banners management
7. `src/App.tsx` — Add /admin routes (MODIFY)

## Design
- Sidebar navigation on desktop, bottom tabs on mobile
- Color: slate/gray neutral palette, blue-600 accents
- Clean table views with action buttons
- Modal forms for create/edit
- Status badges with color coding