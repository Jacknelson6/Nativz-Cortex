// VFF-09 T16: default render for the @modal parallel slot when no
// intercepting route matches. Next requires a default.tsx on every
// parallel slot or the segment 404s during full-page navigations.

export default function ModalDefault() {
  return null;
}
