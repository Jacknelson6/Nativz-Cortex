import { headers } from 'next/headers';
import { API_ENDPOINTS, SECTIONS } from './api-docs-data';
import ApiDocsClient from './api-docs-client';

export default async function ApiDocsPage() {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  return <ApiDocsClient endpoints={API_ENDPOINTS} sections={SECTIONS} baseUrl={baseUrl} />;
}
