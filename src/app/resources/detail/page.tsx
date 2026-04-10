import Link from 'next/link';

import { API_CONFIG, getAvailableApiSites } from '@/lib/config';

import PageLayout from '@/components/PageLayout';

export const dynamic = 'force-dynamic';

interface ClassLikeItem {
  type_id?: string | number;
  type_pid?: string | number;
  type_name?: string;
  class_name?: string;
  name?: string;
}

interface ParsedClassItem {
  id: string;
  pid: string;
  name: string;
  order: number;
}

interface ClassOption {
  id: string;
  name: string;
}

interface ClassGroup {
  title: string;
  items: ClassOption[];
}

interface VideoListItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  remarks: string;
}

interface VideoListResult {
  items: VideoListItem[];
  page: number;
  pageCount: number;
  total: number;
}

const ROOT_PID = '__root__';
const EXCLUDED_CATEGORY_KEYWORDS = ['电影解说', '预告'];

const normalizeClassName = (value: string) => value.trim();

const shouldExcludeCategory = (name: string) => {
  const normalized = normalizeClassName(name).replace(/\s+/g, '').toLowerCase();
  if (!normalized) return false;
  return EXCLUDED_CATEGORY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
};

const normalizePid = (value?: string | number) => {
  if (value === null || value === undefined) return ROOT_PID;
  const text = String(value).trim();
  if (!text || text === '0' || text === '-1') return ROOT_PID;
  return text;
};

const normalizeId = (value: string | number | null | undefined, fallback: string) => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const extractClassItems = (payload: unknown): ParsedClassItem[] => {
  const result: ParsedClassItem[] = [];
  const dedupe = new Set<string>();

  const appendFromArray = (items: unknown, offsetSeed: number) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      const typed = item as ClassLikeItem;
      const name = normalizeClassName(
        typed.type_name || typed.class_name || typed.name || ''
      );
      if (!name) return;

      const id = normalizeId(typed.type_id, `auto-${offsetSeed}-${index}-${name}`);
      const pid = normalizePid(typed.type_pid);
      const key = `${id}::${pid}::${name}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);

      result.push({
        id,
        pid,
        name,
        order: offsetSeed + index,
      });
    });
  };

  if (payload && typeof payload === 'object') {
    const typed = payload as Record<string, unknown>;
    appendFromArray(typed.class, 0);
    appendFromArray(typed.class_list, 1000);
    appendFromArray(typed.typelist, 2000);
    appendFromArray(typed.type_list, 3000);
    appendFromArray(typed.types, 4000);

    if (typed.typelist && typeof typed.typelist === 'object') {
      const typelistObj = typed.typelist as Record<string, unknown>;
      appendFromArray(typelistObj.list, 5000);
    }
  }

  return result;
};

const dedupeClassOptions = (items: ClassOption[]) => {
  const seen = new Set<string>();
  const result: ClassOption[] = [];
  items.forEach((item) => {
    const key = `${item.id}::${item.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const buildClassGroups = (items: ParsedClassItem[]): ClassGroup[] => {
  if (items.length === 0) return [];

  const hasTypePid = items.some((item) => item.pid !== ROOT_PID);
  if (!hasTypePid) {
    const flat = dedupeClassOptions(
      items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({ id: item.id, name: item.name }))
        .filter((item) => !shouldExcludeCategory(item.name))
    );
    return flat.length > 0 ? [{ title: '全部类型', items: flat }] : [];
  }

  const byId = new Map<string, ParsedClassItem>();
  items.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });

  const childrenByPid = new Map<string, ParsedClassItem[]>();
  items.forEach((item) => {
    const list = childrenByPid.get(item.pid) || [];
    list.push(item);
    childrenByPid.set(item.pid, list);
  });

  const parentCandidates = items
    .filter((item) => item.pid === ROOT_PID || !byId.has(item.pid))
    .sort((a, b) => a.order - b.order);

  const groups: ClassGroup[] = [];

  parentCandidates.forEach((parent) => {
    if (shouldExcludeCategory(parent.name)) {
      return;
    }

    const children = (childrenByPid.get(parent.id) || [])
      .filter((child) => child.id !== parent.id)
      .filter((child) => !shouldExcludeCategory(child.name))
      .sort((a, b) => a.order - b.order);

    if (children.length === 0) {
      // 对没有子类的独立大类，保留其本身（已过滤掉需排除的关键词）
      if (!(childrenByPid.get(parent.id) || []).length) {
        groups.push({
          title: parent.name,
          items: [{ id: parent.id, name: parent.name }],
        });
      }
      return;
    }

    groups.push({
      title: parent.name,
      items: dedupeClassOptions(children.map((child) => ({ id: child.id, name: child.name }))),
    });
  });

  const groupedItemKeys = new Set(
    groups.flatMap((group) => group.items.map((item) => `${item.id}::${item.name}`))
  );
  const ungrouped = dedupeClassOptions(
    items
      .filter((item) => !groupedItemKeys.has(`${item.id}::${item.name}`))
      .filter((item) => !shouldExcludeCategory(item.name))
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ id: item.id, name: item.name }))
  );

  if (ungrouped.length > 0) {
    groups.push({ title: '其他类型', items: ungrouped });
  }

  return groups;
};

