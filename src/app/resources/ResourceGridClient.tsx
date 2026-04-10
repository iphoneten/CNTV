'use client';

import { useRouter } from 'next/navigation';

interface ResourceItem {
  key: string;
  name: string;
}

const COLOR_CLASSES = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickRandomLikeColor = (value: string) =>
  COLOR_CLASSES[hashString(value) % COLOR_CLASSES.length];

const getInitial = (name: string) => {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0] : '?';
};

export default function ResourceGridClient({ sites }: { sites: ResourceItem[] }) {
  const router = useRouter();

  return (
    <div className='grid grid-cols-5 border-l border-t border-gray-400 dark:border-gray-500'>
      {sites.map((site) => {
        const colorClass = pickRandomLikeColor(`${site.key}-${site.name}`);
        return (
          <button
            key={site.key}
            type='button'
            data-tv-focusable='true'
            onClick={() =>
              router.push(`/resources/detail?source=${encodeURIComponent(site.key)}`)
            }
            className='h-[116px] overflow-hidden border-b border-r border-gray-400 bg-white/75 text-left transition-colors hover:bg-gray-100/70 dark:border-gray-500 dark:bg-gray-900/60 dark:hover:bg-gray-800/70'
          >
            <div className={`flex h-[64px] items-center justify-center ${colorClass}`}>
              <span className='text-3xl font-semibold text-white'>
                {getInitial(site.name)}
              </span>
            </div>
            <div className='flex h-[52px] items-center justify-center px-2'>
              <h2
                title={site.name}
                className='line-clamp-2 text-center text-xs font-medium leading-5 text-gray-900 dark:text-gray-100'
              >
                {site.name}
              </h2>
            </div>
          </button>
        );
      })}
    </div>
  );
}
