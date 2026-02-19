import { SearchForm } from '@/components/search/search-form';

export default function AdminNewSearchPage() {
  return (
    <div className="flex flex-col items-center justify-center p-6 pt-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Run a topic search
        </h1>
        <p className="mt-2 text-gray-500">
          Enter a topic to get AI-powered research, trending insights, and video ideas
        </p>

        <div className="mt-8">
          <SearchForm redirectPrefix="/admin" />
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Powered by Brave Search + Claude AI
        </p>
      </div>
    </div>
  );
}
