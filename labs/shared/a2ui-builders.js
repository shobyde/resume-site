/* ============================================================
   A2UI builders shared by the labs.

   Same rules the site's own surfaces follow: ids are UAX #31,
   every component is reachable from root, buttons carry text and a
   named action, and values bind through the data model instead of
   being pasted into the component tree. `groundglass check` runs over
   the fixtures these produce, so a broken surface fails CI.

   The component table is the one the site renderer implements:
   Column, Row, Card, Text, Divider, Image, Button.
   ============================================================ */

export const CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

/**
 * A2UI wants a flat component list; the builders read better nested. This
 * walks the tree, lifts every component object into the list and leaves the
 * parent holding ids, which is the shape the renderer and the validator expect.
 */
export function flattenComponents(nodes) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== 'object') return;
    out.push(node);
    for (const key of ['children', 'child']) {
      if (!(key in node)) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        node[key] = value.map((child) => {
          if (child && typeof child === 'object') {
            walk(child);
            return child.id;
          }
          return child;
        });
      } else if (value && typeof value === 'object') {
        walk(value);
        node[key] = value.id;
      }
    }
  };
  walk(nodes);
  return out;
}

export function createSurface(surfaceId, components, dataModel = {}) {
  return {
    version: '1.0',
    createSurface: { surfaceId, catalogId: CATALOG_ID, components: flattenComponents(components), dataModel },
  };
}

export function updateComponents(surfaceId, components) {
  return { version: '1.0', updateComponents: { surfaceId, components } };
}

export function updateDataModel(surfaceId, path, value) {
  return { version: '1.0', updateDataModel: { surfaceId, path, value } };
}

export const Text = (id, text, extra = {}) => ({ id, component: 'Text', text, ...extra });
export const Column = (id, children) => ({ id, component: 'Column', children });
export const Row = (id, children) => ({ id, component: 'Row', children });
export const Card = (id, child) => ({ id, component: 'Card', child });
export const Divider = (id) => ({ id, component: 'Divider' });
export const Button = (id, text, name, context = {}) => ({
  id,
  component: 'Button',
  text,
  action: { name, context },
});

/** A text that reads a value from the surface's data model. */
export const Bound = (id, path, extra = {}) => ({ id, component: 'Text', text: { '@path': path }, ...extra });

/** Stable component ids: a surface may be patched later, so ids cannot be random. */
export const cid = (prefix, index) => `${prefix}_${index}`;
