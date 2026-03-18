/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

'use client';

import { Suspense, useEffect, useState } from 'react';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type FavoriteItem = {
  id: string;
  source: string;
  title: string;
  year?: string;
  poster: string;
  episodes: number;
  source_name: string;
  currentEpisode?: number;
  search_title?: string;
};

function FavoritesClient() {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
        } as FavoriteItem;
      });

    setFavoriteItems(sorted);
  };

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        setLoading(true);
        const allFavorites = await getAllFavorites();
        await updateFavoriteItems(allFavorites);
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, []);

  return (
    <PageLayout activePath='/favorites'>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='max-w-[95%] mx-auto'>
          <section className='mb-8'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                我的收藏
              </h2>
              {favoriteItems.length > 0 && (
                <button
                  className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  onClick={async () => {
                    await clearAllFavorites();
                    setFavoriteItems([]);
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
                  </div>
                ))}
              </div>
            ) : (
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {favoriteItems.map((item) => (
                  <div key={item.id + item.source} className='w-full'>
                    <VideoCard
                      query={item.search_title}
                      {...item}
                      from='favorite'
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                  </div>
                ))}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    暂无收藏内容
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

export default function FavoritesPage() {
  return (
    <Suspense>
      <FavoritesClient />
    </Suspense>
  );
}
