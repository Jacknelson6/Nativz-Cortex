# Nativz Cortex — UI Revision Pass

Comprehensive UI revision across 7 admin dashboard pages to fix bugs, standardize design patterns, remove dead features, and add missing functionality.

## Main Features

- **New Search**: Fix client modal, add logos/agency badges, relocate search history, remove attribution
- **Dashboard**: Rename heading, clean up metrics, fix shoots display, add View All navigation
- **Shoots**: Standardize buttons, simplify ideation to text box + AI, add multi-client Select All, drag-to-reschedule
- **Mood Board**: Fix TikTok/Instagram ingestion, auto-transcription, standardize buttons, click-to-open, fix connections, fix notes persistence
- **Clients**: Health score dropdown, green AC badge, PDF branding, multi-contact support, in-context action buttons
- **Navigation**: Remove Profile Extract and Viral Library, fix tab highlighting
- **Onboarding**: Validate end-to-end (no structural changes)

## Key User Flows

1. Admin searches for trending topics → selects client from enhanced modal → runs search
2. Admin views dashboard → sees accurate metrics and shoots → navigates via View All
3. Admin creates mood board → pastes any platform URL → auto-ingestion + transcription → analysis
4. Admin manages client → sets health score → exports branded PDF → manages contacts

## Key Requirements

- 44 tasks across ui-ux, functional, and data-model categories
- No tech stack changes — all work within existing Next.js/Supabase/Tailwind
- Database migrations needed for: health_score_override (clients), client_contacts table
- AC logo asset required for PDF export
- Profile Extract and Viral Library pages removed entirely
