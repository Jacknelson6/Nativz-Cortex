'use client';

import { TextFlip } from '@/components/ui/text-flip';

const INDUSTRIES = [
  'Software Development',
  'Mobile App Development',
  'Cybersecurity',
  'Cloud Computing Services',
  'Artificial Intelligence & Machine Learning',
  'Data Analytics & Business Intelligence',
  'IT Consulting',
  'Web Development',
  'E-commerce Platforms',
  'Digital Marketing Agency',
  'Search Engine Optimization (SEO)',
  'Social Media Marketing',
  'Pay-Per-Click (PPC) Advertising',
  'Content Marketing',
  'Influencer Marketing',
  'Public Relations (PR)',
  'Branding & Identity Design',
  'Graphic Design',
  'Web Design',
  'UX/UI Design',
  'Interior Design',
  'Architecture',
  'Construction',
  'Residential Real Estate',
  'Commercial Real Estate',
  'Property Management',
  'Real Estate Investment (REITs)',
  'Real Estate Development',
  'Commercial Banking',
  'Investment Banking',
  'Wealth Management',
  'Insurance (Life, Health, Property)',
  'Fintech',
  'Payment Processing',
  'Cryptocurrency & Blockchain Services',
  'Venture Capital',
  'Private Equity',
  'Accounting & Tax Services',
  'Legal Services',
  'Human Resources & Recruitment',
  'Executive Search',
  'Payroll Services',
  'Temporary Staffing',
  'Logistics & Freight Forwarding',
  'Trucking & Transportation',
  'Warehousing & Storage',
  'Last-Mile Delivery',
  'Courier Services',
  'Supply Chain Management',
  'Manufacturing (General)',
  'Food & Beverage Manufacturing',
  'Pharmaceutical Manufacturing',
  'Medical Device Manufacturing',
  'Automotive Manufacturing',
  'Aerospace Manufacturing',
  'Electronics Manufacturing',
  'Furniture Manufacturing',
  'Textile & Apparel Manufacturing',
  'Retail (Brick-and-Mortar)',
  'Online Retail / E-commerce',
  'Wholesale Distribution',
  'Grocery & Supermarkets',
  'Specialty Retail',
  'Fast Food & Quick Service Restaurants',
  'Full-Service Restaurants',
  'Food Trucks & Street Vendors',
  'Catering Services',
  'Coffee Shops & Cafés',
  'Breweries & Craft Beer',
  'Wineries & Vineyards',
  'Distilleries',
  'Hotels & Resorts',
  'Short-Term Vacation Rentals',
  'Event Planning & Management',
  'Wedding Services',
  'Photography & Videography',
  'Film & Television Production',
  'Music Production & Recording',
  'Live Events & Concerts',
  'Fitness Centers & Gyms',
  'Personal Training',
  'Yoga & Pilates Studios',
  'Physical Therapy',
  'Dental Practices',
  'Veterinary Clinics',
  'Medical Clinics & Urgent Care',
  'Hospitals & Healthcare Systems',
  'Telemedicine',
  'Biotechnology',
  'Medical Research',
  'Renewable Energy (Solar / Wind)',
  'Oil & Gas Exploration',
  'Electric Utilities',
  'Waste Management & Recycling',
  'Environmental Consulting',
  'Agriculture & Farming',
  'Aquaculture',
  'Floriculture & Horticulture',
  'Education & Tutoring Services',
  'Online Education & e-Learning',
];

export function SearchHero() {
  return (
    <>
      <h1 className="text-3xl font-bold text-text-primary">
        Research{' '}
        <TextFlip
          words={INDUSTRIES}
          interval={3000}
          className="text-accent-text"
        />
      </h1>
      <p className="mt-2 text-text-muted">
        Enter a topic to get AI-powered research, trending insights, and video ideas
      </p>
    </>
  );
}
