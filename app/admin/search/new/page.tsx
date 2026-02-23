import { SearchModeSelector } from '@/components/search/search-mode-selector';

export default function AdminNewSearchPage() {
  return (
    <div className="flex flex-col items-center justify-center p-6 min-h-full">
      <div className="w-full max-w-4xl">
        <SearchModeSelector redirectPrefix="/admin" />
      </div>
    </div>
  );
}
