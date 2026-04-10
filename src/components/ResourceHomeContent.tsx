import { getAvailableApiSites } from '@/lib/config';

import ResourceGridClient from '@/app/resources/ResourceGridClient';

import PageLayout from './PageLayout';

interface ResourceHomeContentProps {
  activePath?: string;
}

export default async function ResourceHomeContent({
  activePath = '/resources',
}: ResourceHomeContentProps) {
  const sites = await getAvailableApiSites();

  return (
    <PageLayout activePath={activePath}>
      <div className='mx-auto w-full max-w-6xl px-4 pb-6 pt-16 md:px-8 md:pb-8 md:pt-8'>
        {sites.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-gray-400 bg-white/70 px-4 py-8 text-center text-sm text-gray-600 dark:border-gray-500 dark:bg-gray-900/50 dark:text-gray-400'>
            当前没有启用资源，请在管理页开启后再查看。
          </div>
        ) : (
          <ResourceGridClient
            sites={sites.map((site) => ({ key: site.key, name: site.name }))}
          />
        )}
      </div>
    </PageLayout>
  );
}
