/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';
import runtimeConfig from './runtime';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
};

const API_SITE_CHECK_TIMEOUT_MS = 4000;
const API_SITE_CHECK_TTL_MS = 5 * 60 * 1000;
const API_SITE_CHECK_CONCURRENCY = 12;

const apiSiteHealthCache = new Map<
  string,
  {
    ok: boolean;
    checkedAt: number;
  }
>();

const apiSiteHealthInFlight = new Map<string, Promise<boolean>>();
let availableApiSitesCache:
  | {
    fingerprint: string;
    sites: ApiSite[];
  }
  | null = null;
let availableApiSitesInFlight:
  | {
    fingerprint: string;
    promise: Promise<ApiSite[]>;
  }
  | null = null;

function buildApiProbeUrl(api: string): string {
  const joiner = api.includes('?') ? '&' : '?';
  return `${api}${joiner}ac=videolist&pg=1`;
}

async function probeApiSite(site: ApiSite): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    API_SITE_CHECK_TIMEOUT_MS
  );

  try {
    const response = await fetch(buildApiProbeUrl(site.api), {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    if (!data || typeof data !== 'object') {
      return false;
    }

    // 常见苹果 CMS 返回结构：list/page/pagecount/class
    if (Array.isArray((data as any).list)) {
      return true;
    }

    if (
      typeof (data as any).pagecount !== 'undefined' ||
      Array.isArray((data as any).class)
    ) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getApiSiteHealth(site: ApiSite): Promise<boolean> {
  const now = Date.now();
  const cached = apiSiteHealthCache.get(site.key);

  if (cached && now - cached.checkedAt < API_SITE_CHECK_TTL_MS) {
    return cached.ok;
  }

  const inFlight = apiSiteHealthInFlight.get(site.key);
  if (inFlight) {
    return inFlight;
  }

  const checkPromise = probeApiSite(site)
    .then((ok) => {
      apiSiteHealthCache.set(site.key, {
        ok,
        checkedAt: Date.now(),
      });
      return ok;
    })
    .finally(() => {
      apiSiteHealthInFlight.delete(site.key);
    });

  apiSiteHealthInFlight.set(site.key, checkPromise);
  return checkPromise;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await mapper(items[index]);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function filterReachableApiSites(sites: ApiSite[]): Promise<ApiSite[]> {
  const checks = await mapWithConcurrency(
    sites,
    API_SITE_CHECK_CONCURRENCY,
    async (site) => {
      const ok = await getApiSiteHealth(site);
      return {
        site,
        ok,
      };
    }
  );

  return checks.filter((item) => item.ok).map((item) => item.site);
}

function buildApiSitesFingerprint(sites: ApiSite[]): string {
  return sites
    .map((site) => `${site.key}|${site.api}|${site.name}|${site.detail || ''}`)
    .sort()
    .join('||');
}

// 在模块加载时根据环境决定配置来源
let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    // 数据库存储，读取并补全管理员配置
    const storage = getStorage();

    try {
      // 尝试从数据库获取管理员配置
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      // 获取所有用户名，用于补全 Users
      let userNames: string[] = [];
      if (storage && typeof (storage as any).getAllUsers === 'function') {
        try {
          userNames = await (storage as any).getAllUsers();
        } catch (e) {
          console.error('获取用户列表失败:', e);
        }
      }

      // 从文件中获取源信息，用于补全源
      const apiSiteEntries = Object.entries(fileConfig.api_site);
      const customCategories = fileConfig.custom_category || [];

      if (adminConfig) {
        // 补全 SourceConfig
        const sourceConfigMap = new Map(
          (adminConfig.SourceConfig || []).map((s) => [s.key, s])
        );

        apiSiteEntries.forEach(([key, site]) => {
          sourceConfigMap.set(key, {
            key,
            name: site.name,
            api: site.api,
            detail: site.detail,
            from: 'config',
            disabled: false,
          });
        });

        // 将 Map 转换回数组
        adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

        // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
        const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
        adminConfig.SourceConfig.forEach((source) => {
          if (!apiSiteKeys.has(source.key)) {
            source.from = 'custom';
          }
        });

        // 确保 CustomCategories 被初始化
        if (!adminConfig.CustomCategories) {
          adminConfig.CustomCategories = [];
        }

        // 补全 CustomCategories
        const customCategoriesMap = new Map(
          adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
        );

        customCategories.forEach((category) => {
          customCategoriesMap.set(category.query + category.type, {
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          });
        });

        // 检查现有 CustomCategories 是否在 fileConfig.custom_category 中，如果不在则标记为 custom
        const customCategoriesKeys = new Set(
          customCategories.map((c) => c.query + c.type)
        );
        customCategoriesMap.forEach((category) => {
          if (!customCategoriesKeys.has(category.query + category.type)) {
            category.from = 'custom';
          }
        });

        // 将 Map 转换回数组
        adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

        const existedUsers = new Set(
          (adminConfig.UserConfig.Users || []).map((u) => u.username)
        );
        userNames.forEach((uname) => {
          if (!existedUsers.has(uname)) {
            adminConfig!.UserConfig.Users.push({
              username: uname,
              role: 'user',
            });
          }
        });
        // 站长
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
            (u) => u.username !== ownerUser
          );
          adminConfig!.UserConfig.Users.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
      } else {
        // 数据库中没有配置，创建新的管理员配置
        let allUsers = userNames.map((uname) => ({
          username: uname,
          role: 'user',
        }));
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          allUsers = allUsers.filter((u) => u.username !== ownerUser);
          allUsers.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
        adminConfig = {
          SiteConfig: {
            SiteName: process.env.SITE_NAME || 'CCTV',
            Announcement:
              process.env.ANNOUNCEMENT ||
              '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
            SearchDownstreamMaxPage:
              Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
            SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
            ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
            DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
          },
          UserConfig: {
            AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
            Users: allUsers as any,
          },
          SourceConfig: apiSiteEntries.map(([key, site]) => ({
            key,
            name: site.name,
            api: site.api,
            detail: site.detail,
            from: 'config',
            disabled: false,
          })),
          CustomCategories: customCategories.map((category) => ({
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          })),
        };
      }

      // 写回数据库（更新/创建）
      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }

      // 更新缓存
      cachedConfig = adminConfig;
    } catch (err) {
      console.error('加载管理员配置失败:', err);
    }
  } else {
    // 本地存储直接使用文件配置
    cachedConfig = {
      SiteConfig: {
        SiteName: process.env.SITE_NAME || 'CCTV',
        Announcement:
          process.env.ANNOUNCEMENT ||
          '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
        SearchDownstreamMaxPage:
          Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
        SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
        ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
        DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      },
      UserConfig: {
        AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
        Users: [],
      },
      SourceConfig: Object.entries(fileConfig.api_site).map(([key, site]) => ({
        key,
        name: site.name,
        api: site.api,
        detail: site.detail,
        from: 'config',
        disabled: false,
      })),
      CustomCategories:
        fileConfig.custom_category?.map((category) => ({
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        })) || [],
    } as AdminConfig;
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }
  // 非 docker 环境且 DB 存储，直接读 db 配置
  const storage = getStorage();
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }
  if (adminConfig) {
    // 确保 CustomCategories 被初始化
    if (!adminConfig.CustomCategories) {
      adminConfig.CustomCategories = [];
    }

    // 合并一些环境变量配置
    adminConfig.SiteConfig.SiteName = process.env.SITE_NAME || 'CCTV';
    adminConfig.SiteConfig.Announcement =
      process.env.ANNOUNCEMENT ||
      '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
    adminConfig.UserConfig.AllowRegister =
      process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
    adminConfig.SiteConfig.ImageProxy =
      process.env.NEXT_PUBLIC_IMAGE_PROXY || '';
    adminConfig.SiteConfig.DoubanProxy =
      process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';

    // 合并文件中的源信息
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
    const apiSiteEntries = Object.entries(fileConfig.api_site);
    const sourceConfigMap = new Map(
      (adminConfig.SourceConfig || []).map((s) => [s.key, s])
    );

    apiSiteEntries.forEach(([key, site]) => {
      sourceConfigMap.set(key, {
        key,
        name: site.name,
        api: site.api,
        detail: site.detail,
        from: 'config',
        disabled: false,
      });
    });

    // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
    const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
    sourceConfigMap.forEach((source) => {
      if (!apiSiteKeys.has(source.key)) {
        source.from = 'custom';
      }
    });

    // 将 Map 转换回数组
    adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

    // 补全 CustomCategories
    const customCategories = fileConfig.custom_category || [];
    const customCategoriesMap = new Map(
      adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
    );

    customCategories.forEach((category) => {
      customCategoriesMap.set(category.query + category.type, {
        name: category.name,
        type: category.type,
        query: category.query,
        from: 'config',
        disabled: false,
      });
    });

    // 检查现有 CustomCategories 是否在 fileConfig.custom_categories 中，如果不在则标记为 custom
    const customCategoriesKeys = new Set(
      customCategories.map((c) => c.query + c.type)
    );
    customCategoriesMap.forEach((category) => {
      if (!customCategoriesKeys.has(category.query + category.type)) {
        category.from = 'custom';
      }
    });

    // 将 Map 转换回数组
    adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

    const ownerUser = process.env.USERNAME || '';
    // 检查配置中的站长用户是否和 USERNAME 匹配，如果不匹配则降级为普通用户
    let containOwner = false;
    adminConfig.UserConfig.Users.forEach((user) => {
      if (user.username !== ownerUser && user.role === 'owner') {
        user.role = 'user';
      }
      if (user.username === ownerUser) {
        containOwner = true;
        user.role = 'owner';
      }
    });

    // 如果不在则添加
    if (!containOwner) {
      adminConfig.UserConfig.Users.unshift({
        username: ownerUser,
        role: 'owner',
      });
    }
    cachedConfig = adminConfig;
  } else {
    // DB 无配置，执行一次初始化
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const storage = getStorage();
  // 获取所有用户名，用于补全 Users
  let userNames: string[] = [];
  if (storage && typeof (storage as any).getAllUsers === 'function') {
    try {
      userNames = await (storage as any).getAllUsers();
    } catch (e) {
      console.error('获取用户列表失败:', e);
    }
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const apiSiteEntries = Object.entries(fileConfig.api_site);
  const customCategories = fileConfig.custom_category || [];
  let allUsers = userNames.map((uname) => ({
    username: uname,
    role: 'user',
  }));
  const ownerUser = process.env.USERNAME;
  if (ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== ownerUser);
    allUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }
  const adminConfig = {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'CCTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: allUsers as any,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
    CustomCategories:
      storageType === 'redis'
        ? customCategories?.map((category) => ({
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        })) || []
        : [],
  } as AdminConfig;

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }
  if (cachedConfig == null) {
    // serverless 环境，直接使用 adminConfig
    cachedConfig = adminConfig;
  }
  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.SourceConfig = adminConfig.SourceConfig;
  cachedConfig.CustomCategories = adminConfig.CustomCategories;
}

export async function getCacheTime(): Promise<number> {
  if (process.env.NODE_ENV === 'development') {
    return 0;
  }
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  const configuredSites = config.SourceConfig.filter((s) => !s.disabled).map(
    (s) => ({
      key: s.key,
      name: s.name,
      api: s.api,
      detail: s.detail,
    })
  );
  const fingerprint = buildApiSitesFingerprint(configuredSites);

  if (
    availableApiSitesCache &&
    availableApiSitesCache.fingerprint === fingerprint
  ) {
    return availableApiSitesCache.sites;
  }

  if (
    availableApiSitesInFlight &&
    availableApiSitesInFlight.fingerprint === fingerprint
  ) {
    return availableApiSitesInFlight.promise;
  }

  const promise = filterReachableApiSites(configuredSites).then((sites) => {
    availableApiSitesCache = {
      fingerprint,
      sites,
    };
    return sites;
  });

  availableApiSitesInFlight = {
    fingerprint,
    promise,
  };

  try {
    return await promise;
  } finally {
    if (
      availableApiSitesInFlight &&
      availableApiSitesInFlight.fingerprint === fingerprint
    ) {
      availableApiSitesInFlight = null;
    }
  }
}
