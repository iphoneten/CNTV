import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { getLatestFromApi } from '@/lib/downstream';

export const runtime = 'edge';

function parseSiteGroup(name: string) {
  const separatorIndex = name.indexOf('-');
  if (separatorIndex > 0) {
    const group = name.slice(0, separatorIndex).trim() || '其他';
    const shortName = name.slice(separatorIndex + 1).trim() || name;
    return { group, shortName };
  }

  return {
    group: '其他',
    shortName: name,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || '';
    const page = Math.max(Number(searchParams.get('page') || '1'), 1);
    const pageSize = Math.min(
      Math.max(Number(searchParams.get('pageSize') || '18'), 1),
      36
    );
    const apiSites = await getAvailableApiSites();
    const cacheTime = await getCacheTime();

    if (!source) {
      const sections = apiSites.map((site) => ({
        key: site.key,
        name: site.name,
        ...parseSiteGroup(site.name),
      }));

      return NextResponse.json(
        { sections },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          },
        }
      );
    }

    const site = apiSites.find((item) => item.key === source);
    if (!site) {
      return NextResponse.json({ error: '资源不存在' }, { status: 404 });
    }

    const result = await getLatestFromApi(site, pageSize, page);

    return NextResponse.json(
      {
        section: {
          key: site.key,
          name: site.name,
          ...parseSiteGroup(site.name),
          items: result.items,
          page,
          hasMore: result.hasMore,
        },
      },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '获取首页推荐失败' }, { status: 500 });
  }
}
