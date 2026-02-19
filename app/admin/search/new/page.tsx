import { SearchForm } from '@/components/search/search-form';
import { SearchHero } from '@/components/search/search-hero';

export default function AdminNewSearchPage() {
  return (
    <div className="flex flex-col items-center justify-center p-6 pt-16">
      <div className="w-full max-w-2xl text-center">
        <SearchHero />

        <div className="mt-8">
          <SearchForm redirectPrefix="/admin" />
        </div>

        <p className="mt-6 text-xs text-text-muted">
          Powered by Brave Search + Claude AI
        </p>
      </div>
    </div>
  );
}
