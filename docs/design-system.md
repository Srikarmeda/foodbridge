# FoodBridge Design System

Source of truth: `frontend/css/tokens.css`. Live gallery: `frontend/styleguide.html`.

## Colour (WCAG AA verified live in the styleguide)
Primary #1F7A4D (hover #17613D) · Primary soft #DCEFE2 · Accent #C2410C · Danger #B42318
Ink #14281D · Muted #4A5D52 · Background #F6F9F5 · Surface #FFFFFF · Border #DDE6DD · Focus #1D4ED8

## Status badges (bg / text)
Available #DCFCE7/#14532D · Claimed #DBEAFE/#1E3A8A · Picked up #FEF3C7/#78350F
Completed #CCFBF1/#134E4A · Expired #F3F4F6/#4B5563 · Cancelled #FEE2E2/#7F1D1D · Urgent #FFEDD5/#7C2D12

## Typography
Headings Poppins 600/700 · Body Inter 400/500/600 · scale 14, 16, 18, 20, 24, 28-36, 36-56 px (fluid)

## Spacing, shape, motion
4px scale (4, 8, 12, 16, 24, 32, 48, 64, 96) · radii 6/10/16/pill · 180-350 ms ease-out, reduced-motion respected

## Components
Buttons (6 variants, 3 sizes, loading) · Form fields (error and hint states) · Chips · Cards and listing card
Badges and dietary marks · Toasts (aria-live) · Skeleton loaders · Empty and error states
Nav with mobile menu · Hero · Tables and stat cards · Tabs · Confirm dialog (native <dialog>)

## Accessibility
44px touch targets · visible focus rings · skip link · aria-live toasts · native dialog focus trap
prefers-reduced-motion support · colour is never the only signal (badges carry text labels)

## Shared JavaScript
auth.js (Cognito, refresh, guards) · api.js (client, presigned upload) · ui.js (helpers, toasts, cards) · shell.js (nav, footer)