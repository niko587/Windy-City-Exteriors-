# Prototype Implementation Plan

**Goal:** Reviewable local whole-site prototype plus cinematic 3D siding comparison.
**Architecture:** Vite React TypeScript frontend, React Three Fiber/Three.js scene loaded separately, React DOM content and estimate wizard. Component-scoped responsibilities; no backend for this milestone.
**Spec:** docs/prototype-brief.md

## Global constraints
Subscription-only Claude use. No paid assets/services, API billing, deployment or live messaging. Read the brief in full. Preserve supplied logos. Do not publish simulated content as evidence of company work.

## 1. Site shell and content
- [ ] Scaffold package.json, index.html, src/main.tsx and src/App.tsx with build/dev scripts.
- [ ] Centralize confirmed facts in src/content.ts; create src/styles.css with porcelain/navy/red editorial system.
- [ ] Build responsive header, service content, gallery demonstration, company story, source-linked review section and footer.
- [ ] Verify navigation and 375px layout without horizontal overflow.

## 2. Property experience
- [ ] Create src/property/PropertyScene.tsx, House.tsx and CameraRig.tsx; use procedural detailed geometry unless a suitable free licensed model is demonstrably better.
- [ ] Isolate before/after siding states with fixed-camera scissor rendering or clipping; ensure the window/house alignment is identical at every slider value.
- [ ] Define typed service focus destinations in src/property/services.ts. Smooth interruptible camera movements; damped orbit control; reset.
- [ ] Add accessible DOM slider, service selector, loading and WebGL failure fallback. Respect reduced motion.
- [ ] Check before/after at 0/50/100 and orbit/focus/reset on desktop/mobile.

## 3. Estimate walkthrough
- [ ] Build src/estimate/EstimateWizard.tsx and validation.ts. Steps: project, location/details/photos, contact, review/demo confirmation.
- [ ] Require service and town, then name plus contact method and matching valid contact field. Render local file previews with object URL cleanup; no network submission.
- [ ] Test validation rejects missing or invalid contact details and accepts valid call/text/email entries. Clearly label simulated completion.

## 4. Review
- [ ] Run build and meaningful behavior tests; fix errors.
- [ ] Open local site in browser and inspect desktop and mobile, console, scene controls, form flow and reduced motion.
- [ ] Record actual checks and known limitations in docs/prototype-status.md.

Claude executes these tasks; Codex reviews implementation and visual fidelity. No need for further design approval for this agreed prototype scope.
