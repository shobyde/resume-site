/* ============================================================
   A small A2UI 1.0 renderer for this site.

   The agent never touches the DOM: it emits a surface (components
   plus a data model), and this file maps those components onto
   elements the site already styles. Only the basic catalog
   components the assistant actually uses are implemented; anything
   else is skipped and reported rather than guessed at.

   Stream shape (one object per message):
     { version, createSurface:    { surfaceId, catalogId, components, dataModel } }
     { version, updateComponents: { surfaceId, components } }
     { version, updateDataModel:  { surfaceId, path, value } }
   ============================================================ */

const CATALOG = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

const TEXT_VARIANTS = {
  h1: 'h2',
  h2: 'h3',
  h3: 'h4',
  h4: 'h5',
  caption: 'small',
};

/** RFC 6901 lookup with ~0 / ~1 unescaping. */
function resolvePath(data, path) {
  if (!path || path === '/') return data;
  return path
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, part) => (current == null ? undefined : current[part]), data);
}

function resolveValue(value, surface) {
  if (value && typeof value === 'object' && !Array.isArray(value) && '@path' in value) {
    return resolvePath(surface.dataModel, value['@path']);
  }
  return value;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function createSurfaceState(surfaceId, components, dataModel) {
  return {
    surfaceId,
    dataModel: dataModel || {},
    components: new Map(components.map((component) => [component.id, component])),
  };
}

function renderComponent(id, surface, onAction, seen = new Set()) {
  const component = surface.components.get(id);
  if (!component) return null;
  // A cycle in the adjacency list would otherwise render forever; the
  // validator in CI rejects these, and the renderer refuses them at runtime.
  if (seen.has(id)) return null;
  const nextSeen = new Set(seen).add(id);

  const children = (ids = []) =>
    ids
      .map((childId) => renderComponent(childId, surface, onAction, nextSeen))
      .filter(Boolean);

  switch (component.component) {
    case 'Column': {
      const node = el('div', 'a2ui-column');
      for (const child of children(component.children)) node.appendChild(child);
      return node;
    }
    case 'Row': {
      const node = el('div', 'a2ui-row');
      for (const child of children(component.children)) node.appendChild(child);
      return node;
    }
    case 'Card': {
      const node = el('div', 'a2ui-card');
      const child = component.child ? renderComponent(component.child, surface, onAction, nextSeen) : null;
      if (child) node.appendChild(child);
      return node;
    }
    case 'Text': {
      const tag = TEXT_VARIANTS[component.variant] || 'p';
      const node = el(tag, 'a2ui-text');
      const text = resolveValue(component.text, surface);
      node.textContent = text == null ? '' : String(text);
      return node;
    }
    case 'Divider':
      return el('hr', 'a2ui-divider');
    case 'Image': {
      const node = el('img', 'a2ui-image');
      node.src = String(resolveValue(component.src, surface) || '');
      node.alt = String(component.alt || '');
      node.loading = 'lazy';
      return node;
    }
    case 'Button': {
      const node = el('button', 'a2ui-button');
      node.type = 'button';
      const label = resolveValue(component.text, surface);
      node.textContent = label == null ? '' : String(label);
      if (component.action && component.action.name) {
        node.addEventListener('click', () => {
          onAction?.(component.action.name, component.action.context || {});
        });
      } else {
        node.disabled = true;
      }
      return node;
    }
    default:
      console.warn('[a2ui] unsupported component', component.component);
      return null;
  }
}

/**
 * Applies one stream of A2UI messages to a container and returns the surfaces
 * it rendered. Re-rendering replaces the surface in place, which is what
 * updateComponents and updateDataModel expect.
 */
export function renderA2UI(messages, container, { onAction } = {}) {
  const surfaces = new Map();
  const nodes = new Map();

  const paint = (surfaceId) => {
    const surface = surfaces.get(surfaceId);
    if (!surface) return;
    const root = surface.components.get('root');
    if (!root) return;
    const tree = renderComponent('root', surface, onAction);
    if (!tree) return;
    const previous = nodes.get(surfaceId);
    if (previous && previous.parentNode === container) {
      container.replaceChild(tree, previous);
    } else {
      container.appendChild(tree);
    }
    nodes.set(surfaceId, tree);
  };

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (message.createSurface) {
      const { surfaceId, components = [], dataModel } = message.createSurface;
      surfaces.set(surfaceId, createSurfaceState(surfaceId, components, dataModel));
      paint(surfaceId);
    } else if (message.updateComponents) {
      const { surfaceId, components = [] } = message.updateComponents;
      const surface = surfaces.get(surfaceId);
      if (!surface) continue;
      for (const component of components) surface.components.set(component.id, component);
      paint(surfaceId);
    } else if (message.updateDataModel) {
      const { surfaceId, path, value } = message.updateDataModel;
      const surface = surfaces.get(surfaceId);
      if (!surface) continue;
      // Only the shallow write our own surfaces need; nested paths are rare in
      // cards and would need a structural setter.
      if (!path || path === '/') surface.dataModel = value;
      else {
        const parts = path.split('/').slice(1);
        let cursor = surface.dataModel;
        parts.slice(0, -1).forEach((part) => {
          if (cursor[part] == null) cursor[part] = {};
          cursor = cursor[part];
        });
        cursor[parts[parts.length - 1]] = value;
      }
      paint(surfaceId);
    }
  }

  return { surfaceIds: [...surfaces.keys()] };
}

export { CATALOG };
