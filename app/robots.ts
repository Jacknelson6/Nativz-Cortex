import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: [
          '/admin/',
          '/portal/',
          '/api/',
          '/onboarding/',
          // Share-token surfaces (audit reports, moodboards, topic searches)
          '/shared/',
        ],
      },
    ],
  };
}
