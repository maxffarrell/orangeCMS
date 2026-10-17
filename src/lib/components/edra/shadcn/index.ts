import { Tiptap } from '../tiptap/index.ts';
import BubbleMenu from './components/menu/BubbleMenu.svelte';
import Toolbar from './components/Toolbar.svelte';
import './editor.css';

export { createEditor } from './editor.ts';

const Edra = Object.assign(Tiptap, { Toolbar, BubbleMenu });
export { Edra };
