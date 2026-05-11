// VFF-09 T16: parallel-slot layout so the intercepting modal at
// `@modal/(.)formats/[id]` can render on top of the feed while the URL
// reflects the deep link. Direct visits to /admin/formats/<id> hit the
// regular `[id]/page.tsx` instead.

export default function FormatsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
