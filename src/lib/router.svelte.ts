/** Tiny hash router: #/, #/cube, #/train, #/stats, #/tools, #/settings, #/about */
export type Route = 'timer' | 'cube' | 'train' | 'stats' | 'tools' | 'settings' | 'about';

const ROUTES: Route[] = ['timer', 'cube', 'train', 'stats', 'tools', 'settings', 'about'];

function parse(): { route: Route; params: URLSearchParams } {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const r = (path.split('/')[0] || 'timer') as Route;
  return { route: ROUTES.includes(r) ? r : 'timer', params: new URLSearchParams(query ?? '') };
}

function href(route: Route, params?: Record<string, string>): string {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  return '#/' + (route === 'timer' ? '' : route) + q;
}

class Router {
  route: Route = $state(parse().route);
  params: URLSearchParams = $state.raw(parse().params);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        const p = parse();
        this.route = p.route;
        this.params = p.params;
      });
    }
  }

  go(route: Route, params?: Record<string, string>) {
    const target = href(route, params);
    if (location.hash !== target) location.hash = target;
  }

  /** Rewrite the current entry without adding history (used to consume one-shot parameters). */
  replace(route: Route, params?: Record<string, string>) {
    history.replaceState(history.state, '', href(route, params));
    const p = parse();
    this.route = p.route;
    this.params = p.params;
  }
}

export const router = new Router();
