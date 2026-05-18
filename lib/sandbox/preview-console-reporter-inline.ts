/**
 * Injected into the preview app's index.html after </title> or before </head>.
 * Forwards ONLY hard errors / console.error — not console.log/info/warn.
 */
export const PREVIEW_CONSOLE_REPORTER_MARKER = 'data-minu-preview-console-bridge="1"';

export function getPreviewConsoleReporterInlineScript(): string {
  return `(function(){'use strict';function post(k,d){try{if(window.parent===window)return;window.parent.postMessage(Object.assign({source:'minu-preview-console',kind:k,ts:Date.now()},d),'*');}catch(e){}}window.addEventListener('error',function(ev){post('runtime-error',{message:String(ev.message||''),filename:String(ev.filename||''),lineno:ev.lineno||0,colno:ev.colno||0,stack:ev.error&&ev.error.stack?String(ev.error.stack):''});});window.addEventListener('unhandledrejection',function(ev){var r=ev.reason;post('unhandled-rejection',{message:r&&typeof r==='object'&&'message'in r?String(r.message):String(r),stack:r&&typeof r==='object'&&typeof r.stack==='string'?r.stack:''});});var _ce=console.error;console.error=function(){_ce.apply(console,arguments);try{var parts=Array.prototype.slice.call(arguments).map(function(a){if(typeof a==='string')return a;if(a instanceof Error)return a.stack||a.message;try{return JSON.stringify(a);}catch(_){return String(a);}});post('console-error',{message:parts.join(' ')});}catch(_){}};})();`;
}
