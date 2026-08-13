import { FONT_SCALE_STORAGE_KEY, THEME_STORAGE_KEY } from './theme-storage'

/**
 * Runs synchronously in `<head>`, before the browser paints anything, so a
 * dark-mode visitor never sees a light frame first. It cannot import
 * `applyTheme`/`resolveTheme` — module code runs after first paint — so it
 * restates their branches inline. `theme-script.test.ts` executes this string
 * against those functions for every input combination, so the two cannot drift.
 *
 * Everything is wrapped in try/catch: localStorage throws in some private modes,
 * and a throw here would leave the page unstyled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var d=document.documentElement;
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var f=localStorage.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)});
if(p!=='light'&&p!=='dark'&&p!=='night')p='system';
if(f!=='large'&&f!=='x-large')f='default';
var t;
if(p==='dark')t='dark';
else if(p==='light')t='light';
else if(p==='night'){var h=new Date().getHours();t=(h>=21||h<6)?'dark':'light';}
else t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
d.classList.toggle('dark',t==='dark');
d.dataset.theme=t;
d.dataset.fontScale=f;
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.content=t==='dark'?'#1c1a17':'#f7f4ec';
}catch(e){}})()`
