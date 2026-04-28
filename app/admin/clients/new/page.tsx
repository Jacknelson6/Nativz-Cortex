import { redirect } from 'next/navigation';

// The simple "Add client" form was a divergent code path that skipped
// agency selection, services, organization creation, vault sync, Monday
// board provisioning, Late profile creation, and the website
// knowledge-graph build. Anything created through it landed in the DB
// half-configured. The /admin/clients/onboard wizard already collects
// every required field and runs the full provisioning, so /new now
// redirects there to keep one onboarding path.
export default function AdminNewClientPage() {
  redirect('/admin/clients/onboard');
}
