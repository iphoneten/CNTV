import ResourceHomeContent from '@/components/ResourceHomeContent';
import HomeLegacyClient from '@/app/HomeLegacyClient';

export const dynamic = 'force-dynamic';

// 旧首页逻辑保留，可随时切回
const ENABLE_LEGACY_HOME = false;

export default async function HomePage() {
  if (ENABLE_LEGACY_HOME) {
    return <HomeLegacyClient />;
  }

  return <ResourceHomeContent activePath='/resources' />;
}
