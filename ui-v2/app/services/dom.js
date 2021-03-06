import Service from '@ember/service';
import { getOwner } from '@ember/application';
import { guidFor } from '@ember/object/internals';

// selecting
import qsaFactory from 'consul-ui/utils/dom/qsa-factory';
// TODO: sibling and closest seem to have 'PHP-like' guess the order arguments
// ie. one `string, element` and the other has `element, string`
// see if its possible to standardize
import sibling from 'consul-ui/utils/dom/sibling';
import closest from 'consul-ui/utils/dom/closest';
import isOutside from 'consul-ui/utils/dom/is-outside';
import getComponentFactory from 'consul-ui/utils/dom/get-component-factory';

// events
import normalizeEvent from 'consul-ui/utils/dom/normalize-event';
import createListeners from 'consul-ui/utils/dom/create-listeners';
import clickFirstAnchorFactory from 'consul-ui/utils/dom/click-first-anchor';

// ember-eslint doesn't like you using a single $ so use double
// use $_ for components
const $$ = qsaFactory();
let $_;
let inViewportCallbacks;
const clickFirstAnchor = clickFirstAnchorFactory(closest);
export default Service.extend({
  doc: document,
  win: window,
  init: function() {
    this._super(...arguments);
    inViewportCallbacks = new WeakMap();
    $_ = getComponentFactory(getOwner(this));
  },
  willDestroy: function() {
    this._super(...arguments);
    inViewportCallbacks = null;
    $_ = null;
  },
  document: function() {
    return this.doc;
  },
  viewport: function() {
    return this.win;
  },
  guid: function(el) {
    return guidFor(el);
  },
  // TODO: should this be here? Needs a better name at least
  clickFirstAnchor: clickFirstAnchor,
  closest: closest,
  sibling: sibling,
  isOutside: isOutside,
  normalizeEvent: normalizeEvent,
  listeners: createListeners,
  root: function() {
    return this.doc.documentElement;
  },
  // TODO: Should I change these to use the standard names
  // even though they don't have a standard signature (querySelector*)
  elementById: function(id) {
    return this.doc.getElementById(id);
  },
  elementsByTagName: function(name, context) {
    context = typeof context === 'undefined' ? this.doc : context;
    return context.getElementsByTagName(name);
  },
  elements: function(selector, context) {
    // don't ever be tempted to [...$$()] here
    // it should return a NodeList
    return $$(selector, context);
  },
  element: function(selector, context) {
    if (selector.substr(0, 1) === '#') {
      return this.elementById(selector.substr(1));
    }
    // TODO: This can just use querySelector
    return [...$$(selector, context)][0];
  },
  // ember components aren't strictly 'dom-like'
  // but if you think of them as a web component 'shim'
  // then it makes more sense to think of them as part of the dom
  // with traditional/standard web components you wouldn't actually need this
  // method as you could just get to their methods from the dom element
  component: function(selector, context) {
    if (typeof selector !== 'string') {
      return $_(selector);
    }
    return $_(this.element(selector, context));
  },
  components: function(selector, context) {
    return [...this.elements(selector, context)]
      .map(function(item) {
        return $_(item);
      })
      .filter(function(item) {
        return item != null;
      });
  },
  isInViewport: function($el, cb, threshold = 0) {
    inViewportCallbacks.set($el, cb);
    let observer = new IntersectionObserver(
      (entries, observer) => {
        entries.map(item => {
          const cb = inViewportCallbacks.get(item.target);
          if (typeof cb === 'function') {
            cb(item.isIntersecting);
          }
        });
      },
      {
        rootMargin: '0px',
        threshold: threshold,
      }
    );
    observer.observe($el); // eslint-disable-line ember/no-observers
    // observer.unobserve($el);
    return () => {
      observer.unobserve($el); // eslint-disable-line ember/no-observers
      if (inViewportCallbacks) {
        inViewportCallbacks.delete($el);
      }
      observer.disconnect(); // eslint-disable-line ember/no-observers
      observer = null;
    };
  },
});
