// Ligera util de instrumentación para render counts y timings
// Se activa sólo si debug = true. Evita dependencias externas.
import React from 'react';

class PerfMonitor {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.renderCounts = new Map(); // key -> count
    this.markers = new Map(); // id -> { start, label }
  }

  enable(flag) { this.enabled = !!flag; }

  countRender(label) {
    if (!this.enabled) return;
    const c = this.renderCounts.get(label) || 0;
    this.renderCounts.set(label, c + 1);
  }

  start(id, label = id) {
    if (!this.enabled) return;
    this.markers.set(id, { start: performance.now(), label });
  }

  end(id) {
    if (!this.enabled) return;
    const marker = this.markers.get(id);
    if (!marker) return;
    const duration = performance.now() - marker.start;
    // eslint-disable-next-line no-console
    console.log(`[Perf] ${marker.label}: ${duration.toFixed(2)}ms`);
    this.markers.delete(id);
    return duration;
  }

  reportRenders() {
    if (!this.enabled) return;
    // eslint-disable-next-line no-console
    console.table(Array.from(this.renderCounts.entries()).map(([k,v]) => ({ component: k, renders: v })));
  }
}

export const perfMonitor = new PerfMonitor(false);

export function withRenderCount(Component, label){
  const display = label || Component.displayName || Component.name || 'Anon';
  const Wrapped = (props) => {
    perfMonitor.countRender(display);
    // Evitar JSX para compatibilidad cuando el bundler no transforma JSX en .js
    return React.createElement(Component, props);
  };
  Wrapped.displayName = `WithRenderCount(${display})`;
  return Wrapped;
}

export default perfMonitor;