/* eslint-disable react-hooks/exhaustive-deps, no-console */

'use client';

import { Suspense, useEffect, useState } from 'react';

import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

type HomeSection = {
  key: string;
  name: string;
  group: string;
  shortName: string;
};

type SectionState = {
  items: SearchResult[];
  page: number;
  hasMore: boolean;
  initialized: boolean;
};

function HomeClient() {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [sectionStates, setSectionStates] = useState<
    Record<string, SectionState>
  >({});
  const [activeGroup, setActiveGroup] = useState('');
  const [activeSectionKey, setActiveSectionKey] = useState('');
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  useEffect(() => {
    const fetchHomeSections = async () => {
      try {
        setLoadingTabs(true);
        const response = await fetch('/api/home/recommendations');
        if (!response.ok) {
          throw new Error('获取首页推荐失败');
        }

        const data: { sections?: unknown } = await response.json();
        const nextSections: HomeSection[] = Array.isArray(data.sections)
          ? (data.sections as HomeSection[])
          : [];
        const nextGroups = Array.from(
          new Set(nextSections.map((section) => section.group))
        );
        setSections(nextSections);
        setActiveGroup((prev) => {
          if (nextGroups.includes(prev)) {
            return prev;
          }
          return nextGroups[0] || '';
        });
      } catch (error) {
        console.error('获取首页推荐失败:', error);
        setSections([]);
        setActiveGroup('');
        setActiveSectionKey('');
      } finally {
        setLoadingTabs(false);
      }
    };

    fetchHomeSections();
  }, []);

  useEffect(() => {
    if (!activeGroup) {
      setActiveSectionKey('');
      return;
    }

    const groupedSections = sections.filter(
      (section) => section.group === activeGroup
    );

    setActiveSectionKey((prev) => {
      if (groupedSections.some((section) => section.key === prev)) {
        return prev;
      }
      return groupedSections[0]?.key || '';
    });
  }, [activeGroup, sections]);

  useEffect(() => {
    if (!activeSectionKey) {
      return;
    }

    const currentState = sectionStates[activeSectionKey];
    if (currentState?.initialized) {
      return;
    }

    const fetchSection = async () => {
      try {
        setLoadingSection(true);
        const response = await fetch(
          `/api/home/recommendations?source=${encodeURIComponent(
            activeSectionKey
          )}&page=1&pageSize=18`
        );

        if (!response.ok) {
          throw new Error('获取分类内容失败');
        }

        const data = await response.json();
        const section = data.section;
        setSectionStates((prev) => ({
          ...prev,
          [activeSectionKey]: {
            items: Array.isArray(section?.items) ? section.items : [],
            page: Number(section?.page || 1),
            hasMore: Boolean(section?.hasMore),
            initialized: true,
          },
        }));
      } catch (error) {
        console.error('获取分类内容失败:', error);
        setSectionStates((prev) => ({
          ...prev,
          [activeSectionKey]: {
            items: [],
            page: 1,
            hasMore: false,
            initialized: true,
          },
        }));
      } finally {
        setLoadingSection(false);
      }
    };

    fetchSection();
  }, [activeSectionKey, sectionStates]);

  const handleCloseAnnouncement = (value: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', value);
  };

  const groups = Array.from(new Set(sections.map((section) => section.group)));
  const groupedSections = sections.filter(
    (section) => section.group === activeGroup
  );
  const activeSection =
    groupedSections.find((section) => section.key === activeSectionKey) ||
    groupedSections[0];
  const activeSectionState = activeSection
    ? sectionStates[activeSection.key]
    : undefined;
  const shouldShowSectionSkeleton =
    Boolean(activeSection) &&
    (loadingSection || !activeSectionState?.initialized);

  const loadMore = async () => {
    if (!activeSection || !activeSectionState?.hasMore || loadingMore) {
      return;
    }

    try {
      setLoadingMore(true);
      const nextPage = activeSectionState.page + 1;
      const response = await fetch(
        `/api/home/recommendations?source=${encodeURIComponent(
          activeSection.key
        )}&page=${nextPage}&pageSize=18`
      );

      if (!response.ok) {
        throw new Error('加载更多失败');
      }

      const data = await response.json();
      const section = data.section;
      const newItems = Array.isArray(section?.items) ? section.items : [];
      setSectionStates((prev) => ({
        ...prev,
        [activeSection.key]: {
          items: [...(prev[activeSection.key]?.items || []), ...newItems],
          page: Number(section?.page || nextPage),
          hasMore: Boolean(section?.hasMore),
          initialized: true,
        },
      }));
    } catch (error) {
      console.error('加载更多失败:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 pb-4 sm:pb-8 pt-[calc(3rem+env(safe-area-inset-top)+0.75rem)] sm:pt-8 overflow-visible'>
        <div className='max-w-[95%] mx-auto'>
          {sections.length === 0 && !loadingTabs && (
            <section className='mb-8'>
              <div className='rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400'>
                暂无可用资源，请检查 config.json 中的 api_site 配置
              </div>
            </section>
          )}
          {sections.length > 0 && activeGroup && (
            <>
              <div className='mb-6 flex flex-wrap gap-2'>
                {groups.map((group) => {
                  const isActive = group === activeGroup;
                  return (
                    <button
                      key={group}
                      onClick={() => setActiveGroup(group)}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white shadow-sm dark:bg-gray-100 dark:text-gray-900'
                          : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {group}
                    </button>
                  );
                })}
              </div>

              <div className='mb-6 flex flex-wrap gap-2'>
                {groupedSections.map((section) => {
                  const isActive = section.key === activeSection?.key;
                  return (
                    <button
                      key={section.key}
                      onClick={() => setActiveSectionKey(section.key)}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {section.shortName}
                    </button>
                  );
                })}
              </div>

              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {activeSection?.name || '推荐列表'}
                  </h2>
                </div>

                {shouldShowSectionSkeleton ? (
                  <div className='grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20'>
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div key={index} className='w-full'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))}
                  </div>
                ) : activeSectionState?.items?.length ? (
                  <>
                    <div className='grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20'>
                      {activeSectionState.items.map((item) => (
                        <div key={`${item.source}-${item.id}`} className='w-full'>
                          <VideoCard
                            id={item.id}
                            title={item.title}
                            poster={item.poster}
                            episodes={item.episodes.length}
                            source={item.source}
                            source_name={item.source_name}
                            douban_id={item.douban_id?.toString()}
                            year={item.year}
                            from='search'
                            type={item.episodes.length > 1 ? 'tv' : 'movie'}
                          />
                        </div>
                      ))}
                    </div>

                    <div className='mt-8 flex justify-center'>
                      {activeSectionState.hasMore ? (
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className='rounded-full bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60'
                        >
                          {loadingMore ? '加载中...' : '加载更多'}
                        </button>
                      ) : (
                        <div className='text-sm text-gray-500 dark:text-gray-400'>
                          没有更多内容了
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className='rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400'>
                    当前资源暂无内容
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'>
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label='关闭'
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