const buildApiUrl = (baseUrl: string, params: Record<string, string>) => {
  const separator = baseUrl.includes('?') ? '&' : '?';
  const search = new URLSearchParams(params);
  return `${baseUrl}${separator}${search.toString()}`;
};

const fetchSourceClassTypes = async (apiUrl: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(apiUrl, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();
    const classItems = extractClassItems(data);
    return buildClassGroups(classItems);
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchVideoListByType = async (
  apiUrl: string,
  typeId: string,
  page: number
): Promise<VideoListResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const requestUrl = buildApiUrl(apiUrl, {
      ac: 'videolist',
      t: typeId,
      pg: String(page),
    });
    const response = await fetch(requestUrl, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = (await response.json()) as {
      page?: number | string;
      pagecount?: number | string;
      total?: number | string;
      list?: Array<{
        vod_id?: string | number;
        vod_name?: string;
        vod_pic?: string;
        vod_year?: string;
        vod_remarks?: string;
      }>;
    };

    const list = Array.isArray(data.list) ? data.list : [];
    const items: VideoListItem[] = list
      .map((item) => {
        const id = String(item.vod_id ?? '').trim();
        const title = (item.vod_name || '').trim();
        if (!id || !title) return null;
        const yearMatch = (item.vod_year || '').match(/\d{4}/);
        return {
          id,
          title,
          poster: item.vod_pic || '',
          year: yearMatch?.[0] || '',
          remarks: (item.vod_remarks || '').trim(),
        };
      })
      .filter((item): item is VideoListItem => !!item);

    const currentPage = Math.max(1, Number(data.page) || page || 1);
    const pageCount = Math.max(1, Number(data.pagecount) || 1);
    const total = Math.max(0, Number(data.total) || 0);

    return {
      items,
      page: currentPage,
      pageCount,
      total,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildDetailHref = (sourceKey: string, typeId: string, page: number) =>
  `/resources/detail?${new URLSearchParams({
    source: sourceKey,
    t: typeId,
    pg: String(page),
  }).toString()}`;

export default async function ResourceDetailPage({
  searchParams,
}: {
  searchParams: { source?: string; t?: string; pg?: string };
}) {
  const sourceKey = (searchParams.source || '').trim();
  const selectedTypeFromQuery = (searchParams.t || '').trim();
  const selectedPageFromQuery = Math.max(1, Number(searchParams.pg) || 1);

  const sources = await getAvailableApiSites();
  const source = sources.find((item) => item.key === sourceKey);

  let classGroups: ClassGroup[] = [];
  let classErrorMessage = '';
  let listErrorMessage = '';
  let selectedTypeId = '';
  let selectedTypeName = '';
  let videoList: VideoListResult | null = null;

  if (source) {
    try {
      classGroups = await fetchSourceClassTypes(source.api);
    } catch (error) {
      classErrorMessage = error instanceof Error ? error.message : '获取失败';
    }
  }

  const allTypes = dedupeClassOptions(classGroups.flatMap((group) => group.items));
  if (allTypes.length > 0) {
    const matched = allTypes.find((item) => item.id === selectedTypeFromQuery);
    const fallback = allTypes[0];
    selectedTypeId = matched?.id || fallback.id;
    selectedTypeName = matched?.name || fallback.name;
  }

  if (source && selectedTypeId) {
    try {
      videoList = await fetchVideoListByType(
        source.api,
        selectedTypeId,
        selectedPageFromQuery
      );
    } catch (error) {
      listErrorMessage = error instanceof Error ? error.message : '获取失败';
    }
  }

  return (
    <PageLayout activePath='/resources/detail'>
      <div className='mx-auto w-full max-w-6xl px-4 pb-6 pt-16 md:px-8 md:pb-8 md:pt-4'>
        <div className='mb-5 flex items-center gap-3 text-sm'>
          {source && (
            <span className='text-gray-700 dark:text-gray-200'>{source.name}</span>
          )}
          {selectedTypeName && (
            <span className='text-gray-500 dark:text-gray-400'>/ {selectedTypeName}</span>
          )}
        </div>

        {!source && (
          <div className='rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600 dark:border-gray-500 dark:text-gray-300'>
            未找到对应资源，请从资源列表重新进入。
          </div>
        )}

        {source && classErrorMessage && (
          <div className='rounded border border-red-400 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500 dark:bg-red-900/20 dark:text-red-300'>
            获取 class 失败：{classErrorMessage}
          </div>
        )}

        {source && !classErrorMessage && classGroups.length === 0 && (
          <div className='rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600 dark:border-gray-500 dark:text-gray-300'>
            已请求资源 API，但未返回可识别的 class 类型。
          </div>
        )}

        {source && !classErrorMessage && classGroups.length > 0 && (
          <div className='space-y-3'>
            {classGroups.map((group) => (
              <section key={group.title} className='space-y-1.5'>
                <h3 className='text-[11px] font-medium text-gray-700 dark:text-gray-300'>
                  {group.title}
                </h3>
                <div
                  className={`grid grid-cols-6 border-l border-gray-400 dark:border-gray-500 ${group.items.length >= 6 ? 'border-t' : ''
                    }`}
                >
                  {group.items.map((item) => {
                    const active = item.id === selectedTypeId;
                    return (
                      <Link
                        key={`${group.title}-${item.id}-${item.name}`}
                        href={buildDetailHref(source.key, item.id, 1)}
                        replace
                        data-tv-focusable='true'
                        className={`flex h-8 items-center justify-center border-b border-r border-gray-400 px-1 text-center text-[11px] dark:border-gray-500 ${active
                          ? 'bg-green-500/20 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                          : 'bg-white/75 text-gray-900 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-100 dark:hover:bg-gray-800/70'
                          }`}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {source && !classErrorMessage && selectedTypeId && (
          <section className='mt-8 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-medium text-gray-800 dark:text-gray-100'>
                影片列表
              </h3>
              {videoList && (
                <span className='text-xs text-gray-500 dark:text-gray-400'>
                  共 {videoList.total} 条，页码 {videoList.page}/{videoList.pageCount}
                </span>
              )}
            </div>

            {listErrorMessage && (
              <div className='rounded border border-red-400 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500 dark:bg-red-900/20 dark:text-red-300'>
                获取影片列表失败：{listErrorMessage}
              </div>
            )}

            {!listErrorMessage && videoList && videoList.items.length === 0 && (
              <div className='rounded border border-dashed border-gray-400 p-4 text-sm text-gray-600 dark:border-gray-500 dark:text-gray-300'>
                该分类暂无影片数据。
              </div>
            )}

            {!listErrorMessage && videoList && videoList.items.length > 0 && (
              <>
                <div className='grid grid-cols-3 gap-x-2 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'>
                  {videoList.items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/play?source=${encodeURIComponent(source.key)}&id=${encodeURIComponent(item.id)}&title=${encodeURIComponent(item.title)}${item.year ? `&year=${encodeURIComponent(item.year)}` : ''}&stitle=${encodeURIComponent(item.title)}&prefer=true`}
                      data-tv-focusable='true'
                      className='group'
                    >
                      <div className='aspect-[2/3] w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800'>
                        {item.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.poster}
                            alt={item.title}
                            className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
                          />
                        ) : (
                          <div className='flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-400'>
                            无封面
                          </div>
                        )}
                      </div>
                      <div className='mt-1 space-y-0.5'>
                        <p className='line-clamp-2 text-xs leading-4 text-gray-900 dark:text-gray-100'>
                          {item.title}
                        </p>
                        <p className='text-[11px] text-gray-500 dark:text-gray-400'>
                          {item.year || item.remarks || '-'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className='flex items-center justify-center gap-2 pt-2'>
                  <Link
                    href={buildDetailHref(
                      source.key,
                      selectedTypeId,
                      Math.max(1, videoList.page - 1)
                    )}
                    replace
                    data-tv-focusable='true'
                    aria-disabled={videoList.page <= 1}
                    className={`rounded border px-3 py-1 text-sm ${videoList.page <= 1
                      ? 'pointer-events-none border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-600'
                      : 'border-gray-400 text-gray-700 hover:bg-gray-100 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                  >
                    上一页
                  </Link>
                  <span className='text-sm text-gray-600 dark:text-gray-300'>
                    {videoList.page} / {videoList.pageCount}
                  </span>
                  <Link
                    href={buildDetailHref(
                      source.key,
                      selectedTypeId,
                      Math.min(videoList.pageCount, videoList.page + 1)
                    )}
                    replace
                    data-tv-focusable='true'
                    aria-disabled={videoList.page >= videoList.pageCount}
                    className={`rounded border px-3 py-1 text-sm ${videoList.page >= videoList.pageCount
                      ? 'pointer-events-none border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-600'
                      : 'border-gray-400 text-gray-700 hover:bg-gray-100 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                  >
                    下一页
                  </Link>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </PageLayout>
  );
}
