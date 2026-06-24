const BACKEND = 'http://168.75.110.180:443';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/');
    const isWs  = url.pathname === '/ws' || url.pathname.startsWith('/ws/');

    if (isApi || isWs) {
      const target = BACKEND + url.pathname + url.search;
      return fetch(new Request(target, {
        method:  request.method,
        headers: request.headers,
        body:    request.body,
        redirect: 'follow',
      }));
    }

    return env.ASSETS.fetch(request);
  },
};
