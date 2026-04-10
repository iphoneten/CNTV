import PageLayout from '@/components/PageLayout';

export default function ResourcesDetailLoading() {
  return (
    <PageLayout activePath='/resources/detail'>
      <div className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 backdrop-blur-sm'>
        <div className='rounded-xl border border-white/20 bg-black/55 px-5 py-4 text-white shadow-2xl'>
          <div className='flex items-center gap-3'>
            <div className='h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
