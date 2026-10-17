// @ts-nocheck
//
// Behavioral accessibility test for the AG Grid dashboard. It executes the REAL
// public/dashboard.js against a tiny in-memory DOM shim and a mocked AG Grid, so
// the keyboard/focus/ARIA control flow is exercised without a browser, jsdom, or
// any new dependency. It does NOT render AG Grid or validate real screen-reader
// output — those require a browser + assistive technology (see the report).
import fs from 'fs';
import path from 'path';

const PUBLIC = path.join(__dirname, '../../public');
const html = fs.readFileSync(path.join(PUBLIC, 'dashboard.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'dashboard.js'), 'utf8');

class FakeElement {
  constructor(tag: string, id?: string) {
    this.tagName = tag;
    this.id = id || '';
    this._classes = new Set<string>();
    this._attrs = {};
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.hidden = false;
    this.tabIndex = -1;
    this.title = '';
    this._className = '';
  }
  get className() { return Array.from(this._classes).join(' '); }
  set className(v: string) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const self = this;
    return {
      add: (...c: string[]) => c.forEach((x) => self._classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => self._classes.delete(x)),
      contains: (c: string) => self._classes.has(c),
      toggle: (c: string, force?: boolean) => {
        const on = force === undefined ? !self._classes.has(c) : force;
        if (on) self._classes.add(c); else self._classes.delete(c);
        return on;
      },
    };
  }
  setAttribute(k: string, v: any) { this._attrs[k] = String(v); }
  getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  hasAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this._attrs, k); }
  removeAttribute(k: string) { delete this._attrs[k]; }
  appendChild(child: any) { this.children.push(child); return child; }
  addEventListener(t: string, fn: Function) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t: string, fn: Function) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatch(t: string, ev: any) { (this.listeners[t] || []).slice().forEach((fn) => fn(ev)); }
  querySelectorAll() { return []; }
  querySelector(sel: string) { return sel === '.ag-root' ? this._root || null : null; }
  focus() { doc.activeElement = this; }
}

const ids: Record<string, any> = {};
const doc: any = {
  activeElement: null,
  body: new FakeElement('body'),
  getElementById: (id: string) => ids[id] || null,
  createElement: (tag: string) => new FakeElement(tag),
};

const grids: Record<string, any> = {};

function buildDom() {
  Object.keys(ids).forEach((k) => delete ids[k]);
  [
    'ordersQuickFilter', 'eventsQuickFilter', 'ordersCsvBtn', 'eventsCsvBtn',
    'closeSide', 'sideBackdrop', 'themeToggle', 'ordersGroupBy', 'eventsGroupBy',
    'ordersGrid', 'eventsGrid', 'eventModal', 'sideBody', 'sideTitle',
    'ordersStatus', 'ordersError', 'eventsStatus', 'eventsError',
  ].forEach((id) => { ids[id] = new FakeElement('div', id); });
  // AG Grid renders its real root (.ag-root) inside each container.
  ids.ordersGrid._root = new FakeElement('div');
  ids.eventsGrid._root = new FakeElement('div');
  ids.eventModal.className = 'side-panel';
  ids.eventModal.setAttribute('aria-hidden', 'true');
  ids.sideBackdrop.hidden = true;
}

function loadDashboard() {
  buildDom();
  Object.keys(grids).forEach((k) => delete grids[k]);

  global.agGrid = {
    themeQuartz: { withParams: () => ({ mock: true }) },
    createGrid: (el: any, options: any) => {
      const api = {
        options,
        applyTransaction: jest.fn(),
        showLoadingOverlay: jest.fn(),
        hideOverlay: jest.fn(),
        showNoRowsOverlay: jest.fn(),
        setGridOption: jest.fn(),
        exportDataAsCsv: jest.fn(),
      };
      grids[el.id] = { api, options };
      return api;
    },
  };
  global.document = doc;
  global.window = { requestAnimationFrame: (cb: Function) => cb() };
  global.setInterval = () => 0;
  global.fetch = () => Promise.reject(new Error('no network'));

  // Execute the real dashboard logic.
  (0, eval)(js);
}

