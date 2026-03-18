/* eslint-disable no-console */

'use client';

import { Suspense, useEffect, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function RecordsClient() {
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    const sortedRecords = recordsArray.sort((a, b) => b.save_time - a.save_time);
    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('获取播放记录失败:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayRecords();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  return (
    <PageLayout activePath='/records'>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='max-w-[95%] mx-auto'>
          <section className='mb-8'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                观看记录
              </h2>
              {playRecords.length > 0 && (
                <button
                  className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  onClick={async () => {
                    await clearAllPlayRecords();
                    setPlayRecords([]);
                  }}
                >
                  清空
                </button>
              )}
            </div>

            {loading ? (
              <div className='grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20'>
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className='w-full'>
                    <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                      <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                    </div>
                    <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                    <div className='mt-1 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20'>
                {playRecords.map((record) => {
                  const { source, id } = parseKey(record.key);
                  return (
                    <div key={record.key} className='w-full'>
                      <VideoCard
                        id={id}
                        title={record.title}
                        poster={record.cover}
                        year={record.year}
                        source={source}
                        source_name={record.source_name}
                        progress={getProgress(record)}
                        episodes={record.total_episodes}
                        currentEpisode={record.index}
                        query={record.search_title}
                        from='playrecord'
                        onDelete={() =>
                          setPlayRecords((prev) =>
                            prev.filter((r) => r.key !== record.key)
                          )
                        }
                        type={record.total_episodes > 1 ? 'tv' : ''}
                      />
                    </div>
                  );
                })}
                {playRecords.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    暂无播放记录
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsClient />
    </Suspense>
  );
}
