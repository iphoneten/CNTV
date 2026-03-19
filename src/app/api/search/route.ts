import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';

export const runtime = 'edge';

function parseSiteGroup(name: string): string {
  const separatorIndex = name.indexOf('-');
  if (separatorIndex > 0) {
    return name.slice(0, separatorIndex).trim() || '其他';
  }
  return '其他';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const group = (searchParams.get('group') || '').trim();

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  let apiSites = await getAvailableApiSites();
  if (group) {
    apiSites = apiSites.filter((site) => parseSiteGroup(site.name) === group);
  }
  // if (type === 'yellow') {
  //   apiSites = apiSites.filter((site) => site.name.includes('AV'));
  // } else {
  //   apiSites = apiSites.filter((site) => !site.name.includes('AV'));
  // }
  const searchPromises = apiSites.map((site) => searchFromApi(site, query));
  try {
    const results = await Promise.all(searchPromises);
    const flattenedResults = results.flat();
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