function sampleRow() {
  return {
    id: 'ord_1234567890abcdef',
    createdAt: new Date(),
    origin: 'AI_AGENT',
    status: 'PAID',
    itemCount: 2,
    totalMinor: 1300,
    currency: 'EUR',
  };
}

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('dashboard.js accessibility behavior (DOM shim)', () => {
  beforeEach(() => {
    loadDashboard();
  });

  test('keyboard activation (Enter / Space) opens the modal dialog and moves focus in', () => {
    const handler = grids.ordersGrid.options.onCellKeyDown;
    expect(typeof handler).toBe('function');

    const ev = { key: 'Enter', preventDefault: jest.fn() };
    handler({ data: sampleRow(), editing: false, event: ev });

    const modal = ids.eventModal;
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(modal.classList.contains('visible')).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(doc.activeElement).toBe(modal);
  });

  test('Escape closes the dialog and restores focus to the opener', () => {
    ids.closeSide.focus();
    expect(doc.activeElement).toBe(ids.closeSide);

    grids.ordersGrid.options.onCellKeyDown({
      data: sampleRow(),
      editing: false,
      event: { key: ' ', preventDefault: jest.fn() },
    });
    expect(doc.activeElement).toBe(ids.eventModal);

    ids.eventModal.dispatch('keydown', { key: 'Escape', preventDefault: jest.fn() });

    expect(ids.eventModal.classList.contains('visible')).toBe(false);
    expect(ids.eventModal.getAttribute('aria-hidden')).toBe('true');
    expect(doc.activeElement).toBe(ids.closeSide);
  });

  test('mouse row click opens the dialog and the close button dismisses it', () => {
    grids.eventsGrid.options.onRowClicked({ data: { ...sampleRow(), decision: 'BLOCK' } });
    expect(ids.eventModal.classList.contains('visible')).toBe(true);

    ids.closeSide.dispatch('click', {});
    expect(ids.eventModal.classList.contains('visible')).toBe(false);
    expect(ids.eventModal.getAttribute('aria-hidden')).toBe('true');
  });

  test('semantic cells expose descriptive screen-reader labels via getCellAria', () => {
    const ordersCols = grids.ordersGrid.options.columnDefs;
    const originCol = ordersCols.find((c: any) => c.field === 'origin');
    const statusCol = ordersCols.find((c: any) => c.field === 'status');
    expect(originCol.getCellAria({ value: 'AI_AGENT' })['aria-label']).toBe('Origin: AI agent');
    expect(originCol.getCellAria({ value: 'HUMAN' })['aria-label']).toBe('Origin: Human');
    expect(statusCol.getCellAria({ value: 'PAID' })['aria-label']).toBe('Status: PAID');

    const eventsCols = grids.eventsGrid.options.columnDefs;
    const decisionCol = eventsCols.find((c: any) => c.field === 'decision');
    expect(decisionCol.getCellAria({ value: 'BLOCK' })['aria-label']).toBe('Decision: Blocked');
    expect(decisionCol.getCellAria({ value: 'AUTO_ALLOW' })['aria-label']).toBe('Decision: Auto allow');
  });

  test('a failed refresh surfaces an accessible (role=alert) error message', async () => {
    await flush(10);
    expect(ids.ordersError.hidden).toBe(false);
    expect(ids.ordersError.textContent).toMatch(/connection error/i);
    expect(ids.eventsError.hidden).toBe(false);
    expect(ids.ordersStatus.textContent).toMatch(/Loading orders/i);
  });

  test('names AG Grid\'s inner root from the section heading and adds no role of its own', () => {
    expect(ids.ordersGrid._root.getAttribute('aria-labelledby')).toBe('ordersHeading');
    expect(ids.eventsGrid._root.getAttribute('aria-labelledby')).toBe('eventsHeading');
    // The container must stay role-less so AG Grid's own grid/treegrid role is the only one.
    expect(ids.ordersGrid.getAttribute('role')).toBeNull();
    expect(ids.eventsGrid.getAttribute('role')).toBeNull();
    // Every heading we point at exists in the served markup.
    expect(html).toContain('id="ordersHeading"');
    expect(html).toContain('id="eventsHeading"');
  });
});
