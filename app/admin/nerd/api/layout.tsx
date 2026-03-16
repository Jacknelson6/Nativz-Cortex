import ApiDocsSidebar from './api-docs-sidebar';

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ApiDocsSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
