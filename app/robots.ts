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
          // Public proposal surface — contains deal terms + signer emails.
          '/proposals/',
          '/onboarding/',
          // Share-token surfaces (audit reports, moodboards, topic searches)
          '/shared/',
        ],
      },
    ],
  };
}
