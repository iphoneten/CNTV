import ResourceHomeContent from '@/components/ResourceHomeContent';

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  return await ResourceHomeContent({ activePath: '/resources' });
}
