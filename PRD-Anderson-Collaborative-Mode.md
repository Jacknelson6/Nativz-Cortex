# Product Requirements Document: Anderson Collaborative Mode Switching

## Overview
This document outlines the requirements for implementing a theme switching feature that allows users to toggle between Nativz Cortex's default branding and Anderson Collaborative's branding. Similar to light/dark mode switching, users will be able to click the Cortex button in the top-left header to switch between these two brand identities.

## Goals
1. Allow users to switch between Nativz and Anderson Collaborative branding
2. Implement persistent theme preference storage
3. Maintain all existing functionality while changing only visual branding elements
4. Provide seamless transition between modes
5. Follow existing code patterns and conventions

## Anderson Collaborative Branding Details
Based on analysis of andersoncollaborative.com:

### Primary Colors
- **#36D1C2** - Teal/Cyan (primary brand color)
- **#000000** - Black
- **#FFFFFF** - White

### Secondary/Accent Colors
- **#0693E3** - Vivid Cyan Blue
- **#00D084** - Vivid Green Cyan
- **#7BDCB5** - Light Green Cyan
- **#FF6900** - Luminous Vivid Orange
- **#FCB900** - Luminous Vivid Amber
- **#CF2E2E** - Vivid Red
- **#9B51E0** - Vivid Purple
- **#F78DA7** - Pale Pink
- **#ABB8C3** - Cyan-Bluish Gray

### Logos
- **Primary Logo**: `https://www.andersoncollaborative.com/wp-content/uploads/2024/11/logo-tm2.png`
- **Favicon**: `https://www.andersoncollaborative.com/wp-content/uploads/2026/01/AC-Favicon-green-white-on-black-2.png`

## User Experience
### Interaction
1. User clicks the Cortex button in the top-left header
2. On click, the app toggles between Nativz and Anderson Collaborative modes
3. Visual elements update immediately:
   - Logo changes
   - Color scheme updates
   - Theme-specific elements adjust
4. Preference is persisted across sessions
5. System respects user's choice until manually changed

### Visual Changes
When in Anderson Collaborative mode:
- Header/logo switches to Anderson Collaborative branding
- Primary color theme shifts to teal/cyan (#36D1C2) palette
- Accent colors adopt Anderson's vibrant secondary palette
- Favicon updates to Anderson Collaborative version
- All Nativz-specific branding replaced with Anderson equivalents

## Technical Implementation

### State Management
1. Create a theme context/provider to manage brand mode state
2. Store user preference in localStorage for persistence
3. Provide hook for components to access current brand mode
4. Default to Nativz mode for first-time visitors

### Styling Approach
1. Extend existing CSS variables or create new theme-specific classes
2. Implement brand-specific color mappings
3. Use conditional rendering for logo/assets
4. Ensure smooth transitions between states

### Components to Modify
1. **Header Component** (`components/layout/header.tsx`)
   - Modify logo rendering to be brand-mode aware
   - Update click handler to toggle brand mode (in addition to sidebar toggle)
   - Potentially modify the Cortex button to indicate dual function

2. **Global Styling** (`globals.css` or equivalent)
   - Add Anderson Collaborative color variables
   - Implement theme switching logic via CSS classes or inline styles

3. **Layout Components**
   - Update favicon/meta tags based on brand mode
   - Adjust any hardcoded Nativz references

4. **Portal/Admin Areas** (if applicable)
   - Ensure theme switching works across all application sections

### Persistence
- Store selected brand mode in localStorage key: `nativz-cortex-brand-mode`
- Values: `'nativz'` (default) or `'anderson'`
- Read on app initialization to apply user preference

## Acceptance Criteria
1. [ ] Clicking Cortex button toggles between Nativz and Anderson Collaborative modes
2. [ ] Visual update occurs immediately without page reload
3. [ ] Preference persists across browser sessions
4. [ ] All primary branding elements update correctly:
   - Logo
   - Primary colors
   - Accent colors
   - Favicon
5. [ ] Mode switching works in all application routes/views
6. [ ] Default mode is Nativz for new users
7. [ ] No functional changes - only visual/theme updates
8. [ ] Accessible implementation (proper ARIA labels, contrast ratios)
9. [ ] Follows existing code patterns and conventions
10. [ ] Clean implementation without breaking existing functionality

## Dependencies
- No new external dependencies required
- Uses existing state management patterns
- Leverages existing styling infrastructure

## Risks & Mitigations
1. **Risk**: Color conflicts with existing UI components
   **Mitigation**: Thorough testing of all components in both modes
   
2. **Risk**: Performance impact from theme switching
   **Mitigation**: Efficient state updates and CSS transitions
   
3. **Risk**: Inconsistent branding across pages
   **Mitigation**: Centralized theme management with global provider

## Future Considerations
1. Allow user to select preferred mode in settings/profile
2. Add additional brand modes for other partnerships
3. Implement system preference detection (respect OS theme)
4. Add transition animations for smoother UX
5. Allow per-component branding overrides if needed

## Open Questions
1. Should the Cortex button have dual functionality (sidebar toggle + brand switch) or should brand switching be moved elsewhere?
2. How should we handle email notifications or other out-of-band communications in different brand modes?
3. Should certain administrative pages remain in Nativz mode regardless of user selection?
4. How should we handle third-party integrations that may have hardcoded Nativz references?

## Success Metrics
1. User adoption rate of Anderson Collaborative mode
2. No increase in bounce rate or decrease in engagement after implementation
3. Positive user feedback on branding flexibility
4. Zero reported bugs related to theme switching functionality
5. Maintained or improved application performance